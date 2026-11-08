"""Pathway planner: builds the 30-day plan using only resources its tools return."""

from __future__ import annotations

import json
from dataclasses import dataclass

from pydantic_ai import Agent, RunContext

import prompts
import resources
from agents.reference import reference_text
from agents.runtime import Ctx, finished, run_llm, started, tool_called
from models import Plan, VerifierIssue

NAME = "planner"


@dataclass
class PlannerDeps:
    ctx: Ctx
    session: object


agent = Agent(name=NAME, output_type=Plan, deps_type=PlannerDeps, retries=2)


@agent.tool
async def search_resources(
    rc: RunContext[PlannerDeps], category: str, town: str | None = None, has_kids: bool | None = None
) -> list[dict] | str:
    """Find checked Connecticut resources.

    Args:
        category: one of reentry_center, women_reentry, legal_aid, id_documents, benefits,
            housing, employment, family_children, crisis.
        town: her town, to include local programs as well as statewide ones.
        has_kids: whether she has children (family-only programs are left out if false).
    """
    await tool_called(rc.deps.ctx, NAME, "search_resources", {"category": category, "town": town, "has_kids": has_kids})
    if category not in resources.CATEGORIES:
        return f"Unknown category. Use one of: {', '.join(resources.CATEGORIES)}"
    return resources.search(category, town, has_kids)


@agent.tool
async def find_welcome_center(rc: RunContext[PlannerDeps], town: str | None = None) -> dict:
    """Find the Reentry Welcome Center for her town.

    Args:
        town: the town she lives in or will live in.
    """
    await tool_called(rc.deps.ctx, NAME, "find_welcome_center", {"town": town})
    return resources.welcome_center(town)


@agent.tool
async def get_screener_result(rc: RunContext[PlannerDeps]) -> dict:
    """Get the Clean Slate result (from the rules engine) and the disclosure_guidance."""
    await tool_called(rc.deps.ctx, NAME, "get_screener_result", {})
    s = rc.deps.session
    rules = s.rules_result or {}
    return {
        "overall": rules.get("overall"),
        "eligible_on_earliest": rules.get("eligible_on_earliest"),
        "convictions": [
            {k: c[k] for k in ("id", "status", "eligible_on", "reason_code")}
            for c in rules.get("convictions", [])
        ],
        "next_step_codes": s.screener.next_step_codes if s.screener else [],
        "disclosure_guidance": s.screener.disclosure_guidance if s.screener else "unsure_ask_legal_aid",
    }


def revision_note(previous: Plan, issues: list[VerifierIssue]) -> str:
    return (
        "\n\nA reviewer found problems in your previous plan. Fix every problem below and return "
        "the full revised plan.\n<previous_plan>\n"
        + previous.model_dump_json(indent=2)
        + "\n</previous_plan>\n<reviewer_issues>\n"
        + json.dumps([i.model_dump(exclude={"source"}) for i in issues], indent=2)
        + "\n</reviewer_issues>"
    )


async def run(ctx: Ctx, session, previous: Plan | None = None, issues: list[VerifierIssue] | None = None) -> Plan:
    await started(ctx, NAME)
    instructions, user_prompt = prompts.split(
        "planner", ctx.mode, reference=reference_text(),
        profile_json=prompts.escape_tags(session.profile.model_dump_json(indent=2)),
    )
    if previous is not None:
        user_prompt += revision_note(previous, issues or [])
    result, tokens = await run_llm(
        ctx, NAME, agent, user_prompt, instructions,
        deps=PlannerDeps(ctx=ctx, session=session), request_limit=12,
    )
    plan: Plan = result.output
    n_steps = len(plan.steps())
    n_res = sum(1 for s in plan.steps() if s.resource_id)
    await finished(
        ctx, NAME,
        summary=f"{'Revised' if previous else 'Built'} plan: {len(plan.weeks)} weeks, {n_steps} steps, {n_res} linked resources",
        tokens=tokens, input_summary="revision" if previous else "profile + screener",
        output=plan.model_dump(),
    )
    return plan
