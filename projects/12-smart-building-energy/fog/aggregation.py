from statistics import fmean


def summarise_window(sensor_type, site_id, unit, readings, window_start, window_end):
    """Reduce one window's raw {"ts","value"} readings into a single summary record; latest is the last-arrived reading, not the max-timestamp one."""
    sample_values = [r["value"] for r in readings]
    return {
        "sensor_type": sensor_type,
        "site_id": site_id,
        "unit": unit,
        "window_start": window_start,
        "window_end": window_end,
        "count": len(sample_values),
        "min": min(sample_values),
        "max": max(sample_values),
        "avg": round(fmean(sample_values), 3),
        "latest": readings[-1]["value"],
    }
