"""Ingest buffering as a single flat, unstructured list of raw (sensor_type, site_id, value, ts) tuples with no grouping until flush time."""

import threading

_lock = threading.Lock()
RAW = []
_units = {}


def record(sensor_type, site_id, value, ts):
    """Append one raw reading tuple. This is the entire ingest-time
    contract: no lookup, no per-key list, no grouping -- just an append
    under the single lock."""
    with _lock:
        RAW.append((sensor_type, site_id, value, ts))


def set_unit(sensor_type, unit):
    # Units change rarely (one per sensor_type) so they are tracked
    # separately from the raw reading list rather than repeated on every
    # tuple.
    if not unit:
        return
    with _lock:
        _units[sensor_type] = unit


def snapshot_and_clear():
    """Swap RAW out for a fresh empty list under the lock and hand back the
    old list untouched -- grouping happens later, outside the lock, in
    group_by_key()."""
    global RAW
    with _lock:
        raw, RAW = RAW, []
        units = dict(_units)
    return raw, units


def group_by_key(raw_readings):
    """Pure function: fold a flat list of (sensor_type, site_id, value, ts)
    tuples into a dict keyed by (sensor_type, site_id) -> list of
    (value, ts) pairs, preserving arrival order within each key. Called
    once per flush window against the snapshot taken by
    snapshot_and_clear() -- never touches the live RAW list or the lock."""
    grouped = {}
    for sensor_type, site_id, value, ts in raw_readings:
        grouped.setdefault((sensor_type, site_id), []).append((value, ts))
    return grouped
