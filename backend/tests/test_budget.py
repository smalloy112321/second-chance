"""Overspending guard: a per-session cap plus an app-wide daily cap across all sessions."""

import pytest

import usage


def test_daily_cap_stops_every_session(monkeypatch):
    monkeypatch.setattr(usage, "DAILY_TOKEN_CAP", 10_000)
    # Many different sessions, each far under its own 150,000 cap...
    for i in range(5):
        usage.log_model_call("planner", 1_500, 0, 500, session_id=f"stranger-{i}")
    assert usage.daily_tokens_used() == 10_000
    # ...but together they used today's budget, so even a brand-new session is stopped.
    with pytest.raises(usage.DailyTokenCapExceeded):
        usage.check_session_cap("brand-new-session")
    assert usage.session_tokens_remaining("brand-new-session") == 0


def test_daily_cap_rebuilt_from_log_after_restart(monkeypatch):
    monkeypatch.setattr(usage, "DAILY_TOKEN_CAP", 5_000)
    usage.log_model_call("intake", 4_000, 0, 1_000, session_id="before-restart")
    monkeypatch.setattr(usage, "_session_totals", None)  # simulate a server restart
    monkeypatch.setattr(usage, "_daily_totals", None)
    with pytest.raises(usage.DailyTokenCapExceeded):
        usage.check_session_cap("after-restart")


def test_session_cap_still_applies_under_daily_cap():
    usage.log_model_call("intake", 140_000, 0, 10_000, session_id="heavy-session")
    with pytest.raises(usage.SessionTokenCapExceeded):
        usage.check_session_cap("heavy-session")
    usage.check_session_cap("other-session")  # other sessions are fine


def test_daily_cap_shows_daily_message_before_any_ai_call(monkeypatch):
    import asyncio

    from pydantic_ai.models.function import FunctionModel

    import orchestrator
    from agents.runtime import DAILY_LIMIT_MESSAGE

    def must_not_call(messages, info):
        raise AssertionError("No AI call once the daily budget is used up.")

    monkeypatch.setattr(usage, "DAILY_TOKEN_CAP", 1_000)
    usage.log_model_call("planner", 900, 0, 100, session_id="earlier-visitor")
    out = asyncio.run(orchestrator.handle_message(
        "new-visitor-0001", "self_serve", "hello", model=FunctionModel(must_not_call),
    ))
    assert out == {"type": "limit", "reply": DAILY_LIMIT_MESSAGE}
