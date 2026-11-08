"""Every prompt file renders: no placeholder is left unfilled and no argument collides."""

import pytest

import prompts
from agents.config import PROMPTS_DIR

AGENT_PROMPTS = sorted(p.stem for p in PROMPTS_DIR.glob("*.md") if p.stem != "_shared")
DUMMY = {p.strip("{}"): "X" for p in prompts.PLACEHOLDERS if p != "{mode}"}


@pytest.mark.parametrize("name", AGENT_PROMPTS)
@pytest.mark.parametrize("mode", ["self_serve", "caseworker"])
def test_prompt_renders(name, mode):
    instructions, user_prompt = prompts.split(name, mode, **DUMMY)
    text = instructions + user_prompt
    for placeholder in prompts.PLACEHOLDERS:
        assert placeholder not in text, f"{placeholder} left in {name}.md"
    assert f"The current mode is: {mode}" in instructions
