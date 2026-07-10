import threading

import pytest

from conftest import load_module

sensor = load_module("sensor", "sensors/sensor.py")

EXPECTED_SENSOR_TYPES = {
    "charging_current_a", "battery_soc_pct", "station_temp_c", "grid_load_kw", "session_duration_min",
}


class TestProfileCatalog:
    def test_registers_exactly_the_five_expected_sensor_types(self):
        assert set(sensor.PROFILES) == EXPECTED_SENSOR_TYPES

    @pytest.mark.parametrize("sensor_type", list(EXPECTED_SENSOR_TYPES))
    def test_each_entry_is_a_reading_profile_instance(self, sensor_type):
        assert isinstance(sensor.PROFILES[sensor_type], sensor.ReadingProfile)


class TestRandomWalkBounds:
    @pytest.mark.parametrize("sensor_type", list(EXPECTED_SENSOR_TYPES))
    def test_step_stays_within_lo_hi_across_many_iterations(self, sensor_type):
        profile = sensor.PROFILES[sensor_type]
        walk = sensor.RandomWalk(profile)
        assert all(profile.lo <= walk.step() <= profile.hi for _ in range(500))

    def test_initial_value_matches_profile_start(self):
        profile = sensor.PROFILES["station_temp_c"]
        assert sensor.RandomWalk(profile).value == profile.start

    def test_single_step_never_exceeds_configured_step_size(self):
        profile = sensor.ReadingProfile(unit="x", lo=0, hi=100, start=50, step=2.0)
        walk = sensor.RandomWalk(profile)
        assert abs(walk.step() - 50) <= profile.step

    def test_values_are_rounded_to_two_decimal_places(self):
        profile = sensor.PROFILES["charging_current_a"]
        walk = sensor.RandomWalk(profile)
        value = walk.step()
        assert round(value, 2) == value


def make_agent(monkeypatch, sensor_type="charging_current_a", site_id="hub-1"):
    monkeypatch.setenv("SENSOR_TYPE", sensor_type)
    monkeypatch.setenv("SITE_ID", site_id)
    monkeypatch.setenv("SAMPLE_INTERVAL", "0.01")
    monkeypatch.setenv("DISPATCH_INTERVAL", "0.02")
    return sensor.HubSensorAgent()


class TestDoSample:
    def test_do_sample_appends_one_reading_to_the_buffer(self, monkeypatch):
        agent = make_agent(monkeypatch)
        agent._do_sample()
        assert len(agent.buffer) == 1
        assert "ts" in agent.buffer[0] and "value" in agent.buffer[0]

    def test_do_sample_value_stays_within_profile_bounds(self, monkeypatch):
        agent = make_agent(monkeypatch, sensor_type="station_temp_c")
        value = agent._do_sample()
        profile = sensor.PROFILES["station_temp_c"]
        assert profile.lo <= value <= profile.hi


class TestDoDispatch:
    def test_do_dispatch_ships_the_buffered_batch_and_empties_it(self, monkeypatch):
        agent = make_agent(monkeypatch, sensor_type="grid_load_kw", site_id="hub-2")
        agent.buffer = [{"ts": "t0", "value": 45.0}, {"ts": "t1", "value": 47.0}]

        shipped = {}

        def fake_ship(url, payload):
            shipped["url"] = url
            shipped["payload"] = payload
            return 202

        monkeypatch.setattr(sensor, "ship_batch", fake_ship)
        result = agent._do_dispatch()

        assert result is not None
        assert shipped["payload"]["sensor_type"] == "grid_load_kw"
        assert shipped["payload"]["site_id"] == "hub-2"
        assert shipped["payload"]["unit"] == "kW"
        assert len(shipped["payload"]["readings"]) == 2
        assert agent.buffer == []

    def test_do_dispatch_with_empty_buffer_does_nothing(self, monkeypatch):
        agent = make_agent(monkeypatch)
        called = threading.Event()
        monkeypatch.setattr(sensor, "ship_batch", lambda url, payload: called.set())
        result = agent._do_dispatch()
        assert result is None
        assert not called.is_set()

    def test_do_dispatch_requeues_the_batch_on_network_failure(self, monkeypatch):
        import urllib.error

        agent = make_agent(monkeypatch)
        agent.buffer = [{"ts": "t0", "value": 10.0}]

        def failing_ship(url, payload):
            raise urllib.error.URLError("connection refused")

        monkeypatch.setattr(sensor, "ship_batch", failing_ship)
        result = agent._do_dispatch()

        assert result is None
        assert agent.buffer == [{"ts": "t0", "value": 10.0}]


class TestRecurringJobs:
    def test_sample_job_sleeps_then_samples(self, monkeypatch):
        agent = make_agent(monkeypatch)
        agent.sample_interval = 0
        agent._sample_job()
        assert len(agent.buffer) == 1

    def test_dispatch_job_sleeps_then_dispatches(self, monkeypatch):
        agent = make_agent(monkeypatch)
        agent.dispatch_interval = 0
        agent.buffer = [{"ts": "t0", "value": 1.0}]
        monkeypatch.setattr(sensor, "ship_batch", lambda url, payload: 202)
        agent._dispatch_job()
        assert agent.buffer == []
