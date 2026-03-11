"""Tests for the room function mapper."""

from __future__ import annotations

import pytest

from ifc_tool.import_ifc.function_mapper import match_room_function


@pytest.mark.parametrize(
    "name, expected",
    [
        ("Woonkamer", "woonkamer"),
        ("woonkamer 1", "woonkamer"),
        ("Living room", "woonkamer"),
        ("Slaapkamer 1", "slaapkamer"),
        ("SLAAPKAMER", "slaapkamer"),
        ("Bedroom", "slaapkamer"),
        ("Keuken", "keuken"),
        ("Kitchen", "keuken"),
        ("Badkamer", "badkamer"),
        ("Bathroom", "badkamer"),
        ("Toilet", "toilet"),
        ("WC", "toilet"),
        ("Hal", "hal"),
        ("Gang", "hal"),
        ("Entree", "hal"),
        ("Overloop", "hal"),
        ("Berging", "berging"),
        ("Storage", "berging"),
        ("Garage", "garage"),
        ("Kantoor", "kantoor"),
        ("Office", "kantoor"),
        ("Studeerkamer", "kantoor"),
        ("Bijkeuken", "bijkeuken"),
        ("Wasruimte", "bijkeuken"),
        ("Zolder", "zolder"),
        ("Kelder", "kelder"),
        ("Souterrain", "kelder"),
        ("Onbekende ruimte", "custom"),
        ("Room 42", "custom"),
        ("", "custom"),
    ],
)
def test_match_room_function(name: str, expected: str) -> None:
    assert match_room_function(name) == expected
