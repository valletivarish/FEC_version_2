from statistics import fmean


def aggregate(sensor_type, site_id, unit, readings, window_start, window_end):
    """Reduce one window's raw readings into a single summary; latest is the last reading in arrival order."""
    values = [r["value"] for r in readings]
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
        "latest": readings[-1]["value"],
    }
