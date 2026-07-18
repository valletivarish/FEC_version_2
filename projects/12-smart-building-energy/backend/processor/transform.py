import json


def to_reading_record(message_body):
    """Pure transform from a raw SQS message body (the fog node's window aggregate) into the flat DynamoDB record; sort_key is window_end + "#" + site_id so two floors flushing the same window don't collide on the range key."""
    data = json.loads(message_body) if isinstance(message_body, str) else message_body
    site_id = data.get("site_id", "floor-1")
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
