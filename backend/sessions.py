"""In-memory sessions keyed by session_id. Nothing here is written to disk; restarting the
server or pressing "Clear my info" removes it."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from models import Plan, Profile, ScreenerOutput, VerifierResult


@dataclass
class Session:
    session_id: str
    mode: str
    stage: str = "intake"  # intake -> done
    intake_runs: list = field(default_factory=list)  # one list of messages per intake turn
    profile: Profile = field(default_factory=Profile)
    rules_result: dict | None = None
    screener: ScreenerOutput | None = None
    plan: Plan | None = None
    verifier: VerifierResult | None = None
    needs_human_review: bool = False
    final: dict | None = None
    practice: object | None = None  # agents.practice.PracticeState
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


_sessions: dict[str, Session] = {}


def get_or_create(session_id: str, mode: str) -> Session:
    s = _sessions.get(session_id)
    if s is None or s.mode != mode:  # switching mode starts fresh
        s = Session(session_id=session_id, mode=mode)
        _sessions[session_id] = s
    return s


def peek(session_id: str) -> Session | None:
    """The session if it exists, without creating one."""
    return _sessions.get(session_id)


def delete(session_id: str) -> bool:
    return _sessions.pop(session_id, None) is not None
