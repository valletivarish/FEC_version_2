import pytest

from conftest import load_module

buffering = load_module("fog_buffering", "fog/buffering.py")


@pytest.fixture(autouse=True)
def fresh_state():
    buffering._buffers.clear()
    buffering._units.clear()
    yield


class TestAddReadings:
    def test_add_readings_appends_into_the_keyed_deque(self):
        buffering.add_readings("occupied_spaces", "lot-a", "count", [{"ts": "t0", "value": 80.0}])
        assert list(buffering._buffers[("occupied_spaces", "lot-a")]) == [{"ts": "t0", "value": 80.0}]

    def test_different_keys_stay_in_separate_buffer_entries(self):
        buffering.add_readings("occupied_spaces", "lot-a", "count", [{"ts": "t0", "value": 80.0}])
        buffering.add_readings("occupied_spaces", "lot-b", "count", [{"ts": "t0", "value": 95.0}])
        assert set(buffering._buffers) == {("occupied_spaces", "lot-a"), ("occupied_spaces", "lot-b")}

    def test_unit_is_remembered_per_sensor_type(self):
        buffering.add_readings("entry_rate_per_min", "lot-a", "vehicles/min", [{"ts": "t0", "value": 5.0}])
        assert buffering._units["entry_rate_per_min"] == "vehicles/min"

    def test_empty_unit_does_not_overwrite_a_previously_recorded_unit(self):
        buffering.add_readings("entry_rate_per_min", "lot-a", "vehicles/min", [{"ts": "t0", "value": 5.0}])
        buffering.add_readings("entry_rate_per_min", "lot-a", "", [{"ts": "t1", "value": 6.0}])
        assert buffering._units["entry_rate_per_min"] == "vehicles/min"


class TestRingBufferBound:
    def test_deque_is_bounded_by_max_readings_per_key(self):
        key_deque = buffering._buffers[("gate_fault_events", "lot-a")]
        assert key_deque.maxlen == buffering.MAX_READINGS_PER_KEY

    def test_overflowing_the_bound_drops_the_oldest_readings_first(self):
        bound = buffering.MAX_READINGS_PER_KEY
        readings = [{"ts": f"t{i}", "value": float(i)} for i in range(bound + 10)]
        buffering.add_readings("gate_fault_events", "lot-a", "count", readings)
        stored = list(buffering._buffers[("gate_fault_events", "lot-a")])
        assert len(stored) == bound
        # the oldest 10 readings (value 0.0 .. 9.0) were evicted; the buffer
        # keeps only the most recent `bound` readings.
        assert stored[0]["value"] == 10.0
        assert stored[-1]["value"] == float(bound + 9)


class TestSnapshotAndClear:
    def test_snapshot_omits_keys_with_no_readings(self):
        buffering._buffers[("avg_dwell_time_min", "lot-a")]  # touch, stays empty
        buffering.add_readings("avg_dwell_time_min", "lot-b", "min", [{"ts": "t0", "value": 60.0}])

        snapshot, _ = buffering.snapshot_and_clear()

        assert ("avg_dwell_time_min", "lot-a") not in snapshot
        assert ("avg_dwell_time_min", "lot-b") in snapshot

    def test_snapshot_clears_state_so_the_next_window_starts_empty(self):
        buffering.add_readings("occupied_spaces", "lot-a", "count", [{"ts": "t0", "value": 80.0}])
        buffering.snapshot_and_clear()
        second_snapshot, _ = buffering.snapshot_and_clear()
        assert second_snapshot == {}

    def test_snapshot_returns_plain_lists_not_deques(self):
        buffering.add_readings("occupied_spaces", "lot-a", "count", [{"ts": "t0", "value": 80.0}])
        snapshot, _ = buffering.snapshot_and_clear()
        assert isinstance(snapshot[("occupied_spaces", "lot-a")], list)
