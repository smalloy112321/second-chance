"""Which practice conversation to suggest, from her questionnaire answers. Plain Python, no AI.

One scenario is suggested, in this order:
1. Reunification meeting: her children are in foster care / with DCF, or there is a family court case.
2. Job interview: she told us about work she wants (or is not working).
3. Apartment application: she is not in stable housing this month.
"""

from __future__ import annotations

from models import Profile

UNSTABLE_HOUSING = {"family_or_friends", "shelter", "street", "transitional_program"}

REASONS = {
    "reunification": "You told us there is a family court or DCF case.",
    "job_interview": "You told us you're looking for work.",
    "landlord": "You told us you're looking for a stable place to live.",
}


def suggest(profile: Profile | None) -> dict | None:
    if profile is None:
        return None
    kids = profile.children
    if kids.family_court_case or kids.living_with == "foster_care_or_dcf":
        sid = "reunification"
    elif profile.work_goals:
        sid = "job_interview"
    elif profile.housing.this_month in UNSTABLE_HOUSING:
        sid = "landlord"
    else:
        return None
    return {"id": sid, "reason": REASONS[sid]}
