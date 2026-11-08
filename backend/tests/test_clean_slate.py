"""The 14 test cases from backend/rules/clean_slate_rules_spec.md, section 6.

All tests use today = 2026-11-07. Unless a test says otherwise, the person has finished every
sentence, is not on supervision, has no pending CT charges, and each conviction has known
offense/conviction dates and is not family violence or a sex offense.
"""

from datetime import date

from rules.clean_slate import Conviction, Person, evaluate

TODAY = date(2026, 11, 7)
DISCLAIMER = (
    "This is an estimate, not legal advice. Confirm with an official State Police record check "
    "or legal aid."
)


def conv(id="c1", level="misdemeanor", convicted=date(2012, 3, 1), offense=None, **kw) -> Conviction:
    """A conviction with safe defaults; the offense date defaults to 30 days before conviction."""
    if offense is None and convicted is not None:
        offense = date.fromordinal(convicted.toordinal() - 30)
    kw.setdefault("is_family_violence", False)
    kw.setdefault("is_sex_offense", False)
    return Conviction(
        id=id, description=kw.pop("description", "test"), level=level,
        offense_date=offense, conviction_date=convicted, **kw,
    )


def person(*convictions, **kw) -> Person:
    kw.setdefault("on_supervision_now", False)
    kw.setdefault("pending_ct_charges", False)
    kw.setdefault("all_sentences_completed", True)
    return Person(today=TODAY, convictions=list(convictions), **kw)


def by_id(result: dict) -> dict[str, dict]:
    return {c["id"]: c for c in result["convictions"]}


# 1
def test_old_misdemeanor_is_likely_erased():
    r = evaluate(person(conv(convicted=date(2012, 3, 1))))
    c = by_id(r)["c1"]
    assert c["status"] == "likely_erased"
    assert c["eligible_on"] == "2019-03-01"
    assert c["wait_years"] == 7
    assert r["overall"] == "likely_erased"
    assert r["disclaimer"] == DISCLAIMER


# 2
def test_recent_misdemeanor_has_future_date():
    r = evaluate(person(conv(convicted=date(2021, 6, 15))))
    c = by_id(r)["c1"]
    assert c["status"] == "eligible_on"
    assert c["eligible_on"] == "2028-06-15"
    assert r["overall"] == "eligible_on"
    assert r["eligible_on_earliest"] == "2028-06-15"


# 3
def test_old_class_d_felony_is_likely_erased():
    r = evaluate(person(conv(level="felony_D", convicted=date(2014, 1, 10))))
    c = by_id(r)["c1"]
    assert c["status"] == "likely_erased"
    assert c["eligible_on"] == "2024-01-10"
    assert c["wait_years"] == 10


# 4
def test_newer_conviction_restarts_clock_for_both():
    r = evaluate(person(
        conv("felony", level="felony_D", convicted=date(2014, 1, 10)),
        conv("misd", level="misdemeanor", convicted=date(2020, 5, 5)),
    ))
    cs = by_id(r)
    assert cs["felony"]["status"] == "eligible_on"
    assert cs["felony"]["eligible_on"] == "2030-05-05"
    assert cs["misd"]["status"] == "eligible_on"
    assert cs["misd"]["eligible_on"] == "2027-05-05"
    assert r["eligible_on_earliest"] == "2027-05-05"


# 5
def test_class_c_felony_not_eligible():
    r = evaluate(person(conv(level="felony_C", convicted=date(2008, 4, 1))))
    assert by_id(r)["c1"]["status"] == "not_eligible"
    assert r["overall"] == "not_eligible"


# 6
def test_family_violence_misdemeanor_not_eligible():
    r = evaluate(person(conv(convicted=date(2010, 8, 1), is_family_violence=True)))
    c = by_id(r)["c1"]
    assert c["status"] == "not_eligible"
    assert c["reason_code"] == "EXCLUDED_FAMILY_VIOLENCE"


# 7
def test_pre_2000_offense_needs_petition():
    r = evaluate(person(conv(offense=date(1998, 6, 1), convicted=date(1999, 1, 15))))
    c = by_id(r)["c1"]
    assert c["status"] == "petition_pre_2000"
    assert c["reason_code"] == "PRE_2000_PETITION"
    assert "petition_pre_2000" in r["next_steps"]


# 8
def test_on_probation_for_2023_case_waits():
    r = evaluate(person(
        conv("old", convicted=date(2012, 3, 1)),
        conv("new", convicted=date(2023, 9, 20)),
        on_supervision_now=True,
        all_sentences_completed=False,
    ))
    old = by_id(r)["old"]
    assert old["status"] == "not_yet_supervision"
    assert old["eligible_on"] == "2030-09-20"  # 2023 conviction + 7 years


# 9
def test_cannabis_possession_2010_erased_by_cannabis_law():
    r = evaluate(person(conv(convicted=date(2010, 2, 1), is_cannabis_possession=True)))
    assert by_id(r)["c1"]["status"] == "likely_erased_cannabis"
    assert r["overall"] == "likely_erased"


# 10
def test_pre_2015_drug_possession_does_not_restart_clock():
    r = evaluate(person(
        conv("misd", convicted=date(2011, 5, 1)),
        conv("drug", convicted=date(2014, 7, 1), is_21a_279c_before_2015_10_01=True),
    ))
    misd = by_id(r)["misd"]
    assert misd["status"] == "likely_erased"
    assert misd["eligible_on"] == "2018-05-01"


# 11
def test_repeat_dui_within_10_years():
    r = evaluate(person(
        conv("dui2009", convicted=date(2009, 3, 1), is_dui=True),
        conv("dui2015", convicted=date(2015, 4, 1), is_dui=True),
    ))
    cs = by_id(r)
    assert cs["dui2009"]["status"] == "not_eligible"
    assert cs["dui2009"]["reason_code"] == "DUI_REPEAT_10YR"
    assert cs["dui2015"]["status"] == "likely_erased"
    assert cs["dui2015"]["eligible_on"] == "2025-04-01"
    assert r["overall"] == "partly_erased"


# 12
def test_unknown_level_needs_review():
    r = evaluate(person(conv(level="unknown")))
    assert by_id(r)["c1"]["status"] == "needs_review"
    assert r["overall"] == "needs_review"
    assert "legal_aid_referral" in r["next_steps"]


# 13
def test_unknown_sentence_completion_needs_review():
    r = evaluate(person(conv(), all_sentences_completed=None))
    assert by_id(r)["c1"]["status"] == "needs_review"
    assert r["overall"] == "needs_review"


# 14
def test_excluded_statute_stalking_not_eligible():
    r = evaluate(person(conv(level="felony_D", convicted=date(2012, 3, 1), statute="53a-181c")))
    c = by_id(r)["c1"]
    assert c["status"] == "not_eligible"
    assert c["reason_code"] == "EXCLUDED_STATUTE"


def test_rows_include_conviction_date_for_display():
    r = evaluate(person(conv(convicted=date(2012, 3, 1)), conv("c2", convicted=None, offense=None)))
    rows = by_id(r)
    assert rows["c1"]["conviction_date"] == "2012-03-01"
    assert rows["c2"]["conviction_date"] is None
