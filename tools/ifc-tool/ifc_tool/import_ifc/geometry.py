"""2D polygon utility functions.

All coordinates are in mm.
"""

from __future__ import annotations

import math

import numpy as np
from numpy.typing import NDArray

from ifc_tool.constants import (
    COLLINEAR_MERGE_DEG,
    COLLINEAR_TOLERANCE,
    DOUGLAS_PEUCKER_TOLERANCE_MM,
    RIGHT_ANGLE_SNAP_DEG,
    SHORT_EDGE_THRESHOLD_MM,
    VERTEX_DEDUP_TOLERANCE,
    Z_TOLERANCE_MM,
)
from ifc_tool.models import Point2D


def polygon_area(points: list[Point2D]) -> float:
    """Signed area of a 2D polygon (shoelace formula).

    Positive = counter-clockwise, negative = clockwise.
    """
    n = len(points)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += points[i].x * points[j].y
        area -= points[j].x * points[i].y
    return area / 2.0


def ensure_ccw(points: list[Point2D]) -> list[Point2D]:
    """Ensure counter-clockwise winding order."""
    if polygon_area(points) < 0:
        return list(reversed(points))
    return points


def dedup_vertices(
    points: list[Point2D],
    tolerance: float = VERTEX_DEDUP_TOLERANCE,
) -> list[Point2D]:
    """Remove consecutive duplicate vertices within tolerance."""
    if len(points) < 2:
        return points
    result = [points[0]]
    for p in points[1:]:
        prev = result[-1]
        dist = ((p.x - prev.x) ** 2 + (p.y - prev.y) ** 2) ** 0.5
        if dist > tolerance:
            result.append(p)
    # Also check first vs last
    if len(result) > 1:
        first, last = result[0], result[-1]
        dist = ((first.x - last.x) ** 2 + (first.y - last.y) ** 2) ** 0.5
        if dist <= tolerance:
            result.pop()
    return result


def remove_collinear(
    points: list[Point2D],
    tolerance: float = COLLINEAR_TOLERANCE,
) -> list[Point2D]:
    """Remove collinear points from a polygon."""
    if len(points) < 3:
        return points
    result: list[Point2D] = []
    n = len(points)
    for i in range(n):
        prev = points[(i - 1) % n]
        curr = points[i]
        nxt = points[(i + 1) % n]
        # Cross product of (prev→curr) × (curr→next)
        cross = (curr.x - prev.x) * (nxt.y - curr.y) - (
            curr.y - prev.y
        ) * (nxt.x - curr.x)
        if abs(cross) > tolerance:
            result.append(curr)
    return result if len(result) >= 3 else points


def _edge_length(a: Point2D, b: Point2D) -> float:
    """Euclidean distance between two points."""
    return math.hypot(b.x - a.x, b.y - a.y)


def _midpoint(a: Point2D, b: Point2D) -> Point2D:
    """Midpoint of two points."""
    return Point2D(x=(a.x + b.x) / 2, y=(a.y + b.y) / 2)


def _edge_angle(a: Point2D, b: Point2D) -> float:
    """Angle of the edge a→b in radians (-pi..pi]."""
    return math.atan2(b.y - a.y, b.x - a.x)


def _perp_distance(p: Point2D, a: Point2D, b: Point2D) -> float:
    """Perpendicular distance from point *p* to line segment *a*–*b*."""
    dx = b.x - a.x
    dy = b.y - a.y
    length_sq = dx * dx + dy * dy
    if length_sq == 0.0:
        return _edge_length(p, a)
    cross = abs(dx * (a.y - p.y) - dy * (a.x - p.x))
    return cross / math.sqrt(length_sq)


# ---------------------------------------------------------------------------
# Simplification step 1 – remove short edges
# ---------------------------------------------------------------------------


def remove_short_edges(
    points: list[Point2D],
    threshold: float = SHORT_EDGE_THRESHOLD_MM,
) -> list[Point2D]:
    """Remove edges shorter than *threshold* by merging their endpoints.

    Uses a while-loop with a dirty flag so that newly created edges
    are also checked.  Never drops below 3 vertices.
    Limited to 10 passes to prevent infinite loops.
    """
    if len(points) < 4:
        return points

    result = list(points)
    max_passes = 10

    for _pass in range(max_passes):
        n = len(result)
        if n < 4:
            break

        # Find the shortest edge
        min_len = float("inf")
        min_idx = -1
        for i in range(n):
            j = (i + 1) % n
            length = _edge_length(result[i], result[j])
            if length < min_len:
                min_len = length
                min_idx = i

        if min_len >= threshold:
            break  # No more short edges

        # Merge the shortest edge: replace both endpoints with midpoint
        j = (min_idx + 1) % n
        mid = _midpoint(result[min_idx], result[j])
        new_result: list[Point2D] = []
        for i in range(n):
            if i == min_idx:
                new_result.append(mid)
            elif i == j:
                continue  # skip second vertex of merged edge
            else:
                new_result.append(result[i])

        if len(new_result) < 3:
            break  # safety: never drop below 3
        result = new_result

    return result


