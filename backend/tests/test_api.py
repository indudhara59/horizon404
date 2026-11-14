from fastapi.testclient import TestClient

from horizon404.api import app

client = TestClient(app)


def test_sites():
    r = client.get("/api/sites")
    assert r.status_code == 200 and len(r.json()) >= 10


def test_analyze_reference_site():
    r = client.get("/api/analyze", params={"lat": 0.6741, "lon": 23.473, "start": "2026-11-14T00:00:00Z", "days": 2})
    body = r.json()
    assert r.status_code == 200
    assert body["metrics"]["earth_visible_pct"] == 100.0
    assert len(body["track"]["times"]) == 49


def test_bad_start():
    r = client.get("/api/analyze", params={"lat": 0, "lon": 0, "start": "nope"})
    assert r.status_code == 400


def test_best_dates():
    r = client.get("/api/best-dates", params={"lat": 0.6741, "lon": 23.473, "start": "2026-11-14", "months": 1})
    assert r.status_code == 200 and len(r.json()) == 30
