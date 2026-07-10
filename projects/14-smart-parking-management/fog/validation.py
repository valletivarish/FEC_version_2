"""Input validation for POST /ingest, kept separate from app.py so it can be
unit-tested without touching sockets or the ring buffer."""


def validate_batch(payload):
    """Return an error message string if payload is not a well-formed
    ingest batch, or None if it is fine to accept. Never raises -- callers
    turn a non-None return into a 400 response."""
    if not isinstance(payload, dict):
        return "request body must be a JSON object"

    sensor_type = payload.get("sensor_type")
    if not isinstance(sensor_type, str) or not sensor_type:
        return "sensor_type is required and must be a non-empty string"

    site_id = payload.get("site_id", "lot-a")
    if not isinstance(site_id, str) or not site_id:
        return "site_id must be a non-empty string when present"

    unit = payload.get("unit", "")
    if not isinstance(unit, str):
        return "unit must be a string when present"

    readings = payload.get("readings")
    if not isinstance(readings, list) or not readings:
        return "readings must be a non-empty list"

    for reading in readings:
        if not isinstance(reading, dict):
            return "each reading must be a JSON object"
        if "value" not in reading:
            return "each reading must include a 'value' field"
        value = reading["value"]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return "each reading's value must be numeric"

    return None
