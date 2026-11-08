"""Shared plumbing for every agent run: budget, token log, model check, live events, audit."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from pydantic_ai import Agent, UsageLimitExceeded, UsageLimits
from pydantic_ai.usage import RunUsage

import audit
import usage
from agents import config

Emit = Callable[[str, dict], Awaitable[None]]

LIMIT_MESSAGE = (
    "This session reached its limit. Please start a new session or contact a Reentry Welcome Center."
)


class BudgetExceeded(RuntimeError):
    """The session hit SESSION_TOKEN_CAP; the app shows LIMIT_MESSAGE."""


class WrongModel(RuntimeError):
    """A response came back from a model other than gpt-6-luna."""


async def _no_emit(event: str, data: dict) -> None:
    return None


@dataclass
class Ctx:
    """Everything an agent needs for one user message."""

    session_id: str
    mode: str
    emit: Emit = _no_emit
    model: Any = None  # tests pass a fake model; None = gpt-6-luna through Portkey
    tool_calls: list[dict] = field(default_factory=list)


_model = None


def get_model(ctx: Ctx):
    global _model
    if ctx.model is not None:
        return ctx.model
    if _model is None:
        _model = config.build_model()
    return _model


ZERO_TOKENS = {"model_calls": 0, "input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0, "total_tokens": 0}


async def run_llm(
    ctx: Ctx, agent_name: str, agent: Agent, user_prompt: str, instructions: str,
    *, deps: Any = None, message_history: list | None = None, request_limit: int = 4,
):
    """Run one agent under the session token cap. Returns (result, tokens)."""
    try:
        usage.check_session_cap(ctx.session_id)
    except usage.SessionTokenCapExceeded as exc:
        raise BudgetExceeded(str(exc)) from exc

    run_usage = RunUsage()
    try:
        result = await agent.run(
            user_prompt,
            instructions=instructions,
            model=get_model(ctx),
            deps=deps,
            message_history=message_history,
            usage=run_usage,
            usage_limits=UsageLimits(
                request_limit=request_limit,
                total_tokens_limit=usage.session_tokens_remaining(ctx.session_id),
            ),
        )
    except UsageLimitExceeded as exc:
        # Log what was spent before the limit tripped, so the meter stays honest.
        usage.log_model_call(
            agent_name, run_usage.input_tokens, run_usage.cache_read_tokens,
            run_usage.output_tokens, session_id=ctx.session_id, model=config.MODEL_NAME,
        )
        raise BudgetExceeded(str(exc)) from exc

    messages = result.new_messages()
    tokens = usage.log_run(agent_name, messages, session_id=ctx.session_id)
    names = [m.model_name for m in messages if getattr(m, "model_name", None)]
    if ctx.model is None and not all(config.is_allowed_model(n) for n in names):
        raise WrongModel(f"Unexpected model in response: {names}")
    return result, tokens


async def started(ctx: Ctx, agent_name: str) -> None:
    ctx.tool_calls = []
    await ctx.emit("agent_started", {"agent": agent_name})


async def finished(
    ctx: Ctx, agent_name: str, *, summary: str, tokens: dict | None, input_summary: str,
    output: Any, safety_status: str | None = None,
) -> None:
    tokens = tokens or dict(ZERO_TOKENS)
    await ctx.emit("agent_done", {"agent": agent_name, "summary": summary, "tokens": tokens})
    audit.log_agent_run(
        session_id=ctx.session_id, mode=ctx.mode, agent=agent_name, input_summary=input_summary,
        output=output, tokens=tokens, tool_calls=list(ctx.tool_calls), safety_status=safety_status,
    )


async def tool_called(ctx: Ctx, agent_name: str, name: str, args: dict) -> None:
    call = {"agent": agent_name, "name": name, "args": args}
    ctx.tool_calls.append(call)
    await ctx.emit("tool_called", call)
