"""Practice Room: role-play partner, coach, and end-of-session summary.

Privacy: the role-play and coach only ever see practice_context() — first name, job goal,
town, has_kids, mode, and disclosure_guidance. Never conviction details or the full profile.

Code guards (no AI), each logged as a guard event:
  - legal_fact_used must be null or one of the scenario's legal_fact_ids.
  - try_saying may not contain a denial ("I've never been arrested", "nothing on my record")
    unless disclosure_guidance is can_answer_no_if_confirmed AND the scenario is one where that
    guidance applies (the job interview). Otherwise it is replaced with honest-disclosure coaching.
  - scores are clamped to 1-3.
  - the summary's first/last scores are computed from the real scores, and best_quote must be
    words she actually said.
"""

from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from functools import lru_cache

from pydantic_ai import Agent

import audit
import prompts
from agents.config import DATA_DIR
from agents.runtime import Ctx, finished, run_llm, started
from models import SKILLS, CoachFeedback, CoachSummary, RoleplayLine

MAX_TURNS = 5
DIFFICULTIES = ("friendly", "neutral", "skeptical")
PAUSE_WORDS = {"pause", "stop", "help"}
HONEST_REPLACEMENT = (
    "Let's practice an honest, brief answer. Try: name it in one sentence, own it, then share what's changed."
)
DENIAL_PHRASES = (
    "no, i don't have",
    "no i don't have",
    "i've never been",
    "i have never been",
    "never been arrested",
    "never been convicted",
    "nothing on my record",
    "nothing in my background",
    "my record is clean",
    "i don't have a record",
    "i don't have any record",
    "i don't have a criminal",
    "no criminal record",
)

roleplay_agent = Agent(name="roleplay", output_type=RoleplayLine, retries=2)
coach_agent = Agent(name="coach", output_type=CoachFeedback, retries=2)
summary_agent = Agent(name="coach_summary", output_type=CoachSummary, retries=2)


# ---- Data ----------------------------------------------------------------------------------


@lru_cache(maxsize=1)
def scenarios() -> dict[str, dict]:
    return {s["id"]: s for s in json.loads((DATA_DIR / "scenarios.json").read_text(encoding="utf-8"))}


@lru_cache(maxsize=1)
def legal_facts() -> dict[str, dict]:
    return {f["id"]: f for f in json.loads((DATA_DIR / "legal_facts.json").read_text(encoding="utf-8"))}


def character_name(scenario: dict) -> str:
    return scenario["character"].split(",")[0].strip()


def fact_for_display(fact_id: str | None, mode: str) -> dict | None:
    """Legal text shown to the user always comes from legal_facts.json, never from the AI."""
    f = legal_facts().get(fact_id or "")
    if not f:
        return None
    return {"id": f["id"], "text": f["caseworker" if mode == "caseworker" else "plain"], "source": f["source"]}


# ---- State ---------------------------------------------------------------------------------


@dataclass
class PracticeState:
    scenario_id: str
    difficulty: str
    last_partner_line: str
    turns: list[dict] = field(default_factory=list)  # {partner, answer, scores, total}
    roleplay_runs: list = field(default_factory=list)
    ended: bool = False
    summary: dict | None = None


def practice_context(session) -> dict:
    """The ONLY facts about her that the role-play and coach see."""
    p = session.profile
    has_kids = bool(p.children.count) or bool(p.children.ages)
    guidance = session.screener.disclosure_guidance if session.screener else "unsure_ask_legal_aid"
    return {
        "first_name": p.first_name,
        "job_goal": p.work_goals,
        "town": p.town,
        "has_kids": has_kids,
        "mode": session.mode,
        "disclosure_guidance": guidance,
    }


# ---- Guards --------------------------------------------------------------------------------


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower().replace("’", "'").replace("‘", "'"))


def contains_denial(text: str) -> bool:
    t = _normalize(text)
    return any(p in t for p in DENIAL_PHRASES)


