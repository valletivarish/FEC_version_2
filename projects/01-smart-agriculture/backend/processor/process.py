import json


def process(message_body):
    data = json.loads(message_body) if isinstance(message_body, str) else message_body
    site_id = data.get("site_id", "field-1")
    return {
        "sensor_type": data["sensor_type"],
        "sort_key": f"{data['window_end']}#{site_id}",
        "window_end": data["window_end"],
        "window_start": data["window_start"],
        "site_id": site_id,
        "unit": data.get("unit", ""),
        "count": data["count"],
        "min": data["min"],
        "max": data["max"],
        "avg": data["avg"],
        "latest": data["latest"],
        "alerts": data.get("alerts", []),
    }
