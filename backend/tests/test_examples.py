"""The examples page shows every kind of result, with no AI calls."""

from datetime import date

from examples import example_results


def test_examples_cover_every_overall_result():
    ex = example_results(date(2026, 11, 8))
    overall = {e["title"]: e["result"]["rules"]["overall"] for e in ex}
    assert overall == {
        "Likely erased": "likely_erased",
        "Partly erased": "partly_erased",
        "Likely to be erased on a later date": "eligible_on",
        "Likely erased after probation ends": "eligible_on",
        "Likely not covered": "not_eligible",
        "Needs review": "needs_review",
        "Can be erased if you ask a court": "petition",
        "Likely erased (cannabis possession)": "likely_erased",
    }


def test_example_next_steps_are_ordered_and_complete():
    ex = {e["title"]: e for e in example_results(date(2026, 11, 8))}
    codes = lambda t: [s["code"] for s in ex[t]["result"]["next_steps"]]  # noqa: E731
    assert codes("Likely erased") == ["confirm_record_spbi", "hearing_request"]
    assert codes("Needs review")[0] == "legal_aid_referral"
    assert codes("Can be erased if you ask a court")[0] == "petition_pre_2000"
    assert set(ex["Needs review"]["result"]["resources"]) == {"new-haven-legal-assistance", "statewide-legal-services-ct"}
