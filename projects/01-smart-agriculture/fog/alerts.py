THRESHOLDS = {
    "soil_moisture":  [("avg", "<", 20, "irrigation_needed")],
    "temperature":    [("avg", ">", 35, "heat_stress"), ("min", "<", 3, "frost_risk")],
    "humidity":       [("avg", ">", 90, "fungal_risk")],
    "light_intensity":[("avg", "<", 1000, "low_light")],
    "rainfall":       [("max", ">", 10, "heavy_rain")],
}


def evaluate(sensor_type, agg):
    fired = []
    for field, op, limit, label in THRESHOLDS.get(sensor_type, []):
        value = agg[field]
        if (op == "<" and value < limit) or (op == ">" and value > limit):
            fired.append(label)
    return fired
