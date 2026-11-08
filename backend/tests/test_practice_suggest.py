"""Which practice conversation is suggested from her answers (practice_suggest.py)."""

from models import Children, Housing, Profile
from practice_suggest import suggest


def test_family_court_case_suggests_reunification():
    p = Profile(children=Children(count=2, living_with="family", family_court_case=True), work_goals="food service")
    assert suggest(p)["id"] == "reunification"


def test_work_goal_suggests_job_interview():
    # Maria: kids with family, no court case, staying with family, wants food service work
    p = Profile(children=Children(count=2, living_with="family", family_court_case=False),
                housing=Housing(tonight="family_or_friends", this_month="family_or_friends"), work_goals="food service")
    assert suggest(p) == {"id": "job_interview", "reason": "You told us you're looking for work."}


def test_unstable_housing_suggests_landlord():
    assert suggest(Profile(housing=Housing(this_month="shelter")))["id"] == "landlord"


def test_nothing_to_go_on_suggests_nothing():
    assert suggest(Profile()) is None
    assert suggest(None) is None
