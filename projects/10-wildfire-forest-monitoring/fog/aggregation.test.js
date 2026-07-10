"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeWindow } = require("./aggregation");

test("summarizeWindow computes count/min/max/avg/latest over the window", () => {
  const readings = [{ ts: "t0", value: 20 }, { ts: "t1", value: 25 }, { ts: "t2", value: 22 }];
  const summary = summarizeWindow("temperature_c", "station-1", "C", readings, "start", "end");
  assert.equal(summary.count, 3);
  assert.equal(summary.min, 20);
  assert.equal(summary.max, 25);
  assert.equal(summary.avg, 22.333);
  assert.equal(summary.latest, 22, "latest must be last-in-order, not max value");
});

test("summarizeWindow rounds avg to 3 decimals", () => {
  const readings = [{ ts: "t0", value: 1 }, { ts: "t1", value: 2 }, { ts: "t2", value: 2 }];
  const summary = summarizeWindow("smoke_density_ppm", "station-2", "ppm", readings, "s", "e");
  assert.equal(summary.avg, 1.667);
});

test("summarizeWindow carries through sensor_type, site_id, unit and window bounds", () => {
  const readings = [{ ts: "t0", value: 5 }];
  const summary = summarizeWindow("wind_speed_kmh", "station-1", "km/h", readings, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:10.000Z");
  assert.equal(summary.sensor_type, "wind_speed_kmh");
  assert.equal(summary.site_id, "station-1");
  assert.equal(summary.unit, "km/h");
  assert.equal(summary.window_start, "2026-01-01T00:00:00.000Z");
  assert.equal(summary.window_end, "2026-01-01T00:00:10.000Z");
});

test("latest reflects last-in-order reading even when it is not the max", () => {
  const readings = [{ ts: "t0", value: 40 }, { ts: "t1", value: 10 }];
  const summary = summarizeWindow("temperature_c", "station-1", "C", readings, "s", "e");
  assert.equal(summary.max, 40);
  assert.equal(summary.latest, 10);
});
