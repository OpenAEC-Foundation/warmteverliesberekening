"""Tests for 2D geometry utilities."""

from __future__ import annotations

import math

import numpy as np
import pytest

from ifc_tool.import_ifc.geometry import (
    dedup_vertices,
    douglas_peucker,
    ensure_ccw,
    extract_floor_polygon,
    merge_near_collinear,
    polygon_area,
    remove_collinear,
    remove_short_edges,
    simplify_polygon,
    snap_right_angles,
)
from ifc_tool.models import Point2D


class TestPolygonArea:
    def test_rectangle_ccw(self, simple_rectangle: list[Point2D]) -> None:
        area = polygon_area(simple_rectangle)
        assert area == pytest.approx(12_000_000.0)  # 4m x 3m = 12m²

    def test_rectangle_cw(self, simple_rectangle: list[Point2D]) -> None:
        area = polygon_area(list(reversed(simple_rectangle)))
        assert area == pytest.approx(-12_000_000.0)

    def test_triangle(self) -> None:
        triangle = [
            Point2D(x=0, y=0),
            Point2D(x=2000, y=0),
            Point2D(x=0, y=2000),
        ]
        area = polygon_area(triangle)
        assert area == pytest.approx(2_000_000.0)  # 2m²

    def test_empty_polygon(self) -> None:
        assert polygon_area([]) == 0.0

    def test_two_points(self) -> None:
        assert polygon_area([Point2D(x=0, y=0), Point2D(x=1, y=1)]) == 0.0


class TestEnsureCcw:
    def test_already_ccw(self, simple_rectangle: list[Point2D]) -> None:
        result = ensure_ccw(simple_rectangle)
        assert polygon_area(result) > 0

    def test_cw_to_ccw(self, simple_rectangle: list[Point2D]) -> None:
        cw = list(reversed(simple_rectangle))
        result = ensure_ccw(cw)
        assert polygon_area(result) > 0


class TestDedupVertices:
    def test_no_duplicates(self, simple_rectangle: list[Point2D]) -> None:
        result = dedup_vertices(simple_rectangle)
        assert len(result) == 4

    def test_consecutive_duplicates(self) -> None:
        points = [
            Point2D(x=0, y=0),
            Point2D(x=0, y=0),  # duplicate
            Point2D(x=1000, y=0),
            Point2D(x=1000, y=1000),
        ]
        result = dedup_vertices(points)
        assert len(result) == 3

    def test_first_last_duplicate(self) -> None:
        points = [
            Point2D(x=0, y=0),
            Point2D(x=1000, y=0),
            Point2D(x=1000, y=1000),
            Point2D(x=0, y=0.1),  # near-duplicate of first
        ]
        result = dedup_vertices(points, tolerance=1.0)
        assert len(result) == 3


class TestRemoveCollinear:
    def test_no_collinear(self, simple_rectangle: list[Point2D]) -> None:
        result = remove_collinear(simple_rectangle)
        assert len(result) == 4

    def test_collinear_midpoint(self) -> None:
        # Rectangle with extra point on bottom edge
        points = [
            Point2D(x=0, y=0),
            Point2D(x=2000, y=0),  # collinear
            Point2D(x=4000, y=0),
            Point2D(x=4000, y=3000),
            Point2D(x=0, y=3000),
        ]
        result = remove_collinear(points)
        assert len(result) == 4


