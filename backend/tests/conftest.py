"""Keep test runs out of the real logs in output/."""

import pytest

import audit
import usage


@pytest.fixture(autouse=True)
def isolated_logs(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "AUDIT_PATH", tmp_path / "audit_trail.json")
    monkeypatch.setattr(usage, "USAGE_LOG_PATH", tmp_path / "usage_log.json")
    monkeypatch.setattr(usage, "_session_totals", None)
    yield tmp_path
