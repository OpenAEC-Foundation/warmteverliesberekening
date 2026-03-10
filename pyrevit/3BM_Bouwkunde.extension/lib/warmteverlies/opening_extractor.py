# -*- coding: utf-8 -*-
"""Ramen en deuren extraheren uit host walls.

Gebruikt HostObject.FindInserts() om alle ingevoegde families
(ramen, deuren) in een wand te vinden.
"""
from Autodesk.Revit.DB import BuiltInParameter

from warmteverlies.unit_utils import internal_to_meters, get_param_value
from warmteverlies.constants import DEFAULT_U_VALUES


def extract_openings(doc, wall):
    """Extraheer alle ramen en deuren uit een wand.

    Args:
        doc: Revit Document
        wall: Revit Wall element

    Returns:
        list[dict]: Openings met category, area, u_value, name
    """
    if wall is None:
        return []

    try:
        insert_ids = wall.FindInserts(True, False, False, False)
    except Exception:
        return []

    if not insert_ids or insert_ids.Count == 0:
        return []

    openings = []
    for insert_id in insert_ids:
        element = doc.GetElement(insert_id)
        if element is None:
            continue

        category = _classify_opening(element)
        if category is None:
            continue

        width, height, area = _get_opening_dimensions(element)
        u_value = _get_opening_u_value(element, category)
        name = _get_type_name(element)

        openings.append({
            "element": element,
            "element_id": insert_id.IntegerValue,
            "category": category,
            "width_m": width,
            "height_m": height,
            "area_m2": area,
            "u_value": u_value,
            "name": name,
        })

    return openings


def calculate_net_wall_area(gross_area_m2, openings):
    """Bereken netto wandoppervlak na aftrek van openings."""
    total_opening_area = sum(o["area_m2"] for o in openings)
    return max(0.0, gross_area_m2 - total_opening_area)


def _classify_opening(element):
    """Classificeer een element als window of door."""
    cat = element.Category
    if cat is None:
        return None

    cat_id = cat.Id.IntegerValue
    if cat_id == -2000014:  # OST_Windows
        return "window"
    elif cat_id == -2000023:  # OST_Doors
        return "door"
    return None


def _get_opening_dimensions(element):
    """Bepaal afmetingen van een opening.

    Returns:
        tuple: (width_m, height_m, area_m2)
    """
    width = None
    height = None

    # Instance parameters
    for w_name in ["Width", "Rough Width", "Breedte"]:
        w = get_param_value(element, w_name)
        if w is not None and w > 0:
            width = internal_to_meters(w)
            break

    for h_name in ["Height", "Rough Height", "Hoogte"]:
        h = get_param_value(element, h_name)
        if h is not None and h > 0:
            height = internal_to_meters(h)
            break

    # Type parameters fallback
    if width is None or height is None:
        elem_type = element.Document.GetElement(element.GetTypeId())
        if elem_type:
            if width is None:
                for w_name in ["Width", "Rough Width", "Breedte"]:
                    w = get_param_value(elem_type, w_name)
                    if w is not None and w > 0:
                        width = internal_to_meters(w)
                        break

            if height is None:
                for h_name in ["Height", "Rough Height", "Hoogte"]:
                    h = get_param_value(elem_type, h_name)
                    if h is not None and h > 0:
                        height = internal_to_meters(h)
                        break

    if width is None:
        width = 1.0
    if height is None:
        height = 1.5

    return width, height, width * height


def _get_opening_u_value(element, category):
    """Bepaal de U-waarde van een opening."""
    # Directe parameter
    for param_name in [
        "Heat Transfer Coefficient (U)",
        "Warmtedoorgangscoefficient (U)",
        "Thermal Transmittance",
    ]:
        u = get_param_value(element, param_name)
        if u is not None and u > 0:
            return u

    # Type parameter
    elem_type = element.Document.GetElement(element.GetTypeId())
    if elem_type:
        for param_name in [
            "Heat Transfer Coefficient (U)",
            "Warmtedoorgangscoefficient (U)",
            "Thermal Transmittance",
        ]:
            u = get_param_value(elem_type, param_name)
            if u is not None and u > 0:
                return u

        # Analytical Heat Transfer Coefficient (imperial)
        analytical = get_param_value(
            elem_type, "ANALYTICAL_HEAT_TRANSFER_COEFFICIENT",
        )
        if analytical is not None and analytical > 0:
            return analytical * 5.678263

    if category == "window":
        return DEFAULT_U_VALUES["window"]
    return DEFAULT_U_VALUES["door_exterior"]


def _get_type_name(element):
    """Haal de type naam op van een FamilyInstance."""
    try:
        elem_type = element.Document.GetElement(element.GetTypeId())
        if elem_type:
            family_name = elem_type.FamilyName or ""
            type_name = elem_type.get_Parameter(
                BuiltInParameter.ALL_MODEL_TYPE_NAME
            )
            if type_name and type_name.HasValue:
                return "{0}: {1}".format(family_name, type_name.AsString())
            return family_name
    except Exception:
        pass
    return "Onbekend"