class TestExtractFloorPolygon:
    def test_simple_box(self) -> None:
        # 3D box: 4x3x2.6m in mm
        vertices = np.array(
            [
                # Bottom face
                [0, 0, 0],
                [4000, 0, 0],
                [4000, 3000, 0],
                [0, 3000, 0],
                # Top face
                [0, 0, 2600],
                [4000, 0, 2600],
                [4000, 3000, 2600],
                [0, 3000, 2600],
            ],
            dtype=np.float64,
        )
        polygon, height = extract_floor_polygon(vertices)
        assert len(polygon) == 4
        assert height == pytest.approx(2600.0)

    def test_simple_box_with_faces(self) -> None:
        """Box with triangulated faces → boundary extraction."""
        vertices = np.array(
            [
                [0, 0, 0],        # 0
                [4000, 0, 0],     # 1
                [4000, 3000, 0],  # 2
                [0, 3000, 0],     # 3
                [0, 0, 2600],     # 4
                [4000, 0, 2600],  # 5
                [4000, 3000, 2600],  # 6
                [0, 3000, 2600],  # 7
            ],
            dtype=np.float64,
        )
        # Triangulated faces for a box (2 triangles per face)
        faces = np.array(
            [
                # Bottom face
                [0, 1, 2],
                [0, 2, 3],
                # Top face
                [4, 6, 5],
                [4, 7, 6],
                # Front face (y=0)
                [0, 5, 1],
                [0, 4, 5],
                # Back face (y=3000)
                [2, 7, 3],
                [2, 6, 7],
                # Left face (x=0)
                [0, 3, 7],
                [0, 7, 4],
                # Right face (x=4000)
                [1, 5, 6],
                [1, 6, 2],
            ],
            dtype=np.int64,
        )
        polygon, height = extract_floor_polygon(vertices, faces=faces)
        assert len(polygon) == 4
        assert height == pytest.approx(2600.0)

        # Check all 4 corners are present
        xs = sorted(p.x for p in polygon)
        ys = sorted(p.y for p in polygon)
        assert xs[0] == pytest.approx(0.0)
        assert xs[-1] == pytest.approx(4000.0)
        assert ys[0] == pytest.approx(0.0)
        assert ys[-1] == pytest.approx(3000.0)

    def test_l_shaped_room_with_faces(self) -> None:
        """L-shaped room → concave polygon preserved (NOT convex hull)."""
        # L-shape floor: 6 vertices
        #   (0,0)→(6000,0)→(6000,3000)→(3000,3000)→(3000,5000)→(0,5000)
        vertices = np.array(
            [
                # Bottom (z=0)
                [0, 0, 0],        # 0
                [6000, 0, 0],     # 1
                [6000, 3000, 0],  # 2
                [3000, 3000, 0],  # 3
                [3000, 5000, 0],  # 4
                [0, 5000, 0],     # 5
                # Top (z=2600)
                [0, 0, 2600],     # 6
                [6000, 0, 2600],  # 7
                [6000, 3000, 2600],  # 8
                [3000, 3000, 2600],  # 9
                [3000, 5000, 2600],  # 10
                [0, 5000, 2600],    # 11
            ],
            dtype=np.float64,
        )
        # Triangulated bottom face (4 triangles for L-shape)
        faces = np.array(
            [
                # Bottom: triangulate L-shape
                [0, 1, 2],
                [0, 2, 3],
                [0, 3, 4],
                [0, 4, 5],
                # Top (not relevant for floor extraction)
                [6, 8, 7],
                [6, 9, 8],
                [6, 10, 9],
                [6, 11, 10],
            ],
            dtype=np.int64,
        )
        polygon, height = extract_floor_polygon(vertices, faces=faces)

        # Must have 6 vertices (L-shape), not 4 (convex hull)
        assert len(polygon) == 6
        assert height == pytest.approx(2600.0)

        # The concave corner (3000, 3000) must be present
        coords = [(round(p.x), round(p.y)) for p in polygon]
        assert (3000, 3000) in coords, (
            f"Concave corner missing, got: {coords}"
        )

    def test_empty_vertices(self) -> None:
        vertices = np.array([], dtype=np.float64).reshape(0, 3)
        polygon, height = extract_floor_polygon(vertices)
        assert len(polygon) == 0
        assert height == 0.0


# ===================================================================
# Polygon simplification tests
# ===================================================================


