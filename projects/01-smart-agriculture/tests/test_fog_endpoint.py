from fastapi.testclient import TestClient

from conftest import load_module

fog = load_module("fog_app", "fog/app.py")


def test_ingest_buffers_readings():
    fog.app.state.buffers.clear()
    client = TestClient(fog.app)
    payload = {
        "sensor_type": "soil_moisture",
        "site_id": "field-1",
        "unit": "%",
        "readings": [{"ts": "t0", "value": 18.0}, {"ts": "t1", "value": 16.0}],
    }
    resp = client.post("/ingest", json=payload)
    assert resp.status_code == 202
    assert resp.json() == {"accepted": 2}
    assert len(fog.app.state.buffers[("soil_moisture", "field-1")]) == 2


def test_build_messages_aggregates_and_alerts():
    snapshot = {
        ("soil_moisture", "field-1"): [
            {"ts": "t0", "value": 18.0},
            {"ts": "t1", "value": 16.0},
        ]
    }
    messages = fog.build_messages(snapshot, {"soil_moisture": "%"}, "s", "e")
    assert len(messages) == 1
    msg = messages[0]
    assert msg["avg"] == 17.0
    assert msg["alerts"] == ["irrigation_needed"]


def test_health_ok():
    client = TestClient(fog.app)
    assert client.get("/health").json() == {"status": "ok"}
