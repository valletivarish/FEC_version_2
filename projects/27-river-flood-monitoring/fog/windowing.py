"""Window aggregate: standard stats plus a rate-of-rise in metres/hour for the stage logic."""


def summarise(sensor_type, site_id, unit, readings, window_start, window_end, window_seconds):
    values = [r["value"] for r in readings]
    first, last = values[0], values[-1]
    rise_mph = round((last - first) / (window_seconds / 3600.0), 3) if window_seconds else 0.0
    return {
        "sensor_type": sensor_type,
        "site_id": site_id,
        "unit": unit,
        "window_start": window_start,
        "window_end": window_end,
        "count": len(values),
        "min": min(values),
        "max": max(values),
        "avg": round(sum(values) / len(values), 3),
        "latest": last,
        "rise_mph": rise_mph,
    }
