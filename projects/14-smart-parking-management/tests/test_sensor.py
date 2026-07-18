"""sensor.py is asyncio-based, so its ticks are exercised via asyncio.run() on the coroutine methods directly."""

import asyncio
import urllib.error

import pytest

from conftest import load_module

sensor = load_module("sensor", "sensors/sensor.py")

EXPECTED_SENSOR_TYPES = {
    "occupied_spaces", "entry_rate_per_min", "exit_rate_per_min", "avg_dwell_time_min", "gate_fault_events",
}


class TestProfileCatalog:
    def test_registers_exactly_the_five_expected_sensor_types(self):
        assert set(sensor.METRIC_PROFILES) == EXPECTED_SENSOR_TYPES

    @pytest.mark.parametrize("sensor_type", list(EXPECTED_SENSOR_TYPES))
    def test_each_entry_is_a_reading_profile_instance(self, sensor_type):
        assert isinstance(sensor.METRIC_PROFILES[sensor_type], sensor.MetricProfile)

    def test_occupied_spaces_matches_the_brief_exactly(self):
        profile = sensor.METRIC_PROFILES["occupied_spaces"]
        assert (profile.unit, profile.lo, profile.hi, profile.start, profile.step) == ("count", 0, 300, 80, 20.0)

    def test_gate_fault_events_matches_the_brief_exactly(self):
        profile = sensor.METRIC_PROFILES["gate_fault_events"]
        assert (profile.unit, profile.lo, profile.hi, profile.start, profile.step) == ("count", 0, 10, 0, 1.0)


class TestMetricDriftBounds:
    @pytest.mark.parametrize("sensor_type", list(EXPECTED_SENSOR_TYPES))
    def test_step_stays_within_lo_hi_across_many_iterations(self, sensor_type):
        profile = sensor.METRIC_PROFILES[sensor_type]
        drift = sensor.MetricDrift(profile)
        assert all(profile.lo <= drift.step() <= profile.hi for _ in range(500))

    def test_initial_value_matches_profile_start(self):
        profile = sensor.METRIC_PROFILES["avg_dwell_time_min"]
        assert sensor.MetricDrift(profile).value == profile.start

    def test_single_step_never_exceeds_configured_step_size(self):
        profile = sensor.MetricProfile(unit="x", lo=0, hi=100, start=50, step=2.0)
        drift = sensor.MetricDrift(profile)
        assert abs(drift.step() - 50) <= profile.step

    def test_values_are_rounded_to_two_decimal_places(self):
        profile = sensor.METRIC_PROFILES["occupied_spaces"]
        drift = sensor.MetricDrift(profile)
        value = drift.step()
        assert round(value, 2) == value


def make_agent(monkeypatch, sensor_type="occupied_spaces", site_id="lot-a"):
    monkeypatch.setenv("SENSOR_TYPE", sensor_type)
    monkeypatch.setenv("SITE_ID", site_id)
    monkeypatch.setenv("SAMPLE_INTERVAL", "0.01")
    monkeypatch.setenv("DISPATCH_INTERVAL", "0.02")
    return sensor.ParkingSensorAgent()


class TestDoSample:
    def test_do_sample_appends_one_reading_to_the_buffer(self, monkeypatch):
        agent = make_agent(monkeypatch)
        asyncio.run(agent._do_sample())
        assert len(agent.buffer) == 1
        assert "ts" in agent.buffer[0] and "value" in agent.buffer[0]

    def test_do_sample_value_stays_within_profile_bounds(self, monkeypatch):
        agent = make_agent(monkeypatch, sensor_type="entry_rate_per_min")
        value = asyncio.run(agent._do_sample())
        profile = sensor.METRIC_PROFILES["entry_rate_per_min"]
        assert profile.lo <= value <= profile.hi


class TestDoDispatch:
    def test_do_dispatch_ships_the_buffered_batch_and_empties_it(self, monkeypatch):
        agent = make_agent(monkeypatch, sensor_type="avg_dwell_time_min", site_id="lot-b")
        agent.buffer = [{"ts": "t0", "value": 60.0}, {"ts": "t1", "value": 65.0}]

        shipped = {}

        def fake_ship(url, payload):
            shipped["url"] = url
            shipped["payload"] = payload
            return 202

        monkeypatch.setattr(sensor, "ship_batch", fake_ship)
        result = asyncio.run(agent._do_dispatch())

        assert result is not None
        assert shipped["payload"]["sensor_type"] == "avg_dwell_time_min"
        assert shipped["payload"]["site_id"] == "lot-b"
        assert shipped["payload"]["unit"] == "min"
        assert len(shipped["payload"]["readings"]) == 2
        assert agent.buffer == []

    def test_do_dispatch_with_empty_buffer_does_nothing(self, monkeypatch):
        agent = make_agent(monkeypatch)
        called = {"flag": False}

        def fake_ship(url, payload):
            called["flag"] = True

        monkeypatch.setattr(sensor, "ship_batch", fake_ship)
        result = asyncio.run(agent._do_dispatch())
        assert result is None
        assert called["flag"] is False

    def test_do_dispatch_requeues_the_batch_on_network_failure(self, monkeypatch):
        agent = make_agent(monkeypatch)
        agent.buffer = [{"ts": "t0", "value": 90.0}]

        def failing_ship(url, payload):
            raise urllib.error.URLError("connection refused")

        monkeypatch.setattr(sensor, "ship_batch", failing_ship)
        result = asyncio.run(agent._do_dispatch())

        assert result is None
        assert agent.buffer == [{"ts": "t0", "value": 90.0}]


class TestConcurrentLoops:
    def test_sample_and_dispatch_loops_run_concurrently_via_gather(self, monkeypatch):
        """Runs both loops briefly and confirms each cadence fired, proving they interleave on one event loop."""
        agent = make_agent(monkeypatch)
        dispatched = []

        def fake_ship(url, payload):
            dispatched.append(payload)

        monkeypatch.setattr(sensor, "ship_batch", fake_ship)

        async def both_loops():
            await asyncio.gather(agent.sample_loop(), agent.dispatch_loop())

        async def run_briefly():
            task = asyncio.create_task(both_loops())
            await asyncio.sleep(0.1)
            task.cancel()
            try:
                await task
            except asyncio.CancelledError:
                pass

        asyncio.run(run_briefly())

        assert len(dispatched) >= 1
        assert sum(len(p["readings"]) for p in dispatched) >= 1
