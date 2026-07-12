import asyncio
from concurrent.futures import Future

import pytest
from conftest import load_module

sensor = load_module("mvs_sensor", "sensors/sensor.py")


class TestRandomWalk:
    def test_stays_within_bounds_over_many_steps(self):
        profile = sensor.ReadingProfile(unit="C", lo=20, hi=90, start=45, step=4.0)
        walk = sensor.RandomWalk(profile)
        for _ in range(500):
            value = walk.step()
            assert profile.lo <= value <= profile.hi

    def test_starts_at_profile_start(self):
        profile = sensor.PROFILES["engine_room_temp_c"]
        walk = sensor.RandomWalk(profile)
        assert walk.value == profile.start


class TestProfiles:
    def test_all_five_sensor_types_present_with_exact_brief_values(self):
        assert sensor.PROFILES["engine_room_temp_c"] == sensor.ReadingProfile("C", 20, 90, 45, 4.0)
        assert sensor.PROFILES["fuel_consumption_lph"] == sensor.ReadingProfile("L/h", 0, 500, 150, 30.0)
        assert sensor.PROFILES["ballast_water_level_pct"] == sensor.ReadingProfile("%", 0, 100, 50, 6.0)
        assert sensor.PROFILES["hull_vibration_mm"] == sensor.ReadingProfile("mm/s", 0, 20, 2, 1.5)
        assert sensor.PROFILES["passenger_count"] == sensor.ReadingProfile("people", 0, 3000, 800, 150.0)


class FakeLoop:
    """Records scheduled call_later invocations instead of a real event
    loop's timer wheel, and runs call_soon_threadsafe callbacks inline
    (single-threaded test) so _on_dispatch_done can be asserted without a
    running IOLoop."""

    def __init__(self):
        self.scheduled = []

    def call_later(self, delay, fn):
        self.scheduled.append((delay, fn))

    def call_soon_threadsafe(self, fn, *args):
        fn(*args)


@pytest.fixture
def agent(monkeypatch):
    monkeypatch.setenv("SENSOR_TYPE", "hull_vibration_mm")
    monkeypatch.setenv("SITE_ID", "vessel-a")
    monkeypatch.setenv("SAMPLE_INTERVAL", "1")
    monkeypatch.setenv("DISPATCH_INTERVAL", "5")
    return sensor.VesselSensorAgent(loop=FakeLoop())


class TestVesselSensorAgent:
    def test_do_sample_appends_one_reading(self, agent):
        agent._do_sample()
        assert len(agent.buffer) == 1
        assert "ts" in agent.buffer[0] and "value" in agent.buffer[0]

    def test_swap_buffer_detaches_and_resets(self, agent):
        agent._do_sample()
        agent._do_sample()
        batch = agent._swap_buffer()
        assert len(batch) == 2
        assert agent.buffer == []

    def test_merge_failed_batch_puts_batch_in_front(self, agent):
        agent.buffer = [{"ts": "t2", "value": 2.0}]
        agent._merge_failed_batch([{"ts": "t1", "value": 1.0}])
        assert agent.buffer == [{"ts": "t1", "value": 1.0}, {"ts": "t2", "value": 2.0}]

    def test_on_dispatch_done_success_does_not_touch_buffer(self, agent):
        agent.buffer = []
        future = Future()
        future.set_result(200)
        agent._on_dispatch_done([{"ts": "t1", "value": 1.0}], future)
        assert agent.buffer == []

    def test_on_dispatch_done_failure_requeues_batch(self, agent):
        agent.buffer = []
        future = Future()
        future.set_exception(RuntimeError("network down"))
        batch = [{"ts": "t1", "value": 1.0}]
        agent._on_dispatch_done(batch, future)
        assert agent.buffer == batch

    def test_do_dispatch_is_noop_on_empty_buffer(self, agent, monkeypatch):
        called = []
        monkeypatch.setattr(agent.executor, "submit", lambda *a, **k: called.append(a))
        agent._do_dispatch()
        assert called == []

    def test_start_arms_both_sample_and_dispatch_ticks(self, agent):
        agent.start()
        delays = sorted(delay for delay, _fn in agent.loop.scheduled)
        assert delays == [1.0, 5.0]

    def test_sample_tick_rearms_itself(self, agent):
        agent._sample_tick()
        assert len(agent.buffer) == 1
        assert agent.loop.scheduled == [(1.0, agent._sample_tick)]


class TestRealEventLoopScheduling:
    """A real event loop, run for a short bounded window, proving the
    call_later self-rearming chain actually fires repeatedly -- the same
    kind of genuine concurrency check 14/17 apply to their asyncio.gather
    and threading.Event loops respectively."""

    def test_sample_tick_fires_multiple_times_on_a_real_loop(self, monkeypatch):
        monkeypatch.setenv("SENSOR_TYPE", "engine_room_temp_c")
        monkeypatch.setenv("SITE_ID", "vessel-a")
        monkeypatch.setenv("SAMPLE_INTERVAL", "0.02")
        monkeypatch.setenv("DISPATCH_INTERVAL", "10")

        loop = asyncio.new_event_loop()
        try:
            agent_obj = sensor.VesselSensorAgent(loop=loop)
            loop.call_later(agent_obj.sample_interval, agent_obj._sample_tick)
            loop.call_later(0.12, loop.stop)
            loop.run_forever()
            assert len(agent_obj.buffer) >= 3
        finally:
            loop.close()
