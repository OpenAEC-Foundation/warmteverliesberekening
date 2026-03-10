# -*- coding: utf-8 -*-
"""Grensclassificatie: bepaal het boundary_type per grensvlak.

Decision tree per boundary face:
  Wall -> WallType.Function == Exterior? -> "exterior"
       -> Room aan andere kant in heated set? -> "adjacent_room"
       -> Room aan andere kant NIET heated? -> "unheated_space"
       -> Geen room, niet exterior? -> "unheated_space" (conservatief)
  Floor -> Level elevation < 0.5m? -> "ground"
        -> Room eronder/erboven? -> "adjacent_room"
  Roof  -> altijd "exterior"
  None  -> "exterior" (conservatief)
"""
from Autodesk.Revit.DB import (
    SpatialElementBoundaryOptions,
    SpatialElementBoundaryLocation,
    BuiltInParameter,
)

from warmteverlies.room_function_mapper import get_design_temperature


def classify_boundaries(doc, room_data, boundaries, all_rooms, heated_room_ids):
    """Classificeer alle boundary faces van een room.

    Args:
        doc: Revit Document
        room_data: Room data dict (uit room_collector)
        boundaries: list[dict] boundary faces (uit boundary_analyzer)
        all_rooms: Alle room data dicts
        heated_room_ids: set van element_id's van verwarmde ruimten

    Returns:
        list[dict]: Boundary faces aangevuld met boundary_type etc.
    """
    room_lookup = _build_element_room_lookup(doc, all_rooms)

    for boundary in boundaries:
        _classify_single(
            doc, room_data, boundary,
            room_lookup, all_rooms, heated_room_ids,
        )

    return boundaries


def _classify_single(
    doc, room_data, boundary, room_lookup, all_rooms, heated_room_ids
):
    """Classificeer een enkel grensvlak."""
    host = boundary.get("host_element")
    host_category = boundary.get("host_category")
    position = boundary.get("position_type")

    # Defaults
    boundary["boundary_type"] = "exterior"
    boundary["adjacent_room_data"] = None
    boundary["adjacent_temperature"] = None
    boundary["temperature_factor"] = None

    # Roof -> altijd exterior
    if host_category == "Roof":
        boundary["boundary_type"] = "exterior"
        return

    # Wall classificatie
    if host_category == "Wall" and host is not None:
        if _is_exterior_wall(host):
            boundary["boundary_type"] = "exterior"
            return

        adjacent = _find_adjacent_room(
            boundary.get("host_element_id"),
            room_data["element_id"],
            room_lookup, all_rooms,
        )

        if adjacent is not None:
            if adjacent["element_id"] in heated_room_ids:
                boundary["boundary_type"] = "adjacent_room"
                boundary["adjacent_room_data"] = adjacent
                boundary["adjacent_temperature"] = get_design_temperature(
                    adjacent.get("function", "custom")
                )
            else:
                boundary["boundary_type"] = "unheated_space"
                boundary["adjacent_room_data"] = adjacent
        else:
            boundary["boundary_type"] = "unheated_space"
        return

    # Floor classificatie
    if position == "floor" or host_category == "Floor":
        level_elev = room_data.get("level_elevation_m", 0.0)
        if level_elev < 0.5:
            boundary["boundary_type"] = "ground"
            return

        if boundary.get("host_element_id"):
            adjacent = _find_adjacent_room(
                boundary["host_element_id"],
                room_data["element_id"],
                room_lookup, all_rooms,
            )
            if adjacent is not None:
                if adjacent["element_id"] in heated_room_ids:
                    boundary["boundary_type"] = "adjacent_room"
                    boundary["adjacent_room_data"] = adjacent
                    boundary["adjacent_temperature"] = get_design_temperature(
                        adjacent.get("function", "custom")
                    )
                else:
                    boundary["boundary_type"] = "unheated_space"
                    boundary["adjacent_room_data"] = adjacent
                return

        boundary["boundary_type"] = "exterior"
        return

    # Ceiling classificatie
    if position == "ceiling" or host_category == "Ceiling":
        if boundary.get("host_element_id"):
            adjacent = _find_adjacent_room(
                boundary["host_element_id"],
                room_data["element_id"],
                room_lookup, all_rooms,
            )
            if adjacent is not None:
                if adjacent["element_id"] in heated_room_ids:
                    boundary["boundary_type"] = "adjacent_room"
                    boundary["adjacent_room_data"] = adjacent
                    boundary["adjacent_temperature"] = get_design_temperature(
                        adjacent.get("function", "custom")
                    )
                else:
                    boundary["boundary_type"] = "unheated_space"
                    boundary["adjacent_room_data"] = adjacent
                return

        boundary["boundary_type"] = "exterior"
        return

    # Geen host element -> conservatief exterior
    boundary["boundary_type"] = "exterior"


def _is_exterior_wall(wall):
    """Controleer of een Wall een buitenwand is via WallType.Function."""
    try:
        wall_type = wall.WallType
        if wall_type is None:
            return False

        func_param = wall_type.get_Parameter(
            BuiltInParameter.FUNCTION_PARAM
        )
        if func_param and func_param.HasValue:
            func_value = func_param.AsInteger()
            # WallFunction.Exterior = 0
            return func_value == 0
    except Exception:
        pass

    return False


def _build_element_room_lookup(doc, all_rooms):
    """Bouw lookup: element_id -> set(room_element_ids)."""
    lookup = {}
    opt = SpatialElementBoundaryOptions()
    opt.SpatialElementBoundaryLocation = (
        SpatialElementBoundaryLocation.Finish
    )

    for room_data in all_rooms:
        room = room_data["element"]
        room_eid = room_data["element_id"]

        try:
            segments_list = room.GetBoundarySegments(opt)
            if not segments_list:
                continue

            for segment_loop in segments_list:
                for segment in segment_loop:
                    elem_id = segment.ElementId
                    if elem_id and elem_id.IntegerValue > 0:
                        eid = elem_id.IntegerValue
                        if eid not in lookup:
                            lookup[eid] = set()
                        lookup[eid].add(room_eid)
        except Exception:
            continue

    return lookup


def _find_adjacent_room(host_element_id, current_room_eid, room_lookup, all_rooms):
    """Vind de room aan de andere kant van een gedeeld element."""
    if host_element_id is None or host_element_id not in room_lookup:
        return None

    adjacent_eids = room_lookup[host_element_id]
    room_by_eid = {r["element_id"]: r for r in all_rooms}

    for eid in adjacent_eids:
        if eid != current_room_eid and eid in room_by_eid:
            return room_by_eid[eid]

    return None
