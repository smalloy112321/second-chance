"""Read-only access to backend/data/ct_resources.json (the checked resource list).

The AI only ever sees id, name, category, description, towns, and who a resource serves.
Phone numbers, addresses, websites, notes, and tips go straight from this file to the screen.
`notes` are our research notes (shown on the results page); `tip` is a short plain-language
version written for her (shown in the 30-day plan).
"""

from __future__ import annotations

import json
from functools import lru_cache

from agents.config import DATA_DIR

RESOURCES_PATH = DATA_DIR / "ct_resources.json"
CATEGORIES = [
    "reentry_center", "women_reentry", "legal_aid", "id_documents", "benefits",
    "housing", "employment", "family_children", "crisis",
]
AI_FIELDS = ("id", "name", "category", "description", "towns", "serves")


@lru_cache(maxsize=1)
def all_resources() -> tuple[dict, ...]:
    return tuple(json.loads(RESOURCES_PATH.read_text(encoding="utf-8")))


def by_id() -> dict[str, dict]:
    return {r["id"]: r for r in all_resources()}


def resource_ids() -> set[str]:
    return set(by_id())


def for_ai(r: dict) -> dict:
    """Strip contact details and notes before a resource is shown to a model."""
    return {k: r[k] for k in AI_FIELDS}


def _town_match(r: dict, town: str | None) -> bool:
    towns = [t.lower() for t in r["towns"]]
    return "statewide" in towns or (town is not None and town.strip().lower() in towns)


def search(category: str, town: str | None = None, has_kids: bool | None = None) -> list[dict]:
    """Resources in a category that serve her town (or statewide). Family-only resources are
    left out when she has no children."""
    out = []
    for r in all_resources():
        if r["category"] != category or not _town_match(r, town):
            continue
        if r["serves"] == "families" and has_kids is False:
            continue
        out.append(for_ai(r))
    return out


def welcome_center(town: str | None) -> dict:
    """The Reentry Welcome Center in her town, if there is one. The data has no map
    coordinates, so for other towns this lists every center and its town instead of guessing
    which is nearest."""
    centers = [r for r in all_resources() if r["category"] == "reentry_center"]
    local = [for_ai(r) for r in centers if town and town.strip().lower() in [t.lower() for t in r["towns"]]]
    if local:
        return {"match": "same_town", "centers": local}
    return {
        "match": "none_in_town",
        "note": "No Reentry Welcome Center is listed for this town. Here are all centers and their towns.",
        "centers": [for_ai(r) for r in centers],
    }


def catalog_text() -> str:
    """Stable list of every valid resource id (no contact details), for prompt caching."""
    lines = [f"- {r['id']} | {r['category']} | {r['name']} | towns: {', '.join(r['towns'])}" for r in all_resources()]
    return "\n".join(lines)


def crisis_resources(crisis_type: str | None) -> list[dict]:
    """Full records (with contact details) for the app's pre-written crisis message."""
    ids = [r["id"] for r in all_resources() if r["category"] == "crisis"]
    if crisis_type == "no_shelter_tonight":
        ids.append("ct-211-can-housing")
    db = by_id()
    return [db[i] for i in ids if i in db]
