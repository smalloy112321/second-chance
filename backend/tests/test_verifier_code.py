"""Verifier code checks: run before the AI verifier and cost nothing."""

import resources
from agents.verifier import code_check
from models import Plan, PlanStep, PlanWeek

VALID = resources.resource_ids()


def plan_with(*steps: PlanStep) -> Plan:
    return Plan(summary="test", weeks=[PlanWeek(week=1, focus="test", steps=list(steps))])


def step(step_id="w1s1", action="Get a state ID.", why="Most other steps need ID.", resource_id=None):
    return PlanStep(step_id=step_id, action=action, why=why, resource_id=resource_id)


def test_fake_resource_id_flagged():
    plan = plan_with(
        step("w1s1", resource_id="ct-dmv-non-driver-id"),  # real
        step("w1s2", action="Visit the Sunrise Women's Center.", resource_id="sunrise-womens-center"),  # invented
    )
    issues = code_check(plan, VALID, "must_disclose")
    assert [(i.step_id, i.check, i.source) for i in issues] == [("w1s2", "invented_fact", "code")]


def test_real_resource_ids_pass():
    plan = plan_with(step("w1s1", resource_id="ct-dmv-non-driver-id"), step("w1s2", resource_id="ct-dss-snap"))
    assert code_check(plan, VALID, "must_disclose") == []


def test_phone_number_in_step_flagged():
    plan = plan_with(step(action="Call 203-555-0142 to apply."))
    assert code_check(plan, VALID, "must_disclose")[0].check == "invented_fact"


def test_disclosure_wording_flagged_unless_rules_allow_it():
    plan = plan_with(step(action="On job applications you can answer no about convictions."))
    assert code_check(plan, VALID, "unsure_ask_legal_aid")[0].check == "disclosure"
    assert code_check(plan, VALID, "can_answer_no_if_confirmed") == []


def test_disclosure_wording_in_summary_flagged():
    plan = Plan(summary="Your record is erased, so you can answer no.", weeks=[PlanWeek(week=1, focus="t", steps=[step()])])
    issues = code_check(plan, VALID, "must_disclose")
    assert [(i.step_id, i.check) for i in issues] == [("summary", "disclosure")]


def test_cautious_disclosure_wording_not_flagged():
    """Real planner output from a test run: cautious advice must not trigger the check."""
    plan = plan_with(step(
        action="Have your client ask legal aid how to handle conviction questions on applications.",
        why="She should not assume that a conviction has been erased or that she can answer no.",
    ))
    assert code_check(plan, VALID, "unsure_ask_legal_aid") == []
    # ...but the same words without the negation are still caught.
    plan = plan_with(step(why="The conviction was erased, so she can answer no."))
    assert code_check(plan, VALID, "unsure_ask_legal_aid")[0].check == "disclosure"
