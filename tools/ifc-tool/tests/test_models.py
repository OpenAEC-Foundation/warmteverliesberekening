"""Tests for Pydantic models and their JSON serialization."""

from __future__ import annotations

import json

from ifc_tool.models import (
    IfcImportResult,
    ImportStats,
    ModelDoor,
    ModelRoom,
    ModelWindow,
    Point2D,
)


class TestModelRoom:
    def test_basic_serialization(self, sample_room: ModelRoom) -> None:
        data = sample_room.model_dump(by_alias=True)
        assert data["name"] == "Woonkamer"
        assert data["function"] == "woonkamer"
        assert data["floor"] == 0
        assert data["height"] == 2600
        assert len(data["polygon"]) == 4
        assert data["polygon"][0] == {"x": 0, "y": 0}

    def test_optional_fields_absent(self) -> None:
        room = ModelRoom(
            name="Test",
            function="custom",
            polygon=[
                Point2D(x=0, y=0),
                Point2D(x=1000, y=0),
                Point2D(x=1000, y=1000),
            ],
            floor=0,
            height=2600,
        )
        data = room.model_dump(by_alias=True)
        assert data["elevation"] is None
        assert data["temperature"] is None


class TestModelWindow:
    def test_camel_case_aliases(self) -> None:
        window = ModelWindow(
            room_id="room1",
            wall_index=2,
            offset=1500,
            width=900,
        )
        data = window.model_dump(by_alias=True)
        assert data["roomId"] == "room1"
        assert data["wallIndex"] == 2
        assert data["offset"] == 1500
        assert data["width"] == 900


class TestModelDoor:
    def test_camel_case_aliases(self) -> None:
        door = ModelDoor(
            room_id="room1",
            wall_index=0,
            offset=2000,
            width=800,
            swing="left",
        )
        data = door.model_dump(by_alias=True)
        assert data["roomId"] == "room1"
        assert data["wallIndex"] == 0
        assert data["swing"] == "left"


class TestIfcImportResult:
    def test_full_result_serialization(self, sample_room: ModelRoom) -> None:
        result = IfcImportResult(
            rooms=[sample_room],
            windows=[],
            doors=[],
            wall_types=[],
            warnings=[],
            diagnostics=[],
            stats=ImportStats(
                spaces_found=5,
                spaces_imported=1,
                spaces_skipped=4,
            ),
        )
        data = result.model_dump(by_alias=True)

        # Verify camelCase keys at top level
        assert "wallTypes" in data
        assert "rooms" in data
        assert data["stats"]["spacesFound"] == 5
        assert data["stats"]["spacesImported"] == 1
        assert data["stats"]["spacesSkipped"] == 4

    def test_json_roundtrip(self, sample_room: ModelRoom) -> None:
        result = IfcImportResult(
            rooms=[sample_room],
            stats=ImportStats(
                spaces_found=1,
                spaces_imported=1,
                spaces_skipped=0,
            ),
        )
        json_str = result.model_dump_json(by_alias=True)
        parsed = json.loads(json_str)
        assert parsed["rooms"][0]["name"] == "Woonkamer"
