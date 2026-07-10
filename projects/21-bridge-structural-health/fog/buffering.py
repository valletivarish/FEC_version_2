"""Ingest buffering as a single flat, unstructured list of raw tuples --
the 7th distinct buffering shape in the portfolio's Python projects.

01's fog/app.py writes straight into a shared defaultdict(list) keyed by
(sensor_type, site_id), guarded by one asyncio.Lock (grouped at ingest
time). 05's fog/app.py pushes onto an asyncio.Queue and folds each batch
into a WindowAccumulator of per-key RollingStat objects (streaming fold,
grouped at ingest time). 12's fog/ingest_pipeline.py decouples ingest from
buffering with a stdlib queue.Queue INBOX feeding one dedicated consumer
thread that writes into a dict-of-lists (still grouped as it lands, just on
a different thread). 13's fog/app.py keeps a plain dict guarded directly by
a threading.Lock, grouped at ingest time inline in the route handler. 14's
fog/buffering.py bounds each key's history with a
collections.deque(maxlen=N) ring buffer, still keyed by (sensor_type,
site_id) at write time. 17's fog/buffering.py double-buffers two dicts
(active/flushing) and swaps which one is "active" at flush time, but every
ingest write still lands in a dict keyed by (sensor_type, site_id).

Every one of those six is a mapping the readings are sorted into as they
arrive. Here there is no mapping at all until flush time: RAW is a plain
Python list, and every reading appended to it is a flat
(sensor_type, site_id, value, ts) tuple -- no key, no bucket, no grouping
of any kind at ingest time. group_by_key() below is a pure function called
exactly once per window, by the flush path in fog/app.py, and it is the
only place the readings are ever organised by (sensor_type, site_id).
"""

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
