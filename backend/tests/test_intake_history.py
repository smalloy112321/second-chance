"""Intake sends only the last few turns back to the model, so token use stays flat."""

import asyncio

from pydantic_ai.messages import ModelRequest, ModelResponse, ToolCallPart, UserPromptPart
from pydantic_ai.models.function import AgentInfo, FunctionModel

from agents import intake
from agents.runtime import Ctx
from sessions import Session


def user_texts(messages) -> list[str]:
    return [
        p.content for m in messages if isinstance(m, ModelRequest)
        for p in m.parts if isinstance(p, UserPromptPart)
    ]


def test_only_last_three_turns_are_sent():
    seen: list[list] = []

    def fake_intake(messages, info: AgentInfo):
        seen.append(messages)
        tool = info.output_tools[0].name
        n = len(seen)
        return ModelResponse(parts=[ToolCallPart(tool, {
            "reply": f"question {n}",
            "profile": {"town": "Bridgeport", "goals_30_days": [f"answer {i}" for i in range(1, n + 1)]},
            "missing_fields": ["more"], "is_complete": False,
        })])

    session = Session(session_id="history-test", mode="self_serve")
    ctx = Ctx(session_id="history-test", mode="self_serve", model=FunctionModel(fake_intake))
    for i in range(1, 7):
        asyncio.run(intake.run(ctx, session, f"answer {i}"))

    # Turn 6 sees turns 3, 4, 5 plus the new message, never turns 1-2.
    texts = user_texts(seen[-1])
    assert len(texts) == 4
    assert "answer 6" in texts[-1] and "answer 3" in texts[0]
    assert not any("answer 1\n" in t or "answer 2\n" in t for t in texts)
    # History starts with a whole turn (a user message), not a dangling tool result.
    assert isinstance(seen[-1][0], ModelRequest) and any(isinstance(p, UserPromptPart) for p in seen[-1][0].parts)
    # The most recent reply still carries every earlier answer in the profile.
    assert session.profile.goals_30_days == [f"answer {i}" for i in range(1, 7)]
    assert len(session.intake_runs) == 6  # full conversation kept in the session, only trimmed when sent
