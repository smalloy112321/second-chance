"""Screener guards: the AI explains the rules result but can't change what it allows."""

from datetime import date

from agents.screener import ESTIMATE_LINE, apply_guards, filter_next_steps, guard_disclosure, to_rules_person
from models import Profile, ProfileConviction, ScreenerOutput
from rules.clean_slate import evaluate

RULES = {"overall": "eligible_on", "next_steps": ["confirm_record_spbi"]}


def test_next_step_not_in_rules_result_is_dropped():
    kept, dropped = filter_next_steps(["confirm_record_spbi", "hearing_request"], RULES)
    assert kept == ["confirm_record_spbi"]
    assert dropped == ["hearing_request"]


def test_apply_guards_drops_codes_and_adds_estimate_line():
    out = ScreenerOutput(
        headline="h", explanation="Your record may be cleared soon.",
        next_step_codes=["hearing_request", "confirm_record_spbi", "made_up_code"],
        disclosure_guidance="must_disclose",
    )
    guarded, changes = apply_guards(out, RULES)
    assert guarded.next_step_codes == ["confirm_record_spbi"]
    assert changes["dropped_next_step_codes"] == ["hearing_request", "made_up_code"]
    assert guarded.explanation.endswith(ESTIMATE_LINE)


def test_can_answer_no_only_when_everything_likely_erased():
    assert guard_disclosure("can_answer_no_if_confirmed", {"overall": "partly_erased"}) == "unsure_ask_legal_aid"
    assert guard_disclosure("can_answer_no_if_confirmed", {"overall": "likely_erased"}) == "can_answer_no_if_confirmed"
    assert guard_disclosure("must_disclose", {"overall": "likely_erased"}) == "must_disclose"


def test_profile_unknowns_reach_rules_engine_as_unknowns():
    """A DUI answer of "I don't know" must not be guessed as "no" (that could promise 7 years instead of 10)."""
    profile = Profile(
        on_supervision_now=False, pending_ct_charges=False, all_sentences_completed=True,
        convictions=[ProfileConviction(
            description="driving thing", offense_date=date(2012, 1, 1), conviction_date=date(2012, 3, 1),
            level="misdemeanor", is_family_violence=False, is_sex_offense=False, is_dui=None,
        )],
    )
    result = evaluate(to_rules_person(profile, date(2026, 11, 7)))
    assert result["convictions"][0]["status"] == "needs_review"
    assert result["convictions"][0]["reason_code"] == "NEEDS_REVIEW_DUI_UNKNOWN"
