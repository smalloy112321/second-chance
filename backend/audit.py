"""Audit trail: one row per agent run in output/audit_trail.json. Rows are only appended.

User text is cut to a short summary so the log never holds a whole conversation, and the
person's first name is replaced with "[name]" everywhere in the row (what she typed and what the
agents wrote back), so the log doesn't hold names.
"""

from __future__ import annotations

import json
import re
import threading
from datetime import datetime, timezone

from agents.config import OUTPUT_DIR

AUDIT_PATH = OUTPUT_DIR / "audit_trail.json"
SUMMARY_CHARS = 160
_lock = threading.Lock()
NAME = "[name]"
# Names typed before the intake agent has read them (the questionnaire and case-note formats).
_NAME_LINES = re.compile(r"\b(first name|client name|client|name)\s*:\s*(?!skipped\b)([A-Z][\w'-]*(?:\s+[A-Z]\b\.?)?)", re.I)


def scrub(value, names: list[str]):
    """Replace the given names (whole words, any case) and "First name: X"-style lines with [name]."""
    text = json.dumps(value, ensure_ascii=False, default=str) if not isinstance(value, str) else value
    text = _NAME_LINES.sub(lambda m: f"{m.group(1)}: {NAME}", text)
    for n in names:
        if n and len(n) >= 2:
            text = re.sub(rf"\b{re.escape(n)}\b", NAME, text, flags=re.I)
    return text if isinstance(value, str) else json.loads(text)


def _known_names(session_id: str) -> list[str]:
    import sessions  # imported here to keep audit free of app state at import time

    s = sessions.peek(session_id)
    first = (s.profile.first_name or "").strip() if s else ""
    return [first] if first else []


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
    names = _known_names(session_id)
    row = {
        "time": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "session_id": session_id,
        "mode": mode,
        "agent": agent,
        "input_summary": summarize(scrub(str(input_summary), names)),
        "tool_calls": scrub(tool_calls or [], names),
        "output": scrub(output, names),
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
