"""The audit log never keeps the person's first name (audit.py)."""

import json

import audit
import sessions


def test_typed_names_are_scrubbed_before_intake_reads_them():
    assert audit.scrub("Here are my answers. First name: Maria Where I live: Hartford", []) == \
        "Here are my answers. First name: [name] Where I live: Hartford"
    assert audit.scrub("Client: Denise R., 34, New Haven.", []).startswith("Client: [name], 34")
    assert audit.scrub("First name: skipped", []) == "First name: skipped"


def test_known_first_name_is_scrubbed_everywhere_in_a_row(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "AUDIT_PATH", tmp_path / "audit.json")
    monkeypatch.setattr(audit, "OUTPUT_DIR", tmp_path)
    s = sessions.get_or_create("privacy-test", "self_serve")
    s.profile.first_name = "Maria"
    audit.log_agent_run(
        session_id="privacy-test", mode="self_serve", agent="planner", input_summary="profile for maria",
        output={"summary": "Maria, the rules check estimates your 2014 conviction may be erased.", "weeks": []},
    )
    row = json.loads((tmp_path / "audit.json").read_text())[0]
    assert "maria" not in json.dumps(row).lower()
    assert row["output"]["summary"].startswith("[name], the rules check")
    sessions.delete("privacy-test")
