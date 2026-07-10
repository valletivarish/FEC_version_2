from statistics import fmean


def aggregate(sensor_type, site_id, unit, readings, window_start, window_end):
    """Reduce a window's raw readings (a plain list of {"ts", "value"} dicts
    collected by ingest_pipeline.snapshot_and_clear) into one summary record.

    latest is the last reading in arrival order, not the max-timestamp
    reading -- sensors dispatch in order, so arrival order already reflects
    chronological order without needing to parse/sort the ts strings.
    """
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
