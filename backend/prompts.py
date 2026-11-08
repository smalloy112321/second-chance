"""Load the prompt files in backend/prompts/ without changing their wording.

Each agent's prompt = _shared.md (with {mode} filled in) + optional stable reference text +
the agent's file. The agent file is split at its first placeholder: everything before it goes
into the instructions (stable, so prompt caching can reuse it); the rest, with placeholders
filled in, becomes the user message.

Only the named placeholders are replaced, so literal braces such as "{date}" in screener.md
stay as written.
"""

from __future__ import annotations

import re
from functools import lru_cache

from agents.config import PROMPTS_DIR

PLACEHOLDERS = ("{message}", "{profile_json}", "{rules_json}", "{plan_json}", "{screener_json}", "{resource_ids}")


@lru_cache(maxsize=None)
def read(name: str) -> str:
    return (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")


def shared(mode: str) -> str:
    return read("_shared").replace("{mode}", mode)


def escape_tags(text: str) -> str:
    """Stop user text from closing the <user_input>/<case_notes> tags it is wrapped in."""
    for tag in ("user_input", "case_notes", "profile", "plan", "screener", "rules_result"):
        text = text.replace(f"</{tag}>", f"&lt;/{tag}&gt;").replace(f"<{tag}>", f"&lt;{tag}&gt;")
    return text


def split(name: str, mode: str, reference: str = "", **values: str) -> tuple[str, str]:
    """Return (instructions, user_prompt) for an agent."""
    body = read(name)
    positions = [body.find(p) for p in PLACEHOLDERS if p in body]
    cut = min(positions) if positions else len(body)
    # Start the dynamic part at the beginning of the line holding the first placeholder, or at
    # the opening tag on the line above it (so "<user_input>" stays with its content).
    if cut < len(body):
        cut = body.rfind("\n", 0, cut) + 1
        prev_start = body.rfind("\n", 0, max(cut - 1, 0)) + 1
        prev_line = body[prev_start:cut].strip()
        if re.fullmatch(r"<[a-z_]+>", prev_line):
            cut = prev_start
    head, tail = body[:cut], body[cut:]
    for key, val in values.items():
        tail = tail.replace("{" + key + "}", val)
    parts = [shared(mode)]
    if reference:
        parts.append(reference)
    parts.append(head)
    return "\n\n".join(p.strip() for p in parts if p.strip()), tail.strip()
