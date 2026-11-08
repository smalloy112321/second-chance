"""Runs the agents in order for one user message.

safety_guard (every message) -> intake (until complete) -> screener -> planner -> verifier
If the verifier does not approve, the planner revises ONCE and the verifier checks again.
If it still isn't approved, the plan is returned with a "needs human review" flag.
"""

from __future__ import annotations

import resources
import sessions
from agents import intake, planner, practice, safety_guard, screener, verifier
from agents.runtime import BudgetExceeded, Ctx, Emit, _no_emit

# Next steps the UI can show (wording and forms from clean_slate_rules_spec.md section 5).
# Links go straight to official State of Connecticut pages (checked November 8, 2026).
DPS_0846_C = "https://portal.ct.gov/-/media/DESPP/reports_and_records/DPS0846CCriminalHistoryRecordRequestFormRev120117pdf.pdf"
SPBI_PAGE = "https://portal.ct.gov/despp/division-of-emergency-service-and-public-protection/reports-and-records/state-police-bureau-of-identification"
RECORDS_HOWTO = "https://portal.ct.gov/cleanslate/how-to-access-criminal-records"
HEARING_FORM = "https://portal.ct.gov/-/media/DESPP/CSP/SPBI/Clean-Slate/DESPP-CS-Hearing-Form.pdf"
PETITION_FORM = "https://www.jud.ct.gov/webforms/forms/CR202.pdf"

NEXT_STEPS = {
    "confirm_record_spbi": {
        "title": "Get your official record from the State Police",
        "detail": "This is the only way to know for sure what is on your record.",
        "how": [
            "Download form DPS-0846-C (button below) and fill it out.",
            "Mail it to the State Police with the fee. The address and cost are on the form.",
            "Questions? Call the State Police Bureau of Identification at (860) 685-8480.",
        ],
        "resource_ids": [],
        "links": [
            {"label": "Download form DPS-0846-C", "url": DPS_0846_C, "primary": True},
            {"label": "More about getting your record", "url": RECORDS_HOWTO},
        ],
    },
    "hearing_request": {
        "title": "If a conviction still shows that should be erased, ask for a hearing",
        "detail": "Do this after you get your official record, only if it still shows a conviction we said is likely erased.",
        "how": [
            "Download the Clean Slate hearing form (button below) and fill it out.",
            "Email the form and a copy of your official record (dated on or after January 1, 2024) to DESPP.cshearing@ct.gov.",
        ],
        "resource_ids": [],
        "links": [
            {"label": "Download the hearing form", "url": HEARING_FORM, "primary": True},
            {"label": "Email DESPP.cshearing@ct.gov", "url": "mailto:DESPP.cshearing@ct.gov"},
        ],
    },
    "petition_pre_2000": {
        "title": "Ask a court to erase older convictions",
        "detail": "Convictions from before 2000 are not erased automatically, but you can ask a court.",
        "how": [
            "Download court form JD-CR-202 (button below).",
            "Free legal aid can help you fill it out and file it with the court.",
        ],
        "resource_ids": [],
        "links": [{"label": "Download form JD-CR-202", "url": PETITION_FORM, "primary": True}],
    },
    "legal_aid_referral": {
        "title": "Talk with free legal aid",
        "detail": "A legal aid lawyer can look at your record with you and explain your options.",
        "how": [
            "If you live in the Greater New Haven area, call New Haven Legal Assistance.",
            "Anywhere else in Connecticut, call Statewide Legal Services.",
        ],
        "resource_ids": ["new-haven-legal-assistance", "statewide-legal-services-ct"],
        "links": [],
    },
}

# Most important step first, depending on the overall result.
STEP_ORDER = {
    "needs_review": ["legal_aid_referral", "confirm_record_spbi"],
    "not_eligible": ["legal_aid_referral", "confirm_record_spbi"],
    "petition": ["petition_pre_2000", "legal_aid_referral", "confirm_record_spbi"],
}
DEFAULT_ORDER = ["confirm_record_spbi", "hearing_request", "petition_pre_2000", "legal_aid_referral"]


def ordered_steps(codes: list[str], overall: str | None) -> list[str]:
    order = STEP_ORDER.get(overall or "", DEFAULT_ORDER)
    rank = {c: i for i, c in enumerate(order + [c for c in DEFAULT_ORDER if c not in order])}
    return sorted(dict.fromkeys(codes), key=lambda c: rank.get(c, 99))

DONE_MESSAGE = "Your plan is ready. To start over, use \"Clear my info\"."


