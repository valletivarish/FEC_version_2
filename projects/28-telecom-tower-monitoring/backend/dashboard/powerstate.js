// Read-time reasoning the fog cannot do: it sees one signal per window, but the
// dashboard holds every signal for a site and infers which supply is feeding it
// and how long the battery would last if the site islanded right now.
const BATTERY_BANK_AH = 200;
const AUTONOMY_CAP_MIN = 24 * 60;
const TREND_BAND = 1.5;

function autonomyMinutes(batteryPct, loadAmps) {
  if (!(loadAmps > 0)) return AUTONOMY_CAP_MIN;
  const pct = Math.max(0, Math.min(100, batteryPct));
  const remainingAh = (BATTERY_BANK_AH * pct) / 100;
  return Math.min(AUTONOMY_CAP_MIN, Math.round((remainingAh / loadAmps) * 60));
}

function trend(series) {
  if (!series || series.length < 2) return "steady";
  const delta = series[series.length - 1] - series[0];
  if (delta > TREND_BAND) return "rising";
  if (delta < -TREND_BAND) return "falling";
  return "steady";
}

function powerSource({ batteryTrend, fuelTrend, batteryCritical }) {
  if (batteryCritical) return "degraded";
  if (fuelTrend === "falling") return "on_genset";
  if (batteryTrend === "falling") return "on_battery";
  return "on_grid";
}

function siteState(signals) {
  const battery = signals.battery_charge_pct;
  const load = signals.dc_load_amps;
  const fuel = signals.genset_fuel_pct;
  const batteryPct = battery ? battery.last : 100;
  const loadAmps = load ? load.last : 0;
  const batteryTrend = trend(battery ? battery.series : []);
  const fuelTrend = trend(fuel ? fuel.series : []);
  const batteryCritical = batteryPct < 15;
  return {
    source: powerSource({ batteryTrend, fuelTrend, batteryCritical }),
    autonomy_minutes: autonomyMinutes(batteryPct, loadAmps),
    battery_pct: Math.round(batteryPct * 10) / 10,
    battery_trend: batteryTrend,
    fuel_trend: fuelTrend,
    load_amps: Math.round(loadAmps * 10) / 10,
  };
}

export { autonomyMinutes, trend, powerSource, siteState, BATTERY_BANK_AH, AUTONOMY_CAP_MIN };
