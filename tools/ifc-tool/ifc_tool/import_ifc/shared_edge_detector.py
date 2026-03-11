"""Fuzzy shared edge detection between IFC-imported room polygons.

IFC room (IfcSpace) polygons stop at the wall surface.  Adjacent rooms
have a wall-thickness gap (100-400 mm).  This module detects pairs of
edges that are parallel and close, with sufficient overlap, and marks
them as interior boundaries.

All coordinates are in mm.
"""

from __future__ import annotations

import logging
import math
from itertools import combinations

from ifc_tool.constants import (
    SHARED_EDGE_MAX_DISTANCE_MM,
    SHARED_EDGE_MIN_OVERLAP_MM,
    SHARED_EDGE_PARALLEL_TOLERANCE_DEG,
)
from ifc_tool.models import ModelRoom, Point2D, SharedEdgePair

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def detect_shared_edges(rooms: list[ModelRoom]) -> list[SharedEdgePair]:
    """Detect shared interior edges between room polygons.

    Only compares rooms on the same floor.  For each pair of rooms,
    every combination of edges is checked for parallelism, proximity,
    opposing normals, and sufficient overlap.

    Args:
        rooms: List of rooms extracted from IFC spaces.

    Returns:
        List of SharedEdgePair describing detected interior walls.
    """
    if len(rooms) < 2:
        return []

    # Group room indices by floor
    floor_groups: dict[int, list[int]] = {}
    for idx, room in enumerate(rooms):
        floor_groups.setdefault(room.floor, []).append(idx)

    pairs: list[SharedEdgePair] = []

    for floor, indices in floor_groups.items():
        if len(indices) < 2:
            continue
        for idx_a, idx_b in combinations(indices, 2):
            room_a = rooms[idx_a]
            room_b = rooms[idx_b]
            found = _find_shared_edges(idx_a, room_a, idx_b, room_b)
            pairs.extend(found)

    logger.info("Detected %d shared edge pairs", len(pairs))
    return pairs


# ---------------------------------------------------------------------------
# Edge comparison logic
# ---------------------------------------------------------------------------


def _find_shared_edges(
    idx_a: int,
    room_a: ModelRoom,
    idx_b: int,
    room_b: ModelRoom,
) -> list[SharedEdgePair]:
    """Compare all edge pairs between two rooms."""
    edges_a = _polygon_edges(room_a.polygon)
    edges_b = _polygon_edges(room_b.polygon)
    centroid_a = _centroid(room_a.polygon)
    centroid_b = _centroid(room_b.polygon)

    results: list[SharedEdgePair] = []

    for wi_a, (a1, a2) in enumerate(edges_a):
        dir_a = _edge_direction(a1, a2)
        if dir_a is None:
            continue  # degenerate edge

        for wi_b, (b1, b2) in enumerate(edges_b):
            dir_b = _edge_direction(b1, b2)
            if dir_b is None:
                continue

            # (a) Nearly parallel?
            angle = _angle_between(dir_a, dir_b)
            if angle > SHARED_EDGE_PARALLEL_TOLERANCE_DEG:
                continue

            # (b) Close enough?
            dist = _perpendicular_distance(a1, a2, b1, b2)
            if dist > SHARED_EDGE_MAX_DISTANCE_MM:
                continue

            # (c) Normals face each other?
            if not _normals_face_each_other(
                a1, a2, b1, b2, centroid_a, centroid_b
            ):
                continue

            # (d) Sufficient overlap?
            overlap = _edge_overlap(a1, a2, b1, b2, dir_a)
            if overlap < SHARED_EDGE_MIN_OVERLAP_MM:
                continue

            results.append(
                SharedEdgePair(
                    room_a_index=idx_a,
                    wall_a_index=wi_a,
                    room_b_index=idx_b,
                    wall_b_index=wi_b,
                    distance_mm=round(dist, 1),
                    overlap_mm=round(overlap, 1),
                )
            )

    return results


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------


def _polygon_edges(
    polygon: list[Point2D],
) -> list[tuple[Point2D, Point2D]]:
    """Return list of (start, end) edge tuples for a closed polygon."""
    n = len(polygon)
    return [(polygon[i], polygon[(i + 1) % n]) for i in range(n)]


def _centroid(polygon: list[Point2D]) -> tuple[float, float]:
    """Compute the centroid of a polygon."""
    n = len(polygon)
    if n == 0:
        return (0.0, 0.0)
    cx = sum(p.x for p in polygon) / n
    cy = sum(p.y for p in polygon) / n
    return (cx, cy)


