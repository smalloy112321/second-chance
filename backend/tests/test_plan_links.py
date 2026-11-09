"""The plain-Python fixes applied to the 30-day plan (plan_links.py). Steps are taken from a real
live plan (Maria, Hartford, November 2026)."""

import plan_links
import resources
from orchestrator import NEXT_STEPS


def plan(*steps):
    return {"summary": "s", "weeks": [{"week": 1, "focus": "f", "steps": list(steps)}]}


def step(action, why="", resource_id=None):
    return {"step_id": "w1s1", "action": action, "why": why, "resource_id": resource_id, "priority": "high"}


def test_record_request_step_gets_the_state_police_form():
    p = plan_links.apply(plan(step(
        "Ask the Greater Hartford Reentry Welcome Center for help finding the right steps to request your current record from the State Police.",
        "Your Clean Slate result is an estimate.", "hartford-reentry-welcome-center")), NEXT_STEPS)
    s = p["weeks"][0]["steps"][0]
    assert s["official_links"] == NEXT_STEPS["confirm_record_spbi"]["links"]
    assert s["resource_id"] == "hartford-reentry-welcome-center"  # a reentry center can still help


def test_hearing_step_gets_the_hearing_form_and_no_civil_only_legal_aid():
    p = plan_links.apply(plan(step(
        "If your current official record still shows the conviction, contact legal aid and ask whether to request a Clean Slate hearing.",
        "Legal aid can help you understand what to do if the record does not match.", "statewide-legal-services-ct")), NEXT_STEPS)
    s = p["weeks"][0]["steps"][0]
    assert s["official_links"] == NEXT_STEPS["hearing_request"]["links"]
    assert s["resource_id"] == plan_links.RECORD_HELP_FALLBACK
    assert plan_links.RECORD_HELP_FALLBACK in resources.resource_ids()


def test_housing_or_job_harm_keeps_legal_aid_and_pardons_go_to_the_board():
    p = plan_links.apply(plan(
        step("Call legal aid about the apartment denial caused by your conviction that should be erased.",
             "They may take housing problems caused by an erasable conviction.", "new-haven-legal-assistance"),
        step("Ask legal aid to help you apply for a pardon.", "A pardon can erase the rest of your record.",
             "statewide-legal-services-ct"),
    ), NEXT_STEPS)
    s1, s2 = p["weeks"][0]["steps"]
    assert s1["resource_id"] == "new-haven-legal-assistance"
    assert s2["resource_id"] == plan_links.PARDON_HELP


def test_other_steps_are_left_alone():
    original = plan(
        step("Search for food service openings on CTHires and apply to jobs that fit your skills.",
             "Do not answer \u201cno\u201d about convictions unless your official record check confirms you can.", "cthires-job-board"),
        step("Apply for SNAP food help.", "SNAP may help you buy groceries.", "ct-dss-snap"),
        step("Call legal aid about your custody case.", "They handle family court.", "statewide-legal-services-ct"),
    )
    p = plan_links.apply(original, NEXT_STEPS)
    assert p == original
    assert p is not original  # a copy; the session's plan is not changed


def test_no_plan_is_fine():
    assert plan_links.apply(None, NEXT_STEPS) is None


def test_no_criminal_list_matches_the_checked_notes():
    db = resources.by_id()
    for rid in plan_links.NO_CRIMINAL_LEGAL_AID:
        assert "criminal" in db[rid]["notes"].lower() and "pardon" in db[rid]["notes"].lower()
    for rid in (plan_links.RECORD_HELP_FALLBACK, plan_links.PARDON_HELP):
        assert rid in db
