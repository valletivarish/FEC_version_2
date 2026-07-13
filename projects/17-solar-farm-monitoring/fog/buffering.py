"""Double-buffering via swapping `active`/`flushing` dict references under a lock (O(1) swap, not a copy) -- the 4th distinct buffering shape in this portfolio's Python projects."""

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
