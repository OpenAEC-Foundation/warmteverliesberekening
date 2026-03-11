"""Resolve IfcBuildingStorey → floor index mapping.

Sorts storeys by elevation, clusters nearby storeys (e.g. structural
layers within 500 mm of each other), and assigns integer floor indices
(0 = ground floor, 1 = first floor, etc.).
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

from ifc_tool.constants import STOREY_CLUSTER_TOLERANCE_MM

if TYPE_CHECKING:
    import ifcopenshell

logger = logging.getLogger(__name__)

# Pattern for "main" storey names like "00_begane grond", "01 eerste verdieping"
_MAIN_STOREY_RE = re.compile(r"^\d{2}[_\s]")


@dataclass
class StoreyInfo:
    """Resolved storey information."""

    global_id: str
    name: str
    elevation_mm: float
    floor_index: int


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


@dataclass
class _RawStorey:
    """Lightweight holder for storey data before clustering."""

    global_id: str
    name: str
    elevation_mm: float


def _cluster_storeys(
    raw: list[_RawStorey],
    tolerance_mm: float = STOREY_CLUSTER_TOLERANCE_MM,
) -> list[list[_RawStorey]]:
    """Group storeys into clusters based on elevation proximity.

    Storeys must already be sorted by elevation (ascending).
    Consecutive storeys with an elevation gap ≤ *tolerance_mm* are merged
    into the same cluster.

    Returns:
        List of clusters (each cluster is a list of _RawStorey).
    """
    if not raw:
        return []

    clusters: list[list[_RawStorey]] = [[raw[0]]]
    for storey in raw[1:]:
        prev_elevation = clusters[-1][-1].elevation_mm
        if abs(storey.elevation_mm - prev_elevation) <= tolerance_mm:
            clusters[-1].append(storey)
        else:
            clusters.append([storey])
    return clusters


def _pick_main_storey(cluster: list[_RawStorey]) -> _RawStorey:
    """Choose the representative storey for a cluster.

    Preference order:
    1. Name matches ``^\\d{2}[_\\s]`` (e.g. "00_begane grond").
    2. Fallback: lowest elevation in the cluster (already sorted).
    """
    for storey in cluster:
        if _MAIN_STOREY_RE.match(storey.name):
            return storey
    # Fallback — cluster is sorted by elevation, take lowest
    return cluster[0]


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def resolve_storeys(
    ifc_file: ifcopenshell.file,
    unit_to_mm: float,
) -> dict[str, StoreyInfo]:
    """Build a mapping from storey GlobalId to StoreyInfo.

    Nearby storeys (within ``STOREY_CLUSTER_TOLERANCE_MM``) are grouped
    so that structural layers like "O.K. CLT" share the same floor index
    as the real storey they belong to.

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

    # Build lightweight list sorted by elevation
    raw_sorted = sorted(
        [
            _RawStorey(
                global_id=s.GlobalId,
                name=s.Name or "",
                elevation_mm=_get_elevation(s, unit_to_mm),
            )
            for s in storeys
        ],
        key=lambda r: r.elevation_mm,
    )

    clusters = _cluster_storeys(raw_sorted)

    result: dict[str, StoreyInfo] = {}
    for floor_index, cluster in enumerate(clusters):
        main = _pick_main_storey(cluster)

        # Debug: log merges
        if len(cluster) > 1:
            names = [s.name or s.global_id for s in cluster]
            logger.debug(
                "Cluster %d: merged %s → main storey '%s'",
                floor_index,
                names,
                main.name,
            )

        for storey in cluster:
            info = StoreyInfo(
                global_id=storey.global_id,
                name=main.name or f"Verdieping {floor_index}",
                elevation_mm=storey.elevation_mm,
                floor_index=floor_index,
            )
            result[storey.global_id] = info
            logger.debug(
                "Storey %s (%s): elevation=%.0f mm, floor=%d",
                storey.name,
                storey.global_id,
                storey.elevation_mm,
                floor_index,
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
