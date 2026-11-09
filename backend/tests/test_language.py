"""The site language reaches every agent (agents/runtime.py)."""

from agents.runtime import language_note


def test_agents_are_told_to_write_in_the_site_language():
    assert language_note("en") == ""
    assert "Spanish" in language_note("es")
    assert "Portuguese" in language_note("pt")
    # Codes and names stay in English so the app's code checks and the checked resource list still match.
    assert "JSON field name" in language_note("es") and "phone numbers" in language_note("pt")
    assert language_note("fr") == ""  # anything else falls back to English
