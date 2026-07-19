from aiohttp.test_utils import TestClient, TestServer

import gateway


def test_validate_accepts_well_formed():
    assert gateway.validate({"sensor_type": "river_level_m", "site_id": "reach-a", "readings": [{"value": 3.0}]}) is None


def test_validate_missing_field():
    assert gateway.validate({"sensor_type": "x", "readings": [{"value": 1}]}) is not None


def test_validate_empty_readings():
    assert gateway.validate({"sensor_type": "x", "site_id": "r", "readings": []}) is not None


def test_validate_non_numeric_value():
    assert gateway.validate({"sensor_type": "x", "site_id": "r", "readings": [{"value": "hi"}]}) is not None


def test_validate_rejects_non_object():
    assert gateway.validate([1, 2]) is not None


def test_drain_returns_nonempty_and_clears():
    buffers = {("a", "r"): [1, 2], ("b", "r"): []}
    snapshot = gateway.drain(buffers)
    assert snapshot == {("a", "r"): [1, 2]}
    assert buffers == {}


async def test_ingest_buffers_readings():
    app = gateway.build_app()
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/ingest", json={"sensor_type": "river_level_m", "site_id": "reach-a",
                                                   "unit": "m", "readings": [{"ts": "t", "value": 3.2}]})
        assert resp.status == 202
        assert app["buffers"][("river_level_m", "reach-a")][0]["value"] == 3.2


async def test_ingest_rejects_bad_body():
    app = gateway.build_app()
    async with TestClient(TestServer(app)) as client:
        resp = await client.post("/ingest", json={"sensor_type": "x"})
        assert resp.status == 400


async def test_health_endpoint():
    app = gateway.build_app()
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/health")
        assert (await resp.json())["status"] == "ok"


async def test_thresholds_endpoint():
    app = gateway.build_app()
    async with TestClient(TestServer(app)) as client:
        resp = await client.get("/thresholds")
        assert "river_level_m" in await resp.json()
