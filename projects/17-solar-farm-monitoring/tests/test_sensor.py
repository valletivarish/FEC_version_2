import os
import urllib.error

import pytest

from conftest import load_module

sensor = load_module("sensors_sensor", "sensors/sensor.py")


class TestPanelDriftWalk:
    def test_step_stays_within_bounds_across_many_steps(self):
        profile = sensor.PanelMetricProfile(unit="W/m2", lo=0, hi=1200, start=600, step=80.0)
        walk = sensor.PanelDriftWalk(profile)
        for _ in range(500):
            value = walk.step()
            assert profile.lo <= value <= profile.hi

    def test_step_rounds_to_2_decimals(self):
        profile = sensor.PanelMetricProfile(unit="C", lo=10, hi=80, start=35, step=3.0)
        walk = sensor.PanelDriftWalk(profile)
        value = walk.step()
        assert value == round(value, 2)


@pytest.fixture
def agent(monkeypatch):
    monkeypatch.setenv("SENSOR_TYPE", "inverter_output_kw")
    monkeypatch.setenv("SITE_ID", "array-1")
    monkeypatch.setenv("SAMPLE_INTERVAL", "2")
    monkeypatch.setenv("DISPATCH_INTERVAL", "9")
    return sensor.PanelSensorAgent()


class TestPanelSensorAgent:
    def test_reads_sensor_type_and_site_from_env(self, agent):
        assert agent.sensor_type == "inverter_output_kw"
        assert agent.site_id == "array-1"
        assert agent.sample_interval == 2.0
        assert agent.dispatch_interval == 9.0

    def test_sample_and_dispatch_intervals_are_independently_configurable(self, monkeypatch):
        monkeypatch.setenv("SENSOR_TYPE", "dc_voltage_v")
        monkeypatch.setenv("SAMPLE_INTERVAL", "1.5")
        monkeypatch.setenv("DISPATCH_INTERVAL", "17")
        a = sensor.PanelSensorAgent()
        assert a.sample_interval == 1.5
        assert a.dispatch_interval == 17.0
        assert a.sample_interval != a.dispatch_interval

    def test_do_sample_appends_one_reading_to_the_buffer(self, agent):
        agent._do_sample()
        agent._do_sample()
        assert len(agent.buffer) == 2
        assert all("ts" in r and "value" in r for r in agent.buffer)

    def test_do_dispatch_sends_the_buffered_batch_and_clears_it(self, agent, monkeypatch):
        sent = []
        monkeypatch.setattr(sensor, "push_to_gateway", lambda url, payload: sent.append(payload) or 202)
        agent._do_sample()
        agent._do_sample()
        result = agent._do_dispatch()
        assert len(sent) == 1
        assert sent[0]["sensor_type"] == "inverter_output_kw"
        assert sent[0]["site_id"] == "array-1"
        assert len(sent[0]["readings"]) == 2
        assert result is not None
        assert agent.buffer == []

    def test_do_dispatch_with_empty_buffer_sends_nothing(self, agent, monkeypatch):
        sent = []
        monkeypatch.setattr(sensor, "push_to_gateway", lambda url, payload: sent.append(payload) or 202)
        result = agent._do_dispatch()
        assert sent == []
        assert result is None

    def test_do_dispatch_requeues_the_batch_on_network_failure(self, agent, monkeypatch):
        def failing_ship(url, payload):
            raise urllib.error.URLError("connection refused")
        monkeypatch.setattr(sensor, "push_to_gateway", failing_ship)

        agent._do_sample()
        result = agent._do_dispatch()

        assert result is None
        assert len(agent.buffer) == 1

    def test_readings_sampled_during_a_failed_dispatch_are_not_lost(self, agent, monkeypatch):
        def failing_ship(url, payload):
            raise urllib.error.URLError("connection refused")
        monkeypatch.setattr(sensor, "push_to_gateway", failing_ship)

        agent._do_sample()
        agent._do_dispatch()
        agent._do_sample()

        assert len(agent.buffer) == 2
