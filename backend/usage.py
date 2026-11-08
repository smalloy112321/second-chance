"""Token meter: one row in output/usage_log.json for every model call, plus a per-session cap.

Rows are only ever appended. If the log file is unreadable it is renamed aside (never
deleted) and a fresh list is started.

Token fields follow the OpenAI convention: input_tokens INCLUDES cached_input_tokens
(cached tokens are the part of the input billed at the discounted rate).
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone

from pydantic_ai.messages import ModelResponse

from agents.config import DATA_DIR, OUTPUT_DIR

USAGE_LOG_PATH = OUTPUT_DIR / "usage_log.json"
SESSION_TOKEN_CAP = 150_000  # input + output tokens one browser session may spend (~$0.02 at class prices)


class SessionTokenCapExceeded(RuntimeError):
    """Raised when a session has used up SESSION_TOKEN_CAP."""


_lock = threading.Lock()
_session_totals: dict[str, int] | None = None  # session_id -> input + output tokens so far


def _read_rows() -> list[dict]:
    if not USAGE_LOG_PATH.exists():
        return []
    try:
        rows = json.loads(USAGE_LOG_PATH.read_text(encoding="utf-8") or "[]")
        if not isinstance(rows, list):
            raise ValueError("usage log is not a list")
        return rows
    except ValueError:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        USAGE_LOG_PATH.rename(USAGE_LOG_PATH.with_name(f"usage_log.corrupt-{stamp}.json"))
        return []


def _totals() -> dict[str, int]:
    """Per-session totals, rebuilt from the log on first use so a restart keeps the cap."""
    global _session_totals
    if _session_totals is None:
        _session_totals = {}
        for row in _read_rows():
            sid = row.get("session_id")
            if sid:
                _session_totals[sid] = _session_totals.get(sid, 0) + int(
                    row.get("input_tokens", 0)
                ) + int(row.get("output_tokens", 0))
    return _session_totals


def log_model_call(
    agent: str,
    input_tokens: int,
    cached_input_tokens: int,
    output_tokens: int,
    session_id: str | None = None,
    model: str | None = None,
) -> dict:
    """Append one row to output/usage_log.json and add it to the session's running total."""
    row = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "agent": agent,
        "input_tokens": int(input_tokens),
        "cached_input_tokens": int(cached_input_tokens),
        "output_tokens": int(output_tokens),
        "session_id": session_id,
        "model": model,
    }
    with _lock:
        totals = _totals()
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        rows = _read_rows()
        rows.append(row)
        tmp = USAGE_LOG_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")
        tmp.replace(USAGE_LOG_PATH)
        if session_id:
            totals[session_id] = totals.get(session_id, 0) + row["input_tokens"] + row["output_tokens"]
    return row


def log_run(agent: str, messages: list, session_id: str | None = None) -> dict:
    """Log every model response in a PydanticAI run (pass result.new_messages()).

    Returns the summed tokens for the run.
    """
    summary = {"model_calls": 0, "input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0}
    for msg in messages:
        if not isinstance(msg, ModelResponse):
            continue
        u = msg.usage
        row = log_model_call(
            agent=agent,
            input_tokens=u.input_tokens,
            cached_input_tokens=u.cache_read_tokens,
            output_tokens=u.output_tokens,
            session_id=session_id,
            model=msg.model_name,
        )
        summary["model_calls"] += 1
        for key in ("input_tokens", "cached_input_tokens", "output_tokens"):
            summary[key] += row[key]
    summary["total_tokens"] = summary["input_tokens"] + summary["output_tokens"]
    return summary


def session_tokens_used(session_id: str) -> int:
    with _lock:
        return _totals().get(session_id, 0)


def session_tokens_remaining(session_id: str) -> int:
    return max(0, SESSION_TOKEN_CAP - session_tokens_used(session_id))


def check_session_cap(session_id: str) -> None:
    """Raise SessionTokenCapExceeded if this session has reached SESSION_TOKEN_CAP."""
    used = session_tokens_used(session_id)
    if used >= SESSION_TOKEN_CAP:
        raise SessionTokenCapExceeded(
            f"This session has used {used:,} of its {SESSION_TOKEN_CAP:,}-token limit."
        )


# ---- Per-session totals and estimated cost --------------------------------------------------

PRICES_PATH = DATA_DIR / "prices.json"


def _prices() -> dict:
    """gpt-6-luna prices per 1M tokens (class price table, MGT 409 Lecture 11)."""
    data = json.loads(PRICES_PATH.read_text(encoding="utf-8"))
    return {**data["gpt-6-luna"], "source": data.get("source", "")}


def estimate_cost(input_tokens: int, cached_input_tokens: int, output_tokens: int) -> float:
    """USD. Cached tokens are part of input_tokens and billed at the cached rate."""
    p = _prices()
    uncached = max(0, input_tokens - cached_input_tokens)
    return (
        uncached * p["input_per_1m"] + cached_input_tokens * p["cached_input_per_1m"]
        + output_tokens * p["output_per_1m"]
    ) / 1_000_000


def session_summary(session_id: str) -> dict:
    """Totals per agent and overall for one session, from output/usage_log.json."""
    with _lock:
        rows = [r for r in _read_rows() if r.get("session_id") == session_id]
    keys = ("input_tokens", "cached_input_tokens", "output_tokens")
    per_agent: dict[str, dict] = {}
    for r in rows:
        a = per_agent.setdefault(r["agent"], {"model_calls": 0, **{k: 0 for k in keys}})
        a["model_calls"] += 1
        for k in keys:
            a[k] += int(r.get(k, 0))
    overall = {"model_calls": sum(a["model_calls"] for a in per_agent.values()),
               **{k: sum(a[k] for a in per_agent.values()) for k in keys}}
    for block in (*per_agent.values(), overall):
        block["total_tokens"] = block["input_tokens"] + block["output_tokens"]
        block["estimated_cost_usd"] = round(estimate_cost(*(block[k] for k in keys)), 6)
    p = _prices()
    return {
        "session_id": session_id,
        "per_agent": per_agent,
        "overall": overall,
        "session_token_cap": SESSION_TOKEN_CAP,
        "prices_per_1m": {k: v for k, v in p.items() if k != "source"},
        "price_source": p["source"],
    }
