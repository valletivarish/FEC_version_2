"""Bounded collections.deque(maxlen=MAX_READINGS_PER_KEY) ring buffer per (sensor_type, site_id) key, silently dropping oldest readings once full -- the 4th distinct buffering shape in this portfolio's Python projects."""

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
