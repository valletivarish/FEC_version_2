"""Fog-side ingest buffering as a plain dict, guarded by no synchronization
primitive at all -- the 8th distinct buffering shape in the portfolio's
Python projects.

01's fog/app.py writes into a shared defaultdict(list), guarded by a single
asyncio.Lock held around both the /ingest write and the flush's read+clear.
05's fog/app.py pushes onto an asyncio.Queue and folds each batch into a
WindowAccumulator of RollingStat objects from an asyncio background task.
12's fog/ingest_pipeline.py decouples ingest from buffering with a stdlib
queue.Queue INBOX feeding one dedicated consumer thread that owns a plain
dict exclusively. 13's fog/app.py keeps a plain dict guarded directly by a
threading.Lock. 14's fog/buffering.py bounds each key's history with a
collections.deque(maxlen=500) ring buffer, guarded by a threading.Lock.
17's fog/buffering.py double-buffers two dicts (active/flushing) and swaps
which one is "active" under a threading.Lock. 21's fog/buffering.py appends
flat, ungrouped (sensor_type, site_id, value, ts) tuples to a single list
under a threading.Lock, grouping only at flush time.

Every one of those seven reaches for a lock, a thread-safe queue, or a
double-buffer swap because their HTTP layer hands each request to a real OS
thread (or, for 01/05, defensively even though the same single-event-loop
guarantee already held). This project's fog node is Tornado, whose IOLoop
is a single-threaded, run-to-completion-between-await-points event loop:
IngestHandler.post() (fog/app.py) never awaits in the middle of mutating
_buffers, and the PeriodicCallback-driven flush() never awaits in the
middle of its snapshot+clear either -- both are plain synchronous callbacks
that run to completion in one go, so they can never interleave mid-
mutation, only fully before or fully after each other. That correctness
argument (not a Lock, Queue, or swap object) is what makes a bare dict safe
here.
"""

_buffers = {}
_units = {}


def record(sensor_type, site_id, unit, readings):
    key = (sensor_type, site_id)
    _buffers.setdefault(key, []).extend(readings)
    if unit:
        _units[sensor_type] = unit


def snapshot_and_clear():
    """Take out every non-empty (sensor_type, site_id) group and reset the
    buffer for the next window. Safe to call with no lock: see module
    docstring for why Tornado's single-threaded, non-preemptive callback
    execution makes this correct here."""
    snapshot = {key: values for key, values in _buffers.items() if values}
    _buffers.clear()
    units = dict(_units)
    return snapshot, units
