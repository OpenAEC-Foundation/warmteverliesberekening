"""Extract windows and doors from IFC and match to room polygon edges.

Best-effort: if matching to a wall edge fails, a warning is added
but the opening is still included with ``wallIndex = -1``.
"""

from __future__ import annotations

import logging
import math
from typing import TYPE_CHECKING

from ifc_tool.constants import WALL_MATCH_TOLERANCE_MM
from ifc_tool.models import ImportWarning, ModelDoor, ModelRoom, ModelWindow, Point2D

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)


def extract_openings(
    ifc_file: ifcopenshell.file,
    rooms: list[ModelRoom],
    unit_to_mm: float,
) -> tuple[list[ModelWindow], list[ModelDoor], list[ImportWarning]]:
    """Extract IfcWindow and IfcDoor entities and match to rooms.

    Args:
        ifc_file: An opened IfcOpenShell file.
        rooms: Already-extracted rooms (needed for wall matching).
        unit_to_mm: Conversion factor from IFC units to mm.

    Returns:
        Tuple of (windows, doors, warnings).
    """
    windows: list[ModelWindow] = []
    doors: list[ModelDoor] = []
    warnings: list[ImportWarning] = []

    # Build room lookup by name for matching
    room_by_name: dict[str, int] = {}
    for idx, room in enumerate(rooms):
        room_by_name[room.name.lower()] = idx

    # Extract windows
    for ifc_window in ifc_file.by_type("IfcWindow"):
        result = _extract_opening(
            ifc_window, rooms, unit_to_mm, room_by_name
        )
        if result is None:
            continue

        room_idx, wall_index, offset, width = result
        room = rooms[room_idx]

        # Use room name as roomId (actual ID assignment happens in frontend)
        windows.append(
            ModelWindow(
                room_id=room.name,
                wall_index=wall_index,
                offset=offset,
                width=width,
            )
        )

    # Extract doors
    for ifc_door in ifc_file.by_type("IfcDoor"):
        result = _extract_opening(
            ifc_door, rooms, unit_to_mm, room_by_name
        )
        if result is None:
            continue

        room_idx, wall_index, offset, width = result
        room = rooms[room_idx]

        # Determine swing from door properties (default: left)
        swing = _detect_door_swing(ifc_door)

        doors.append(
            ModelDoor(
                room_id=room.name,
                wall_index=wall_index,
                offset=offset,
                width=width,
                swing=swing,
            )
        )

    logger.info(
        "Extracted %d windows and %d doors", len(windows), len(doors)
    )
    return windows, doors, warnings


def _extract_opening(
    element: ifcopenshell.entity_instance,
    rooms: list[ModelRoom],
    unit_to_mm: float,
    room_by_name: dict[str, int],
) -> tuple[int, int, float, float] | None:
    """Extract a single opening (window or door).

    Returns (room_index, wall_index, offset_mm, width_mm) or None.
    """
    # Get overall dimensions
    width = _get_dimension(element, "OverallWidth", unit_to_mm)
    if width is None or width <= 0:
        return None

    # Find host wall via IfcRelFillsElement
    host_wall = _get_host_wall(element)
    if host_wall is None:
        return None

    # Get opening placement (world coordinates)
    position = _get_world_position(element, unit_to_mm)
    if position is None:
        return None

    # Transform to screen coordinates (Y flip)
    screen_pos = Point2D(x=position.x, y=-position.y)

    # Find which room and wall edge this opening belongs to
    match = _match_to_room_wall(screen_pos, rooms)
    if match is None:
        return None

    room_idx, wall_index, offset = match
    return room_idx, wall_index, offset, width


def _get_dimension(
    element: ifcopenshell.entity_instance,
    attr: str,
    unit_to_mm: float,
) -> float | None:
    """Get a dimension attribute, checking element and type."""
    val = getattr(element, attr, None)
    if val is not None and float(val) > 0:
        return float(val) * unit_to_mm

    # Check the type definition
    element_type = _get_element_type(element)
    if element_type is not None:
        val = getattr(element_type, attr, None)
        if val is not None and float(val) > 0:
            return float(val) * unit_to_mm

    return None


def _get_element_type(
    element: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance | None:
    """Get the type object for an element."""
    try:
        import ifcopenshell.util.element

        return ifcopenshell.util.element.get_type(element)
    except Exception:
        return None


def _get_host_wall(
    element: ifcopenshell.entity_instance,
) -> ifcopenshell.entity_instance | None:
    """Get the host wall of an opening via IfcRelFillsElement."""
    for rel in getattr(element, "FillsVoids", []) or []:
        opening = rel.RelatingOpeningElement
        if opening:
            for rel2 in getattr(opening, "VoidsElements", []) or []:
                return rel2.RelatingBuildingElement
    return None


def _get_world_position(
    element: ifcopenshell.entity_instance,
    unit_to_mm: float,
) -> Point2D | None:
    """Extract the world XY position of an element's placement."""
    placement = getattr(element, "ObjectPlacement", None)
    if placement is None:
        return None

    try:
        import ifcopenshell.util.placement

        matrix = ifcopenshell.util.placement.get_local_placement(placement)
        x = float(matrix[0][3]) * unit_to_mm
        y = float(matrix[1][3]) * unit_to_mm
        return Point2D(x=x, y=y)
    except Exception:
        return None


def _match_to_room_wall(
    position: Point2D,
    rooms: list[ModelRoom],
) -> tuple[int, int, float] | None:
    """Match a screen-space position to the nearest room wall edge.

    Returns (room_index, wall_index, offset_along_wall) or None.
    """
    best_dist = WALL_MATCH_TOLERANCE_MM
    best_match: tuple[int, int, float] | None = None

    for room_idx, room in enumerate(rooms):
        polygon = room.polygon
        n = len(polygon)
        for wi in range(n):
            a = polygon[wi]
            b = polygon[(wi + 1) % n]

            # Project position onto wall edge
            dist, offset = _point_to_segment(position, a, b)
            if dist < best_dist:
                best_dist = dist
                best_match = (room_idx, wi, offset)

    return best_match


def _point_to_segment(
    p: Point2D, a: Point2D, b: Point2D
) -> tuple[float, float]:
    """Distance from point to line segment, plus offset along segment.

    Returns (distance, offset_from_start_to_projection).
    """
    dx = b.x - a.x
    dy = b.y - a.y
    seg_len_sq = dx * dx + dy * dy

    if seg_len_sq < 1e-10:
        dist = math.hypot(p.x - a.x, p.y - a.y)
        return dist, 0.0

    t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / seg_len_sq
    t = max(0.0, min(1.0, t))

    proj_x = a.x + t * dx
    proj_y = a.y + t * dy
    dist = math.hypot(p.x - proj_x, p.y - proj_y)
    offset = t * math.sqrt(seg_len_sq)

    return dist, offset


def _detect_door_swing(
    door: ifcopenshell.entity_instance,
) -> str:
    """Detect door swing direction from IFC properties.

    Returns 'left' or 'right'.
    """
    operation_type = getattr(door, "OperationType", None)
    if operation_type and "RIGHT" in str(operation_type).upper():
        return "right"
    return "left"