def _result_payload(s: sessions.Session) -> dict:
    db = resources.by_id()
    used_ids = {st.resource_id for st in s.plan.steps() if st.resource_id in db} if s.plan else set()
    steps = [
        {"code": code, **NEXT_STEPS[code]}
        for code in ordered_steps(s.screener.next_step_codes if s.screener else [], (s.rules_result or {}).get("overall"))
        if code in NEXT_STEPS
    ]
    for step in steps:
        used_ids.update(i for i in step["resource_ids"] if i in db)
    return {
        "type": "result",
        "rules": s.rules_result,
        "screener": s.screener.model_dump() if s.screener else None,
        "plan": s.plan.model_dump() if s.plan else None,
        "verifier": s.verifier.model_dump() if s.verifier else None,
        "needs_human_review": s.needs_human_review,
        "next_steps": steps,
        "resources": {i: db[i] for i in sorted(used_ids)},  # contact details come from the checked list
    }


async def _build_plan(ctx: Ctx, s: sessions.Session) -> dict:
    await screener.run(ctx, s)
    plan = await planner.run(ctx, s)
    check = await verifier.run(ctx, s, plan)
    if not check.approved:
        plan = await planner.run(ctx, s, previous=plan, issues=check.issues)
        check = await verifier.run(ctx, s, plan)
    s.plan, s.verifier = plan, check
    s.needs_human_review = not check.approved
    s.stage = "done"
    s.final = _result_payload(s)
    return s.final


async def handle_message(session_id: str, mode: str, message: str, emit: Emit = _no_emit, model=None) -> dict:
    s = sessions.get_or_create(session_id, mode)
    ctx = Ctx(session_id=session_id, mode=mode, emit=emit, model=model)
    async with s.lock:
        try:
            safety = await safety_guard.run(ctx, message)
            if safety.status != "ok":
                shown = safety_guard.user_message(safety)
                payload = {"type": "safety", "status": safety.status, "crisis_type": safety.crisis_type, **shown}
                await emit("safety_block", payload)
                return payload

            if s.stage == "done":
                return {"type": "info", "reply": DONE_MESSAGE, **({"result": s.final} if s.final else {})}

            turn = await intake.run(ctx, s, message)
            if not turn.is_complete:
                return {"type": "question", "reply": turn.reply, "missing_fields": turn.missing_fields}

            result = await _build_plan(ctx, s)
            return {**result, "reply": turn.reply}
        except BudgetExceeded as exc:
            payload = {"type": "limit", "reply": exc.user_message}
            await emit("error", {"message": exc.user_message, "kind": "limit"})
            return payload


# ---- Practice room (Step 4) ---------------------------------------------------------------


def start_practice(session_id: str, mode: str, scenario_id: str, difficulty: str) -> dict:
    """Begin a practice conversation. The opening line comes straight from scenarios.json."""
    scenario = practice.scenarios()[scenario_id]
    s = sessions.get_or_create(session_id, mode)
    s.practice = practice.PracticeState(
        scenario_id=scenario_id, difficulty=difficulty, last_partner_line=scenario["opening_line"],
    )
    return {
        "type": "started",
        "scenario": {k: scenario[k] for k in ("id", "title", "description", "setting")},
        "difficulty": difficulty,
        "partner": {"name": practice.character_name(scenario), "role": scenario["character"], "line": scenario["opening_line"]},
        "max_turns": practice.MAX_TURNS,
        "disclosure_guidance": practice.practice_context(s)["disclosure_guidance"],
    }


async def practice_turn(session_id: str, mode: str, message: str, emit: Emit = _no_emit, model=None) -> dict:
    s = sessions.get_or_create(session_id, mode)
    if s.practice is None:
        return {"type": "error", "reply": "Choose a scenario to start practicing."}
    if s.practice.ended:
        return {"type": "ended", "summary": s.practice.summary}
    if practice.is_pause(message):  # a bare "pause"/"stop"/"help": nothing to screen, no AI call
        return dict(practice.PAUSED)
    ctx = Ctx(session_id=session_id, mode=mode, emit=emit, model=model)
    async with s.lock:
        try:
            safety = await safety_guard.run(ctx, message)
            if safety.status != "ok":
                shown = safety_guard.user_message(safety)
                payload = {"type": "safety", "status": safety.status, "crisis_type": safety.crisis_type, **shown}
                await emit("safety_block", payload)
                return payload
            return await practice.take_turn(ctx, s, message)
        except BudgetExceeded as exc:
            await emit("error", {"message": exc.user_message, "kind": "limit"})
            return {"type": "limit", "reply": exc.user_message}


async def end_practice(session_id: str, mode: str, emit: Emit = _no_emit, model=None) -> dict:
    s = sessions.get_or_create(session_id, mode)
    st = s.practice
    if st is None or not st.turns:
        return {"type": "ended", "summary": None, "reply": "No answers yet, so there's nothing to score."}
    if st.ended and st.summary:
        return {"type": "ended", "summary": st.summary}
    ctx = Ctx(session_id=session_id, mode=mode, emit=emit, model=model)
    async with s.lock:
        try:
            return {"type": "ended", "summary": await practice.run_summary(ctx, st)}
        except BudgetExceeded as exc:
            await emit("error", {"message": exc.user_message, "kind": "limit"})
            return {"type": "limit", "reply": exc.user_message}