# ---------------------------------------------------------------------------
# Simplification step 2 – Douglas-Peucker for closed polygons
# ---------------------------------------------------------------------------


def _dp_reduce(
    points: list[Point2D],
    tolerance: float,
) -> list[Point2D]:
    """Classic Douglas-Peucker on an open polyline."""
    if len(points) <= 2:
        return points

    # Find the point farthest from the line first→last
    max_dist = 0.0
    max_idx = 0
    first, last = points[0], points[-1]
    for i in range(1, len(points) - 1):
        d = _perp_distance(points[i], first, last)
        if d > max_dist:
            max_dist = d
            max_idx = i

    if max_dist > tolerance:
        left = _dp_reduce(points[: max_idx + 1], tolerance)
        right = _dp_reduce(points[max_idx:], tolerance)
        return left[:-1] + right
    else:
        return [first, last]


def douglas_peucker(
    points: list[Point2D],
    tolerance: float = DOUGLAS_PEUCKER_TOLERANCE_MM,
) -> list[Point2D]:
    """Douglas-Peucker simplification for a **closed** polygon.

    The ring is split at the two farthest-apart vertices, both halves
    are simplified independently, and then rejoined.
    Minimum 3 points are always returned.
    """
    n = len(points)
    if n <= 3:
        return points

    # Find the pair of vertices that are farthest apart
    max_dist = 0.0
    idx_a, idx_b = 0, 1
    for i in range(n):
        for j in range(i + 1, n):
            d = _edge_length(points[i], points[j])
            if d > max_dist:
                max_dist = d
                idx_a, idx_b = i, j

    # Build two open polylines: a→b and b→a (wrapping around)
    if idx_a > idx_b:
        idx_a, idx_b = idx_b, idx_a

    chain_ab = points[idx_a : idx_b + 1]
    chain_ba = points[idx_b:] + points[: idx_a + 1]

    simplified_ab = _dp_reduce(chain_ab, tolerance)
    simplified_ba = _dp_reduce(chain_ba, tolerance)

    # Rejoin: drop the duplicate endpoints where the chains meet
    result = simplified_ab[:-1] + simplified_ba[:-1]

    if len(result) < 3:
        return points
    return result


# ---------------------------------------------------------------------------
# Simplification step 3 – snap near-right angles
# ---------------------------------------------------------------------------


def snap_right_angles(
    points: list[Point2D],
    tolerance_deg: float = RIGHT_ANGLE_SNAP_DEG,
) -> list[Point2D]:
    """Snap vertex angles that are close to 90/180/270 deg to exact values.

    Adjusts one vertex at a time.  Does 3 passes since adjusting one
    vertex affects its neighbours.
    """
    if len(points) < 3:
        return points

    tolerance_rad = math.radians(tolerance_deg)
    target_angles = [
        math.radians(90),
        math.radians(180),
        math.radians(270),
    ]

    result = [Point2D(x=p.x, y=p.y) for p in points]

    for _pass in range(3):
        n = len(result)
        for i in range(n):
            prev = result[(i - 1) % n]
            curr = result[i]
            nxt = result[(i + 1) % n]

            # Vectors: incoming (prev→curr) and outgoing (curr→nxt)
            dx_in = curr.x - prev.x
            dy_in = curr.y - prev.y
            dx_out = nxt.x - curr.x
            dy_out = nxt.y - curr.y

            len_in = math.hypot(dx_in, dy_in)
            len_out = math.hypot(dx_out, dy_out)
            if len_in < 1e-9 or len_out < 1e-9:
                continue

            # Interior angle via the turn angle between the two edge directions
            angle_in = math.atan2(dy_in, dx_in)
            angle_out = math.atan2(dy_out, dx_out)

            # Turn angle (exterior angle)
            turn = angle_out - angle_in
            # Normalise to (-pi, pi]
            turn = math.atan2(math.sin(turn), math.cos(turn))

            # Interior angle = pi - turn  (for CCW polygon)
            interior = math.pi - turn
            # Normalise to (0, 2pi)
            interior = interior % (2 * math.pi)

            # Check if close to a target
            for target in target_angles:
                diff = interior - target
                if abs(diff) < tolerance_rad:
                    # Snap: rotate the outgoing edge direction so interior = target exactly
                    new_angle_out = angle_in + (math.pi - target)
                    new_dx = math.cos(new_angle_out) * len_out
                    new_dy = math.sin(new_angle_out) * len_out
                    result[(i + 1) % n] = Point2D(
                        x=curr.x + new_dx,
                        y=curr.y + new_dy,
                    )
                    break

    return result


# ---------------------------------------------------------------------------
# Simplification step 4 – merge near-collinear consecutive edges
# ---------------------------------------------------------------------------


