import queue
import threading
import time

import pytest

from conftest import load_module

ingest_pipeline = load_module("fog_ingest_pipeline", "fog/ingest_pipeline.py")


@pytest.fixture(autouse=True)
def fresh_state():
    """Each test gets its own inbox/consumer thread and clean buffers, so no test sees another's leftover state."""
    ingest_pipeline.TELEMETRY_INBOX = queue.Queue()
    ingest_pipeline._window_buffers.clear()
    ingest_pipeline._unit_by_type.clear()
    yield


def start_consumer_on(inbox):
    thread = threading.Thread(target=ingest_pipeline.consume_telemetry_forever, args=(inbox,), daemon=True)
    thread.start()
    return thread


class TestEnqueueBatch:
    def test_enqueue_batch_puts_a_tuple_onto_the_module_inbox(self):
        ingest_pipeline.queue_reading_batch("energy_consumption_kw", "floor-1", "kW", [{"ts": "t0", "value": 25.0}])
        assert ingest_pipeline.TELEMETRY_INBOX.qsize() == 1
        item = ingest_pipeline.TELEMETRY_INBOX.get_nowait()
        assert item == ("energy_consumption_kw", "floor-1", "kW", [{"ts": "t0", "value": 25.0}])


class TestConsumerThread:
    def test_consumer_folds_a_single_batch_into_the_buffer(self):
        inbox = ingest_pipeline.TELEMETRY_INBOX
        inbox.put(("co2_ppm", "floor-1", "ppm", [{"ts": "t0", "value": 600.0}]))
        start_consumer_on(inbox)
        inbox.join()

        snapshot, units = ingest_pipeline.drain_window_buffers()
        assert snapshot[("co2_ppm", "floor-1")] == [{"ts": "t0", "value": 600.0}]
        assert units["co2_ppm"] == "ppm"

    def test_multiple_batches_for_the_same_key_accumulate(self):
        inbox = ingest_pipeline.TELEMETRY_INBOX
        inbox.put(("hvac_temp_c", "floor-2", "C", [{"ts": "t0", "value": 21.0}]))
        inbox.put(("hvac_temp_c", "floor-2", "C", [{"ts": "t1", "value": 22.0}]))
        start_consumer_on(inbox)
        inbox.join()

        snapshot, _ = ingest_pipeline.drain_window_buffers()
        assert len(snapshot[("hvac_temp_c", "floor-2")]) == 2

    def test_different_keys_stay_in_separate_buffer_entries(self):
        inbox = ingest_pipeline.TELEMETRY_INBOX
        inbox.put(("water_usage_lpm", "floor-1", "L/min", [{"ts": "t0", "value": 5.0}]))
        inbox.put(("water_usage_lpm", "floor-2", "L/min", [{"ts": "t0", "value": 9.0}]))
        start_consumer_on(inbox)
        inbox.join()

        snapshot, _ = ingest_pipeline.drain_window_buffers()
        assert set(snapshot) == {("water_usage_lpm", "floor-1"), ("water_usage_lpm", "floor-2")}


class TestSnapshotAndClear:
    def test_snapshot_omits_keys_with_no_readings(self):
        ingest_pipeline._window_buffers[("occupancy_count", "floor-1")] = []
        ingest_pipeline._window_buffers[("occupancy_count", "floor-2")] = [{"ts": "t0", "value": 10.0}]

        snapshot, _ = ingest_pipeline.drain_window_buffers()

        assert ("occupancy_count", "floor-1") not in snapshot
        assert ("occupancy_count", "floor-2") in snapshot

    def test_snapshot_clears_state_so_the_next_window_starts_empty(self):
        ingest_pipeline._window_buffers[("energy_consumption_kw", "floor-1")] = [{"ts": "t0", "value": 30.0}]
        ingest_pipeline.drain_window_buffers()
        second_snapshot, _ = ingest_pipeline.drain_window_buffers()
        assert second_snapshot == {}
