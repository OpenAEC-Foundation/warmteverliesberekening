"""Shared test fixtures for ifc-tool tests."""

from __future__ import annotations

import pytest

from ifc_tool.models import ModelRoom, Point2D


@pytest.fixture
def simple_rectangle() -> list[Point2D]:
    """A simple 4x3m rectangle polygon (in mm, CCW)."""
    return [
        Point2D(x=0, y=0),
        Point2D(x=4000, y=0),
        Point2D(x=4000, y=3000),
        Point2D(x=0, y=3000),
    ]


@pytest.fixture
def l_shaped_polygon() -> list[Point2D]:
    """An L-shaped polygon (in mm, CCW)."""
    return [
        Point2D(x=0, y=0),
        Point2D(x=6000, y=0),
        Point2D(x=6000, y=3000),
        Point2D(x=3000, y=3000),
        Point2D(x=3000, y=5000),
        Point2D(x=0, y=5000),
    ]


@pytest.fixture
def sample_room(simple_rectangle: list[Point2D]) -> ModelRoom:
    """A sample ModelRoom for testing."""
    return ModelRoom(
        name="Woonkamer",
        function="woonkamer",
        polygon=simple_rectangle,
        floor=0,
        height=2600,
        elevation=0,
    )
