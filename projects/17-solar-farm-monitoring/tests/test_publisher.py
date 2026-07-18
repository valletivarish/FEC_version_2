import json
import queue
import threading
import time

from conftest import load_module

publisher = load_module("fog_publisher", "fog/publisher.py")


class FakeSqsClient:
    def __init__(self):
        self.batches = []

    def send_message_batch(self, QueueUrl, Entries):
        self.batches.append((QueueUrl, Entries))
        return {"Successful": [{"Id": e["Id"]} for e in Entries], "Failed": []}


class FlakyQueueResolver:
    """get_queue_url fails the first N times then succeeds, exercising _resolve_queue_url's retry loop without a real wait."""

    def __init__(self, fail_times):
        self.fail_times = fail_times
        self.calls = 0

    def get_queue_url(self, QueueName):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise RuntimeError("queue not provisioned yet")
        return {"QueueUrl": f"http://queue/{QueueName}"}


def test_build_batch_entries_gives_each_message_a_positional_id():
    entries = publisher.build_batch_entries([{"a": 1}, {"b": 2}])
    assert entries == [
        {"Id": "0", "MessageBody": json.dumps({"a": 1})},
        {"Id": "1", "MessageBody": json.dumps({"b": 2})},
    ]


def test_drain_ready_stops_at_limit_and_at_empty():
    q = queue.SimpleQueue()
    for i in range(5):
        q.put(i)
    assert publisher.drain_ready(q, 3) == [0, 1, 2]
    assert publisher.drain_ready(q, 10) == [3, 4]
    assert publisher.drain_ready(q, 10) == []


def test_drain_one_batch_blocks_for_first_then_tops_up_without_blocking():
    q = queue.SimpleQueue()
    q.put("first")
    q.put("second")
    batch = publisher.drain_one_batch(q, max_batch=10)
    assert batch == ["first", "second"]


def test_drain_one_batch_returns_none_on_timeout_with_nothing_queued():
    q = queue.SimpleQueue()
    assert publisher.drain_one_batch(q, block_timeout=0.05) is None


def test_flush_batch_calls_send_message_batch_once_for_the_whole_batch():
    client = FakeSqsClient()
    messages = [{"sensor_type": "inverter_output_kw", "avg": 1}, {"sensor_type": "panel_temp_c", "avg": 2}]
    publisher.flush_batch(client, "http://queue/sfm-array-agg", messages)
    assert len(client.batches) == 1
    queue_url, entries = client.batches[0]
    assert queue_url == "http://queue/sfm-array-agg"
    assert len(entries) == 2


def test_resolve_queue_url_retries_until_it_succeeds():
    resolver = FlakyQueueResolver(fail_times=2)
    url = publisher._resolve_queue_url(resolver, "sfm-array-agg", attempts=5, delay=0.01)
    assert url == "http://queue/sfm-array-agg"
    assert resolver.calls == 3


def test_run_flusher_batches_multiple_ready_messages_into_one_send_call():
    q = queue.SimpleQueue()
    client = FakeSqsClient()
    stop_event = threading.Event()

    for i in range(4):
        q.put({"sensor_type": "irradiance_wm2", "avg": i})

    thread = threading.Thread(
        target=publisher.run_flusher,
        args=(client, "http://queue/sfm-array-agg"),
        kwargs={"outbox": q, "stop_event": stop_event, "block_timeout": 0.05},
        daemon=True,
    )
    thread.start()
    deadline = time.monotonic() + 5
    while not client.batches and time.monotonic() < deadline:
        time.sleep(0.02)
    stop_event.set()
    thread.join(timeout=2)

    assert len(client.batches) >= 1
    _, entries = client.batches[0]
    assert len(entries) == 4
