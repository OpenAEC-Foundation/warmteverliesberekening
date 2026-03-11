"""Map IFC space names to room function keywords.

Port of the TypeScript ``FUNCTION_KEYWORDS`` from ``ifc-import.ts``.
"""

from __future__ import annotations

import re

from ifc_tool.constants import DEFAULT_ROOM_FUNCTION

# Pattern → function name, ordered by specificity
_FUNCTION_KEYWORDS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"woonkamer|huiskamer|living|zitkamer", re.IGNORECASE), "woonkamer"),
    (re.compile(r"slaapkamer|bedroom", re.IGNORECASE), "slaapkamer"),
    (re.compile(r"bijkeuken|wasruimte|laundry", re.IGNORECASE), "bijkeuken"),
    (re.compile(r"keuken|kitchen", re.IGNORECASE), "keuken"),
    (re.compile(r"badkamer|bathroom", re.IGNORECASE), "badkamer"),
    (re.compile(r"toilet|wc", re.IGNORECASE), "toilet"),
    (re.compile(r"hal|gang|entree|corridor|overloop", re.IGNORECASE), "hal"),
    (re.compile(r"berging|storage|opslag", re.IGNORECASE), "berging"),
    (re.compile(r"garage", re.IGNORECASE), "garage"),
    (re.compile(r"kantoor|office|studeerkamer|werkruimte", re.IGNORECASE), "kantoor"),
    (re.compile(r"zolder|attic", re.IGNORECASE), "zolder"),
    (re.compile(r"kelder|basement|souterrain", re.IGNORECASE), "kelder"),
]


def match_room_function(name: str) -> str:
    """Match a room/space name to a known function keyword.

    Args:
        name: The IFC space name (e.g. "Slaapkamer 1", "WC").

    Returns:
        Matched function string or ``DEFAULT_ROOM_FUNCTION``.
    """
    for pattern, function in _FUNCTION_KEYWORDS:
        if pattern.search(name):
            return function
    return DEFAULT_ROOM_FUNCTION
