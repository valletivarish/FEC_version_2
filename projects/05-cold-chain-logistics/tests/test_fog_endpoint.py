import asyncio

import pytest
from fastapi.testclient import TestClient

from conftest import load_module

depot_app = load_module("fog_app", "fog/app.py")


class FakeReading:
    def __init__(self, value):
        self.value = value


def make_batch(sensor_type, site_id, values, unit=""):
    batch = type(
        "FakeBatch",
        (),
        {
            "sensor_type": sensor_type,
            "site_id": site_id,
            "unit": unit,
            "readings": [FakeReading(v) for v in values],
        },
    )
    return batch()


@pytest.fixture
def fresh_state():
    depot_app.app.state.inbox = asyncio.Queue()
    depot_app.app.state.accumulator = depot_app.ManifestWindow()
    return depot_app.app


@pytest.fixture
def client(fresh_state):
    return TestClient(fresh_state)


class TestIngestEndpoint:
    def test_accepted_batch_is_queued_onto_inbox(self, client, fresh_state):
        payload = {
            "sensor_type": "storage_temperature",
            "site_id": "container-1",
            "unit": "C",
            "readings": [{"ts": "t0", "value": -10.0}, {"ts": "t1", "value": -8.0}],
        }
        resp = client.post("/ingest", json=payload)
        assert resp.status_code == 202
        assert resp.json() == {"accepted": 2}
        assert fresh_state.state.inbox.qsize() == 1

    @pytest.mark.parametrize(
        "payload, expected_status",
        [
            ({"sensor_type": "humidity", "readings": []}, 202),
            ({"sensor_type": "humidity"}, 422),
            ({"readings": [{"ts": "t0", "value": 1.0}]}, 422),
        ],
    )
    def test_ingest_status_code_by_payload_shape(self, client, payload, expected_status):
        resp = client.post("/ingest", json=payload)
        assert resp.status_code == expected_status


class TestInboxConsumer:
    def test_consumer_drains_queued_batch_without_deadlocking(self, fresh_state):
        batch = make_batch("storage_temperature", "container-1", [-10.0, -8.0])

        async def run_one_cycle():
            await fresh_state.state.inbox.put(batch)
            consumer = asyncio.create_task(depot_app.intake_worker(fresh_state))
            await fresh_state.state.inbox.join()
            consumer.cancel()

        asyncio.run(run_one_cycle())
        assert not fresh_state.state.accumulator.is_empty()

    def test_consumer_drains_a_burst_of_batches_in_one_pass(self, fresh_state):
        batches = [
            make_batch("humidity", "container-1", [70.0]),
            make_batch("humidity", "container-2", [90.0]),
            make_batch("shock_vibration", "container-1", [1.0]),
        ]

        async def run_one_cycle():
            for batch in batches:
                await fresh_state.state.inbox.put(batch)
            consumer = asyncio.create_task(depot_app.intake_worker(fresh_state))
            await fresh_state.state.inbox.join()
            consumer.cancel()

        asyncio.run(run_one_cycle())
        messages = fresh_state.state.accumulator.drain_messages("s", "e")
        assert len(messages) == 3

    def test_drain_ready_batches_stops_at_the_limit_leaving_the_rest_queued(self, fresh_state):
        async def run():
            for i in range(5):
                await fresh_state.state.inbox.put(make_batch("humidity", "container-1", [float(i)]))
            drained = depot_app._collect_ready_batches(fresh_state.state.inbox, 3)
            return drained, fresh_state.state.inbox.qsize()

        drained, remaining = asyncio.run(run())
        assert len(drained) == 3
        assert remaining == 2

    def test_drain_ready_batches_returns_empty_when_queue_is_already_empty(self, fresh_state):
        drained = depot_app._collect_ready_batches(fresh_state.state.inbox, 10)
        assert drained == []


class TestWindowAccumulator:
    def test_drain_produces_summary_with_alerts_for_single_batch(self):
        accumulator = depot_app.ManifestWindow()
        accumulator.absorb(make_batch("storage_temperature", "container-1", [-10.0, -8.0], unit="C"))
        messages = accumulator.drain_messages("s", "e")

        assert len(messages) == 1
        msg = messages[0]
        assert msg["sensor_type"] == "storage_temperature"
        assert msg["site_id"] == "container-1"
        assert msg["unit"] == "C"
        assert msg["avg"] == -9.0
        assert msg["alerts"] == ["cold_chain_breach"]
        assert accumulator.is_empty()

    def test_multiple_batches_for_same_key_merge_into_one_summary(self):
        accumulator = depot_app.ManifestWindow()
        accumulator.absorb(make_batch("humidity", "container-9", [80.0, 90.0], unit="%"))
        accumulator.absorb(make_batch("humidity", "container-9", [100.0]))

        messages = accumulator.drain_messages("s", "e")
        assert len(messages) == 1
        msg = messages[0]
        assert msg["count"] == 3
        assert msg["unit"] == "%"
        assert msg["max"] == 100.0
        assert msg["alerts"] == ["humidity_breach"]


class TestReadOnlyEndpoints:
    @pytest.mark.parametrize(
        "path, expected_status",
        [
            ("/health", 200),
            ("/thresholds", 200),
            ("/not-a-real-route", 404),
        ],
    )
    def test_get_returns_expected_status(self, client, path, expected_status):
        assert client.get(path).status_code == expected_status

    def test_health_reports_ok(self, client):
        assert client.get("/health").json() == {"status": "ok"}

    def test_thresholds_exposes_cold_chain_rule(self, client):
        body = client.get("/thresholds").json()
        rule = {"field": "avg", "op": ">", "limit": -15, "key": "cold_chain_breach"}
        assert rule in body["storage_temperature"]
