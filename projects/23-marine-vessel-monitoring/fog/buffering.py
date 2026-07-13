"""Plain dict with no lock at all, safe only because Tornado's single-threaded IOLoop never awaits mid-mutation in post()/flush() -- the 8th distinct buffering shape in this portfolio's Python projects."""

_buffers = {}
_units = {}


def record(sensor_type, site_id, unit, readings):
    key = (sensor_type, site_id)
    _buffers.setdefault(key, []).extend(readings)
    if unit:
        _units[sensor_type] = unit


def snapshot_and_clear():
    """Take out every non-empty (sensor_type, site_id) group and reset the
    buffer for the next window. Safe to call with no lock: see module
    docstring for why Tornado's single-threaded, non-preemptive callback
    execution makes this correct here."""
    snapshot = {key: values for key, values in _buffers.items() if values}
    _buffers.clear()
    units = dict(_units)
    return snapshot, units
