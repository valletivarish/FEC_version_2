import test from "node:test";
import assert from "node:assert/strict";
import { summariseSignal, assembleSite, rollup, network, readings, SIGNALS } from "../backend/dashboard/service.js";

function item(over) {
  return { unit: "%", last: 50, min: 40, max: 60, mean: 50, window_end: "2026-01-01T00:00:10Z", alerts: [], ...over };
}

test("summariseSignal reads the newest window and orders the series oldest-first", () => {
  const items = [
    item({ mean: 30, last: 28, window_end: "t3", alerts: ["battery_low"] }),
    item({ mean: 40, last: 41, window_end: "t2" }),
    item({ mean: 50, last: 52, window_end: "t1" }),
  ];
  const s = summariseSignal(items);
  assert.equal(s.last, 28);
  assert.deepEqual(s.series, [50, 40, 30]);
  assert.deepEqual(s.alerts, ["battery_low"]);
  assert.equal(s.window_end, "t3");
});

test("summariseSignal returns null for an empty signal", () => {
  assert.equal(summariseSignal([]), null);
});

test("assembleSite fuses per-signal summaries into a power state with alerts", () => {
  const site = assembleSite("site-north", {
    battery_charge_pct: { last: 55, series: [80, 68, 55], unit: "%", window_end: "t3", alerts: ["battery_low"] },
    dc_load_amps: { last: 40, series: [40], unit: "A", window_end: "t3", alerts: [] },
    genset_fuel_pct: { last: 90, series: [90, 90], unit: "%", window_end: "t2", alerts: [] },
    cabinet_temp_c: { last: 33, series: [33], unit: "degC", window_end: "t3", alerts: [] },
    rf_utilization_pct: { last: 70, series: [70], unit: "%", window_end: "t3", alerts: [] },
  });
  assert.equal(site.site_id, "site-north");
  assert.equal(site.source, "on_battery");
  assert.equal(site.active_alerts.length, 1);
  assert.equal(site.active_alerts[0].signal, "battery_charge_pct");
  assert.equal(Object.keys(site.signals).length, 5);
});

test("assembleSite tolerates missing signals", () => {
  const site = assembleSite("site-south", { dc_load_amps: { last: 20, series: [20], unit: "A", window_end: "t1", alerts: [] } });
  assert.equal(site.source, "on_grid");
  assert.ok(Number.isFinite(site.autonomy_minutes));
});

test("rollup counts sites by source and reports the worst autonomy", () => {
  const r = rollup([
    { source: "on_battery", autonomy_minutes: 120, active_alerts: [{ signal: "x", key: "battery_low" }] },
    { source: "on_grid", autonomy_minutes: 1440, active_alerts: [] },
  ]);
  assert.equal(r.sites, 2);
  assert.equal(r.on_battery, 1);
  assert.equal(r.alerting, 1);
  assert.equal(r.worst_autonomy_minutes, 120);
});

// --- AWS-backed reads against a fake document client ------------------------

class FakeDoc {
  async send(cmd) {
    const signal = cmd.input.ExpressionAttributeValues[":s"];
    // battery drains so both sites read on_battery; other signals are flat.
    if (signal === "battery_charge_pct") {
      return { Items: [item({ mean: 55, last: 55, unit: "%" }), item({ mean: 75, last: 75, unit: "%" })] };
    }
    return { Items: [item({ mean: 30, last: 30, unit: "A" })] };
  }
}

test("network returns both sites plus a rollup", async () => {
  const clients = { doc: new FakeDoc() };
  const payload = await network(clients);
  assert.equal(payload.sites.length, 2);
  assert.ok("rollup" in payload);
  for (const s of payload.sites) {
    assert.ok(typeof s.source === "string");
    assert.ok(Number.isFinite(s.autonomy_minutes));
  }
});

test("readings returns one row per site/signal pair", async () => {
  const clients = { doc: new FakeDoc() };
  const rows = await readings(clients);
  assert.equal(rows.length, 2 * SIGNALS.length);
  assert.ok(Array.isArray(rows[0].windows));
});

test("readings honours a site and signal filter", async () => {
  const clients = { doc: new FakeDoc() };
  const rows = await readings(clients, "site-north", "dc_load_amps");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].site_id, "site-north");
  assert.equal(rows[0].sensor_type, "dc_load_amps");
});
