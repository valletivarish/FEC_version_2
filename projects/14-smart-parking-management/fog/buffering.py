"""Bounded per-(sensor_type, site_id) ring buffer that drops the oldest readings once full."""

import threading
from collections import defaultdict, deque

BAY_BUFFER_LIMIT = 500

_bay_buffers = defaultdict(lambda: deque(maxlen=BAY_BUFFER_LIMIT))
_unit_by_metric = {}
_buffer_lock = threading.Lock()


def add_readings(sensor_type, site_id, unit, readings):
    key = (sensor_type, site_id)
    with _buffer_lock:
        _bay_buffers[key].extend(readings)
        if unit:
            _unit_by_metric[sensor_type] = unit


def snapshot_and_clear():
    """Copy every non-empty bay group out as a plain list and reset the buffers for the next window."""
    with _buffer_lock:
        snapshot = {key: list(buf) for key, buf in _bay_buffers.items() if buf}
        for buf in _bay_buffers.values():
            buf.clear()
        units = dict(_unit_by_metric)
    return snapshot, units
