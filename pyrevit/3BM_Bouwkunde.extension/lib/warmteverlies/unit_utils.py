# -*- coding: utf-8 -*-
"""Eenhedenconversie utilities voor Revit 2022-2025 compatibiliteit.

Revit 2022-2023 gebruiken DisplayUnitType (deprecated).
Revit 2024-2025 gebruiken ForgeTypeId.
Intern werkt Revit altijd in feet (lengte) en square feet (oppervlak).
"""
from warmteverlies.constants import FEET_TO_M, SQFT_TO_M2

from Autodesk.Revit.DB import UnitUtils

# Detecteer welke unit API beschikbaar is
try:
    from Autodesk.Revit.DB import ForgeTypeId
    HAS_FORGE_UNITS = True
except ImportError:
    HAS_FORGE_UNITS = False
    try:
        from Autodesk.Revit.DB import DisplayUnitType
    except ImportError:
        pass


def internal_to_meters(value_feet):
    """Converteer Revit internal units (feet) naar meters."""
    if HAS_FORGE_UNITS:
        return UnitUtils.ConvertFromInternalUnits(
            value_feet,
            ForgeTypeId("autodesk.unit.unit:meters-1.0.1"),
        )
    return value_feet * FEET_TO_M


def internal_to_sqm(value_sqft):
    """Converteer Revit internal units (square feet) naar vierkante meters."""
    if HAS_FORGE_UNITS:
        return UnitUtils.ConvertFromInternalUnits(
            value_sqft,
            ForgeTypeId("autodesk.unit.unit:squareMeters-1.0.1"),
        )
    return value_sqft * SQFT_TO_M2


def internal_to_mm(value_feet):
    """Converteer Revit internal units (feet) naar millimeters."""
    return internal_to_meters(value_feet) * 1000.0


def feet_to_m(value):
    """Directe conversie feet naar meters (zonder Revit API)."""
    return value * FEET_TO_M


def sqft_to_m2(value):
    """Directe conversie square feet naar vierkante meters (zonder Revit API)."""
    return value * SQFT_TO_M2


def get_param_value(element, param_name, default=None):
    """Haal parameterwaarde op van een Revit element.

    Args:
        element: Revit Element
        param_name: Parameternaam als string
        default: Fallback waarde

    Returns:
        Parameterwaarde of default
    """
    param = element.LookupParameter(param_name)
    if param is None or not param.HasValue:
        return default

    storage_type = param.StorageType.ToString()
    if storage_type == "Double":
        return param.AsDouble()
    elif storage_type == "Integer":
        return param.AsInteger()
    elif storage_type == "String":
        return param.AsString()
    elif storage_type == "ElementId":
        return param.AsElementId()
    return default


def get_param_value_si(element, param_name, unit_type="length", default=None):
    """Haal parameterwaarde op en converteer naar SI eenheden.

    Args:
        element: Revit Element
        param_name: Parameternaam als string
        unit_type: "length" (m), "area" (m2), of "raw" (geen conversie)
        default: Fallback waarde

    Returns:
        Waarde in SI eenheden of default
    """
    raw = get_param_value(element, param_name, default=None)
    if raw is None:
        return default

    if unit_type == "length":
        return internal_to_meters(raw)
    elif unit_type == "area":
        return internal_to_sqm(raw)
    return raw


def get_room_height(room, default_height_m=2.6):
    """Bepaal de hoogte van een room in meters.

    Probeert in volgorde:
    1. UnboundedHeight parameter
    2. Limit Offset parameter
    3. Default waarde

    Args:
        room: Revit Room element
        default_height_m: Fallback hoogte in meters

    Returns:
        Hoogte in meters
    """
    unbounded = get_param_value(room, "Unbounded Height")
    if unbounded is not None and unbounded > 0:
        return internal_to_meters(unbounded)

    upper_offset = get_param_value(room, "Limit Offset")
    if upper_offset is not None and upper_offset > 0:
        return internal_to_meters(upper_offset)

    return default_height_m
