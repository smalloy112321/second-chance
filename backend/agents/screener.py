"""Clean Slate screener: the rules engine decides; the AI only explains.

Code guards after the AI call:
  - next_step_codes are cut down to the rules engine's own next_steps.
  - "can_answer_no_if_confirmed" is only allowed when the rules engine says every conviction
    is likely erased; otherwise it becomes "unsure_ask_legal_aid".
  - the explanation always ends with the estimate disclaimer.
"""

from __future__ import annotations

import json
from datetime import date

from pydantic_ai import Agent

import prompts
from agents.reference import reference_text
from agents.runtime import Ctx, finished, run_llm, started
from models import Profile, ScreenerOutput
from rules.clean_slate import Conviction, Person, evaluate

NAME = "screener"
ESTIMATE_LINE = "This is an estimate, not legal advice."

agent = Agent(name=NAME, output_type=ScreenerOutput, retries=2)


def to_rules_person(profile: Profile, today: date) -> Person:
    """Convert the intake profile into the rules engine's input. Unknowns stay unknown."""
    convictions = [
        Conviction(
            id=f"c{i}",
            description=c.description,
            level=c.level,
            offense_date=c.offense_date,
            conviction_date=c.conviction_date,
            unclassified_felony_max_under_5_years=c.unclassified_felony_max_under_5_years,
            statute=c.statute,
            is_family_violence=c.is_family_violence,
            is_sex_offense=c.is_sex_offense,
            is_dui=c.is_dui,
            is_cannabis_possession=c.is_cannabis_possession,
            is_21a_279c_before_2015_10_01=c.is_21a_279c_before_2015_10_01,
        )
        for i, c in enumerate(profile.convictions, start=1)
    ]
    return Person(
        today=today,
        on_supervision_now=profile.on_supervision_now,
        pending_ct_charges=profile.pending_ct_charges,
        all_sentences_completed=profile.all_sentences_completed,
        convictions=convictions,
    )


def filter_next_steps(codes: list[str], rules_result: dict) -> tuple[list[str], list[str]]:
    """Keep only codes the rules engine produced. Returns (kept, dropped)."""
    allowed = set(rules_result.get("next_steps", []))
    kept, dropped = [], []
    for code in codes:
        (kept if code in allowed and code not in kept else dropped).append(code)
    return kept, dropped


def guard_disclosure(guidance: str, rules_result: dict) -> str:
    """'can_answer_no_if_confirmed' only when the rules engine says everything is likely erased."""
    if guidance == "can_answer_no_if_confirmed" and rules_result.get("overall") != "likely_erased":
        return "unsure_ask_legal_aid"
    return guidance


def apply_guards(out: ScreenerOutput, rules_result: dict) -> tuple[ScreenerOutput, dict]:
    kept, dropped = filter_next_steps(out.next_step_codes, rules_result)
    guidance = guard_disclosure(out.disclosure_guidance, rules_result)
    explanation = out.explanation.rstrip()
    if ESTIMATE_LINE not in explanation:
        explanation = f"{explanation}\n\n{ESTIMATE_LINE}"
    guarded = out.model_copy(update={
        "next_step_codes": kept, "disclosure_guidance": guidance, "explanation": explanation,
    })
    changes = {
        "dropped_next_step_codes": dropped,
        "disclosure_downgraded": guidance != out.disclosure_guidance,
    }
    return guarded, changes


async def run(ctx: Ctx, session, today: date | None = None) -> ScreenerOutput:
    await started(ctx, NAME)
    rules_result = evaluate(to_rules_person(session.profile, today or date.today()))
    session.rules_result = rules_result
    await ctx.emit("tool_called", {"agent": NAME, "name": "rules_engine.evaluate", "args": {
        "convictions": len(session.profile.convictions), "overall": rules_result["overall"],
    }})

    instructions, user_prompt = prompts.split(
        "screener", ctx.mode, reference=reference_text(),
        rules_json=json.dumps(rules_result, indent=2),
    )
    result, tokens = await run_llm(ctx, NAME, agent, user_prompt, instructions, request_limit=3)
    out, changes = apply_guards(result.output, rules_result)
    session.screener = out
    notes = []
    if changes["dropped_next_step_codes"]:
        notes.append(f"dropped {changes['dropped_next_step_codes']}")
    if changes["disclosure_downgraded"]:
        notes.append("disclosure downgraded")
    await finished(
        ctx, NAME,
        summary=f"Rules: {rules_result['overall']}; guidance: {out.disclosure_guidance}"
        + (f" ({'; '.join(notes)})" if notes else ""),
        tokens=tokens, input_summary=f"rules overall={rules_result['overall']}",
        output={**out.model_dump(), "guards": changes},
    )
    return out
