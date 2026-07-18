"""Input validation for POST /ingest, kept separate from app.py so it is unit-testable without sockets or the buffer queue."""


def validate_batch(payload):
    """Return an error-message string for a malformed ingest batch, or None if it is fine to accept; never raises."""
    if not isinstance(payload, dict):
        return "request body must be a JSON object"

    sensor_type = payload.get("sensor_type")
    if not isinstance(sensor_type, str) or not sensor_type:
        return "sensor_type is required and must be a non-empty string"

    site_id = payload.get("site_id", "floor-1")
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
