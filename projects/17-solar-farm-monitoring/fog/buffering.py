"""Combiner buffer: swaps active/flushing dict references under a lock for an O(1) window rollover instead of copying."""

import threading


class CombinerBuffer:
    def __init__(self):
        self.active = {}
        self.flushing = {}
        self._units = {}
        self._lock = threading.Lock()

    def record(self, sensor_type, site_id, unit, readings):
        group_key = (sensor_type, site_id)
        with self._lock:
            self.active.setdefault(group_key, []).extend(readings)
            if unit:
                self._units[sensor_type] = unit

    def swap(self):
        # Swap the two dicts under the lock, then hand back the non-empty groups plus a copy of the unit map.
        with self._lock:
            self.active, self.flushing = self.flushing, self.active
            unit_map = dict(self._units)
        pending = {group_key: values for group_key, values in self.flushing.items() if values}
        self.flushing.clear()
        return pending, unit_map