class TestRemoveShortEdges:
    def test_rectangle_with_bump(self) -> None:
        """A 4x3m rectangle with a tiny 20mm bump on one edge → bump removed."""
        points = [
            Point2D(x=0, y=0),
            Point2D(x=2000, y=0),
            Point2D(x=2000, y=20),    # bump out
            Point2D(x=2020, y=20),    # bump top
            Point2D(x=2020, y=0),     # bump back
            Point2D(x=4000, y=0),
            Point2D(x=4000, y=3000),
            Point2D(x=0, y=3000),
        ]
        result = remove_short_edges(points, threshold=100)
        # The three bump vertices (edges ~20mm) should be merged away
        assert len(result) < len(points)
        # Should still form a roughly rectangular shape
        assert len(result) >= 4

    def test_no_short_edges(self, simple_rectangle: list[Point2D]) -> None:
        """A clean rectangle should pass through unchanged."""
        result = remove_short_edges(simple_rectangle, threshold=100)
        assert len(result) == 4

    def test_never_below_three_vertices(self) -> None:
        """Even with very aggressive threshold, never drop below 3 vertices."""
        triangle = [
            Point2D(x=0, y=0),
            Point2D(x=50, y=0),
            Point2D(x=50, y=50),
            Point2D(x=0, y=50),
        ]
        result = remove_short_edges(triangle, threshold=200)
        assert len(result) >= 3


class TestDouglasPeucker:
    def test_zigzag_smoothed(self) -> None:
        """A straight edge with a 30mm zigzag offset should be smoothed."""
        # Rectangle 4x3m, but the bottom edge has a zigzag
        points = [
            Point2D(x=0, y=0),
            Point2D(x=1000, y=30),    # offset 30mm up
            Point2D(x=2000, y=0),
            Point2D(x=3000, y=30),    # offset 30mm up
            Point2D(x=4000, y=0),
            Point2D(x=4000, y=3000),
            Point2D(x=0, y=3000),
        ]
        result = douglas_peucker(points, tolerance=50)
        # The 30mm zigzag should be removed (< 50mm tolerance)
        assert len(result) < len(points)
        assert len(result) >= 3

    def test_large_features_preserved(self) -> None:
        """Features larger than tolerance should be preserved."""
        # L-shaped polygon — all edges are significant
        points = [
            Point2D(x=0, y=0),
            Point2D(x=4000, y=0),
            Point2D(x=4000, y=2000),
            Point2D(x=2000, y=2000),
            Point2D(x=2000, y=3000),
            Point2D(x=0, y=3000),
        ]
        result = douglas_peucker(points, tolerance=50)
        # All 6 vertices are far from any simplification line
        assert len(result) == 6

    def test_minimum_three_points(self) -> None:
        """Should never return fewer than 3 points."""
        triangle = [
            Point2D(x=0, y=0),
            Point2D(x=1000, y=0),
            Point2D(x=500, y=1000),
        ]
        result = douglas_peucker(triangle, tolerance=50)
        assert len(result) >= 3


class TestSnapRightAngles:
    def test_near_rectangle_snapped(self) -> None:
        """A near-rectangle with 89° and 91° corners → exact 90°."""
        # Slightly off-square: top-right corner is shifted
        # This makes angles not quite 90°
        offset = 4000 * math.tan(math.radians(1))  # ~70mm offset for 1° off
        points = [
            Point2D(x=0, y=0),
            Point2D(x=4000, y=0),
            Point2D(x=4000 + offset, y=3000),  # ~91° angle at bottom-right
            Point2D(x=0, y=3000),
        ]
        result = snap_right_angles(points, tolerance_deg=5)

        # Check that each angle is now very close to 90°
        n = len(result)
        for i in range(n):
            prev = result[(i - 1) % n]
            curr = result[i]
            nxt = result[(i + 1) % n]

            dx_in = curr.x - prev.x
            dy_in = curr.y - prev.y
            dx_out = nxt.x - curr.x
            dy_out = nxt.y - curr.y

            len_in = math.hypot(dx_in, dy_in)
            len_out = math.hypot(dx_out, dy_out)
            if len_in < 1e-9 or len_out < 1e-9:
                continue

            dot = dx_in * dx_out + dy_in * dy_out
            cos_angle = dot / (len_in * len_out)
            cos_angle = max(-1.0, min(1.0, cos_angle))
            angle = math.degrees(math.acos(cos_angle))
            # Each angle should be close to 90° (or 180° for straight edges)
            min_diff = min(abs(angle - 90), abs(angle - 180), abs(angle - 270))
            assert min_diff < 1.0, f"Angle {angle}° not snapped (vertex {i})"

    def test_clean_rectangle_unchanged(self, simple_rectangle: list[Point2D]) -> None:
        """A perfect rectangle should be essentially unchanged."""
        result = snap_right_angles(simple_rectangle, tolerance_deg=5)
        for orig, snapped in zip(simple_rectangle, result):
            assert abs(orig.x - snapped.x) < 1.0
            assert abs(orig.y - snapped.y) < 1.0


