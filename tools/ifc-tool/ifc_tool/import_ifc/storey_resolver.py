"""Resolve IfcBuildingStorey → floor index mapping.

Sorts storeys by elevation and assigns integer floor indices
(0 = ground floor, 1 = first floor, etc.).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)


@dataclass
class StoreyInfo:
    """Resolved storey information."""

    global_id: str
    name: str
    elevation_mm: float
    floor_index: int


def resolve_storeys(
    ifc_file: ifcopenshell.file,
    unit_to_mm: float,
) -> dict[str, StoreyInfo]:
    """Build a mapping from storey GlobalId to StoreyInfo.

    Args:
        ifc_file: An opened IfcOpenShell file.
        unit_to_mm: Conversion factor from IFC units to mm.

    Returns:
        Dict mapping storey GlobalId → StoreyInfo with floor indices.
    """
    storeys = ifc_file.by_type("IfcBuildingStorey")
    if not storeys:
        logger.warning("No IfcBuildingStorey found")
        return {}

    # Sort by elevation
    sorted_storeys = sorted(
        storeys,
        key=lambda s: _get_elevation(s, unit_to_mm),
    )

    result: dict[str, StoreyInfo] = {}
    for index, storey in enumerate(sorted_storeys):
        elevation_mm = _get_elevation(storey, unit_to_mm)
        info = StoreyInfo(
            global_id=storey.GlobalId,
            name=storey.Name or f"Verdieping {index}",
            elevation_mm=elevation_mm,
            floor_index=index,
        )
        result[storey.GlobalId] = info
        logger.debug(
            "Storey %s (%s): elevation=%.0f mm, floor=%d",
            info.name,
            info.global_id,
            elevation_mm,
            index,
        )

    return result


def get_space_storey(
    space: ifcopenshell.entity_instance,
    storeys: dict[str, StoreyInfo],
    unit_to_mm: float,
) -> StoreyInfo | None:
    """Find which storey a space belongs to.

    Uses ``IfcRelContainedInSpatialStructure`` first,
    falls back to elevation matching.

    Args:
        space: An IfcSpace entity.
        storeys: Resolved storey mapping.
        unit_to_mm: Conversion factor from IFC units to mm.

    Returns:
        StoreyInfo or None if no storey could be determined.
    """
    # Method 1: spatial containment
    for rel in getattr(space, "ContainedInStructure", []) or []:
        structure = rel.RelatingStructure
        if structure.is_a("IfcBuildingStorey"):
            info = storeys.get(structure.GlobalId)
            if info:
                return info

    # Method 2: decomposes
    for rel in getattr(space, "Decomposes", []) or []:
        parent = rel.RelatingObject
        if parent.is_a("IfcBuildingStorey"):
            info = storeys.get(parent.GlobalId)
            if info:
                return info

    # Method 3: elevation matching
    space_elevation = _get_elevation(space, unit_to_mm)
    if storeys and space_elevation is not None:
        closest = min(
            storeys.values(),
            key=lambda s: abs(s.elevation_mm - space_elevation),
        )
        logger.debug(
            "Space %s matched to storey %s by elevation",
            space.Name,
            closest.name,
        )
        return closest

    return None


def _get_elevation(
    entity: ifcopenshell.entity_instance,
    unit_to_mm: float,
) -> float:
    """Extract elevation from an IFC entity, converted to mm."""
    elevation = getattr(entity, "Elevation", None)
    if elevation is not None:
        return float(elevation) * unit_to_mm

    # Fallback: ObjectPlacement Z coordinate
    placement = getattr(entity, "ObjectPlacement", None)
    if placement is not None:
        try:
            rel_placement = placement.RelativePlacement
            if rel_placement and rel_placement.Location:
                coords = rel_placement.Location.Coordinates
                if len(coords) >= 3:
                    return float(coords[2]) * unit_to_mm
        except (AttributeError, IndexError):
            pass

    return 0.0
