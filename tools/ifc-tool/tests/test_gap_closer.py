"""Tests for gap closing between IFC-imported room polygons."""

from __future__ import annotations

import pytest

from ifc_tool.import_ifc.gap_closer import close_gaps
from ifc_tool.import_ifc.geometry import polygon_area
from ifc_tool.models import ModelRoom, Point2D, SharedEdgePair


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_room(
    polygon: list[Point2D],
    *,
    name: str = "Room",
    floor: int = 0,
) -> ModelRoom:
    """Helper to create a ModelRoom with sensible defaults."""
    return ModelRoom(
        name=name,
        function="custom",
        polygon=polygon,
        floor=floor,
        height=2600,
        elevation=0,
    )


def _rect(x: float, y: float, w: float, h: float) -> list[Point2D]:
    """Create a CCW rectangle polygon from bottom-left corner (mm)."""
    return [
        Point2D(x=x, y=y),
        Point2D(x=x + w, y=y),
        Point2D(x=x + w, y=y + h),
        Point2D(x=x, y=y + h),
    ]


def _make_pair(
    room_a_index: int,
    wall_a_index: int,
    room_b_index: int,
    wall_b_index: int,
    distance_mm: float,
    overlap_mm: float = 3000.0,
) -> SharedEdgePair:
    """Helper to create a SharedEdgePair."""
    return SharedEdgePair(
        room_a_index=room_a_index,
        wall_a_index=wall_a_index,
        room_b_index=room_b_index,
        wall_b_index=wall_b_index,
        distance_mm=distance_mm,
        overlap_mm=overlap_mm,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestTwoRoomsSimpleGap:
    """Two 3x3m rectangles side by side with a 200mm wall gap."""

    def test_edges_meet_at_centre_line(self) -> None:
        """After closing, the right wall of A and left wall of B should meet."""
        # Room A: (0,0) → (3000,3000)
        # Room B: (3200,0) → (6200,3000)  — 200mm gap
        room_a = _make_room(_rect(0, 0, 3000, 3000), name="Room A")
        room_b = _make_room(_rect(3200, 0, 3000, 3000), name="Room B")

        # Room A right wall = edge 1: (3000,0) → (3000,3000)
        # Room B left wall  = edge 3: (3200,3000) → (3200,0)
        pair = _make_pair(
            room_a_index=0,
            wall_a_index=1,
            room_b_index=1,
            wall_b_index=3,
            distance_mm=200.0,
            overlap_mm=3000.0,
        )

        result = close_gaps([room_a, room_b], [pair])

        assert len(result) == 2

        # Room A's right edge vertices should have moved +100mm in X
        # Original: (3000, 0) and (3000, 3000) → (3100, 0) and (3100, 3000)
        poly_a = result[0].polygon
        assert poly_a[1].x == pytest.approx(3100.0, abs=1.0)
        assert poly_a[2].x == pytest.approx(3100.0, abs=1.0)

        # Room B's left edge vertices should have moved -100mm in X
        # Original: (3200, 3000) and (3200, 0) → (3100, 3000) and (3100, 0)
        poly_b = result[1].polygon
        assert poly_b[0].x == pytest.approx(3100.0, abs=1.0)
        assert poly_b[3].x == pytest.approx(3100.0, abs=1.0)

    def test_non_shared_vertices_unchanged(self) -> None:
        """Vertices not part of a shared edge should stay in place."""
        room_a = _make_room(_rect(0, 0, 3000, 3000), name="Room A")
        room_b = _make_room(_rect(3200, 0, 3000, 3000), name="Room B")

        pair = _make_pair(
            room_a_index=0,
            wall_a_index=1,
            room_b_index=1,
            wall_b_index=3,
            distance_mm=200.0,
        )

        result = close_gaps([room_a, room_b], [pair])

        # Room A: bottom-left (0,0) and top-left (0,3000) are untouched
        assert result[0].polygon[0].x == pytest.approx(0.0)
        assert result[0].polygon[0].y == pytest.approx(0.0)
        assert result[0].polygon[3].x == pytest.approx(0.0)
        assert result[0].polygon[3].y == pytest.approx(3000.0)

    def test_does_not_mutate_originals(self) -> None:
        """The input rooms must not be mutated."""
        room_a = _make_room(_rect(0, 0, 3000, 3000), name="Room A")
        room_b = _make_room(_rect(3200, 0, 3000, 3000), name="Room B")

        pair = _make_pair(
            room_a_index=0,
            wall_a_index=1,
            room_b_index=1,
            wall_b_index=3,
            distance_mm=200.0,
        )

        _ = close_gaps([room_a, room_b], [pair])

        # Originals should be unchanged
        assert room_a.polygon[1].x == pytest.approx(3000.0)
        assert room_b.polygon[0].x == pytest.approx(3200.0)


class TestMultipleGaps:
    """Multiple shared edge pairs processed in one call."""

    def test_two_pairs_both_closed(self) -> None:
        """Room A shares edges with both Room B (right) and Room C (top)."""
        # Use larger rooms (5x5m) so the 100mm shift is well within 5% area
        room_a = _make_room(_rect(0, 0, 5000, 5000), name="Room A")
        room_b = _make_room(_rect(5200, 0, 5000, 5000), name="Room B")
        room_c = _make_room(_rect(0, 5200, 5000, 5000), name="Room C")

        # A right wall (edge 1) <-> B left wall (edge 3): 200mm gap
        pair_ab = _make_pair(
            room_a_index=0,
            wall_a_index=1,
            room_b_index=1,
            wall_b_index=3,
            distance_mm=200.0,
            overlap_mm=5000.0,
        )
        # A top wall (edge 2) <-> C bottom wall (edge 0): 200mm gap
        pair_ac = _make_pair(
            room_a_index=0,
            wall_a_index=2,
            room_b_index=2,
            wall_b_index=0,
            distance_mm=200.0,
            overlap_mm=5000.0,
        )

        result = close_gaps([room_a, room_b, room_c], [pair_ab, pair_ac])
        assert len(result) == 3

        # Room A's top-right vertex (index 2) is shared by both edges 1 and 2.
        # Edge 1 (right wall) shifts +100 in X.
        # Edge 2 (top wall) shifts +100 in Y.
        # Since vertex 2 participates in both, the shifts are averaged:
        #   avg_x = (100 + 0) / 2 = 50, avg_y = (0 + 100) / 2 = 50
        poly_a = result[0].polygon
        assert poly_a[2].x == pytest.approx(5050.0, abs=1.0)
        assert poly_a[2].y == pytest.approx(5050.0, abs=1.0)

        # Room A vertex 1 (bottom-right) only participates in edge 1
        # shift = (+100, 0)
        assert poly_a[1].x == pytest.approx(5100.0, abs=1.0)
        assert poly_a[1].y == pytest.approx(0.0, abs=1.0)

        # Room A vertex 3 (top-left) only participates in edge 2
        # shift = (0, +100)
        assert poly_a[3].x == pytest.approx(0.0, abs=1.0)
        assert poly_a[3].y == pytest.approx(5100.0, abs=1.0)

        # Room B's left edge should have moved -100mm in X
        poly_b = result[1].polygon
        assert poly_b[0].x == pytest.approx(5100.0, abs=1.0)
        assert poly_b[3].x == pytest.approx(5100.0, abs=1.0)

        # Room C's bottom edge should have moved -100mm in Y
        poly_c = result[2].polygon
        assert poly_c[0].y == pytest.approx(5100.0, abs=1.0)
        assert poly_c[1].y == pytest.approx(5100.0, abs=1.0)


class TestGapTooLarge:
    """Gap outside the normal range — use large rooms so area check passes."""

    def test_large_gap_still_processes(self) -> None:
        """A 400mm gap on large (6x6m) rooms is shifted (half = 200mm each side)."""
        room_a = _make_room(_rect(0, 0, 6000, 6000), name="Room A")
        room_b = _make_room(_rect(6400, 0, 6000, 6000), name="Room B")

        pair = _make_pair(
            room_a_index=0,
            wall_a_index=1,
            room_b_index=1,
            wall_b_index=3,
            distance_mm=400.0,
            overlap_mm=6000.0,
        )

        result = close_gaps([room_a, room_b], [pair])

        # Room A right: 6000 + 200 = 6200
        assert result[0].polygon[1].x == pytest.approx(6200.0, abs=1.0)
        # Room B left: 6400 - 200 = 6200
        assert result[1].polygon[0].x == pytest.approx(6200.0, abs=1.0)


class TestSingleRoom:
    """A single room with no pairs should pass through unchanged."""

    def test_no_change(self) -> None:
        room = _make_room(_rect(0, 0, 3000, 3000))
        result = close_gaps([room], [])

        assert len(result) == 1
        assert result[0].polygon[0].x == pytest.approx(0.0)
        assert result[0].polygon[1].x == pytest.approx(3000.0)


class TestLShapedRoomWithGap:
    """L-shaped room with a gap on the straight segment."""

    def test_straight_segment_shifted(self) -> None:
        # L-shaped room (CCW):
        #   (0,0) → (6000,0) → (6000,3000) → (3000,3000) → (3000,5000) → (0,5000)
        l_polygon = [
            Point2D(x=0, y=0),
            Point2D(x=6000, y=0),
            Point2D(x=6000, y=3000),
            Point2D(x=3000, y=3000),
            Point2D(x=3000, y=5000),
            Point2D(x=0, y=5000),
        ]
        # Rectangle to the right of the L's arm: 200mm gap
        # x=6200, y=0..3000
        rect_polygon = _rect(6200, 0, 3000, 3000)

        room_a = _make_room(l_polygon, name="L-shaped")
        room_b = _make_room(rect_polygon, name="Rectangle")

        # L-room edge 1: (6000,0)→(6000,3000) — right wall of arm
        # Rect edge 3: (6200,3000)→(6200,0) — left wall
        pair = _make_pair(
            room_a_index=0,
            wall_a_index=1,
            room_b_index=1,
            wall_b_index=3,
            distance_mm=200.0,
            overlap_mm=3000.0,
        )

        result = close_gaps([room_a, room_b], [pair])

        # L-room vertices 1 and 2 should shift +100 in X
        poly_a = result[0].polygon
        assert poly_a[1].x == pytest.approx(6100.0, abs=1.0)
        assert poly_a[2].x == pytest.approx(6100.0, abs=1.0)

        # Other L-room vertices should be unchanged
        assert poly_a[0].x == pytest.approx(0.0)
        assert poly_a[3].x == pytest.approx(3000.0)
        assert poly_a[4].x == pytest.approx(3000.0)
        assert poly_a[5].x == pytest.approx(0.0)

        # Rectangle left wall should shift -100 in X
        poly_b = result[1].polygon
        assert poly_b[0].x == pytest.approx(6100.0, abs=1.0)
        assert poly_b[3].x == pytest.approx(6100.0, abs=1.0)


class TestAreaSafetyCheck:
    """If gap closing changes the area too much, the original is preserved."""

    def test_excessive_area_change_keeps_original(self) -> None:
        """Tiny triangle with a massive shift would blow up the area."""
        # Very small triangle: area = 0.5 * 200 * 200 = 20000 mm²
        tiny_polygon = [
            Point2D(x=0, y=0),
            Point2D(x=200, y=0),
            Point2D(x=0, y=200),
        ]
        room_a = _make_room(tiny_polygon, name="Tiny")

        # Bigger rectangle far away — doesn't matter for the shift
        room_b = _make_room(_rect(1000, 0, 3000, 3000), name="Big")

        # Fake a pair with a huge gap — shifting 400mm will dramatically
        # change the tiny triangle's area (> 5%)
        pair = _make_pair(
            room_a_index=0,
            wall_a_index=0,  # edge (0,0)→(200,0), outward normal = (0, -1)
            room_b_index=1,
            wall_b_index=2,  # doesn't matter for the check
            distance_mm=800.0,  # half = 400mm shift, massive for 200mm triangle
        )

        result = close_gaps([room_a, room_b], [pair])

        # Room A should keep its original polygon due to area safety
        poly_a = result[0].polygon
        assert poly_a[0].x == pytest.approx(0.0)
        assert poly_a[0].y == pytest.approx(0.0)
        assert poly_a[1].x == pytest.approx(200.0)
        assert poly_a[1].y == pytest.approx(0.0)

    def test_normal_gap_passes_area_check(self) -> None:
        """A typical 200mm gap on a 3x3m room is well within 5%."""
        room_a = _make_room(_rect(0, 0, 3000, 3000), name="Room A")
        room_b = _make_room(_rect(3200, 0, 3000, 3000), name="Room B")

        pair = _make_pair(
            room_a_index=0,
            wall_a_index=1,
            room_b_index=1,
            wall_b_index=3,
            distance_mm=200.0,
        )

        result = close_gaps([room_a, room_b], [pair])

        # Verify area change is small
        original_area = abs(polygon_area(room_a.polygon))
        new_area = abs(polygon_area(result[0].polygon))
        area_change = abs(new_area - original_area) / original_area
        assert area_change < 0.05


class TestCWPolygonsGapClose:
    """CW polygons should shift edges outward, not inward."""

    def test_cw_edges_shift_outward(self) -> None:
        """CW rectangles with 200mm gap — edges should move toward each other."""
        # CW rectangles (reversed winding)
        cw_a = list(reversed(_rect(0, 0, 3000, 3000)))
        cw_b = list(reversed(_rect(3200, 0, 3000, 3000)))

        room_a = _make_room(cw_a, name="Room A CW")
        room_b = _make_room(cw_b, name="Room B CW")

        # Find the wall indices for the shared edges in CW winding.
        # CW rect A: (0,3000) → (3000,3000) → (3000,0) → (0,0)
        #   Edge 1: (3000,3000)→(3000,0) = right wall
        # CW rect B: (3200,3000) → (6200,3000) → (6200,0) → (3200,0)
        #   Edge 3: (3200,0)→(3200,3000) = left wall
        # Actually, reversed _rect(3200, 0, 3000, 3000):
        #   Original CCW: (3200,0) → (6200,0) → (6200,3000) → (3200,3000)
        #   Reversed CW:  (3200,3000) → (6200,3000) → (6200,0) → (3200,0)
        #   Edge 3: (3200,0)→(3200,3000) = left wall

        # Use detect to find the correct wall indices
        from ifc_tool.import_ifc.shared_edge_detector import detect_shared_edges

        pairs = detect_shared_edges([room_a, room_b])
        assert len(pairs) == 1
        pair = pairs[0]

        result = close_gaps([room_a, room_b], [pair])

        # The right wall of A should move +100mm (outward toward B)
        # The left wall of B should move -100mm (outward toward A)
        # They should meet at x=3100
        poly_a = result[0].polygon
        poly_b = result[1].polygon

        # Find the x-coordinates of the shared edge vertices after shift.
        # For room A, the right-wall vertices should be at ~3100.
        right_wall_a_xs = [
            p.x for p in poly_a if abs(p.x - 3100.0) < 10.0
        ]
        assert len(right_wall_a_xs) >= 2, (
            f"Expected right wall at ~3100, got polygon: {[(p.x, p.y) for p in poly_a]}"
        )

        # For room B, the left-wall vertices should be at ~3100.
        left_wall_b_xs = [
            p.x for p in poly_b if abs(p.x - 3100.0) < 10.0
        ]
        assert len(left_wall_b_xs) >= 2, (
            f"Expected left wall at ~3100, got polygon: {[(p.x, p.y) for p in poly_b]}"
        )


class TestEmptyInput:
    """Edge cases with empty rooms or pairs."""

    def test_empty_rooms_and_pairs(self) -> None:
        result = close_gaps([], [])
        assert result == []

    def test_rooms_with_no_pairs(self) -> None:
        room = _make_room(_rect(0, 0, 3000, 3000))
        result = close_gaps([room], [])
        assert len(result) == 1
