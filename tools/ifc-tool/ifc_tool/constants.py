"""Shared constants for the IFC tool.

All thresholds, conversion factors, and default values live here —
no magic numbers in extraction modules.
"""

# ---------------------------------------------------------------------------
# Unit conversion
# ---------------------------------------------------------------------------

DEFAULT_UNIT_TO_MM: float = 1000.0
"""Fallback conversion factor when IFC unit detection fails (assumes meters)."""

# ---------------------------------------------------------------------------
# Space extraction thresholds
# ---------------------------------------------------------------------------

MIN_ROOM_AREA_MM2: float = 500_000.0
"""Minimum floor area (0.5 m²) — spaces smaller than this are skipped."""

MIN_POLYGON_POINTS: int = 3
"""Minimum number of vertices for a valid polygon."""

FLOOR_HEIGHT_DEFAULT_MM: float = 2600.0
"""Default room height when extraction fails (2.6 m)."""

COLLINEAR_TOLERANCE: float = 1.0
"""Distance tolerance (mm) for removing collinear points."""

VERTEX_DEDUP_TOLERANCE: float = 0.5
"""Distance tolerance (mm) for deduplicating close vertices."""

# ---------------------------------------------------------------------------
# Opening extraction
# ---------------------------------------------------------------------------

WALL_MATCH_TOLERANCE_MM: float = 50.0
"""Tolerance for matching an opening position to a wall edge."""

# ---------------------------------------------------------------------------
# Function mapping defaults
# ---------------------------------------------------------------------------

DEFAULT_ROOM_FUNCTION: str = "custom"
"""Fallback room function when name matching fails."""

# ---------------------------------------------------------------------------
# IFC geometry settings
# ---------------------------------------------------------------------------

Z_TOLERANCE_MM: float = 5.0
"""Tolerance for grouping vertices by Z-coordinate (bottom face detection)."""
