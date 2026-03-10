# -*- coding: utf-8 -*-
"""U-waarde bepaling uit Revit elementen.

Drie pogingen in volgorde:
1. CompoundStructure: laagopbouw -> R per laag -> U = 1/Rtot
2. Revit parameter: ANALYTICAL_HEAT_TRANSFER_COEFFICIENT
3. Default: lookup in constants per constructietype
"""
from Autodesk.Revit.DB import BuiltInParameter, ElementId

from warmteverlies.unit_utils import internal_to_meters, get_param_value
from warmteverlies.constants import (
    DEFAULT_U_VALUES,
    RSI_HORIZONTAL, RSE_HORIZONTAL,
    RSI_UPWARD, RSE_UPWARD,
    RSI_DOWNWARD, RSE_DOWNWARD,
    RSI_GROUND, RSE_GROUND,
)


def get_u_value(doc, host_element, position_type="wall", boundary_type="exterior"):
    """Bepaal de U-waarde van een constructie-element.

    Args:
        doc: Revit Document
        host_element: Revit Element (Wall/Floor/Roof)
        position_type: "wall", "floor", of "ceiling"
        boundary_type: "exterior", "adjacent_room", "unheated_space", "ground"

    Returns:
        tuple: (u_value, source) waar source "compound"/"parameter"/"default"
    """
    if host_element is None:
        return _get_default_u(position_type, boundary_type), "default"

    u_compound = _try_compound_structure(
        doc, host_element, position_type, boundary_type
    )
    if u_compound is not None:
        return u_compound, "compound"

    u_param = _try_parameter(host_element)
    if u_param is not None:
        return u_param, "parameter"

    return _get_default_u(position_type, boundary_type), "default"


def _try_compound_structure(doc, element, position_type, boundary_type):
    """Probeer U-waarde te berekenen uit de CompoundStructure laagopbouw."""
    try:
        elem_type = doc.GetElement(element.GetTypeId())
        if elem_type is None:
            return None

        compound = elem_type.GetCompoundStructure()
        if compound is None:
            return None

        layers = compound.GetLayers()
        if not layers or layers.Count == 0:
            return None

        total_r = 0.0
        valid_layers = 0

        for layer in layers:
            width_ft = layer.Width
            thickness_m = internal_to_meters(width_ft)

            if thickness_m <= 0:
                continue

            mat_id = layer.MaterialId
            if mat_id is None or mat_id == ElementId.InvalidElementId:
                continue

            material = doc.GetElement(mat_id)
            if material is None:
                continue

            conductivity = _get_thermal_conductivity(material)
            if conductivity is None or conductivity <= 0:
                continue

            r_layer = thickness_m / conductivity
            total_r += r_layer
            valid_layers += 1

        if valid_layers == 0 or total_r <= 0:
            return None

        rsi, rse = _get_surface_resistances(position_type, boundary_type)
        r_total = rsi + total_r + rse

        if r_total <= 0:
            return None

        return round(1.0 / r_total, 3)

    except Exception:
        return None


def _get_thermal_conductivity(material):
    """Haal lambda [W/(m*K)] op uit een Revit Material."""
    try:
        thermal_asset_id = material.ThermalAssetId
        if (thermal_asset_id is None
                or thermal_asset_id == ElementId.InvalidElementId):
            return None

        doc = material.Document
        prop_set = doc.GetElement(thermal_asset_id)
        if prop_set is None:
            return None

        thermal_asset = prop_set.GetThermalAsset()
        if thermal_asset is None:
            return None

        return thermal_asset.ThermalConductivity

    except Exception:
        return None


def _try_parameter(element):
    """Probeer U-waarde uit Revit parameter te halen."""
    for param_name in [
        "Heat Transfer Coefficient (U)",
        "Warmtedoorgangscoefficient (U)",
        "Thermal Transmittance",
    ]:
        u = get_param_value(element, param_name)
        if u is not None and u > 0:
            return u

    try:
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

            param = elem_type.get_Parameter(
                BuiltInParameter.ANALYTICAL_HEAT_TRANSFER_COEFFICIENT
            )
            if param and param.HasValue:
                val = param.AsDouble()
                if val > 0:
                    return round(val * 5.678263, 3)
    except Exception:
        pass

    return None


def _get_surface_resistances(position_type, boundary_type):
    """Bepaal Rsi en Rse op basis van positie en grenstype."""
    if boundary_type == "ground":
        return RSI_GROUND, RSE_GROUND

    if position_type == "ceiling":
        rsi = RSI_UPWARD
    elif position_type == "floor":
        rsi = RSI_DOWNWARD
    else:
        rsi = RSI_HORIZONTAL

    if boundary_type in ("adjacent_room", "unheated_space"):
        rse = rsi  # Binnenzijde aan beide kanten
    else:
        if position_type == "ceiling":
            rse = RSE_UPWARD
        elif position_type == "floor":
            rse = RSE_DOWNWARD
        else:
            rse = RSE_HORIZONTAL

    return rsi, rse


def _get_default_u(position_type, boundary_type):
    """Haal default U-waarde op basis van positie en grenstype."""
    if boundary_type == "ground":
        return DEFAULT_U_VALUES["floor_ground"]

    if position_type == "wall":
        if boundary_type == "exterior":
            return DEFAULT_U_VALUES["exterior_wall"]
        return DEFAULT_U_VALUES["interior_wall"]
    elif position_type == "floor":
        if boundary_type == "exterior":
            return DEFAULT_U_VALUES["floor_ground"]
        return DEFAULT_U_VALUES["floor_interior"]
    elif position_type == "ceiling":
        if boundary_type == "exterior":
            return DEFAULT_U_VALUES["roof"]
        return DEFAULT_U_VALUES["ceiling_interior"]

    return DEFAULT_U_VALUES["exterior_wall"]