def merge_near_collinear(
    points: list[Point2D],
    tolerance_deg: float = COLLINEAR_MERGE_DEG,
) -> list[Point2D]:
    """Remove a vertex when its two adjacent edges are nearly collinear.

    If the angle difference between consecutive edge directions is less
    than *tolerance_deg*, the middle vertex is removed.
    """
    if len(points) < 4:
        return points

    tolerance_rad = math.radians(tolerance_deg)
    result: list[Point2D] = []
    n = len(points)

    for i in range(n):
        prev = points[(i - 1) % n]
        curr = points[i]
        nxt = points[(i + 1) % n]

        angle_in = _edge_angle(prev, curr)
        angle_out = _edge_angle(curr, nxt)

        diff = angle_out - angle_in
        diff = math.atan2(math.sin(diff), math.cos(diff))

        if abs(diff) > tolerance_rad:
            result.append(curr)

    return result if len(result) >= 3 else points


# ---------------------------------------------------------------------------
# Combined simplification pipeline
# ---------------------------------------------------------------------------

_AREA_CHANGE_TOLERANCE = 0.05  # 5 %


def simplify_polygon(points: list[Point2D]) -> list[Point2D]:
    """Full simplification pipeline for IFC-imported room polygons.

    Steps:
        1. Remove short edges (< 100 mm bump artifacts)
        2. Douglas-Peucker (smooth zigzag offsets)
        3. Snap near-right angles to exact 90/180/270 deg
        4. Merge near-collinear edges
        5. Final cleanup (dedup, remove collinear, ensure CCW)

    Safety: if the area changes by more than 5 %, return the original
    polygon (with only the standard cleanup applied).
    """
    if len(points) < 3:
        return points

    original_area = abs(polygon_area(points))

    simplified = remove_short_edges(points)
    simplified = douglas_peucker(simplified)
    simplified = snap_right_angles(simplified)
    simplified = merge_near_collinear(simplified)

    # Standard cleanup
    simplified = dedup_vertices(simplified)
    simplified = remove_collinear(simplified)
    simplified = ensure_ccw(simplified)

    if len(simplified) < 3:
        # Fallback to just cleanup on original
        fallback = dedup_vertices(points)
        fallback = remove_collinear(fallback)
        fallback = ensure_ccw(fallback)
        return fallback

    new_area = abs(polygon_area(simplified))
    if original_area > 0 and abs(new_area - original_area) / original_area > _AREA_CHANGE_TOLERANCE:
        # Area changed too much — return original with just cleanup
        fallback = dedup_vertices(points)
        fallback = remove_collinear(fallback)
        fallback = ensure_ccw(fallback)
        return fallback

    return simplified


def extract_floor_polygon(
    vertices: NDArray[np.float64],
    z_tolerance: float = Z_TOLERANCE_MM,
) -> tuple[list[Point2D], float]:
    """Extract the floor polygon from 3D mesh vertices.

    Finds vertices at the minimum Z level, projects to 2D XY,
    and computes the convex hull. Returns (polygon, height_mm).

    Args:
        vertices: Nx3 array of vertex coordinates in mm.
        z_tolerance: Tolerance for grouping bottom-face vertices.

    Returns:
        Tuple of (floor polygon as Point2D list, room height in mm).
    """
    if len(vertices) == 0:
        return [], 0.0

    z_min = float(np.min(vertices[:, 2]))
    z_max = float(np.max(vertices[:, 2]))
    height = z_max - z_min

    # Select bottom-face vertices
    bottom_mask = np.abs(vertices[:, 2] - z_min) < z_tolerance
    bottom_verts = vertices[bottom_mask][:, :2]  # XY only

    if len(bottom_verts) < 3:
        return [], height

    # Convex hull via gift wrapping (good enough for room polygons)
    hull = _convex_hull_2d(bottom_verts)

    points = [Point2D(x=float(p[0]), y=float(p[1])) for p in hull]
    return points, height


def _convex_hull_2d(
    points: NDArray[np.float64],
) -> NDArray[np.float64]:
    """Simple convex hull using cross-product method.

    For rooms with concave shapes, this is a reasonable
    approximation — IfcSpace geometries are typically convex
    or near-convex.
    """
    # Remove duplicates
    unique = np.unique(points, axis=0)
    if len(unique) < 3:
        return unique

    # Sort by x then y
    idx = np.lexsort((unique[:, 1], unique[:, 0]))
    sorted_pts = unique[idx]

    # Andrew's monotone chain
    lower: list[int] = []
    for i in range(len(sorted_pts)):
        while len(lower) >= 2 and _cross(
            sorted_pts[lower[-2]], sorted_pts[lower[-1]], sorted_pts[i]
        ) <= 0:
            lower.pop()
        lower.append(i)

    upper: list[int] = []
    for i in range(len(sorted_pts) - 1, -1, -1):
        while len(upper) >= 2 and _cross(
            sorted_pts[upper[-2]], sorted_pts[upper[-1]], sorted_pts[i]
        ) <= 0:
            upper.pop()
        upper.append(i)

    hull_indices = lower[:-1] + upper[:-1]
    return sorted_pts[hull_indices]


def _cross(
    o: NDArray[np.float64],
    a: NDArray[np.float64],
    b: NDArray[np.float64],
) -> float:
    """2D cross product of vectors OA and OB."""
    return float((a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]))
