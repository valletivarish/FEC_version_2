"""Fog-side ingest buffering via a bounded collections.deque(maxlen=N) ring
buffer per (sensor_type, site_id) key -- the 4th distinct buffering shape
in the portfolio's Python projects.

01's fog/app.py writes straight into a shared defaultdict(list) from inside
the async request handler -- unbounded, no queue at all. 05's fog/app.py
pushes onto an asyncio.Queue and folds each batch into a WindowAccumulator
of RollingStat objects from an asyncio background task (streaming fold,
also unbounded). 12's fog/ingest_pipeline.py decouples ingest from
buffering with a stdlib queue.Queue INBOX feeding a single consumer thread
that writes into a plain (unbounded) dict of lists.

This project's buffer itself is the bounded structure: MAX_READINGS_PER_KEY
caps each (sensor_type, site_id) deque, so a key that is never flushed (fog
down, or a sensor dispatching far faster than WINDOW_SECONDS) cannot grow
memory without limit -- the oldest unflushed readings for that key are
silently dropped in favour of the newest ones once the bound is hit, rather
than the process eventually running out of memory.
"""

import threading
from collections import defaultdict, deque

MAX_READINGS_PER_KEY = 500

_buffers = defaultdict(lambda: deque(maxlen=MAX_READINGS_PER_KEY))
_units = {}
_lock = threading.Lock()


def add_readings(sensor_type, site_id, unit, readings):
    key = (sensor_type, site_id)
    with _lock:
        _buffers[key].extend(readings)
        if unit:
            _units[sensor_type] = unit


def snapshot_and_clear():
    """Atomically copy out every non-empty (sensor_type, site_id) group as a
    plain list (so aggregation never has to know about deques) and clear
    every ring buffer for the next window."""
    with _lock:
        snapshot = {key: list(buf) for key, buf in _buffers.items() if buf}
        for buf in _buffers.values():
            buf.clear()
        units = dict(_units)
    return snapshot, units
