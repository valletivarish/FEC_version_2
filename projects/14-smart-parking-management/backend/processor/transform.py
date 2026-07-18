import json


def to_item(message_body):
    """Transform a raw SQS message body into the flat DynamoDB record; sort_key is window_end#site_id to avoid per-lot collisions."""
    data = json.loads(message_body) if isinstance(message_body, str) else message_body
    site_id = data.get("site_id", "lot-a")
    return {
        "sensor_type": data["sensor_type"],
        "sort_key": f"{data['window_end']}#{site_id}",
        "window_start": data["window_start"],
        "window_end": data["window_end"],
        "site_id": site_id,
        "unit": data.get("unit", ""),
        "count": data["count"],
        "min": data["min"],
        "max": data["max"],
        "avg": data["avg"],
        "latest": data["latest"],
        "alerts": data.get("alerts", []),
    }