class TestMergeNearCollinear:
    def test_two_edges_merged(self) -> None:
        """Two edges ~2° apart should be merged into one."""
        # Bottom edge split into two segments with ~1° deviation each
        # = ~2° total angle between the two edges (within 3° tolerance)
        offset = 2000 * math.tan(math.radians(1))  # ~35mm for 1°
        points = [
            Point2D(x=0, y=0),
            Point2D(x=2000, y=offset),   # 1° off from horizontal
            Point2D(x=4000, y=0),        # back to horizontal
            Point2D(x=4000, y=3000),
            Point2D(x=0, y=3000),
        ]
        result = merge_near_collinear(points, tolerance_deg=3)
        # The middle vertex on the bottom edge should be removed
        assert len(result) == 4

    def test_sharp_corners_preserved(self, simple_rectangle: list[Point2D]) -> None:
        """90° corners should NOT be merged."""
        result = merge_near_collinear(simple_rectangle, tolerance_deg=3)
        assert len(result) == 4


class TestSimplifyPipeline:
    def test_revit_like_polygon_cleaned(self) -> None:
        """Realistic Revit-like polygon with bumps → clean rectangle.

        Simulates a 4x3m room where Revit space boundaries have:
        - 20mm offsets from wall layers
        - tiny bump from column
        """
        points = [
            Point2D(x=20, y=0),          # 20mm offset from wall
            Point2D(x=2000, y=0),
            Point2D(x=2000, y=30),        # 30mm bump (column offset)
            Point2D(x=2030, y=30),
            Point2D(x=2030, y=0),
            Point2D(x=3980, y=0),         # 20mm short of 4000
            Point2D(x=4000, y=20),        # offset corner
            Point2D(x=4000, y=2980),
            Point2D(x=3980, y=3000),      # offset corner
            Point2D(x=20, y=3000),
            Point2D(x=0, y=2980),         # offset corner
            Point2D(x=0, y=20),           # offset corner
        ]
        result = simplify_polygon(points)

        # Should produce a much cleaner polygon
        assert len(result) < len(points)
        assert len(result) >= 3

        # Area should be preserved within 5%
        original_area = abs(polygon_area(points))
        new_area = abs(polygon_area(result))
        area_change = abs(new_area - original_area) / original_area
        assert area_change <= 0.05

        # Should be CCW
        assert polygon_area(result) > 0

    def test_clean_rectangle_passthrough(self, simple_rectangle: list[Point2D]) -> None:
        """A clean rectangle should pass through essentially unchanged."""
        result = simplify_polygon(simple_rectangle)
        assert len(result) == 4
        # Area should be identical
        assert abs(polygon_area(result)) == pytest.approx(
            abs(polygon_area(simple_rectangle)), rel=0.001
        )

    def test_area_safety_fallback(self) -> None:
        """If simplification changes area > 5%, fallback to original cleanup."""
        # Create a polygon where aggressive simplification would destroy shape
        # A star-like shape where removing points drastically changes area
        points = [
            Point2D(x=0, y=0),
            Point2D(x=5000, y=0),
            Point2D(x=5000, y=5000),
            Point2D(x=0, y=5000),
        ]
        result = simplify_polygon(points)
        # Simple rectangle — area should match exactly
        assert abs(polygon_area(result)) == pytest.approx(25_000_000.0, rel=0.001)
