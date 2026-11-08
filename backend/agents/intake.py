"""Intake agent: multi-turn conversation that builds the profile.

The conversation and partial profile live in the server-side session (sessions.py).

To keep token use flat, only the last INTAKE_HISTORY_TURNS turns are sent back to the model.
Nothing is lost: every intake reply carries the full profile collected so far, so the most
recent turn alone holds every earlier answer. Whole turns are kept or dropped together, so a
structured-output call is never separated from its result.
"""

from __future__ import annotations

from pydantic_ai import Agent

import prompts
from agents.runtime import Ctx, finished, run_llm, started
from models import IntakeTurn

NAME = "intake"
INTAKE_HISTORY_TURNS = 3

agent = Agent(name=NAME, output_type=IntakeTurn, retries=2)


def trimmed_history(runs: list[list], turns: int = INTAKE_HISTORY_TURNS) -> list:
    """Messages from the last `turns` intake turns, oldest first."""
    return [m for run in runs[-turns:] for m in run] if turns > 0 else []


def wrap_message(mode: str, message: str) -> str:
    """Caseworker messages are pasted case notes, so they are also tagged <case_notes>."""
    text = prompts.escape_tags(message)
    if mode == "caseworker":
        return f"<case_notes>\n{text}\n</case_notes>"
    return text


async def run(ctx: Ctx, session, message: str) -> IntakeTurn:
    await started(ctx, NAME)
    instructions, user_prompt = prompts.split("intake", ctx.mode, message=wrap_message(ctx.mode, message))
    result, tokens = await run_llm(
        ctx, NAME, agent, user_prompt, instructions,
        message_history=trimmed_history(session.intake_runs) or None, request_limit=4,
    )
    turn: IntakeTurn = result.output
    session.intake_runs.append(result.new_messages())
    session.profile = turn.profile
    n = len(turn.profile.convictions)
    summary = (
        f"Profile complete ({n} conviction{'s' if n != 1 else ''})"
        if turn.is_complete
        else f"Asked a question; missing: {', '.join(turn.missing_fields[:3]) or 'n/a'}"
    )
    await finished(
        ctx, NAME, summary=summary, tokens=tokens, input_summary=message,
        output={"reply": turn.reply, "missing_fields": turn.missing_fields, "is_complete": turn.is_complete},
    )
    return turn
