"""A dedicated flusher thread drains OUTBOX (a queue.SimpleQueue) and ships every ready message in one send_message_batch call instead of one send_message per group -- the 4th distinct publisher shape in this portfolio's Python projects."""

import json
import queue
import threading
import time

import boto3

OUTBOX = queue.SimpleQueue()

# SQS hard caps send_message_batch at 10 entries per call.
MAX_BATCH = 10


def enqueue(message, outbox=OUTBOX):
    """Called from window-flush code (fog/app.py) once a group's summary is
    ready. Never touches the network -- only the dedicated flusher thread
    (run_flusher) does that."""
    outbox.put(message)


def drain_ready(outbox, limit):
    """Pull whatever is already sitting in the queue, up to `limit` items,
    without blocking further once it's empty."""
    drained = []
    for _ in range(limit):
        try:
            drained.append(outbox.get_nowait())
        except queue.Empty:
            break
    return drained


def drain_one_batch(outbox, max_batch=MAX_BATCH, block_timeout=None):
    """Block for at least one message (or return None once block_timeout
    elapses with nothing arriving), then greedily top up to max_batch
    messages without blocking further."""
    try:
        first = outbox.get(timeout=block_timeout) if block_timeout is not None else outbox.get()
    except queue.Empty:
        return None
    batch = [first]
    batch.extend(drain_ready(outbox, max_batch - 1))
    return batch


def build_batch_entries(messages):
    """Pure transform: window-aggregate dicts -> send_message_batch Entries.
    Id only needs to be unique within one batch call, so the entry's
    position is enough."""
    return [{"Id": str(i), "MessageBody": json.dumps(message)} for i, message in enumerate(messages)]


def _resolve_queue_url(client, queue_name, attempts=30, delay=2):
    for _ in range(attempts):
        try:
            return client.get_queue_url(QueueName=queue_name)["QueueUrl"]
        except Exception:
            time.sleep(delay)
    raise RuntimeError(f"queue {queue_name} never became available")


def flush_batch(client, queue_url, messages):
    """Ship one already-drained batch of messages in a single
    send_message_batch call."""
    client.send_message_batch(QueueUrl=queue_url, Entries=build_batch_entries(messages))


def run_flusher(client, queue_url, outbox=OUTBOX, stop_event=None, block_timeout=1.0):
    """Body of the dedicated flusher thread: forever (or until stop_event is
    set) block for the next ready message, drain whatever else is already
    queued up to MAX_BATCH, and ship the whole batch in one call."""
    while stop_event is None or not stop_event.is_set():
        batch = drain_one_batch(outbox, block_timeout=block_timeout)
        if not batch:
            continue
        try:
            flush_batch(client, queue_url, batch)
        except Exception as exc:
            print(f"batch publish failed ({len(batch)} messages): {exc}", flush=True)


def _resolve_and_run(client, queue_name, outbox):
    # Queue-url resolution happens on this background thread, not on the
    # caller's thread -- start_flusher_thread must return immediately so it
    # never delays the aiohttp app's own startup/readiness.
    queue_url = _resolve_queue_url(client, queue_name)
    run_flusher(client, queue_url, outbox=outbox)


def start_flusher_thread(endpoint_url, region, queue_name, outbox=OUTBOX):
    client = boto3.client("sqs", endpoint_url=endpoint_url, region_name=region)
    thread = threading.Thread(
        target=_resolve_and_run, args=(client, queue_name, outbox),
        name="sqs-batch-flusher", daemon=True,
    )
    thread.start()
    return thread
