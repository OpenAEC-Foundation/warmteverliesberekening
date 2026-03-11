"""Tests for 2D geometry utilities."""

from __future__ import annotations

import numpy as np
import pytest

from ifc_tool.import_ifc.geometry import (
    dedup_vertices,
    ensure_ccw,
    extract_floor_polygon,
    polygon_area,
    remove_collinear,
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

    def test_empty_vertices(self) -> None:
        vertices = np.array([], dtype=np.float64).reshape(0, 3)
        polygon, height = extract_floor_polygon(vertices)
        assert len(polygon) == 0
        assert height == 0.0
