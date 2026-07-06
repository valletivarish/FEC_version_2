import json

_REQUIRED_FIELDS = ("sensor_type", "window_start", "window_end", "count", "min", "max", "avg", "latest")
_DEFAULT_SITE = "container-1"


def _coerce(message_body):
    if isinstance(message_body, str):
        return json.loads(message_body)
    return message_body


def reshape_message(message_body):
    payload = _coerce(message_body)

    record = {}
    for field in _REQUIRED_FIELDS:
        record[field] = payload[field]

    site_id = payload.get("site_id") or _DEFAULT_SITE
    record["site_id"] = site_id
    record["unit"] = payload.get("unit", "")
    record["alerts"] = payload.get("alerts", [])
    record["sort_key"] = "#".join((record["window_end"], site_id))

    return record
