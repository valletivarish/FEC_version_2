"""Pure window-aggregation math over the (value, ts) pairs produced by
buffering.group_by_key() for one (sensor_type, site_id) group."""

from statistics import fmean


def aggregate(sensor_type, site_id, unit, pairs, window_start, window_end):
    """Reduce one window's (value, ts) pairs into a summary record.

    latest is the last pair in arrival order, not the max-timestamp pair --
    group_by_key() preserves the order readings were appended to RAW in, and
    sensors dispatch batches in chronological order, so arrival order
    already reflects reading order without needing to parse/sort ts.
    """
    values = [value for value, _ts in pairs]
    return {
        "sensor_type": sensor_type,
        "site_id": site_id,
        "unit": unit,
        "window_start": window_start,
        "window_end": window_end,
        "count": len(values),
        "min": min(values),
        "max": max(values),
        "avg": round(fmean(values), 3),
        "latest": values[-1],
    }
