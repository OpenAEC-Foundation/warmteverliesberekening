# -*- coding: utf-8 -*-
"""Room naam naar ISSO 51 RoomFunction mapping.

Pure Python module — geen Revit API dependency, standalone testbaar.
Matcht Nederlandse en Engelse ruimtenamen op ISSO 51 functies.
"""
import re

from warmteverlies.constants import DESIGN_TEMPERATURES

# Patronen: (regex, isso51_function)
# Volgorde is belangrijk: specifiekere patronen eerst.
FUNCTION_PATTERNS = [
    (re.compile(r"woonkamer|huiskamer|living|zitkamer", re.IGNORECASE),
     "living_room"),
    (re.compile(r"slaapkamer|bedroom", re.IGNORECASE),
     "bedroom"),
    (re.compile(r"keuken|kitchen", re.IGNORECASE),
     "kitchen"),
    (re.compile(r"badkamer|bathroom|doucheruimte", re.IGNORECASE),
     "bathroom"),
    (re.compile(r"toilet|wc\b", re.IGNORECASE),
     "toilet"),
    (re.compile(r"hal\b|gang|entree|corridor", re.IGNORECASE),
     "hallway"),
    (re.compile(r"overloop|landing", re.IGNORECASE),
     "landing"),
    (re.compile(r"berging|storage|opslag", re.IGNORECASE),
     "storage"),
    (re.compile(r"zolder|attic|vliering", re.IGNORECASE),
     "attic"),
    (re.compile(r"kantoor|office|studeerkamer|werkruimte|studie", re.IGNORECASE),
     "bedroom"),  # kantoor -> bedroom (zelfde theta_i = 20)
    (re.compile(r"wasruimte|laundry|bijkeuken", re.IGNORECASE),
     "kitchen"),  # bijkeuken -> kitchen (zelfde theta_i = 20)
]

# Patronen voor ruimten die waarschijnlijk onverwarmd zijn
UNHEATED_PATTERNS = [
    re.compile(r"garage", re.IGNORECASE),
    re.compile(r"berging|bergkast", re.IGNORECASE),
    re.compile(r"trappenhuis|trappenhal", re.IGNORECASE),
    re.compile(r"kruipruimte|crawl\s*space", re.IGNORECASE),
    re.compile(r"kelder|basement|souterrain", re.IGNORECASE),
    re.compile(r"technische\s*ruimte|meterkast", re.IGNORECASE),
    re.compile(r"schuur|shed", re.IGNORECASE),
]


def map_room_function(room_name):
    """Bepaal ISSO 51 functie op basis van de room naam.

    Args:
        room_name: Ruimtenaam als string

    Returns:
        str: ISSO 51 RoomFunction waarde of "custom"
    """
    if not room_name:
        return "custom"

    for pattern, function in FUNCTION_PATTERNS:
        if pattern.search(room_name):
            return function

    return "custom"


def get_design_temperature(function):
    """Haal de ontwerptemperatuur op voor een RoomFunction.

    Args:
        function: ISSO 51 RoomFunction string

    Returns:
        float: Ontwerptemperatuur in graden C
    """
    return DESIGN_TEMPERATURES.get(function, 20.0)


def is_likely_unheated(room_name):
    """Controleer of een ruimte waarschijnlijk onverwarmd is.

    Args:
        room_name: Ruimtenaam als string

    Returns:
        bool: True als de ruimte waarschijnlijk niet verwarmd is
    """
    if not room_name:
        return False

    for pattern in UNHEATED_PATTERNS:
        if pattern.search(room_name):
            return True

    return False


def suggest_heating_system(function):
    """Suggereer een verwarmingssysteem op basis van de ruimtefunctie.

    Args:
        function: ISSO 51 RoomFunction string

    Returns:
        str: HeatingSystem waarde (default "radiator_lt")
    """
    return "radiator_lt"


def map_all_rooms(rooms):
    """Map functies voor een lijst van room data dicts.

    Args:
        rooms: list[dict] van room data (uit room_collector)

    Returns:
        list[dict]: Dezelfde lijst met ingevulde function en is_heated
    """
    for room in rooms:
        name = room.get("name", "")
        room["function"] = map_room_function(name)
        if is_likely_unheated(name):
            room["is_heated"] = False
    return rooms
