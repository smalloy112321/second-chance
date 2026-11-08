"""Sample results for the /?examples page (screenshots for the report). No AI calls: the
self-serve results step shows only rules-engine output plus the fixed next steps, so these
are exactly what the app would show for these answers."""

from __future__ import annotations

from datetime import date

import resources
from orchestrator import NEXT_STEPS, ordered_steps
from rules.clean_slate import Conviction, Person, evaluate


def _c(i: str, desc: str, level: str, happened: int | None, convicted: int | None, **kw) -> Conviction:
    kw.setdefault("is_family_violence", False)
    kw.setdefault("is_sex_offense", False)
    kw.setdefault("is_dui", False)
    # The questionnaire asks for the year only; the intake agent records mid-year (July 1).
    return Conviction(
        id=i, description=desc, level=level,
        offense_date=date(happened, 7, 1) if happened else None,
        conviction_date=date(convicted, 7, 1) if convicted else None, **kw,
    )


def _person(*convictions: Conviction, today: date, supervision=False, pending=False, finished=True) -> Person:
    return Person(today=today, on_supervision_now=supervision, pending_ct_charges=pending,
                  all_sentences_completed=finished, convictions=list(convictions))


def example_results(today: date | None = None) -> list[dict]:
    t = today or date.today()
    cases = [
        ("Likely erased", "Shoplifting, misdemeanor, 2012. Nothing else.",
         _person(_c("c1", "Shoplifting", "misdemeanor", 2012, 2012), today=t)),
        ("Partly erased", "Shoplifting 2012, plus a family-violence breach of peace in 2015.",
         _person(_c("c1", "Shoplifting", "misdemeanor", 2012, 2012),
                 _c("c2", "Breach of peace (family violence)", "misdemeanor", 2015, 2015, is_family_violence=True), today=t)),
        ("Likely to be erased on a later date", "Class D felony drug sale in 2014, plus a misdemeanor in 2020.",
         _person(_c("c1", "Drug sale", "felony_D", 2013, 2014), _c("c2", "Breach of peace", "misdemeanor", 2020, 2020), today=t)),
        ("Likely erased after probation ends", "Drug possession misdemeanor in 2017. On probation now.",
         _person(_c("c1", "Drug possession", "misdemeanor", 2017, 2017), today=t, supervision=True, finished=False)),
        ("Likely not covered", "Class B felony robbery, 2010.",
         _person(_c("c1", "Robbery", "felony_B", 2009, 2010), today=t)),
        ("Needs review", "Felony drug sale, 2016. Class and sentence: not sure.",
         _person(_c("c1", "Drug sale", "felony_unclassified", 2015, 2016, unclassified_felony_max_under_5_years=None), today=t)),
        ("Can be erased if you ask a court", "Shoplifting, misdemeanor. It happened in 1998.",
         _person(_c("c1", "Shoplifting", "misdemeanor", 1998, 1999), today=t)),
        ("Likely erased (cannabis possession)", "Cannabis possession, 2010.",
         _person(_c("c1", "Cannabis possession", "misdemeanor", 2010, 2010, is_cannabis_possession=True), today=t)),
    ]
    db = resources.by_id()
    out = []
    for title, answers, person in cases:
        rules = evaluate(person)
        steps = [{"code": code, **NEXT_STEPS[code]} for code in ordered_steps(rules["next_steps"], rules["overall"]) if code in NEXT_STEPS]
        ids = {i for s in steps for i in s["resource_ids"] if i in db}
        out.append({
            "title": title,
            "answers": answers,
            "result": {"type": "result", "rules": rules, "next_steps": steps, "resources": {i: db[i] for i in sorted(ids)}},
        })
    return out
