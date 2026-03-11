"""Detect IFC length units and compute conversion factor to mm.

Reads ``IfcUnitAssignment`` from the IFC model and determines the
length unit. Returns a multiplication factor so that:

    value_in_mm = ifc_value * factor
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ifc_tool.constants import DEFAULT_UNIT_TO_MM

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)

# SI prefix → factor relative to meters
_SI_PREFIX_TO_METERS: dict[str, float] = {
    "EXA": 1e18,
    "PETA": 1e15,
    "TERA": 1e12,
    "GIGA": 1e9,
    "MEGA": 1e6,
    "KILO": 1e3,
    "HECTO": 1e2,
    "DECA": 1e1,
    "DECI": 1e-1,
    "CENTI": 1e-2,
    "MILLI": 1e-3,
    "MICRO": 1e-6,
    "NANO": 1e-9,
    "PICO": 1e-12,
}


def detect_unit_to_mm(ifc_file: ifcopenshell.file) -> float:
    """Detect the length unit and return conversion factor to millimeters.

    Args:
        ifc_file: An opened IfcOpenShell file.

    Returns:
        Factor such that ``ifc_value * factor = mm``.
        Falls back to 1000.0 (meters → mm) on failure.
    """
    try:
        # ifcopenshell.util.unit provides robust unit detection
        import ifcopenshell.util.unit

        factor = ifcopenshell.util.unit.calculate_unit_scale(ifc_file)
        # calculate_unit_scale returns a factor to convert to meters
        # We need mm, so multiply by 1000
        result = factor * 1000.0
        logger.info("Detected unit conversion factor: %.4f (to mm)", result)
        return result
    except Exception:
        logger.warning(
            "Unit detection failed, using default (meters → mm = %s)",
            DEFAULT_UNIT_TO_MM,
        )
        return DEFAULT_UNIT_TO_MM
