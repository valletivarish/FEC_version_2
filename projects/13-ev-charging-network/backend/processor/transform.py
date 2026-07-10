import json


def to_item(message_body):
    """Pure transform from a raw SQS message body (the fog node's window
    aggregate JSON) into the flat record DynamoDB stores. sort_key is
    window_end + "#" + site_id: window_end alone would collide whenever
    hub-1 and hub-2 both flush in the same window, since sensor_type is
    the table's partition key and window_end would otherwise repeat as the
    range key for both hubs in that flush cycle.
    """
    data = json.loads(message_body) if isinstance(message_body, str) else message_body
    site_id = data.get("site_id", "hub-1")
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
