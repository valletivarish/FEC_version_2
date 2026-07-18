class ReeferTally:
    """O(1)-per-window running count/min/max/avg/latest for one (sensor_type, site_id) reefer."""

    __slots__ = ("_count", "_total", "_floor", "_ceiling", "_last")

    def __init__(self):
        self._count = 0
        self._total = 0.0
        self._floor = None
        self._ceiling = None
        self._last = None

    def add(self, value):
        self._count += 1
        self._total += value
        self._last = value
        if self._floor is None or value < self._floor:
            self._floor = value
        if self._ceiling is None or value > self._ceiling:
            self._ceiling = value

    def __len__(self):
        return self._count

    def snapshot(self, sensor_type, site_id, unit, window_start, window_end):
        # An empty window here means a bookkeeping bug upstream, not a real reading gap.
        if self._count == 0:
            raise ValueError("cannot snapshot a stat with no observations")
        return {
            "sensor_type": sensor_type,
            "site_id": site_id,
            "unit": unit,
            "window_start": window_start,
            "window_end": window_end,
            "count": self._count,
            "min": self._floor,
            "max": self._ceiling,
            "avg": round(self._total / self._count, 3),
            "latest": self._last,
        }


def tally_window(sensor_type, site_id, unit, readings, window_start, window_end):
    """One-shot aggregate over an already-collected reading list, used by tests."""
    tally = ReeferTally()
    for reading in readings:
        tally.add(reading["value"])
    return tally.snapshot(sensor_type, site_id, unit, window_start, window_end)
