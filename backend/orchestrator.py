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
        "title": "Get your official record from State Police",
        "detail": "This is the only way to know for sure. Request a copy of your Connecticut criminal history from the State Police using form DPS-0846-C. There is a fee; the form lists the cost.",
        "resource_ids": [],
        "links": [
            {"label": "Request form DPS-0846-C (PDF)", "url": DPS_0846_C},
            {"label": "How to get your record (Clean Slate CT)", "url": RECORDS_HOWTO},
            {"label": "State Police Bureau of Identification", "url": SPBI_PAGE},
        ],
    },
    "hearing_request": {
        "title": "If it should be erased but still shows, ask for a hearing",
        "detail": "Send a record check dated on or after 1/1/2024 plus the Clean Slate hearing form (DESPP-0847-C) to DESPP.cshearing@ct.gov.",
        "resource_ids": [],
        "links": [
            {"label": "Clean Slate hearing form (PDF)", "url": HEARING_FORM},
            {"label": "Email DESPP.cshearing@ct.gov", "url": "mailto:DESPP.cshearing@ct.gov"},
        ],
    },
    "petition_pre_2000": {
        "title": "Ask a court to erase older convictions",
        "detail": "Older convictions are not erased automatically. You can petition the court (form JD-CR-202).",
        "resource_ids": [],
        "links": [{"label": "Court petition form JD-CR-202 (PDF)", "url": PETITION_FORM}],
    },
    "legal_aid_referral": {
        "title": "Talk with free legal aid",
        "detail": "New Haven Legal Assistance (Greater New Haven) or Statewide Legal Services (elsewhere in CT).",
        "resource_ids": ["new-haven-legal-assistance", "statewide-legal-services-ct"],
        "links": [],
    },
}

DONE_MESSAGE = "Your plan is ready. To start over, use \"Clear my info\"."


def _result_payload(s: sessions.Session) -> dict:
    db = resources.by_id()
    used_ids = {st.resource_id for st in s.plan.steps() if st.resource_id in db} if s.plan else set()
    steps = [
        {"code": code, **NEXT_STEPS[code]}
        for code in (s.screener.next_step_codes if s.screener else [])
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