def guard_coach(fb: CoachFeedback, scenario: dict, guidance: str) -> tuple[CoachFeedback, list[dict]]:
    """Apply the no-AI guards to the coach's output. Returns (feedback, guard events)."""
    events: list[dict] = []
    update: dict = {"scores": fb.scores.clamped()}
    if update["scores"] != fb.scores:
        events.append({"guard": "score_clamped", "detail": "Scores outside 1-3 were clamped."})

    if fb.legal_fact_used is not None and fb.legal_fact_used not in scenario.get("legal_fact_ids", []):
        events.append({
            "guard": "legal_fact_blocked",
            "detail": f"Coach cited '{fb.legal_fact_used}', which is not approved for this scenario.",
        })
        update["legal_fact_used"] = None

    denial_allowed = guidance == "can_answer_no_if_confirmed" and scenario.get("uses_disclosure_guidance", False)
    if not denial_allowed and contains_denial(fb.try_saying):
        events.append({
            "guard": "denial_replaced",
            "detail": "The suggested answer denied having a record, which the rules result does not support.",
            "original": fb.try_saying,
        })
        update["try_saying"] = HONEST_REPLACEMENT

    return fb.model_copy(update=update), events


def guard_summary(s: CoachSummary, turns: list[dict]) -> tuple[CoachSummary, list[dict]]:
    events: list[dict] = []
    update: dict = {}
    if turns:
        update["score_first"] = turns[0]["total"]
        update["score_last"] = turns[-1]["total"]
    answers = " ".join(t["answer"] for t in turns)
    quote = s.best_quote.strip().strip('"“”')
    if quote and _normalize(quote) not in _normalize(answers):
        best = max(turns, key=lambda t: t["total"]) if turns else None
        fallback = re.split(r"(?<=[.!?])\s+", best["answer"].strip())[0][:160] if best else ""
        events.append({"guard": "quote_replaced", "detail": "Summary quote was not something she said."})
        update["best_quote"] = fallback
    else:
        update["best_quote"] = quote
    return s.model_copy(update=update), events


async def emit_guards(ctx: Ctx, agent: str, events: list[dict]) -> None:
    for e in events:
        await ctx.emit("guard_triggered", {"agent": agent, **e})
        audit.log_agent_run(
            session_id=ctx.session_id, mode=ctx.mode, agent=f"guard:{e['guard']}",
            input_summary=e["detail"], output=e, safety_status=None,
        )


# ---- Agents --------------------------------------------------------------------------------


def _scenario_json(scenario: dict) -> str:
    return json.dumps(scenario, indent=2)


async def run_roleplay(ctx: Ctx, session, state: PracticeState, message: str) -> RoleplayLine:
    await started(ctx, "roleplay")
    instructions, user_prompt = prompts.split(
        "roleplay", ctx.mode,
        scenario_json=_scenario_json(scenarios()[state.scenario_id]),
        difficulty=state.difficulty,
        context_json=json.dumps(practice_context(session)),
        max_turns=str(MAX_TURNS),
        message=prompts.escape_tags(message),
    )
    history = [m for run in state.roleplay_runs for m in run] or None
    result, tokens = await run_llm(ctx, "roleplay", roleplay_agent, user_prompt, instructions,
                                   message_history=history, request_limit=3)
    out: RoleplayLine = result.output
    state.roleplay_runs.append(result.new_messages())
    line = out.line.strip()
    if line.startswith("[END]"):
        out = RoleplayLine(line=line[len("[END]"):].strip(), ended=True)
    await finished(ctx, "roleplay", summary=("[PAUSE]" if "[PAUSE]" in line else ("Ended" if out.ended else "Replied in character")),
                   tokens=tokens, input_summary=message, output=out.model_dump())
    return out


