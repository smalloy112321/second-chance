"""Clean Slate rules engine: plain Python, no AI.

Estimates whether each Connecticut conviction has likely been erased under the Clean Slate law,
or when it will be. Implements backend/rules/clean_slate_rules_spec.md. The AI screener agent
only explains this output (status + reason_code); it never decides eligibility.

Unknown answers (None) are never guessed: they push a result toward "needs_review".

Choices made where the spec is silent (each is marked "SPEC GAP" below):
  - A §21a-279(c) possession before Oct 1, 2015 is itself reported as likely_erased_cannabis
    (the spec says the cannabis law erased it but gives it no row in the status table).
  - Cannabis possession with an unknown conviction date is needs_review, because we can't tell
    automatic erasure (2000-2015) from petition (any other date).
  - If any conviction that counts toward the clock has an unknown conviction date, the clock is
    unknown, so every eligible-type conviction is needs_review.
  - "overall" is needs_review whenever any conviction is needs_review, and needs_review
    convictions are listed first, so an unknown is never hidden behind a good result.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import get_args, Literal

# ---- Constants (spec section 2) ------------------------------------------------------------

CLEAN_SLATE_START = date(2000, 1, 1)
MISDEMEANOR_WAIT_YEARS = 7
FELONY_WAIT_YEARS = 10
CANNABIS_AUTO_START = date(2000, 1, 1)
CANNABIS_AUTO_END = date(2015, 9, 30)
DUI_REPEAT_WINDOW_YEARS = 10
DRUG_21A_279C_CUTOFF = date(2015, 10, 1)

# Statutes never eligible (from the official eligibility page)
EXCLUDED_STATUTES = {
    "29-33", "53a-60a", "53a-60b", "53a-60c", "53a-61a", "53a-64bb", "53a-64cc",
    "53a-72a", "53a-90a", "53a-103a", "53a-181c", "53a-189a(a)(1)", "53a-191",
    "53a-196", "53a-196d", "53a-196f", "53a-211", "53a-212", "53a-216",
    "53a-217", "53a-217a", "53a-217c", "53a-322", "53a-323",
    "54-251", "54-252", "54-253", "54-254",
}

DISCLAIMER = (
    "This is an estimate, not legal advice. Confirm with an official State Police record check "
    "or legal aid."
)

SOURCE_ELIGIBILITY = "https://portal.ct.gov/cleanslate/clean-slate-eligibility"
SOURCE_FLYER = "https://ctlawhelp.org/files/pamphlets/benefits_work/clean-slate-flyer-EN.pdf"

Level = Literal[
    "misdemeanor", "felony_A", "felony_B", "felony_C", "felony_D", "felony_E",
    "felony_unclassified", "unknown",
]
LEVELS = set(get_args(Level))

ERASED_STATUSES = {"likely_erased", "likely_erased_cannabis"}
WAITING_STATUSES = {"eligible_on", "not_yet_supervision", "not_yet_sentence"}
PETITION_STATUSES = {"petition_pre_2000", "petition_cannabis"}

PLAIN_MEANING = {
    "likely_erased_cannabis": "Erased automatically on Jan 1, 2023 under the cannabis law.",
    "petition_cannabis": "Can be erased by petitioning the court.",
    "not_eligible": "This type of conviction is not covered by Clean Slate.",
    "petition_pre_2000": "Not automatic; you can petition the court.",
    "needs_review": "Not enough information; talk to legal aid.",
    "likely_erased": "Should already be erased. If it still shows on your record, you can request a hearing.",
    "eligible_on": "Expected to be erased automatically on or after {eligible_on}, if you have no new convictions before then.",
    "not_yet_supervision": "Once your supervision ends and with no new convictions, your clock continues. Estimated date: {eligible_on}",
    "not_yet_sentence": "Once your supervision ends and with no new convictions, your clock continues. Estimated date: {eligible_on}",
}


# ---- Inputs (spec section 1) ---------------------------------------------------------------


@dataclass
class Conviction:
    id: str
    description: str
    level: Level
    offense_date: date | None = None
    conviction_date: date | None = None
    unclassified_felony_max_under_5_years: bool | None = None
    statute: str | None = None
    is_family_violence: bool | None = None
    is_sex_offense: bool | None = None
    is_dui: bool = False
    is_cannabis_possession: bool = False
    is_21a_279c_before_2015_10_01: bool = False

    def __post_init__(self) -> None:
        if self.level not in LEVELS:
            raise ValueError(f"level must be one of {sorted(LEVELS)}, got {self.level!r}")


@dataclass
class Person:
    today: date
    on_supervision_now: bool | None = None
    pending_ct_charges: bool | None = None
    all_sentences_completed: bool | None = None
    convictions: list[Conviction] = field(default_factory=list)


# ---- Helpers -------------------------------------------------------------------------------


def add_years(d: date, years: int) -> date:
    """Calendar years; Feb 29 becomes Feb 28 when the target year is not a leap year."""
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        return d.replace(year=d.year + years, day=28)


def normalize_statute(statute: str | None) -> str | None:
    """'§ 53a-181c', 'CGS 53a-181C', ' 53a-181c ' -> '53a-181c'."""
    if not statute:
        return None
    s = statute.strip().lower().replace("§", "").replace("c.g.s.", "").replace("cgs", "")
    return s.replace(" ", "") or None


def _is_21a_279c(c: Conviction) -> bool:
    return c.is_21a_279c_before_2015_10_01 and (
        c.conviction_date is None or c.conviction_date < DRUG_21A_279C_CUTOFF
    )


def _cannabis_auto_erased(c: Conviction) -> bool:
    return (
        c.is_cannabis_possession
        and c.conviction_date is not None
        and CANNABIS_AUTO_START <= c.conviction_date <= CANNABIS_AUTO_END
    )


def _wait_years(c: Conviction) -> int:
    if c.is_dui or c.level != "misdemeanor":
        return FELONY_WAIT_YEARS  # felony_D, felony_E, felony_unclassified (<5 yrs), or DUI
    return MISDEMEANOR_WAIT_YEARS


def _row(c: Conviction, status: str, reason_code: str, source: str = SOURCE_ELIGIBILITY,
         wait_years: int | None = None, eligible_on: date | None = None) -> dict:
    return {
        "id": c.id,
        "description": c.description,
        "status": status,
        "wait_years": wait_years,
        "eligible_on": eligible_on.isoformat() if eligible_on else None,
        "reason_code": reason_code,
        "plain_meaning": PLAIN_MEANING[status].format(
            eligible_on=eligible_on.isoformat() if eligible_on else "unknown"
        ),
        "rule_source": source,
    }


# ---- Per-conviction type check (spec section 3; first match wins) --------------------------


def _type_check(c: Conviction, all_convictions: list[Conviction]) -> dict | None:
    """Return a final row for this conviction, or None if it is an eligible type (go to timing)."""
    # SPEC GAP: §21a-279(c) possession before Oct 1, 2015 was erased by the cannabis law.
    if _is_21a_279c(c):
        return _row(c, "likely_erased_cannabis", "DRUG_21A_279C_CANNABIS_LAW", SOURCE_FLYER)

    # 1-2. Cannabis possession
    if c.is_cannabis_possession:
        if c.conviction_date is None:  # SPEC GAP: can't tell automatic from petition
            return _row(c, "needs_review", "NEEDS_REVIEW_DATE_UNKNOWN")
        if _cannabis_auto_erased(c):
            return _row(c, "likely_erased_cannabis", "CANNABIS_AUTO_ERASED_2023")
        return _row(c, "petition_cannabis", "CANNABIS_PETITION")

    # 3. Excluded types
    if c.is_family_violence is True:
        return _row(c, "not_eligible", "EXCLUDED_FAMILY_VIOLENCE")
    if c.is_sex_offense is True:
        return _row(c, "not_eligible", "EXCLUDED_SEX_OFFENSE")
    if normalize_statute(c.statute) in EXCLUDED_STATUTES:
        return _row(c, "not_eligible", "EXCLUDED_STATUTE")

    # 4. Serious felony classes
    if c.level in {"felony_A", "felony_B", "felony_C"}:
        return _row(c, "not_eligible", "FELONY_CLASS_NOT_COVERED")

    # 5. Repeat DUI: another DUI conviction within 10 years after this one
    if c.is_dui and c.conviction_date is not None:
        window_end = add_years(c.conviction_date, DUI_REPEAT_WINDOW_YEARS)
        for other in all_convictions:
            if (
                other is not c
                and other.is_dui
                and other.conviction_date is not None
                and c.conviction_date < other.conviction_date <= window_end
            ):
                return _row(c, "not_eligible", "DUI_REPEAT_10YR")

    # 6. Before Clean Slate's start date
    if any(d is not None and d < CLEAN_SLATE_START for d in (c.offense_date, c.conviction_date)):
        return _row(c, "petition_pre_2000", "PRE_2000_PETITION")

    # 7. Not enough information
    if c.level == "unknown":
        return _row(c, "needs_review", "NEEDS_REVIEW_LEVEL_UNKNOWN")
    if c.level == "felony_unclassified" and c.unclassified_felony_max_under_5_years is not True:
        return _row(c, "needs_review", "NEEDS_REVIEW_UNCLASSIFIED_MAX")
    if c.is_family_violence is None:
        return _row(c, "needs_review", "NEEDS_REVIEW_FAMILY_VIOLENCE_UNKNOWN")
    if c.is_sex_offense is None:
        return _row(c, "needs_review", "NEEDS_REVIEW_SEX_OFFENSE_UNKNOWN")
    if c.offense_date is None or c.conviction_date is None:
        return _row(c, "needs_review", "NEEDS_REVIEW_DATE_UNKNOWN")

    # 8. Eligible type
    return None


# ---- Timing (spec section 4) ---------------------------------------------------------------


def _most_recent_conviction(convictions: list[Conviction]) -> tuple[date | None, bool]:
    """(latest conviction date that counts for the clock, whether any counted date is unknown).

    Every conviction counts, eligible or not, except §21a-279(c) before Oct 1, 2015 and
    cannabis convictions already erased by the cannabis law.
    """
    counted = [c for c in convictions if not _is_21a_279c(c) and not _cannabis_auto_erased(c)]
    dates = [c.conviction_date for c in counted if c.conviction_date is not None]
    unknown = len(dates) < len(counted)
    return (max(dates) if dates else None), unknown


def _timing_row(c: Conviction, p: Person, most_recent: date | None, clock_unknown: bool) -> dict:
    wait = _wait_years(c)
    if clock_unknown or most_recent is None:  # SPEC GAP: a conviction with no date might be the newest
        return _row(c, "needs_review", "NEEDS_REVIEW_CLOCK_UNKNOWN", SOURCE_FLYER, wait)
    eligible_on = add_years(most_recent, wait)

    if p.on_supervision_now is True or p.pending_ct_charges is True:
        return _row(c, "not_yet_supervision", "SUPERVISION_OR_PENDING", SOURCE_FLYER, wait, eligible_on)
    if p.all_sentences_completed is False:
        return _row(c, "not_yet_sentence", "SENTENCE_NOT_COMPLETE", SOURCE_FLYER, wait, eligible_on)
    if None in (p.on_supervision_now, p.pending_ct_charges, p.all_sentences_completed):
        return _row(c, "needs_review", "NEEDS_REVIEW_PERSON_UNKNOWN", SOURCE_FLYER, wait, eligible_on)

    kind = "DUI" if c.is_dui else ("MISD" if c.level == "misdemeanor" else "FELONY")
    met = p.today >= eligible_on
    code = f"{kind}_{wait}YR_{'MET' if met else 'NOT_MET'}"
    return _row(c, "likely_erased" if met else "eligible_on", code, SOURCE_FLYER, wait, eligible_on)


# ---- Output (spec section 5) ---------------------------------------------------------------


def _overall(statuses: list[str]) -> str:
    if not statuses:
        return "needs_review"
    if "needs_review" in statuses:
        return "needs_review"
    erased = [s in ERASED_STATUSES for s in statuses]
    if all(erased):
        return "likely_erased"
    if any(erased):
        return "partly_erased"
    if any(s in WAITING_STATUSES for s in statuses):
        return "eligible_on"
    if any(s in PETITION_STATUSES for s in statuses):
        return "petition"
    return "not_eligible"


def _next_steps(statuses: set[str]) -> list[str]:
    steps = ["confirm_record_spbi"]
    if "likely_erased" in statuses:
        steps.append("hearing_request")
    if "petition_pre_2000" in statuses:
        steps.append("petition_pre_2000")
    if statuses & {"needs_review", "not_eligible", "petition_pre_2000", "petition_cannabis"}:
        steps.append("legal_aid_referral")
    return steps


def evaluate(person: Person) -> dict:
    """Estimate Clean Slate status for every conviction. Pure function of its input."""
    convictions = person.convictions
    most_recent, clock_unknown = _most_recent_conviction(convictions)

    rows = []
    for c in convictions:
        row = _type_check(c, convictions)
        if row is None:
            row = _timing_row(c, person, most_recent, clock_unknown)
        rows.append(row)

    # needs_review first so it is never hidden; otherwise keep the input order
    rows.sort(key=lambda r: r["status"] != "needs_review")
    statuses = [r["status"] for r in rows]

    future = [
        r["eligible_on"] for r in rows
        if r["status"] in WAITING_STATUSES and r["eligible_on"]
    ]

    assumptions = [
        "No convictions outside Connecticut were considered (federal or other states).",
        "Based only on the answers given, not on the official State Police record.",
        "The waiting period counts from the most recent conviction of any kind.",
    ]
    if not convictions:
        assumptions.append("No convictions were entered.")
    if any(_is_21a_279c(c) for c in convictions):
        assumptions.append(
            "Drug possession under §21a-279(c) before Oct 1, 2015 was not counted toward the "
            "waiting period, because the cannabis law erased it."
        )

    return {
        "overall": _overall(statuses),
        "eligible_on_earliest": min(future) if future else None,
        "convictions": rows,
        "assumptions": assumptions,
        "next_steps": _next_steps(set(statuses)),
        "disclaimer": DISCLAIMER,
    }
