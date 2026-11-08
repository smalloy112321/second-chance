"""Results-page next steps link only to official State of Connecticut pages."""

from urllib.parse import urlparse

from orchestrator import NEXT_STEPS, ordered_steps

OFFICIAL_HOSTS = {"portal.ct.gov", "www.jud.ct.gov"}


def test_every_next_step_has_links_or_resources():
    for code, step in NEXT_STEPS.items():
        assert step["links"] or step["resource_ids"], code


def test_links_are_official_ct_pages_or_the_state_email():
    for step in NEXT_STEPS.values():
        for link in step["links"]:
            url = urlparse(link["url"])
            if url.scheme == "mailto":
                assert url.path.endswith("@ct.gov")
            else:
                assert url.scheme == "https" and url.netloc in OFFICIAL_HOSTS, link


def test_record_check_step_links_to_the_state_police_form():
    labels = [link["label"] for link in NEXT_STEPS["confirm_record_spbi"]["links"]]
    assert any("DPS-0846-C" in label for label in labels)


def test_each_step_has_numbered_instructions_and_at_most_one_main_button():
    for code, step in NEXT_STEPS.items():
        assert step["how"], code
        assert sum(1 for link in step["links"] if link.get("primary")) <= 1, code


def test_most_important_step_comes_first():
    all_codes = ["confirm_record_spbi", "hearing_request", "legal_aid_referral"]
    assert ordered_steps(all_codes, "likely_erased")[:2] == ["confirm_record_spbi", "hearing_request"]
    assert ordered_steps(["confirm_record_spbi", "legal_aid_referral"], "needs_review")[0] == "legal_aid_referral"
    assert ordered_steps(["confirm_record_spbi", "legal_aid_referral"], "not_eligible")[0] == "legal_aid_referral"
    assert ordered_steps(["confirm_record_spbi", "petition_pre_2000", "legal_aid_referral"], "petition")[0] == "petition_pre_2000"
