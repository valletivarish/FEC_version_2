"""Buffering via a real producer/consumer pipeline built on the stdlib
queue.Queue, the 3rd distinct buffering shape in the portfolio's Python
projects.

01 writes straight into a shared defaultdict(list) from inside the async
request handler (no queue at all; buffer-then-reduce, single event loop).
05 pushes onto an asyncio.Queue and folds each batch into a WindowAccumulator
of RollingStat objects from an asyncio background task (streaming fold,
single-threaded cooperative concurrency).

This project's fog node has no event loop -- http.server.ThreadingHTTPServer
runs one real OS thread per request -- so asyncio.Queue is the wrong tool
(it is not thread-safe across threads without call_soon_threadsafe
gymnastics). queue.Queue *is* thread-safe by design, so /ingest handler
threads simply call enqueue_batch() and return; a single dedicated consumer
thread owns _buffers exclusively and is the only thing that ever writes to
it, decoupling request handling from buffering the same way 05 decouples
ingest from accumulation, but with real threads instead of coroutines.
"""

import queue
import threading

INBOX = queue.Queue()

_buffers = {}
_units = {}
_lock = threading.Lock()


def enqueue_batch(sensor_type, site_id, unit, readings):
    """Called from an HTTP worker thread inside POST /ingest. Never touches
    _buffers directly -- it only ever puts onto the thread-safe queue, so
    the request thread is never blocked on buffer bookkeeping."""
    INBOX.put((sensor_type, site_id, unit, readings))


def _absorb(sensor_type, site_id, unit, readings):
    key = (sensor_type, site_id)
    with _lock:
        _buffers.setdefault(key, []).extend(readings)
        if unit:
            _units[sensor_type] = unit


def consume_forever(inbox=INBOX):
    """Body of the single dedicated consumer thread: blocks on inbox.get()
    and folds each arriving batch into the shared buffer dict, one at a
    time, for as long as the process runs."""
    while True:
        sensor_type, site_id, unit, readings = inbox.get()
        try:
            _absorb(sensor_type, site_id, unit, readings)
        finally:
            inbox.task_done()


def start_consumer_thread():
    thread = threading.Thread(target=consume_forever, name="fog-buffer-consumer", daemon=True)
    thread.start()
    return thread


def snapshot_and_clear():
    """Atomically take the whole buffer state and reset it for the next
    window. Only non-empty (sensor_type, site_id) groups are returned."""
    with _lock:
        snapshot = {key: values for key, values in _buffers.items() if values}
        _buffers.clear()
        units = dict(_units)
    return snapshot, units
