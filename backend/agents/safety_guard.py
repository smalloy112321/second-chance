"""Safety guard: a free keyword check in code first, then the AI classifier.

The app, not the AI, writes what the user sees for crisis / injection / off-topic messages.
"""

from __future__ import annotations

import re

from pydantic_ai import Agent

import prompts
import resources
from agents.runtime import Ctx, finished, run_llm, started
from models import SafetyResult

NAME = "safety_guard"

CRISIS_PHRASES: dict[str, str] = {
    "kill myself": "self_harm",
    "killing myself": "self_harm",
    "suicide": "self_harm",
    "suicidal": "self_harm",
    "end my life": "self_harm",
    "hurt myself": "self_harm",
    "want to die": "self_harm",
    # Caseworkers write about the client in the third person.
    "kill herself": "self_harm",
    "killing herself": "self_harm",
    "hurt herself": "self_harm",
    "hurting herself": "self_harm",
    "end her life": "self_harm",
    "wants to die": "self_harm",
    "hurt me": "violence",
    "hurting me": "violence",
    "beat me": "violence",
    "hits me": "violence",
    "is hurting her": "violence",
    "hits her": "violence",
    "beats her": "violence",
    "nowhere to sleep": "no_shelter_tonight",
    "no place to sleep": "no_shelter_tonight",
    "nowhere to stay tonight": "no_shelter_tonight",
    "sleeping outside tonight": "no_shelter_tonight",
    "overdose": "medical",
    # Spanish
    "matarme": "self_harm",
    "suicidarme": "self_harm",
    "suicidio": "self_harm",
    "quitarme la vida": "self_harm",
    "quiero morir": "self_harm",
    "hacerme daño": "self_harm",
    "quiere matarse": "self_harm",
    "quiere suicidarse": "self_harm",
    "quiere morir": "self_harm",
    "me pega": "violence",
    "me golpea": "violence",
    "la golpea": "violence",
    "no tengo dónde dormir": "no_shelter_tonight",
    "no tengo donde dormir": "no_shelter_tonight",
    "sobredosis": "medical",
    # Portuguese
    "me matar": "self_harm",
    "suicídio": "self_harm",
    "quero morrer": "self_harm",
    "tirar minha vida": "self_harm",
    "me machucar": "self_harm",
    "quer se matar": "self_harm",
    "quer morrer": "self_harm",
    "me bate": "violence",
    "bate nela": "violence",
    "não tenho onde dormir": "no_shelter_tonight",
    "overdosing": "medical",
    "od'd": "medical",
}

INJECTION_PHRASES = (
    "ignore previous",
    "ignore all previous",
    "ignore the previous",
    "ignore your instructions",
    "ignore your rules",
    "system prompt",
    "you are now",
    "disregard previous",
    "disregard all",
    "disregard your",
    "disregard the above",
    "reveal your prompt",
    "developer mode",
    "ignora las instrucciones",
    "ignora todas las instrucciones",
    "ignore as instruções",
    "ignore todas as instruções",
    "modo desarrollador",
    "modo desenvolvedor",
)

INJECTION_MESSAGE = "I can only help with reentry planning."
OFF_TOPIC_MESSAGE = (
    "I'm here to help with reentry: your record, a 30-day plan, benefits, housing, work, and family. "
    "What would you like help with?"
)
CRISIS_MESSAGE = (
    "It sounds like you may need help right now. You don't have to handle this alone. "
    "If you are in immediate danger, call 911. These free services can help today:"
)
# Caseworkers usually write about the client, so the message speaks to them about her.
CRISIS_MESSAGE_CASEWORKER = (
    "It sounds like your client may need help right now. If she is in immediate danger, call 911. "
    "These free services can help today, and you can share them with her:"
)

agent = Agent(name=NAME, output_type=SafetyResult, retries=2)


def _normalize(text: str) -> str:
    text = text.lower().replace("’", "'").replace("‘", "'")
    return re.sub(r"\s+", " ", text)


def keyword_check(message: str) -> SafetyResult | None:
    """Free check in code. Returns a result if a crisis or injection phrase matches."""
    text = _normalize(message)
    for phrase, crisis_type in CRISIS_PHRASES.items():
        if phrase in text:
            return SafetyResult(status="crisis", crisis_type=crisis_type, reason=f"Keyword match: '{phrase}'.")
    for phrase in INJECTION_PHRASES:
        if phrase in text:
            return SafetyResult(status="injection", crisis_type=None, reason=f"Keyword match: '{phrase}'.")
    return None


def user_message(result: SafetyResult, mode: str = "self_serve") -> dict:
    """The pre-written message and checked resources the app shows for a blocked message."""
    if result.status == "crisis":
        message = CRISIS_MESSAGE_CASEWORKER if mode == "caseworker" else CRISIS_MESSAGE
        return {"message": message, "resources": resources.crisis_resources(result.crisis_type)}
    if result.status == "injection":
        return {"message": INJECTION_MESSAGE, "resources": []}
    if result.status == "off_topic":
        return {"message": OFF_TOPIC_MESSAGE, "resources": []}
    return {"message": "", "resources": []}


async def run(ctx: Ctx, message: str) -> SafetyResult:
    await started(ctx, NAME)
    hit = keyword_check(message)
    if hit is not None:
        await finished(
            ctx, NAME, summary=f"{hit.status} (keyword check, no AI call)", tokens=None,
            input_summary=message, output=hit.model_dump(), safety_status=hit.status,
        )
        return hit

    instructions, user_prompt = prompts.split(
        "safety_guard", ctx.mode, message=prompts.escape_tags(message)
    )
    result, tokens = await run_llm(ctx, NAME, agent, user_prompt, instructions, request_limit=3)
    out: SafetyResult = result.output
    await finished(
        ctx, NAME, summary=f"{out.status}" + (f" ({out.crisis_type})" if out.crisis_type else ""),
        tokens=tokens, input_summary=message, output=out.model_dump(), safety_status=out.status,
    )
    return out
