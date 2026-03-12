"""Orchestrator for the IFC import pipeline.

Chains all extraction steps:
  open file → detect units → resolve storeys → extract spaces
  → extract openings → extract wall types → serialize result.
"""

from __future__ import annotations

import logging
from pathlib import Path

import ifcopenshell

from ifc_tool.import_ifc.gap_closer import close_gaps as close_gaps_fn
from ifc_tool.import_ifc.opening_extractor import extract_openings
from ifc_tool.import_ifc.shared_edge_detector import detect_shared_edges
from ifc_tool.import_ifc.space_extractor import extract_spaces
from ifc_tool.import_ifc.storey_resolver import resolve_storeys
from ifc_tool.import_ifc.unit_detector import detect_unit_to_mm
from ifc_tool.import_ifc.wall_type_extractor import extract_wall_types
from ifc_tool.models import IfcImportResult, ImportStats

logger = logging.getLogger(__name__)


def import_ifc(
    file_path: str | Path,
    *,
    close_gaps: bool = True,
) -> IfcImportResult:
    """Run the full IFC import pipeline.

    Args:
        file_path: Path to the .ifc file.
        close_gaps: Expand polygons to wall centre-line.  When *False*,
            shared edges are still detected but polygons keep their
            original IfcSpace geometry (no overlap risk).

    Returns:
        IfcImportResult with rooms, windows, doors, wall types,
        warnings, diagnostics, and stats.

    Raises:
        FileNotFoundError: If the IFC file doesn't exist.
        ValueError: If the file cannot be parsed.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"IFC file not found: {path}")

    logger.info("Opening IFC file: %s", path)
    try:
        ifc_file = ifcopenshell.open(str(path))
    except Exception as exc:
        raise ValueError(f"Failed to parse IFC file: {exc}") from exc

    schema = ifc_file.schema
    logger.info("IFC schema: %s", schema)

    # Step 1: Detect units
    unit_to_mm = detect_unit_to_mm(ifc_file)
    logger.info("Unit conversion factor: %.4f (to mm)", unit_to_mm)

    # Step 2: Resolve storeys
    storeys = resolve_storeys(ifc_file, unit_to_mm)
    logger.info("Resolved %d storeys", len(storeys))

    # Step 3: Extract spaces → rooms
    rooms, space_warnings, diagnostics = extract_spaces(
        ifc_file, unit_to_mm, storeys
    )
    logger.info("Extracted %d rooms", len(rooms))

    # Step 4: Detect shared interior edges between rooms
    shared_edges = detect_shared_edges(rooms)

    # Step 4b: Optionally close gaps — expand polygons to wall centre-line
    if close_gaps:
        rooms = close_gaps_fn(rooms, shared_edges)
        logger.info("Gap closing complete for %d rooms", len(rooms))
    else:
        logger.info("Gap closing skipped (--no-close-gaps)")

    # Step 5: Extract openings (windows + doors)
    windows, doors, opening_warnings = extract_openings(
        ifc_file, rooms, unit_to_mm
    )

    # Step 6: Extract wall types
    wall_types = extract_wall_types(ifc_file, unit_to_mm)
    logger.info("Extracted %d wall types", len(wall_types))

    # Combine warnings
    all_warnings = space_warnings + opening_warnings

    # Compute stats
    spaces_found = len(ifc_file.by_type("IfcSpace"))
    stats = ImportStats(
        spaces_found=spaces_found,
        spaces_imported=len(rooms),
        spaces_skipped=spaces_found - len(rooms),
    )

    return IfcImportResult(
        rooms=rooms,
        windows=windows,
        doors=doors,
        wall_types=wall_types,
        shared_edges=shared_edges,
        warnings=all_warnings,
        diagnostics=diagnostics,
        stats=stats,
    )
