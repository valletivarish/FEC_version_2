"""Thread-safe stdlib queue.Queue feeding a single dedicated consumer thread that owns _buffers exclusively -- the 3rd distinct buffering shape in this portfolio's Python projects."""

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
