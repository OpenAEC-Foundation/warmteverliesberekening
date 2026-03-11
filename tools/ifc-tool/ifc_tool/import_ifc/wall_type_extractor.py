"""Extract wall types and material layers from IfcWallType entities.

Reads ``IfcMaterialLayerSet`` from wall types and converts to
``IfcWallTypeInfo`` models with layer thicknesses in mm.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from ifc_tool.models import IfcWallTypeInfo, WallTypeLayer

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)


def extract_wall_types(
    ifc_file: ifcopenshell.file,
    unit_to_mm: float,
) -> list[IfcWallTypeInfo]:
    """Extract all IfcWallType entities with their material layers.

    Args:
        ifc_file: An opened IfcOpenShell file.
        unit_to_mm: Conversion factor from IFC units to mm.

    Returns:
        List of wall type info with material layers.
    """
    import ifcopenshell.util.element

    wall_types = ifc_file.by_type("IfcWallType")
    logger.info("Found %d IfcWallType entities", len(wall_types))

    result: list[IfcWallTypeInfo] = []

    for wall_type in wall_types:
        name = wall_type.Name or f"WallType_{wall_type.id()}"
        global_id = wall_type.GlobalId

        material = ifcopenshell.util.element.get_material(wall_type)
        if material is None:
            logger.debug("Wall type %s has no material assignment", name)
            continue

        layers = _extract_layers(material, unit_to_mm)
        if not layers:
            logger.debug(
                "Wall type %s: no material layers extracted", name
            )
            continue

        original_names = [layer.material_name for layer in layers]

        info = IfcWallTypeInfo(
            name=name,
            global_id=global_id,
            layers=layers,
            original_material_names=original_names,
        )
        result.append(info)
        logger.debug(
            "Extracted wall type %s: %d layers", name, len(layers)
        )

    return result


def _extract_layers(
    material: ifcopenshell.entity_instance,
    unit_to_mm: float,
) -> list[WallTypeLayer]:
    """Extract layers from an IFC material definition.

    Handles IfcMaterialLayerSet, IfcMaterialLayerSetUsage,
    and IfcMaterialConstituentSet.
    """
    layers: list[WallTypeLayer] = []

    # IfcMaterialLayerSetUsage → unwrap to IfcMaterialLayerSet
    if material.is_a("IfcMaterialLayerSetUsage"):
        material = material.ForLayerSet

    if material.is_a("IfcMaterialLayerSet"):
        for ml in material.MaterialLayers or []:
            mat_name = "Unknown"
            if ml.Material and ml.Material.Name:
                mat_name = ml.Material.Name
            thickness = float(ml.LayerThickness or 0) * unit_to_mm
            layers.append(
                WallTypeLayer(
                    material_name=mat_name,
                    thickness_mm=thickness,
                )
            )

    elif material.is_a("IfcMaterialConstituentSet"):
        for constituent in material.MaterialConstituents or []:
            mat_name = "Unknown"
            if constituent.Material and constituent.Material.Name:
                mat_name = constituent.Material.Name
            # Constituents don't have thickness — use 0
            layers.append(
                WallTypeLayer(
                    material_name=mat_name,
                    thickness_mm=0.0,
                )
            )

    elif material.is_a("IfcMaterial"):
        # Single material, no layers
        mat_name = material.Name or "Unknown"
        layers.append(
            WallTypeLayer(
                material_name=mat_name,
                thickness_mm=0.0,
            )
        )

    return layers
