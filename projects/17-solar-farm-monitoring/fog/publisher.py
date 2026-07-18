"""A dedicated flusher thread drains OUTBOX and ships each ready group in one send_message_batch call rather than one send per group."""

import json
import queue
import threading
import time

import boto3

OUTBOX = queue.SimpleQueue()

# SQS hard caps send_message_batch at 10 entries per call.
MAX_BATCH = 10


def enqueue(message, outbox=OUTBOX):
    """Hand a ready window summary to the flusher thread; never touches the network itself."""
    outbox.put(message)


def drain_ready(outbox, limit):
    """Pull up to `limit` items already sitting in the queue, without blocking once it is empty."""
    drained = []
    for _ in range(limit):
        try:
            drained.append(outbox.get_nowait())
        except queue.Empty:
            break
    return drained


def drain_one_batch(outbox, max_batch=MAX_BATCH, block_timeout=None):
    """Block for at least one message (or None on timeout), then greedily top up to max_batch without blocking."""
    try:
        first = outbox.get(timeout=block_timeout) if block_timeout is not None else outbox.get()
    except queue.Empty:
        return None
    batch = [first]
    batch.extend(drain_ready(outbox, max_batch - 1))
    return batch


def build_batch_entries(messages):
    """Turn window-aggregate dicts into send_message_batch Entries, keyed by position within the batch."""
    return [{"Id": str(i), "MessageBody": json.dumps(message)} for i, message in enumerate(messages)]


def _resolve_queue_url(client, queue_name, attempts=30, delay=2):
    for _ in range(attempts):
        try:
            return client.get_queue_url(QueueName=queue_name)["QueueUrl"]
        except Exception:
            time.sleep(delay)
    raise RuntimeError(f"queue {queue_name} never became available")


def flush_batch(client, queue_url, messages):
    """Ship one already-drained batch of messages in a single send_message_batch call."""
    client.send_message_batch(QueueUrl=queue_url, Entries=build_batch_entries(messages))


def run_flusher(client, queue_url, outbox=OUTBOX, stop_event=None, block_timeout=1.0):
    """Flusher-thread body: block for the next message, drain up to MAX_BATCH more, and ship the whole batch."""
    while stop_event is None or not stop_event.is_set():
        batch = drain_one_batch(outbox, block_timeout=block_timeout)
        if not batch:
            continue
        try:
            flush_batch(client, queue_url, batch)
        except Exception as exc:
            print(f"batch publish failed ({len(batch)} messages): {exc}", flush=True)


def _resolve_and_run(client, queue_name, outbox):
    # Resolve the queue url on this background thread so start_flusher_thread can return immediately.
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
