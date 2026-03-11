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

# ---------------------------------------------------------------------------
# Storey clustering
# ---------------------------------------------------------------------------

STOREY_CLUSTER_TOLERANCE_MM: float = 500.0
"""Max elevation gap (mm) to merge storeys into one cluster (e.g. structural layers)."""

# ---------------------------------------------------------------------------
# Polygon simplification (IFC import cleanup)
# ---------------------------------------------------------------------------

SHORT_EDGE_THRESHOLD_MM: float = 100.0
"""Edges shorter than this are removed by merging adjacent vertices."""

DOUGLAS_PEUCKER_TOLERANCE_MM: float = 50.0
"""Maximum perpendicular distance for Douglas-Peucker simplification."""

RIGHT_ANGLE_SNAP_DEG: float = 5.0
"""Angles within this tolerance of 90/180/270° are snapped to exact."""

COLLINEAR_MERGE_DEG: float = 3.0
"""Consecutive edges whose direction differs by less than this are merged."""

# ---------------------------------------------------------------------------
# Shared edge detection
# ---------------------------------------------------------------------------

SHARED_EDGE_MAX_DISTANCE_MM: float = 500.0
"""Max perpendicular distance (mm) between two edges to consider them shared."""

SHARED_EDGE_MIN_OVERLAP_MM: float = 200.0
"""Minimum projected overlap (mm) along the shared direction."""

SHARED_EDGE_PARALLEL_TOLERANCE_DEG: float = 5.0
"""Maximum angle (degrees) between two edges to consider them parallel."""

# ---------------------------------------------------------------------------
# Gap closing (polygon expansion to wall centre-line)
# ---------------------------------------------------------------------------

GAP_CLOSE_AREA_TOLERANCE: float = 0.05
"""Max relative area change (5 %) before gap closing is rejected for a room."""
