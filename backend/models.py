"""Structured outputs for every agent (PydanticAI output_type), plus the intake profile."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["self_serve", "caseworker"]

# ---- Safety guard ------------------------------------------------------------------------


class SafetyResult(BaseModel):
    status: Literal["ok", "crisis", "injection", "off_topic"]
    crisis_type: Literal["self_harm", "violence", "no_shelter_tonight", "medical"] | None = None
    reason: str = Field(description="One short sentence for the audit log.")


# ---- Intake profile ----------------------------------------------------------------------

Level = Literal[
    "misdemeanor", "felony_A", "felony_B", "felony_C", "felony_D", "felony_E",
    "felony_unclassified", "unknown",
]


class ProfileConviction(BaseModel):
    description: str = Field(description="What she called it, in her words.")
    offense_date: date | None = Field(None, description="When it happened (YYYY-MM-DD). null if unknown.")
    conviction_date: date | None = Field(None, description="When convicted (YYYY-MM-DD). null if unknown.")
    date_is_approximate: bool = False
    level: Level = Field("unknown", description="Never guess a felony class; use unknown.")
    unclassified_felony_max_under_5_years: bool | None = None
    statute: str | None = None
    is_family_violence: bool | None = None
    is_sex_offense: bool | None = None
    is_dui: bool | None = None
    is_cannabis_possession: bool | None = None
    is_21a_279c_before_2015_10_01: bool | None = Field(
        None, description="Drug possession under 21a-279(c) before Oct 1, 2015. null if unknown."
    )


class Children(BaseModel):
    count: int | None = None
    ages: list[int] = Field(default_factory=list)
    living_with: Literal["her", "family", "foster_care_or_dcf", "other"] | None = None
    family_court_case: bool | None = None


class Housing(BaseModel):
    tonight: Literal["stable", "family_or_friends", "shelter", "street", "transitional_program"] | None = None
    this_month: Literal["stable", "family_or_friends", "shelter", "street", "transitional_program"] | None = None


class IDs(BaseModel):
    state_id_or_license: bool | None = None
    birth_certificate: bool | None = None
    social_security_card: bool | None = None


class Profile(BaseModel):
    first_name: str | None = Field(None, description="Only if she offers it.")
    town: str | None = None
    convictions: list[ProfileConviction] = Field(default_factory=list)
    on_supervision_now: bool | None = None
    pending_ct_charges: bool | None = None
    all_sentences_completed: bool | None = None
    children: Children = Field(default_factory=Children)
    housing: Housing = Field(default_factory=Housing)
    ids: IDs = Field(default_factory=IDs)
    income: str | None = None
    work_goals: str | None = None
    goals_30_days: list[str] = Field(default_factory=list)


class IntakeTurn(BaseModel):
    reply: str
    profile: Profile
    missing_fields: list[str] = Field(default_factory=list)
    is_complete: bool = False


# ---- Screener ----------------------------------------------------------------------------

NextStepCode = Literal["confirm_record_spbi", "hearing_request", "petition_pre_2000", "legal_aid_referral"]
DisclosureGuidance = Literal["can_answer_no_if_confirmed", "must_disclose", "unsure_ask_legal_aid"]


class ScreenerOutput(BaseModel):
    headline: str
    explanation: str
    next_step_codes: list[str] = Field(default_factory=list)
    disclosure_guidance: DisclosureGuidance


# ---- Planner -----------------------------------------------------------------------------


class PlanStep(BaseModel):
    step_id: str = Field(description="e.g. w1s1")
    action: str
    why: str
    resource_id: str | None = Field(None, description="An id returned by a tool, or null. Never contact details.")
    priority: Literal["high", "medium", "low"] = "medium"


class PlanWeek(BaseModel):
    week: int = Field(ge=1, le=4)
    focus: str
    steps: list[PlanStep]


class Plan(BaseModel):
    summary: str
    weeks: list[PlanWeek]

    def steps(self) -> list[PlanStep]:
        return [s for w in self.weeks for s in w.steps]


# ---- Verifier ----------------------------------------------------------------------------

CheckName = Literal["disclosure", "certainty", "invented_fact", "order", "fit", "tone"]


class VerifierIssue(BaseModel):
    step_id: str | None = None
    check: CheckName
    problem: str
    fix: str = ""
    source: Literal["code", "ai"] = "ai"


class VerifierResult(BaseModel):
    approved: bool
    issues: list[VerifierIssue] = Field(default_factory=list)


# ---- Practice room (Step 4) ---------------------------------------------------------------

Difficulty = Literal["friendly", "neutral", "skeptical"]
SKILLS = ("honest_and_accurate", "brief", "ownership", "forward", "calm_confidence")


class RoleplayLine(BaseModel):
    line: str
    ended: bool = False


class CoachScores(BaseModel):
    # Plain ints: the app clamps them to 1-3 in code instead of making the model retry.
    honest_and_accurate: int = 2
    brief: int = 2
    ownership: int = 2
    forward: int = 2
    calm_confidence: int = 2

    def clamped(self) -> "CoachScores":
        return CoachScores(**{k: min(3, max(1, int(v))) for k, v in self.model_dump().items()})

    def total(self) -> int:
        return sum(self.model_dump().values())


class CoachFeedback(BaseModel):
    scores: CoachScores
    strength: str
    tip: str
    try_saying: str
    legal_fact_used: str | None = None


class CoachSummary(BaseModel):
    summary: str
    best_quote: str
    practice_next: str
    score_first: float
    score_last: float
