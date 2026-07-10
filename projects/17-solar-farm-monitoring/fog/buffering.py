"""Buffering via a double-buffering swap, the 4th distinct buffering shape
in the portfolio's Python projects.

01 writes straight into a shared defaultdict(list), guarded by a single
asyncio.Lock held around both the ingest write and the flush's read+clear
(no queue, no thread/task handoff). 05 pushes onto an asyncio.Queue and
folds each batch into a
WindowAccumulator of RollingStat objects. 12 decouples ingest from
buffering with a stdlib queue.Queue plus one dedicated consumer thread that
owns the buffer dict exclusively.

Here there are always exactly two dicts, `active` and `flushing`. Ingest
handlers append into `active` under a `threading.Lock`. At flush time the
lock is held just long enough to swap which dict object each name points
at (`self.active, self.flushing = self.flushing, self.active`) -- an O(1)
reference swap, not a copy of the buffered readings -- and to snapshot the
per-sensor-type unit map. The actual aggregation work then reads
`self.flushing` with the lock already released, so a burst of concurrent
ingests never blocks behind window-aggregation math, and window-aggregation
never blocks a burst of concurrent ingests.
"""

import threading


class DoubleBuffer:
    def __init__(self):
        self.active = {}
        self.flushing = {}
        self._units = {}
        self._lock = threading.Lock()

    def record(self, sensor_type, site_id, unit, readings):
        key = (sensor_type, site_id)
        with self._lock:
            self.active.setdefault(key, []).extend(readings)
            if unit:
                self._units[sensor_type] = unit

    def swap(self):
        """Atomically swap `active` and `flushing`, then hand back whatever
        the now-`flushing` dict held (non-empty groups only) plus a copy of
        the unit map. The dict object that was `active` a moment ago is
        cleared here, outside the lock, and reused as `flushing` next time a
        window rolls over -- no new dict is ever allocated after startup."""
        with self._lock:
            self.active, self.flushing = self.flushing, self.active
            units = dict(self._units)
        snapshot = {key: values for key, values in self.flushing.items() if values}
        self.flushing.clear()
        return snapshot, units
