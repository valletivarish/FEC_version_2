// Per-signal edge alarms raised at the fog on each window aggregate. These are
// hard, single-signal trips; the cross-signal power-source reasoning lives in
// the dashboard, which sees every signal for a site at once.
const RULES = {
  battery_charge_pct: [
    { key: "battery_critical", field: "min", op: "<", limit: 15 },
    { key: "battery_low", field: "mean", op: "<", limit: 30 },
  ],
  genset_fuel_pct: [
    { key: "refuel_required", field: "mean", op: "<", limit: 20 },
  ],
  cabinet_temp_c: [
    { key: "thermal_alarm", field: "max", op: ">", limit: 45 },
  ],
  dc_load_amps: [
    { key: "overcurrent", field: "max", op: ">", limit: 55 },
  ],
  rf_utilization_pct: [
    { key: "capacity_saturation", field: "mean", op: ">", limit: 90 },
  ],
};

function trips(op, value, limit) {
  return op === "<" ? value < limit : value > limit;
}

function evaluate(agg) {
  const rules = RULES[agg.sensor_type] || [];
  const fired = [];
  for (const rule of rules) {
    if (trips(rule.op, agg[rule.field], rule.limit)) fired.push(rule.key);
  }
  return fired;
}

function thresholds() {
  const out = {};
  for (const [signal, rules] of Object.entries(RULES)) {
    out[signal] = rules.map((r) => ({ alert: r.key, on: `${r.field} ${r.op} ${r.limit}` }));
  }
  return out;
}

export { RULES, evaluate, thresholds };
