"""Verifier: checks in code first (free), then the AI verifier for what code can't check.

Code checks (each failure is an automatic issue, so the plan is not approved):
  - every resource_id exists in ct_resources.json
  - no phone numbers, URLs, or email addresses written into step text
  - no "you can answer no" / "your record is erased" wording unless disclosure_guidance is
    can_answer_no_if_confirmed (the disclosure rule, checked a second time)
"""

from __future__ import annotations

import json
import re

from pydantic_ai import Agent

import prompts
import resources
from agents.reference import reference_text
from agents.runtime import Ctx, finished, run_llm, started
from models import Plan, VerifierIssue, VerifierResult

NAME = "verifier"

agent = Agent(name=NAME, output_type=VerifierResult, retries=2)

PHONE_RE = re.compile(r"(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\b1-8\d{2}-\d{3}-\d{4}\b")
URL_RE = re.compile(r"https?://|www\.|\b[\w-]+\.(?:org|com|gov|net)\b", re.I)
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.]+\b")
DISCLOSURE_RE = re.compile(
    r"\b(?:answer|say|check|mark|put|write)\s+[\"“']?no[\"”']?\b"
    r"|\brecord\s+(?:is|has\s+been|was)\s+(?:erased|cleared|sealed|clean)\b"
    # Spanish and Portuguese (the site's other languages)
    r"|\b(?:responder|contestar|decir|marcar|escribir|poner)\s+(?:que\s+)?[\"“']?no[\"”']?(?!\w)"
    r"|\b(?:responder|dizer|marcar|escrever|colocar)\s+(?:que\s+)?[\"“']?n[ãa]o[\"”']?(?!\w)"
    r"|\b(?:récord|registro|historial|antecedentes|ficha)\s+(?:está|esta|ha\s+sido|fue|foi)\s+"
    r"(?:borrad[oa]s?|eliminad[oa]s?|limpi[oa]s?|limp[oa]s?|sellad[oa]s?|apagad[oa]s?)\b",
    re.I,
)
# Cautious wording ("she should NOT assume she can answer no") is what we want, so a match is
# ignored when a negation comes earlier in the same clause. The AI verifier still reads meaning.
NEGATION_RE = re.compile(
    r"\bnot\b|\bnever\b|n't\b|\bcannot\b|\bavoid\b|\bunless\b|\buntil\b|\bwithout\b"
    r"|\bno\s+(?=\w)(?!sea\b)|\bnunca\b|\bsin\b|\bhasta\b|\ba\s+menos\s+que\b|\bevite\b"   # Spanish
    r"|\bnão\b|\bsem\b|\baté\b|\bevite\b",                                         # Portuguese
    re.I,
)


def unsafe_disclosure(text: str) -> bool:
    for m in DISCLOSURE_RE.finditer(text):
        clause = re.split(r"[.!?;:]", text[: m.start()])[-1]
        if not NEGATION_RE.search(clause):
            return True
    return False


def _text_issues(step_id: str | None, text: str, disclosure_guidance: str | None) -> list[VerifierIssue]:
    issues: list[VerifierIssue] = []
    if PHONE_RE.search(text) or URL_RE.search(text) or EMAIL_RE.search(text):
        issues.append(VerifierIssue(
            step_id=step_id, check="invented_fact", source="code",
            problem="Text contains a phone number, website, or email address.",
            fix="Remove contact details; the app adds them from the checked list.",
        ))
    if disclosure_guidance != "can_answer_no_if_confirmed" and unsafe_disclosure(text):
        issues.append(VerifierIssue(
            step_id=step_id, check="disclosure", source="code",
            problem="Text suggests she can answer 'no' about convictions or that her record is erased.",
            fix="Remove it; she should confirm with an official record check or legal aid first.",
        ))
    return issues


def code_check(plan: Plan, valid_ids: set[str], disclosure_guidance: str | None) -> list[VerifierIssue]:
    issues = _text_issues("summary", plan.summary, disclosure_guidance)
    for step in plan.steps():
        if step.resource_id and step.resource_id not in valid_ids:
            issues.append(VerifierIssue(
                step_id=step.step_id, check="invented_fact", source="code",
                problem=f"resource_id '{step.resource_id}' is not in the checked resource list.",
                fix="Use a resource_id returned by a tool, or set resource_id to null.",
            ))
        issues += _text_issues(step.step_id, f"{step.action} {step.why}", disclosure_guidance)
    return issues


def valid_ids_block(plan: Plan) -> str:
    """Every valid id, plus what the planner's tools said about the resources this plan uses,
    so the verifier doesn't mistake facts from the checked list for invented ones."""
    db = resources.by_id()
    used = sorted({s.resource_id for s in plan.steps() if s.resource_id in db})
    return json.dumps({
        "all_ids": sorted(db),
        "used_in_plan": [resources.for_ai(db[i]) for i in used],
    }, indent=2)


async def run(ctx: Ctx, session, plan: Plan) -> VerifierResult:
    await started(ctx, NAME)
    guidance = session.screener.disclosure_guidance if session.screener else None
    code_issues = code_check(plan, resources.resource_ids(), guidance)
    for issue in code_issues:
        await ctx.emit("verifier_issue", issue.model_dump())

    instructions, user_prompt = prompts.split(
        "verifier", ctx.mode, reference=reference_text(),
        plan_json=prompts.escape_tags(plan.model_dump_json(indent=2)),
        screener_json=prompts.escape_tags(session.screener.model_dump_json(indent=2)) if session.screener else "{}",
        resource_ids=valid_ids_block(plan),
        profile_json=prompts.escape_tags(session.profile.model_dump_json(indent=2)),
    )
    result, tokens = await run_llm(ctx, NAME, agent, user_prompt, instructions, request_limit=3)
    ai: VerifierResult = result.output
    ai_issues = [i.model_copy(update={"source": "ai"}) for i in ai.issues]
    for issue in ai_issues:
        await ctx.emit("verifier_issue", issue.model_dump())

    serious = {"disclosure", "certainty", "invented_fact"}
    approved = ai.approved and not code_issues and not any(i.check in serious for i in ai_issues)
    out = VerifierResult(approved=approved, issues=code_issues + ai_issues)
    await finished(
        ctx, NAME,
        summary=f"{'Approved' if approved else 'Not approved'}: {len(code_issues)} code issue(s), {len(ai_issues)} AI issue(s)",
        tokens=tokens, input_summary=f"{len(plan.steps())} steps", output=out.model_dump(),
    )
    return out