async def run_coach(ctx: Ctx, session, state: PracticeState, message: str) -> tuple[CoachFeedback, list[dict]]:
    await started(ctx, "coach")
    scenario = scenarios()[state.scenario_id]
    context = practice_context(session)
    facts = [
        {"id": fid, "text": legal_facts()[fid]["caseworker" if ctx.mode == "caseworker" else "plain"]}
        for fid in scenario.get("legal_fact_ids", []) if fid in legal_facts()
    ]
    instructions, user_prompt = prompts.split(
        "coach", ctx.mode,
        scenario_json=_scenario_json(scenario),
        context_json=json.dumps(context),
        last_partner_line=prompts.escape_tags(state.last_partner_line),
        message=prompts.escape_tags(message),
        disclosure_guidance=context["disclosure_guidance"],
        legal_facts=json.dumps(facts, indent=2) if facts else "None for this scenario.",
    )
    result, tokens = await run_llm(ctx, "coach", coach_agent, user_prompt, instructions, request_limit=3)
    fb, events = guard_coach(result.output, scenario, context["disclosure_guidance"])
    await finished(ctx, "coach", summary=f"Scored {fb.scores.total()}/15" + (f" · {len(events)} guard(s)" if events else ""),
                   tokens=tokens, input_summary=message, output={**fb.model_dump(), "guards": events})
    await emit_guards(ctx, "coach", events)
    return fb, events


async def run_summary(ctx: Ctx, state: PracticeState) -> dict:
    await started(ctx, "coach_summary")
    turns_for_ai = [{"partner": t["partner"], "answer": t["answer"], "scores": t["scores"]} for t in state.turns]
    instructions, user_prompt = prompts.split(
        "coach_summary", ctx.mode,
        turns_json=prompts.escape_tags(json.dumps(turns_for_ai, indent=2)),
    )
    result, tokens = await run_llm(ctx, "coach_summary", summary_agent, user_prompt, instructions, request_limit=3)
    s, events = guard_summary(result.output, state.turns)
    await finished(ctx, "coach_summary", summary=f"First {s.score_first:g}/15 → last {s.score_last:g}/15",
                   tokens=tokens, input_summary=f"{len(state.turns)} turns", output={**s.model_dump(), "guards": events})
    await emit_guards(ctx, "coach_summary", events)
    state.summary = {**s.model_dump(), "max_score": 15, "turns": len(state.turns)}
    state.ended = True
    return state.summary


# ---- One turn ------------------------------------------------------------------------------

PAUSED = {"type": "paused", "reply": "Paused. Resume when you're ready, or end and see your feedback."}


def is_pause(message: str) -> bool:
    return message.strip().lower().strip(".!") in PAUSE_WORDS



async def take_turn(ctx: Ctx, session, message: str) -> dict:
    """Coach + role-play in parallel for one of her answers. Returns the turn payload."""
    state: PracticeState = session.practice
    if is_pause(message):
        return dict(PAUSED)

    question = state.last_partner_line
    (fb, guards), reply = await asyncio.gather(
        run_coach(ctx, session, state, message),
        run_roleplay(ctx, session, state, message),
    )
    if "[PAUSE]" in reply.line:
        state.roleplay_runs.pop()  # the pause is not part of the conversation
        return dict(PAUSED)

    scores = fb.scores.model_dump()
    state.turns.append({"partner": question, "answer": message, "scores": scores, "total": fb.scores.total()})
    state.last_partner_line = reply.line
    coach = {
        **fb.model_dump(),
        "skills": list(SKILLS),
        "legal_fact": fact_for_display(fb.legal_fact_used, ctx.mode),
        "guards": [{k: v for k, v in g.items() if k != "original"} for g in guards],
    }
    payload = {
        "type": "turn",
        "turn_number": len(state.turns),
        "max_turns": MAX_TURNS,
        "partner": {"name": character_name(scenarios()[state.scenario_id]), "line": reply.line},
        "coach": coach,
        "ended": reply.ended,
    }
    if reply.ended or len(state.turns) >= MAX_TURNS:
        payload["type"] = "ended"
        payload["summary"] = await run_summary(ctx, state)
    return payload
