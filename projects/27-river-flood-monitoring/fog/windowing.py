"""Window aggregate: count/min/max/avg/latest over the readings in one window."""


def summarise(sensor_type, site_id, unit, readings, window_start, window_end, window_seconds=None):
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
        "avg": round(sum(values) / len(values), 3),
        "latest": values[-1],
    }
