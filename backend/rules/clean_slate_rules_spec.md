# Clean Slate Rules Engine: Spec

**Purpose:** a plain-Python function (no AI) that estimates whether each conviction has likely been erased under Connecticut's Clean Slate law, or when it will be. The AI screener agent only *explains* the output; it never decides eligibility.

**Sources (rules below are taken from these; re-check before submitting):**
- CT Clean Slate eligibility page: https://portal.ct.gov/cleanslate/clean-slate-eligibility
- New Haven Legal Assistance flyer (Aug 11, 2025): https://ctlawhelp.org/files/pamphlets/benefits_work/clean-slate-flyer-EN.pdf
- Full eligible offense list (PDF): https://portal.ct.gov/-/media/DESPP/CSP/SPBI/Clean-Slate/EligibleCleanSlateStatute.pdf

> Every result shown to a user must include: "This is an estimate, not legal advice. Confirm with an official State Police record check or legal aid."

---

## 1. Inputs

### Person-level
| Field | Type | Notes |
|---|---|---|
| `today` | date | Pass in (don't call `date.today()` inside) so tests are repeatable |
| `on_supervision_now` | bool / null | Currently on CT probation, parole, or special parole |
| `pending_ct_charges` | bool / null | Any open criminal case in CT |
| `all_sentences_completed` | bool / null | Prison, parole, special parole, and probation finished for **every** conviction |
| `convictions` | list | See below |

### Per conviction
| Field | Type | Notes |
|---|---|---|
| `id` | str | |
| `description` | str | What she called it, e.g., "shoplifting" |
| `offense_date` | date / null | When the act happened |
| `conviction_date` | date / null | When convicted |
| `level` | enum | `misdemeanor`, `felony_A`, `felony_B`, `felony_C`, `felony_D`, `felony_E`, `felony_unclassified`, `unknown` |
| `unclassified_felony_max_under_5_years` | bool / null | Only matters for `felony_unclassified` |
| `statute` | str / null | e.g., "53a-125b". Often unknown; that's OK |
| `is_family_violence` | bool / null | Family violence crime (§46b-38a) |
| `is_sex_offense` | bool / null | Nonviolent sexual or sexually violent offense (§54-250) |
| `is_dui` | bool | Operating under the influence (§14-227a) |
| `is_cannabis_possession` | bool | Possession of 4 oz or less of cannabis |
| `is_21a_279c_before_2015_10_01` | bool | Certain drug possession before Oct 1, 2015 (erased under cannabis law, see §4) |

`null` means "she doesn't know." Unknowns must never be guessed. They push the result toward `needs_review`.

---

## 2. Constants

```python
CLEAN_SLATE_START = date(2000, 1, 1)
MISDEMEANOR_WAIT_YEARS = 7
FELONY_WAIT_YEARS = 10
CANNABIS_AUTO_START = date(2000, 1, 1)
CANNABIS_AUTO_END = date(2015, 9, 30)

# Statutes never eligible (from the official eligibility page)
EXCLUDED_STATUTES = {
  "29-33", "53a-60a", "53a-60b", "53a-60c", "53a-61a", "53a-64bb", "53a-64cc",
  "53a-72a", "53a-90a", "53a-103a", "53a-181c", "53a-189a(a)(1)", "53a-191",
  "53a-196", "53a-196d", "53a-196f", "53a-211", "53a-212", "53a-216",
  "53a-217", "53a-217a", "53a-217c", "53a-322", "53a-323",
  "54-251", "54-252", "54-253", "54-254",
}
```

---

## 3. Per-conviction status (check in this order; first match wins)

| # | Condition | Status | Plain-language meaning |
|---|---|---|---|
| 1 | `is_cannabis_possession` and conviction between 2000-01-01 and 2015-09-30 | `likely_erased_cannabis` | Erased automatically on Jan 1, 2023 under the cannabis law |
| 2 | `is_cannabis_possession` (any other date) | `petition_cannabis` | Can be erased by petitioning the court |
| 3 | `is_family_violence` is true, `is_sex_offense` is true, or `statute` in `EXCLUDED_STATUTES` | `not_eligible` | This type of conviction is not covered by Clean Slate |
| 4 | `level` in `felony_A`, `felony_B`, `felony_C` | `not_eligible` | Only class D, E, and some unclassified felonies qualify |
| 5 | `is_dui` and there is another DUI conviction within 10 years after it | `not_eligible` | Repeat DUI within 10 years is excluded |
| 6 | `offense_date` or `conviction_date` before 2000-01-01 | `petition_pre_2000` | Not automatic; she can petition the court |
| 7 | `level` = `unknown`, or `felony_unclassified` with `unclassified_felony_max_under_5_years` not true, or any of `is_family_violence` / `is_sex_offense` / dates is null | `needs_review` | Not enough information; talk to legal aid |
| 8 | Otherwise | **eligible type**: go to §4 for timing | |

Waiting period for eligible types:
- `misdemeanor` → 7 years
- `felony_D`, `felony_E`, `felony_unclassified` (under 5 years), or `is_dui` → 10 years

---

## 4. Timing (the waiting-period clock)

The clock runs from her **most recent conviction of any kind**, not from the conviction being checked. A newer conviction, even an ineligible one, restarts the clock for everything.

```
most_recent = max(conviction_date for all convictions
                  where not is_21a_279c_before_2015_10_01
                  and not likely_erased_cannabis)
eligible_on = most_recent + wait_years   # use calendar years; Feb 29 → Feb 28
```

Exclude drug possession under §21a-279(c) before Oct 1, 2015 from the clock, because the cannabis law erases it ("it will not count as a conviction for the purpose of the date of your last conviction").

Then the person-level gates:

| Condition | Result for each eligible-type conviction |
|---|---|
| `on_supervision_now` true or `pending_ct_charges` true | `not_yet_supervision`: "Once your supervision ends and with no new convictions, your clock continues. Estimated date: {eligible_on}" |
| `all_sentences_completed` is false | `not_yet_sentence`: same message |
| any of those three is null | `needs_review` |
| `today >= eligible_on` | `likely_erased`: "Should already be erased. If it still shows on your record, you can request a hearing." |
| `today < eligible_on` | `eligible_on`: "Expected to be erased automatically on or after {eligible_on}, if you have no new convictions before then." |

---

## 5. Output

```json
{
  "overall": "likely_erased | partly_erased | eligible_on | petition | not_eligible | needs_review",
  "eligible_on_earliest": "2027-03-14 or null",
  "convictions": [
    {"id": "c1", "status": "likely_erased", "wait_years": 7,
     "eligible_on": "2019-05-02", "reason_code": "MISD_7YR_MET",
     "rule_source": "https://portal.ct.gov/cleanslate/clean-slate-eligibility"}
  ],
  "assumptions": ["No convictions outside Connecticut were considered", "..."],
  "next_steps": ["confirm_record_spbi", "legal_aid_referral", "hearing_request"]
}
```

`reason_code` is a short fixed code (e.g., `EXCLUDED_FAMILY_VIOLENCE`, `PRE_2000_PETITION`, `FELONY_10YR_NOT_MET`). The AI screener explains the code; it cannot change it. That is what keeps the AI from inventing a rule.

**`overall` logic:** all convictions `likely_erased*` → `likely_erased`; some → `partly_erased`; none erased but some have a future date → `eligible_on`; and so on. Put any `needs_review` at the top so it's never hidden.

**`next_steps` the UI can show:**
- `confirm_record_spbi`: request a current record from State Police (online, or by mail with form DPS-0846-C)
- `hearing_request`: if it should have been erased but wasn't, send a record check dated on or after 1/1/2024 plus the Clean Slate hearing form to DESPP.cshearing@ct.gov
- `petition_pre_2000`: court petition (form JD-CR-202)
- `legal_aid_referral`: New Haven Legal Assistance 203-946-4811 (Greater New Haven) or Statewide Legal Services 800-453-3320 (elsewhere)

---

## 6. Test cases (write these as pytest tests first, with `today = 2026-11-07`)

| # | Scenario | Expected |
|---|---|---|
| 1 | One misdemeanor, convicted 2012-03-01, sentence done, no supervision | `likely_erased` (eligible 2019-03-01) |
| 2 | One misdemeanor, convicted 2021-06-15, sentence done | `eligible_on` 2028-06-15 |
| 3 | Class D felony, convicted 2014-01-10, sentence done | `likely_erased` (eligible 2024-01-10) |
| 4 | Class D felony 2014-01-10 **plus** misdemeanor 2020-05-05 | felony `eligible_on` 2030-05-05; misdemeanor `eligible_on` 2027-05-05 (the newer conviction restarts the clock for both) |
| 5 | Class C felony 2008 | `not_eligible` |
| 6 | Misdemeanor 2010, flagged family violence | `not_eligible` |
| 7 | Misdemeanor, offense date 1998 | `petition_pre_2000` |
| 8 | Misdemeanor 2012, currently on probation for a 2023 case | `not_yet_supervision`, estimated date based on 2023 |
| 9 | Cannabis possession, 2010 | `likely_erased_cannabis` |
| 10 | Misdemeanor 2011 plus 21a-279(c) possession 2014 | misdemeanor `likely_erased` (the 2014 possession does not restart the clock) |
| 11 | DUI 2009 and DUI 2015, sentences done | 2009 DUI `not_eligible` (followed by another DUI within 10 years); 2015 DUI `likely_erased` (eligible 2025) |
| 12 | Level `unknown` | `needs_review` |
| 13 | `all_sentences_completed` = null | `needs_review` |
| 14 | Statute "53a-181c" (stalking 1st) | `not_eligible` |

These 14 tests double as **safety evidence** for the report: screenshot them passing.

---

## 7. Known limits (put these in "Limits + next steps")

- The engine can't see her official record. It relies on what she remembers, which is why every result says "estimate" and links to the official record check.
- Out-of-state and federal convictions aren't considered.
- The DUI repeat rule is applied in a simple way, and the full eligible-offense PDF has more detail than this spec covers. Ask a legal aid attorney to review the 14 test cases.
- Most women won't know their felony class or statute number. The intake agent should ask in plain terms ("Was it a misdemeanor or a felony? Do you remember how long the sentence could have been?") and allow "I don't know," which leads to `needs_review`, not a guess.
