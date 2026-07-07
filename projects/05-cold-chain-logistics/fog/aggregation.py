class RollingStat:
    """Accumulates count/min/max/avg/latest for one (sensor_type, site_id)
    pair over a single window without keeping the individual readings, so
    memory use is O(1) per window regardless of how many readings arrive."""

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
        # Guard against publishing an empty window: the caller (WindowAccumulator)
        # only keeps stats that received at least one reading, so hitting this
        # would indicate a bug in that bookkeeping rather than a real empty window.
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


def roll_up(sensor_type, site_id, unit, readings, window_start, window_end):
    """Convenience one-shot aggregate over an already-collected list of
    readings, used by tests; production ingest instead feeds readings into a
    RollingStat incrementally via WindowAccumulator.absorb."""
    stat = RollingStat()
    for reading in readings:
        stat.add(reading["value"])
    return stat.snapshot(sensor_type, site_id, unit, window_start, window_end)
