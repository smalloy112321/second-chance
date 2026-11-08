"""Long, unchanging reference text placed right after the shared rules in the screener,
planner, and verifier prompts, so the same prefix repeats and prompt caching can kick in.

Contains no phone numbers, addresses, or websites: the AI never sees contact details.
"""

from __future__ import annotations

from functools import lru_cache

import resources

RULES_SUMMARY = """## Reference: Clean Slate rules engine (summary)
The rules engine is plain code. It has already decided every status, date, and reason code.
Statuses:
- likely_erased: waiting period met and no supervision, pending case, or unfinished sentence.
- likely_erased_cannabis: cannabis possession (or drug possession under 21a-279(c)) erased by the cannabis law.
- eligible_on: an eligible type; expected to be erased on or after the date shown, if there are no new convictions.
- not_yet_supervision / not_yet_sentence: eligible type, but on supervision, a pending case, or an unfinished sentence.
- petition_pre_2000 / petition_cannabis: not automatic; a court petition is possible.
- not_eligible: family violence, sex offense, excluded statute, class A/B/C felony, or repeat DUI within 10 years.
- needs_review: missing information; legal aid can check.
Waiting periods: 7 years for misdemeanors; 10 years for class D/E felonies, some unclassified felonies, and DUI.
The clock runs from the most recent conviction of any kind.
Next step codes:
- confirm_record_spbi: request a current record from State Police.
- hearing_request: if a conviction should have been erased but still shows, request a Clean Slate hearing.
- petition_pre_2000: court petition for older convictions.
- legal_aid_referral: talk with legal aid.
"""


@lru_cache(maxsize=1)
def reference_text() -> str:
    return (
        RULES_SUMMARY
        + "\n## Reference: valid resource ids (id | category | name | towns)\n"
        + resources.catalog_text()
    )
