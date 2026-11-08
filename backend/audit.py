"""Audit trail: one row per agent run in output/audit_trail.json. Rows are only appended.

User text is cut to a short summary so the log never holds a whole conversation.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime, timezone

from agents.config import OUTPUT_DIR

AUDIT_PATH = OUTPUT_DIR / "audit_trail.json"
SUMMARY_CHARS = 160
_lock = threading.Lock()


def summarize(text: str, limit: int = SUMMARY_CHARS) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _read() -> list:
    if not AUDIT_PATH.exists():
        return []
    try:
        rows = json.loads(AUDIT_PATH.read_text(encoding="utf-8") or "[]")
        if not isinstance(rows, list):
            raise ValueError
        return rows
    except ValueError:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        AUDIT_PATH.rename(AUDIT_PATH.with_name(f"audit_trail.corrupt-{stamp}.json"))
        return []


def log_agent_run(
    *, session_id: str, mode: str, agent: str, input_summary: str, output,
    tokens: dict | None = None, tool_calls: list | None = None, safety_status: str | None = None,
) -> None:
    row = {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "session_id": session_id,
        "mode": mode,
        "agent": agent,
        "input_summary": summarize(input_summary),
        "tool_calls": tool_calls or [],
        "output": output,
        "tokens": tokens or {"input_tokens": 0, "cached_input_tokens": 0, "output_tokens": 0, "total_tokens": 0},
        "safety_status": safety_status,
    }
    with _lock:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        rows = _read()
        rows.append(row)
        tmp = AUDIT_PATH.with_suffix(".tmp")
        tmp.write_text(json.dumps(rows, indent=2, ensure_ascii=False, default=str), encoding="utf-8")
        tmp.replace(AUDIT_PATH)
