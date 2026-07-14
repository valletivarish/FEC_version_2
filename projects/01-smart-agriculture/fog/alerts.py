# Each sensor type maps to a list of (aggregate_field, comparison_op, limit,
# alert_label) rules. temperature carries two independent rules (heat and
# frost) since both ends of its range are operationally meaningful; every
# other sensor type only needs one.
THRESHOLDS = {
    "soil_moisture":  [("avg", "<", 20, "irrigation_needed")],
    "temperature":    [("avg", ">", 35, "heat_stress"), ("min", "<", 3, "frost_risk")],
    "humidity":       [("avg", ">", 90, "fungal_risk")],
    "light_intensity":[("avg", "<", 1000, "low_light")],
    "rainfall":       [("max", ">", 10, "heavy_rain")],
}


def evaluate(sensor_type, agg):
    """Return every alert label whose rule fires against this window's
    aggregate. A sensor type can raise more than one alert per window
    (e.g. temperature's heat_stress and frost_risk are independent checks)."""
    fired = []
    for field, op, limit, label in THRESHOLDS.get(sensor_type, []):
        value = agg[field]
        if (op == "<" and value < limit) or (op == ">" and value > limit):
            fired.append(label)
    return fired
