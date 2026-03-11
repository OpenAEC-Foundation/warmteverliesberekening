"""2D polygon utility functions.

All coordinates are in mm.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

from ifc_tool.constants import (
    COLLINEAR_TOLERANCE,
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
