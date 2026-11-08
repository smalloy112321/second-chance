"""Plain-Python fixes applied to the planner's 30-day plan before it is shown. The planner agent
and its prompt are unchanged; this runs on the finished plan.

1. Record steps get the same official links as the results page, judged from the step's action.
   A step about getting your official record gets the DPS-0846-C form button. A step about a
   Clean Slate hearing gets the hearing form button.
2. Record steps never point to a legal aid office that does not take criminal-record matters
   (Statewide Legal Services and New Haven Legal Assistance both say so in their notes). Those
   steps point to CTLawHelp's free legal help finder instead.
"""

from __future__ import annotations

import copy
import re

# Legal aid offices whose checked notes say they do not handle criminal matters.
NO_CRIMINAL_LEGAL_AID = {"statewide-legal-services-ct", "new-haven-legal-assistance"}
RECORD_HELP_FALLBACK = "ctlawhelp"

_HEARING = re.compile(r"\bhearing\b", re.I)
_RECORD_REQUEST = re.compile(
    r"(state police|official record|current record|criminal record|record check|dps-0846|request (?:a copy of )?your record)", re.I
)
_RECORD_TOPIC = re.compile(r"(record|conviction|clean slate|eras|hearing|pardon)", re.I)


def official_step_code(text: str) -> str | None:
    """Which results-page step a plan step matches, judged from its wording."""
    if _HEARING.search(text):
        return "hearing_request"
    if _RECORD_REQUEST.search(text):
        return "confirm_record_spbi"
    return None


def apply(plan: dict | None, next_steps: dict[str, dict]) -> dict | None:
    """Return a copy of the plan with official links added and unsuitable legal aid swapped."""
    if not plan:
        return plan
    out = copy.deepcopy(plan)
    for week in out.get("weeks", []):
        for step in week.get("steps", []):
            text = f"{step.get('action', '')} {step.get('why', '')}"
            code = official_step_code(step.get("action", ""))  # the action only: a "why" can mention the record in passing
            if code and code in next_steps:
                step["official_links"] = next_steps[code]["links"]
            if step.get("resource_id") in NO_CRIMINAL_LEGAL_AID and _RECORD_TOPIC.search(text):
                step["resource_id"] = RECORD_HELP_FALLBACK
    return out
