"""Thread-safe queue feeding one dedicated consumer thread that owns the window buffers exclusively."""

import queue
import threading

TELEMETRY_INBOX = queue.Queue()

_window_buffers = {}
_unit_by_type = {}
_buffer_lock = threading.Lock()


def queue_reading_batch(sensor_type, site_id, unit, readings):
    """Called from an HTTP worker inside POST /ingest; only ever puts onto the thread-safe inbox so the request thread never blocks on buffer bookkeeping."""
    TELEMETRY_INBOX.put((sensor_type, site_id, unit, readings))


def _fold_batch(sensor_type, site_id, unit, readings):
    buffer_key = (sensor_type, site_id)
    with _buffer_lock:
        _window_buffers.setdefault(buffer_key, []).extend(readings)
        if unit:
            _unit_by_type[sensor_type] = unit


def consume_telemetry_forever(inbox=TELEMETRY_INBOX):
    """Body of the single consumer thread: block on inbox.get() and fold each arriving batch into the shared buffers, one at a time, for the process lifetime."""
    while True:
        sensor_type, site_id, unit, readings = inbox.get()
        try:
            _fold_batch(sensor_type, site_id, unit, readings)
        finally:
            inbox.task_done()


def start_telemetry_consumer():
    thread = threading.Thread(target=consume_telemetry_forever, name="fog-buffer-consumer", daemon=True)
    thread.start()
    return thread


def drain_window_buffers():
    """Atomically take the whole buffer state and reset it for the next window; only non-empty (sensor_type, site_id) groups are returned."""
    with _buffer_lock:
        window_snapshot = {key: values for key, values in _window_buffers.items() if values}
        _window_buffers.clear()
        units = dict(_unit_by_type)
    return window_snapshot, units
