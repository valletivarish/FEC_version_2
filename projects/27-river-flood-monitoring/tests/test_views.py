import data_access
import views


def test_reaches_builds_catchment_and_reaches(monkeypatch):
    monkeypatch.setattr(data_access, "reach_windows", lambda: {
        "reach-a": {"river_level_m": {"latest": 5.6, "alerts": ["flood_warning"], "rise_mph": 0.3}},
        "reach-b": {"river_level_m": {"latest": 2.0, "alerts": [], "rise_mph": 0.0}},
    })
    status, body = views.reaches({})
    assert status == 200
    assert body["catchment_stage"] == "warning"
    assert {r["site_id"] for r in body["reaches"]} == {"reach-a", "reach-b"}


def test_readings_rejects_unknown_sensor_type():
    status, _ = views.readings({"sensor_type": "nope"})
    assert status == 400


def test_readings_returns_items(monkeypatch):
    monkeypatch.setattr(data_access, "recent_windows", lambda st, limit: [{"site_id": "reach-a", "latest": 3.0}])
    status, body = views.readings({"sensor_type": "river_level_m", "limit": "5"})
    assert status == 200 and body["items"]


def test_readings_rejects_bad_limit():
    status, _ = views.readings({"sensor_type": "river_level_m", "limit": "0"})
    assert status == 400


def test_readings_filters_by_site(monkeypatch):
    monkeypatch.setattr(data_access, "recent_windows", lambda st, limit: [{"site_id": "reach-a"}, {"site_id": "reach-b"}])
    _, body = views.readings({"sensor_type": "river_level_m", "site_id": "reach-b"})
    assert [row["site_id"] for row in body["items"]] == ["reach-b"]


def test_health_pipeline_true_when_fresh(monkeypatch):
    monkeypatch.setattr(views, "_fog_online", lambda: True)
    monkeypatch.setattr(data_access, "freshest_age_seconds", lambda now: 5.0)
    monkeypatch.setattr(data_access, "queue_reachable", lambda: True)
    monkeypatch.setattr(data_access, "lambda_active", lambda: True)
    _, body = views.health({})
    assert body["pipeline"] is True and body["gateway"] is True


def test_health_pipeline_false_when_stale(monkeypatch):
    monkeypatch.setattr(views, "_fog_online", lambda: False)
    monkeypatch.setattr(data_access, "freshest_age_seconds", lambda now: 999)
    monkeypatch.setattr(data_access, "queue_reachable", lambda: False)
    monkeypatch.setattr(data_access, "lambda_active", lambda: False)
    _, body = views.health({})
    assert body["pipeline"] is False


def test_backend_stats(monkeypatch):
    monkeypatch.setattr(data_access, "stored_count", lambda: 42)
    monkeypatch.setattr(data_access, "queue_stats", lambda: {"waiting": 0, "in_flight": 0})
    _, body = views.backend_stats({})
    assert body["items_in_table"] == 42
