# -*- coding: utf-8 -*-
"""Rooms ophalen uit het Revit model met basisdata.

Verzamelt alle geplaatste rooms met oppervlakte > 0 en extraheert
de basisgegevens die nodig zijn voor de warmteverliesberekening.
"""
from Autodesk.Revit.DB import (
    FilteredElementCollector,
    BuiltInCategory,
    BuiltInParameter,
)

from warmteverlies.unit_utils import (
    internal_to_sqm,
    internal_to_meters,
    get_room_height,
    get_param_value,
)


def collect_rooms(doc):
    """Verzamel alle geplaatste rooms met oppervlakte > 0.

    Args:
        doc: Revit Document

    Returns:
        list[dict]: Room data dictionaries
    """
    collector = (
        FilteredElementCollector(doc)
        .OfCategory(BuiltInCategory.OST_Rooms)
        .WhereElementIsNotElementType()
    )

    rooms = []
    for room in collector:
        if room.Area <= 0:
            continue

        level = doc.GetElement(room.LevelId)
        level_name = level.Name if level else "Onbekend"
        level_elev = 0.0
        if level:
            elev_param = level.get_Parameter(BuiltInParameter.LEVEL_ELEV)
            if elev_param and elev_param.HasValue:
                level_elev = internal_to_meters(elev_param.AsDouble())

        room_data = {
            "element": room,
            "element_id": room.Id.IntegerValue,
            "name": _get_room_name(room),
            "number": _get_room_number(room),
            "level_name": level_name,
            "level_elevation_m": level_elev,
            "floor_area_m2": internal_to_sqm(room.Area),
            "height_m": get_room_height(room),
            "is_heated": True,
            "function": None,
        }
        rooms.append(room_data)

    rooms.sort(key=lambda r: (r["level_elevation_m"], r["number"]))
    return rooms


def generate_room_id(room_data, all_rooms):
    """Genereer een room ID in het formaat <verdieping>.<nummer>.

    Args:
        room_data: Room data dictionary
        all_rooms: Alle room data dictionaries (voor nummering)

    Returns:
        str: Room ID (bijv. "0.01", "1.02")
    """
    elev = room_data["level_elevation_m"]
    floor = _get_floor_number(elev)

    same_floor = [
        r for r in all_rooms
        if _get_floor_number(r["level_elevation_m"]) == floor
    ]
    same_floor.sort(key=lambda r: (r["level_elevation_m"], r["number"]))
    idx = 1
    for r in same_floor:
        if r["element_id"] == room_data["element_id"]:
            break
        idx += 1

    return "{0}.{1:02d}".format(floor, idx)


def _get_floor_number(elevation_m):
    """Bepaal verdiepingsnummer uit elevation."""
    if elevation_m < 0.5:
        return 0
    return max(0, int(round(elevation_m / 3.0)))


def _get_room_name(room):
    """Haal room naam op, met fallback."""
    name_param = room.get_Parameter(BuiltInParameter.ROOM_NAME)
    if name_param and name_param.HasValue:
        name = name_param.AsString()
        if name:
            return name
    return "Ruimte {0}".format(room.Id.IntegerValue)


def _get_room_number(room):
    """Haal room nummer op, met fallback."""
    num_param = room.get_Parameter(BuiltInParameter.ROOM_NUMBER)
    if num_param and num_param.HasValue:
        num = num_param.AsString()
        if num:
            return num
    return str(room.Id.IntegerValue)
