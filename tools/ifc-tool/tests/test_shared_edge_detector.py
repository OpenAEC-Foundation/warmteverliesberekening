"""Tests for fuzzy shared edge detection between room polygons."""

from __future__ import annotations

import pytest

from ifc_tool.import_ifc.shared_edge_detector import detect_shared_edges
from ifc_tool.models import ModelRoom, Point2D


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


def _rect(
    x: float, y: float, w: float, h: float
) -> list[Point2D]:
    """Create a CCW rectangle polygon from bottom-left corner (mm)."""
    return [
        Point2D(x=x, y=y),
        Point2D(x=x + w, y=y),
        Point2D(x=x + w, y=y + h),
        Point2D(x=x, y=y + h),
    ]


class TestAdjacentRooms:
    """Two 3x3m rectangles side by side with a 200mm wall gap."""

    def test_detects_one_shared_edge(self) -> None:
        # Room A: 0,0 -> 3000,3000
        # Room B: 3200,0 -> 6200,3000  (200mm gap)
        room_a = _make_room(_rect(0, 0, 3000, 3000), name="Room A")
        room_b = _make_room(_rect(3200, 0, 3000, 3000), name="Room B")

        pairs = detect_shared_edges([room_a, room_b])

        assert len(pairs) == 1
        pair = pairs[0]
        assert pair.room_a_index == 0
        assert pair.room_b_index == 1
        assert pair.distance_mm == pytest.approx(200.0, abs=1.0)
        assert pair.overlap_mm == pytest.approx(3000.0, abs=1.0)
        assert pair.suggested_boundary == "interior"

    def test_wall_indices_are_correct(self) -> None:
        room_a = _make_room(_rect(0, 0, 3000, 3000), name="Room A")
        room_b = _make_room(_rect(3200, 0, 3000, 3000), name="Room B")

        pairs = detect_shared_edges([room_a, room_b])
        pair = pairs[0]

        # Room A's right wall: edge from (3000,0)->(3000,3000) = index 1
        assert pair.wall_a_index == 1
        # Room B's left wall: edge from (3200,3000)->(3200,0) = index 3
        assert pair.wall_b_index == 3


class TestDifferentFloors:
    """Two rooms on different floors should not be detected as shared."""

    def test_no_shared_edges(self) -> None:
        room_a = _make_room(
            _rect(0, 0, 3000, 3000), name="Room A", floor=0
        )
        room_b = _make_room(
            _rect(3200, 0, 3000, 3000), name="Room B", floor=1
        )

        pairs = detect_shared_edges([room_a, room_b])
        assert len(pairs) == 0


class TestParallelExteriorWalls:
    """Two parallel exterior walls (normals facing same direction) → no match."""

    def test_no_false_positive(self) -> None:
        # Both rooms have their right walls facing the same direction (+X).
        # Room A: 0,0 -> 3000,3000
        # Room B: 0,4000 -> 3000,7000 (same X range, offset in Y)
        # The bottom wall of B (y=4000) and top wall of A (y=3000) are
        # parallel and close (1000mm) but that's above threshold.
        #
        # Use rooms where parallel walls face the SAME direction:
        # Room A at x=0..3000, Room B at x=200..3200
        # Both have their bottom walls along y=0 and y=0+gap.
        # Actually, let's put them so their left walls are parallel
        # and both normals point left (away from each room).
        #
        # Room A: (0,0) to (3000,3000) — left wall normal points left (-x)
        # Room B: (-200,5000) to (2800,8000) — left wall normal also points left (-x)
        # Left walls: x=0 and x=-200, parallel, 200mm apart, but normals same dir
        room_a = _make_room(_rect(0, 0, 3000, 3000), name="Room A")
        room_b = _make_room(_rect(-200, 5000, 3000, 3000), name="Room B")

        pairs = detect_shared_edges([room_a, room_b])
        # Left walls are parallel and close (200mm) but normals both
        # point in the -X direction — they don't face each other.
        # Also the Y overlap is 0 (rooms don't overlap in Y at all).
        assert len(pairs) == 0


class TestGapTooLarge:
    """Gap > 500mm should not be detected."""

    def test_no_match_when_gap_exceeds_threshold(self) -> None:
        room_a = _make_room(_rect(0, 0, 3000, 3000), name="Room A")
        room_b = _make_room(_rect(3600, 0, 3000, 3000), name="Room B")

        pairs = detect_shared_edges([room_a, room_b])
        assert len(pairs) == 0


class TestLShapedRoom:
    """L-shaped room next to a rectangle — shared edge on the straight part."""

    def test_shared_edge_on_straight_segment(self) -> None:
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
        # Rectangle adjacent to the bottom-right arm of the L:
        #   right wall of L at x=6000, rectangle starts at x=6200
        rect_polygon = _rect(6200, 0, 3000, 3000)

        room_a = _make_room(l_polygon, name="L-shaped")
        room_b = _make_room(rect_polygon, name="Rectangle")

        pairs = detect_shared_edges([room_a, room_b])

        assert len(pairs) == 1
        pair = pairs[0]
        assert pair.distance_mm == pytest.approx(200.0, abs=1.0)
        assert pair.overlap_mm == pytest.approx(3000.0, abs=1.0)
        # L-room edge 1: (6000,0) → (6000,3000) — wall index 1
        assert pair.wall_a_index == 1


class TestMultipleSharedEdges:
    """Room that shares two edges with another room (e.g. wrapping around)."""

    def test_two_shared_edges_detected(self) -> None:
        # Room A: large room  (0,0) → (6000,6000)
        room_a = _make_room(_rect(0, 0, 6000, 6000), name="Big room")
        # Room B: small room adjacent to bottom and right of A
        # This is an L-shaped corridor wrapping the corner.
        # Bottom wall of A at y=0, Room B bottom edge at y=-200
        # Right wall of A at x=6000, Room B right edge at x=6200
        # We use a simple rectangle just to the right for clarity.
        # For two shared edges, put a room below (gap 200mm):
        room_b = _make_room(
            _rect(0, -3200, 6000, 3000), name="Room below"
        )
        # Room C to the right (gap 200mm):
        room_c = _make_room(
            _rect(6200, 0, 3000, 6000), name="Room right"
        )

        pairs = detect_shared_edges([room_a, room_b, room_c])

        # A-B: bottom edge of A (y=0) vs top edge of B (y=-200)
        # A-C: right edge of A (x=6000) vs left edge of C (x=6200)
        assert len(pairs) == 2


class TestSingleRoom:
    """A single room has nothing to compare against."""

    def test_no_pairs(self) -> None:
        room = _make_room(_rect(0, 0, 3000, 3000))
        assert detect_shared_edges([room]) == []


class TestEmptyRooms:
    """Empty list returns empty result."""

    def test_no_pairs(self) -> None:
        assert detect_shared_edges([]) == []


class TestSharedEdgeSerialization:
    """SharedEdgePair serializes to camelCase JSON aliases."""

    def test_camel_case_output(self) -> None:
        from ifc_tool.models import SharedEdgePair

        pair = SharedEdgePair(
            room_a_index=0,
            wall_a_index=1,
            room_b_index=2,
            wall_b_index=3,
            distance_mm=200.0,
            overlap_mm=3000.0,
        )
        data = pair.model_dump(by_alias=True)
        assert "roomAIndex" in data
        assert "wallAIndex" in data
        assert "roomBIndex" in data
        assert "wallBIndex" in data
        assert "distanceMm" in data
        assert "overlapMm" in data
        assert "suggestedBoundary" in data
        assert data["suggestedBoundary"] == "interior"