def _edge_direction(
    a: Point2D, b: Point2D
) -> tuple[float, float] | None:
    """Normalized direction vector from a to b, or None for degenerate edges."""
    dx = b.x - a.x
    dy = b.y - a.y
    length = math.hypot(dx, dy)
    if length < 1e-9:
        return None
    return (dx / length, dy / length)


def _angle_between(
    dir1: tuple[float, float], dir2: tuple[float, float]
) -> float:
    """Angle in degrees between two direction vectors (0-90 range).

    Since edges can point in opposite directions and still be parallel,
    we use the absolute dot product to map to 0-90 degrees.
    """
    dot = dir1[0] * dir2[0] + dir1[1] * dir2[1]
    # Clamp for numerical safety
    dot = max(-1.0, min(1.0, dot))
    angle_rad = math.acos(abs(dot))
    return math.degrees(angle_rad)


def _perpendicular_distance(
    a1: Point2D,
    a2: Point2D,
    b1: Point2D,
    b2: Point2D,
) -> float:
    """Perpendicular distance between two edges (mm).

    Computed as the average of the distances from each edge's midpoint
    to the infinite line defined by the other edge.  This is robust for
    edges that are offset along their shared direction.
    """
    mid_a = ((a1.x + a2.x) / 2, (a1.y + a2.y) / 2)
    mid_b = ((b1.x + b2.x) / 2, (b1.y + b2.y) / 2)

    d1 = _point_to_line_distance(mid_b, a1, a2)
    d2 = _point_to_line_distance(mid_a, b1, b2)
    return (d1 + d2) / 2.0


def _point_to_line_distance(
    point: tuple[float, float],
    line_a: Point2D,
    line_b: Point2D,
) -> float:
    """Perpendicular distance from a point to the infinite line through line_a → line_b."""
    dx = line_b.x - line_a.x
    dy = line_b.y - line_a.y
    length = math.hypot(dx, dy)
    if length < 1e-9:
        # Degenerate line — distance to point
        return math.hypot(point[0] - line_a.x, point[1] - line_a.y)
    # |cross product| / length
    cross = abs(dx * (line_a.y - point[1]) - dy * (line_a.x - point[0]))
    return cross / length


def _edge_overlap(
    a1: Point2D,
    a2: Point2D,
    b1: Point2D,
    b2: Point2D,
    direction: tuple[float, float],
) -> float:
    """Overlap length (mm) when both edges are projected onto their shared direction.

    Projects all four endpoints onto the direction vector and computes
    the overlap of the two resulting 1D intervals.
    """
    dx, dy = direction

    # Project endpoints onto direction
    proj_a1 = a1.x * dx + a1.y * dy
    proj_a2 = a2.x * dx + a2.y * dy
    proj_b1 = b1.x * dx + b1.y * dy
    proj_b2 = b2.x * dx + b2.y * dy

    # Intervals
    min_a, max_a = min(proj_a1, proj_a2), max(proj_a1, proj_a2)
    min_b, max_b = min(proj_b1, proj_b2), max(proj_b1, proj_b2)

    overlap = min(max_a, max_b) - max(min_a, min_b)
    return max(0.0, overlap)


def _normals_face_each_other(
    a1: Point2D,
    a2: Point2D,
    b1: Point2D,
    b2: Point2D,
    centroid_a: tuple[float, float],
    centroid_b: tuple[float, float],
) -> bool:
    """Check that the outward normals of the two edges face each other.

    For a CCW polygon, the outward normal of edge (a1 -> a2) is (dy, -dx).
    We verify that normal_A points from room A toward room B, and
    normal_B points from room B toward room A.

    The check: dot(normal_A, midA -> midB) > 0  AND
               dot(normal_B, midB -> midA) > 0.
    """
    # Edge A: direction and outward normal
    dx_a = a2.x - a1.x
    dy_a = a2.y - a1.y
    normal_a = (dy_a, -dx_a)  # outward for CCW

    # Edge B: direction and outward normal
    dx_b = b2.x - b1.x
    dy_b = b2.y - b1.y
    normal_b = (dy_b, -dx_b)

    # Midpoints
    mid_a = ((a1.x + a2.x) / 2, (a1.y + a2.y) / 2)
    mid_b = ((b1.x + b2.x) / 2, (b1.y + b2.y) / 2)

    # Vector from midA to midB
    ab_x = mid_b[0] - mid_a[0]
    ab_y = mid_b[1] - mid_a[1]

    # normal_A should point toward room B (positive dot with A→B vector)
    dot_a = normal_a[0] * ab_x + normal_a[1] * ab_y

    # normal_B should point toward room A (positive dot with B→A vector)
    dot_b = normal_b[0] * (-ab_x) + normal_b[1] * (-ab_y)

    return dot_a > 0 and dot_b > 0
