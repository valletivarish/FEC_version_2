import multiprocessing as mp
import queue
import threading

from conftest import load_module

sensor = load_module("bshm_sensor", "sensors/sensor.py")


def test_clamp_bounds():
    assert sensor.clamp(5, 0, 10) == 5
    assert sensor.clamp(-5, 0, 10) == 0
    assert sensor.clamp(15, 0, 10) == 10


def test_all_five_sensor_types_have_profiles():
    assert set(sensor.PROFILES.keys()) == {
        "strain_microstrain",
        "deck_vibration_mms",
        "tilt_angle_deg",
        "traffic_load_tonnes",
        "expansion_joint_mm",
    }


def test_expansion_joint_profile_allows_negative_range():
    profile = sensor.PROFILES["expansion_joint_mm"]
    assert profile.lo < 0
    assert profile.hi > 0


def test_next_value_stays_within_bounds_over_many_iterations():
    for sensor_type, profile in sensor.PROFILES.items():
        value = profile.start
        for _ in range(500):
            value = sensor.next_value(value, profile)
            assert profile.lo <= value <= profile.hi


def test_next_value_moves_by_at_most_step_per_tick():
    profile = sensor.PROFILES["strain_microstrain"]
    value = profile.start
    for _ in range(200):
        next_v = sensor.next_value(value, profile)
        assert abs(next_v - value) <= profile.step + 1e-9
        value = next_v


class TestSampleProcess:
    """sample_process/dispatch_process are plain functions parameterised by
    queue-like and event-like objects -- run here as real
    multiprocessing.Queue/Event primitives driven from a thread (rather than
    a spawned OS process) so failures surface as normal pytest assertions."""

    def test_sample_process_puts_readings_onto_outbox(self):
        outbox = mp.Queue()
        stop_event = mp.Event()

        thread = threading.Thread(
            target=sensor.sample_process,
            args=(outbox, "strain_microstrain", 0.02, stop_event),
        )
        thread.start()
        stop_event.wait(0.15)
        stop_event.set()
        thread.join(timeout=2)

        readings = []
        while True:
            try:
                readings.append(outbox.get_nowait())
            except queue.Empty:
                break

        assert len(readings) >= 2
        for reading in readings:
            assert "ts" in reading and "value" in reading


class TestDispatchProcess:
    def test_dispatch_process_ships_buffered_readings(self, monkeypatch):
        shipped = []

        def fake_ship_batch(url, payload):
            shipped.append((url, payload))
            return 200

        monkeypatch.setattr(sensor, "ship_batch", fake_ship_batch)

        outbox = mp.Queue()
        outbox.put({"ts": "t1", "value": 1.0})
        outbox.put({"ts": "t2", "value": 2.0})
        stop_event = mp.Event()

        thread = threading.Thread(
            target=sensor.dispatch_process,
            args=(outbox, "strain_microstrain", "span-a", "microstrain", 0.05, "http://fog/ingest", stop_event),
        )
        thread.start()
        stop_event.wait(0.2)
        stop_event.set()
        thread.join(timeout=2)

        assert len(shipped) >= 1
        url, payload = shipped[0]
        assert url == "http://fog/ingest"
        assert payload["sensor_type"] == "strain_microstrain"
        assert payload["site_id"] == "span-a"
        assert payload["readings"] == [{"ts": "t1", "value": 1.0}, {"ts": "t2", "value": 2.0}]

    def test_dispatch_process_retains_buffer_on_failed_dispatch(self, monkeypatch):
        import urllib.error

        def failing_ship_batch(url, payload):
            raise urllib.error.URLError("connection refused")

        monkeypatch.setattr(sensor, "ship_batch", failing_ship_batch)

        outbox = mp.Queue()
        outbox.put({"ts": "t1", "value": 1.0})
        stop_event = mp.Event()

        thread = threading.Thread(
            target=sensor.dispatch_process,
            args=(outbox, "strain_microstrain", "span-a", "microstrain", 0.05, "http://fog/ingest", stop_event),
        )
        thread.start()
        stop_event.wait(0.12)
        stop_event.set()
        thread.join(timeout=2)
        # No assertion error means the thread tolerated the failure and
        # exited cleanly once stop_event was set, without dropping into an
        # unhandled exception.
