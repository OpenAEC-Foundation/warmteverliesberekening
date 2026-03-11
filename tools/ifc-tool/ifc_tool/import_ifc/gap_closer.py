"""Close gaps between IFC-imported room polygons.

IFC IfcSpace polygons stop at the wall surface.  Adjacent rooms therefore
have a gap equal to the wall thickness (typically 100-400 mm).  After
shared-edge detection, this module expands each polygon by half the gap
toward the neighbouring room so that the edges meet at the wall
centre-line.

All coordinates are in mm.
"""

from __future__ import annotations

import logging
import math

from ifc_tool.constants import GAP_CLOSE_AREA_TOLERANCE
from ifc_tool.import_ifc.geometry import polygon_area
from ifc_tool.models import ModelRoom, Point2D, SharedEdgePair

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def close_gaps(
    rooms: list[ModelRoom],
    pairs: list[SharedEdgePair],
) -> list[ModelRoom]:
    """Expand room polygons so that shared edges meet at the wall centre-line.

    For every :class:`SharedEdgePair`, each edge is shifted outward by
    half the detected gap (``distance_mm / 2``).  The shift direction is
    the outward normal of the edge, which points toward the neighbouring
    room.

    A safety check ensures the area of each modified polygon does not
    change by more than ``GAP_CLOSE_AREA_TOLERANCE`` (5 %).  If it does,
    the original polygon is kept.

    Args:
        rooms: Rooms extracted from IFC spaces (not mutated).
        pairs: Shared edge pairs from :func:`detect_shared_edges`.

    Returns:
        New list of :class:`ModelRoom` with adjusted polygons.
    """
    if not pairs:
        return [_copy_room(r) for r in rooms]

    # Build per-room shift instructions: room_index -> list of (wall_index, shift_vec)
    shifts: dict[int, list[tuple[int, tuple[float, float]]]] = {}

    for pair in pairs:
        half_gap = pair.distance_mm / 2.0

        # Edge A: compute outward normal and shift vector
        shift_a = _edge_outward_shift(
            rooms[pair.room_a_index].polygon,
            pair.wall_a_index,
            half_gap,
        )
        if shift_a is not None:
            shifts.setdefault(pair.room_a_index, []).append(
                (pair.wall_a_index, shift_a)
            )

        # Edge B: compute outward normal and shift vector
        shift_b = _edge_outward_shift(
            rooms[pair.room_b_index].polygon,
            pair.wall_b_index,
            half_gap,
        )
        if shift_b is not None:
            shifts.setdefault(pair.room_b_index, []).append(
                (pair.wall_b_index, shift_b)
            )

    # Apply shifts and build new room list
    result: list[ModelRoom] = []
    for idx, room in enumerate(rooms):
        if idx not in shifts:
            result.append(_copy_room(room))
            continue

        new_polygon = _apply_shifts(room.polygon, shifts[idx])

        # Safety check: area change within tolerance
        original_area = abs(polygon_area(room.polygon))
        new_area = abs(polygon_area(new_polygon))

        if original_area > 0 and (
            abs(new_area - original_area) / original_area
            > GAP_CLOSE_AREA_TOLERANCE
        ):
            logger.warning(
                "Gap closing for '%s' changed area by %.1f%% "
                "(original=%.0f mm², new=%.0f mm²) — keeping original",
                room.name,
                abs(new_area - original_area) / original_area * 100,
                original_area,
                new_area,
            )
            result.append(_copy_room(room))
            continue

        new_room = room.model_copy(update={"polygon": new_polygon})
        result.append(new_room)

    logger.info(
        "Gap closing applied %d edge shifts across %d rooms",
        sum(len(v) for v in shifts.values()),
        len(shifts),
    )
    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _copy_room(room: ModelRoom) -> ModelRoom:
    """Create a shallow copy of a room (new polygon list, same point data)."""
    return room.model_copy(
        update={"polygon": [Point2D(x=p.x, y=p.y) for p in room.polygon]}
    )


def _edge_outward_shift(
    polygon: list[Point2D],
    wall_index: int,
    distance: float,
) -> tuple[float, float] | None:
    """Compute the outward shift vector for a polygon edge.

    The outward normal of edge ``(p_i -> p_{i+1})`` for a CCW polygon is
    ``(dy, -dx)`` (normalised), multiplied by *distance*.

    Returns:
        ``(shift_x, shift_y)`` or ``None`` for degenerate edges.
    """
    n = len(polygon)
    p1 = polygon[wall_index]
    p2 = polygon[(wall_index + 1) % n]

    dx = p2.x - p1.x
    dy = p2.y - p1.y
    length = math.hypot(dx, dy)

    if length < 1e-9:
        return None

    # Outward normal for CCW polygon: (dy, -dx) / length
    nx = dy / length
    ny = -dx / length

    return (nx * distance, ny * distance)


def _apply_shifts(
    polygon: list[Point2D],
    edge_shifts: list[tuple[int, tuple[float, float]]],
) -> list[Point2D]:
    """Apply edge shifts to polygon vertices.

    Each edge shift moves both vertices of the indicated edge by the
    given vector.  When a vertex is shared by multiple shifted edges,
    the shifts are averaged to keep the polygon consistent.

    Returns:
        New list of :class:`Point2D` with adjusted coordinates.
    """
    n = len(polygon)

    # Accumulate shifts per vertex: vertex_index -> list of (dx, dy)
    vertex_shifts: dict[int, list[tuple[float, float]]] = {}

    for wall_index, (sx, sy) in edge_shifts:
        v1 = wall_index
        v2 = (wall_index + 1) % n

        vertex_shifts.setdefault(v1, []).append((sx, sy))
        vertex_shifts.setdefault(v2, []).append((sx, sy))

    # Build new polygon
    new_points: list[Point2D] = []
    for i, p in enumerate(polygon):
        if i in vertex_shifts:
            shifts_list = vertex_shifts[i]
            avg_sx = sum(s[0] for s in shifts_list) / len(shifts_list)
            avg_sy = sum(s[1] for s in shifts_list) / len(shifts_list)
            new_points.append(Point2D(x=p.x + avg_sx, y=p.y + avg_sy))
        else:
            new_points.append(Point2D(x=p.x, y=p.y))

    return new_points
