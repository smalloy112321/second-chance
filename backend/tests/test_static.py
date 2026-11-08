"""The built frontend is served, and a missing file is a real 404 (so the homepage photo can
hide itself cleanly when no licensed copy is deployed)."""

from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def test_homepage_served():
    r = client.get("/")
    assert r.status_code == 200 and "<div id=\"root\">" in r.text


def test_missing_file_is_404():
    assert client.get("/no-such-photo.jpg").status_code == 404


def test_app_routes_still_fall_back_to_homepage():
    assert client.get("/practice").status_code == 200
