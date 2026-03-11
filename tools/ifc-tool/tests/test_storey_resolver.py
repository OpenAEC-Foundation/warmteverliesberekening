"""Tests for storey clustering in the storey resolver."""

from __future__ import annotations

import pytest

from ifc_tool.import_ifc.storey_resolver import (
    StoreyInfo,
    _RawStorey,
    _cluster_storeys,
    _pick_main_storey,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_raw(name: str, elevation_mm: float) -> _RawStorey:
    """Create a _RawStorey with a deterministic global_id."""
    return _RawStorey(
        global_id=f"id-{name}",
        name=name,
        elevation_mm=elevation_mm,
    )


# ---------------------------------------------------------------------------
# Real-world scenario: 9 storeys → 3 clusters
# ---------------------------------------------------------------------------

# Elevations taken from the real IFC file:
#   Cluster 0 (kelder):      -3500, -3230, 0          (gap 270, 3230 — but 0 is >500 from -3230)
#   Wait — let's recompute gaps:
#     -3500 → -3230: gap = 270 ≤ 500 → same cluster
#     -3230 → 0: gap = 3230 > 500 → new cluster
#     0 → 2880: gap = 2880 > 500 → new cluster
#     2880 → 2915: gap = 35 ≤ 500 → same cluster
#     2915 → 3300: gap = 385 ≤ 500 → same cluster
#     3300 → 5900: gap = 2600 > 500 → new cluster
#     5900 → 5970: gap = 70 ≤ 500 → same cluster
#     5970 → 6320: gap = 350 ≤ 500 → same cluster
#   So: 4 clusters:
#     cluster 0: -3500, -3230
#     cluster 1: 0
#     cluster 2: 2880, 2915, 3300
#     cluster 3: 5900, 5970, 6320

_REAL_STOREYS = [
    _make_raw("Fundering", -3500),
    _make_raw("O.K. Funderingsbalk", -3230),
    _make_raw("00_begane grond", 0),
    _make_raw("1 O.K. Verdiepingsvloer", 2880),
    _make_raw("O.K. CLT", 2915),
    _make_raw("01_eerste verdieping", 3300),
    _make_raw("2 O.K. Dakconstructie", 5900),
    _make_raw("O.K. Dakplaat", 5970),
    _make_raw("02_tweede verdieping", 6320),
]


class TestClusterStoreys:
    """Tests for _cluster_storeys()."""

    def test_real_world_9_storeys_into_4_clusters(self) -> None:
        clusters = _cluster_storeys(_REAL_STOREYS)
        assert len(clusters) == 4

        # Cluster 0: kelder
        assert [s.name for s in clusters[0]] == [
            "Fundering",
            "O.K. Funderingsbalk",
        ]
        # Cluster 1: begane grond (single storey)
        assert [s.name for s in clusters[1]] == ["00_begane grond"]
        # Cluster 2: eerste verdieping
        assert [s.name for s in clusters[2]] == [
            "1 O.K. Verdiepingsvloer",
            "O.K. CLT",
            "01_eerste verdieping",
        ]
        # Cluster 3: tweede verdieping
        assert [s.name for s in clusters[3]] == [
            "2 O.K. Dakconstructie",
            "O.K. Dakplaat",
            "02_tweede verdieping",
        ]

    def test_no_clustering_when_far_apart(self) -> None:
        """Storeys >500 mm apart should each get their own cluster."""
        storeys = [
            _make_raw("Ground", 0),
            _make_raw("First", 3000),
            _make_raw("Second", 6000),
        ]
        clusters = _cluster_storeys(storeys)
        assert len(clusters) == 3
        assert all(len(c) == 1 for c in clusters)

    def test_empty_input(self) -> None:
        assert _cluster_storeys([]) == []

    def test_single_storey(self) -> None:
        clusters = _cluster_storeys([_make_raw("Only", 0)])
        assert len(clusters) == 1
        assert len(clusters[0]) == 1


class TestPickMainStorey:
    """Tests for _pick_main_storey()."""

    def test_prefers_numbered_name(self) -> None:
        cluster = [
            _make_raw("O.K. CLT", 2915),
            _make_raw("01_eerste verdieping", 3300),
            _make_raw("1 O.K. Verdiepingsvloer", 2880),
        ]
        main = _pick_main_storey(cluster)
        assert main.name == "01_eerste verdieping"

    def test_fallback_to_lowest_elevation(self) -> None:
        """Without a matching name, the first (lowest) storey wins."""
        cluster = [
            _make_raw("Fundering", -3500),
            _make_raw("O.K. Funderingsbalk", -3230),
        ]
        main = _pick_main_storey(cluster)
        assert main.name == "Fundering"

    def test_ground_floor_pattern(self) -> None:
        cluster = [
            _make_raw("Some layer", -100),
            _make_raw("00_begane grond", 0),
        ]
        main = _pick_main_storey(cluster)
        assert main.name == "00_begane grond"

    def test_pattern_with_space_separator(self) -> None:
        """Pattern also matches '02 tweede' (space instead of underscore)."""
        cluster = [
            _make_raw("Dakplaat", 5970),
            _make_raw("02 tweede verdieping", 6320),
        ]
        main = _pick_main_storey(cluster)
        assert main.name == "02 tweede verdieping"
