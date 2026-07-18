"""Real HTTP-level tests against a genuine aiohttp server on an ephemeral port, driven with aiohttp's TestClient over a real socket."""

import asyncio
import json

import pytest
from aiohttp.test_utils import TestClient, TestServer

from conftest import load_module

fog_app = load_module("fog_app", "fog/app.py")


def run(coro_fn):
    return asyncio.run(coro_fn())


def fresh_app():
    # enable_background=False: no SQS client, flusher thread or flush task -- these tests only exercise routing/validation/buffering.
    return fog_app.create_app(enable_background=False)


class TestHealthAndThresholds:
    def test_health_returns_200_ok(self):
        async def scenario():
            async with TestClient(TestServer(fresh_app())) as client:
                resp = await client.get("/health")
                assert resp.status == 200
                assert await resp.json() == {"status": "ok"}
        run(scenario)

    def test_thresholds_exposes_the_real_panel_temp_rule(self):
        async def scenario():
            async with TestClient(TestServer(fresh_app())) as client:
                resp = await client.get("/thresholds")
                assert resp.status == 200
                body = await resp.json()
                assert {"field": "avg", "op": ">", "limit": 65, "key": "thermal_derate_risk"} in body["panel_temp_c"]
                assert "irradiance_wm2" not in body
        run(scenario)

    def test_unknown_route_returns_404(self):
        async def scenario():
            async with TestClient(TestServer(fresh_app())) as client:
                resp = await client.get("/not-a-real-route")
                assert resp.status == 404
        run(scenario)


class TestIngestValidation:
    def test_valid_batch_is_accepted_with_202(self):
        async def scenario():
            async with TestClient(TestServer(fresh_app())) as client:
                payload = {
                    "sensor_type": "inverter_output_kw",
                    "site_id": "array-1",
                    "unit": "kW",
                    "readings": [{"ts": "t0", "value": 70.0}, {"ts": "t1", "value": 72.0}],
                }
                resp = await client.post("/ingest", json=payload)
                assert resp.status == 202
                assert await resp.json() == {"accepted": 2}
        run(scenario)

    def test_valid_batch_is_actually_buffered_end_to_end(self):
        async def scenario():
            app = fresh_app()
            async with TestClient(TestServer(app)) as client:
                payload = {
                    "sensor_type": "soiling_index_pct",
                    "site_id": "array-2",
                    "unit": "%",
                    "readings": [{"ts": "t0", "value": 12.5}],
                }
                await client.post("/ingest", json=payload)
                assert app[fog_app.COMBINER_KEY].active[("soiling_index_pct", "array-2")] == [{"ts": "t0", "value": 12.5}]
        run(scenario)

    @pytest.mark.parametrize(
        "payload",
        [
            {"site_id": "array-1", "readings": [{"ts": "t0", "value": 1.0}]},
            {"sensor_type": "inverter_output_kw", "readings": []},
            {"sensor_type": "inverter_output_kw", "readings": [{"ts": "t0"}]},
            {"sensor_type": "inverter_output_kw", "readings": [{"ts": "t0", "value": "hot"}]},
            {"sensor_type": "", "readings": [{"ts": "t0", "value": 1.0}]},
        ],
    )
    def test_malformed_payloads_are_rejected_with_400(self, payload):
        async def scenario():
            async with TestClient(TestServer(fresh_app())) as client:
                resp = await client.post("/ingest", json=payload)
                assert resp.status == 400
                body = await resp.json()
                assert "error" in body
        run(scenario)

    def test_non_json_body_is_rejected_with_400(self):
        async def scenario():
            async with TestClient(TestServer(fresh_app())) as client:
                resp = await client.post(
                    "/ingest", data=b"not json at all",
                    headers={"Content-Type": "application/json"},
                )
                assert resp.status == 400
        run(scenario)

    def test_empty_body_is_rejected_with_400(self):
        async def scenario():
            async with TestClient(TestServer(fresh_app())) as client:
                resp = await client.post("/ingest", data=b"")
                assert resp.status == 400
        run(scenario)

    def test_unknown_post_route_returns_404(self):
        async def scenario():
            async with TestClient(TestServer(fresh_app())) as client:
                resp = await client.post("/not-ingest", json={"a": 1})
                assert resp.status == 404
        run(scenario)


class TestFlushOnce:
    def test_flush_window_aggregates_buffered_readings_and_enqueues_one_message_per_group(self, monkeypatch):
        async def scenario():
            app = fresh_app()
            # Starting a real TestServer fires aiohttp's startup signals, which is what populates the combiner app-key.
            async with TestServer(app):
                app[fog_app.COMBINER_KEY].record("dc_voltage_v", "array-1", "V", [
                    {"ts": "t0", "value": 340.0}, {"ts": "t1", "value": 360.0},
                ])
                app[fog_app.COMBINER_KEY].record("irradiance_wm2", "array-1", "W/m2", [{"ts": "t0", "value": 600.0}])

                captured = []
                monkeypatch.setattr(fog_app, "enqueue", lambda message: captured.append(message))

                await fog_app.flush_window(app)

                by_type = {m["sensor_type"]: m for m in captured}
                assert set(by_type) == {"dc_voltage_v", "irradiance_wm2"}
                # dc_voltage_v: min 340 < 350 -> undervoltage_fault must fire.
                assert by_type["dc_voltage_v"]["alerts"] == ["undervoltage_fault"]
                assert by_type["dc_voltage_v"]["min"] == 340.0
                assert by_type["irradiance_wm2"]["alerts"] == []
        run(scenario)
