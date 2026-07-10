"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeWindow } = require("./aggregation");

test("summarizeWindow computes count/min/max/avg (3dp) over the readings", () => {
  const readings = [{ ts: "t0", value: 21.5 }, { ts: "t1", value: 22.2 }, { ts: "t2", value: 20.9 }];
  const s = summarizeWindow("temperature_c", "hall-1", "C", readings, "start", "end");
  assert.equal(s.count, 3);
  assert.equal(s.min, 20.9);
  assert.equal(s.max, 22.2);
  assert.equal(s.avg, 21.533);
});

test("summarizeWindow's latest is last-in-order, not the maximum value", () => {
  const readings = [{ ts: "t0", value: 99 }, { ts: "t1", value: 10 }];
  const s = summarizeWindow("power_load_kw", "hall-2", "kW", readings, "start", "end");
  assert.equal(s.latest, 10, "latest must be the last array element, not Math.max");
});

test("summarizeWindow carries sensor_type/site_id/unit/window bounds through untouched", () => {
  const s = summarizeWindow("dust_density_ugm3", "hall-1", "ug/m3", [{ ts: "t0", value: 5 }], "2026-01-01T00:00:00Z", "2026-01-01T00:00:10Z");
  assert.equal(s.sensor_type, "dust_density_ugm3");
  assert.equal(s.site_id, "hall-1");
  assert.equal(s.unit, "ug/m3");
  assert.equal(s.window_start, "2026-01-01T00:00:00Z");
  assert.equal(s.window_end, "2026-01-01T00:00:10Z");
});

test("summarizeWindow handles a single-reading window (min == max == avg == latest)", () => {
  const s = summarizeWindow("airflow_cfm", "hall-1", "CFM", [{ ts: "t0", value: 950 }], "s", "e");
  assert.equal(s.min, 950);
  assert.equal(s.max, 950);
  assert.equal(s.avg, 950);
  assert.equal(s.latest, 950);
});

test("summarizeWindow rounds avg to exactly 3 decimal places", () => {
  const readings = [{ ts: "t0", value: 1 }, { ts: "t1", value: 2 }, { ts: "t2", value: 2 }];
  const s = summarizeWindow("humidity_pct", "hall-1", "%", readings, "s", "e");
  assert.equal(s.avg, 1.667);
});
