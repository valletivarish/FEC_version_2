import test from "node:test";
import assert from "node:assert/strict";
import { Windower, summarise } from "../fog/windower.js";

function group(values) {
  return {
    sensor_type: "dc_load_amps",
    site_id: "site-north",
    unit: "A",
    first_ts: "2026-01-01T00:00:00Z",
    last_ts: "2026-01-01T00:00:09Z",
    values,
  };
}

test("summarise reduces a window to count/min/max/mean/last/spread", () => {
  const s = summarise(group([10, 20, 30]));
  assert.equal(s.count, 3);
  assert.equal(s.min, 10);
  assert.equal(s.max, 30);
  assert.equal(s.mean, 20);
  assert.equal(s.last, 30);
  assert.equal(s.spread, 20);
  assert.equal(s.window_start, "2026-01-01T00:00:00Z");
  assert.equal(s.window_end, "2026-01-01T00:00:09Z");
});

test("summarise rounds to three decimals", () => {
  const s = summarise(group([1, 2, 2]));
  assert.equal(s.mean, 1.667);
});

test("accept groups readings by sensor_type and site", () => {
  const w = new Windower(10000);
  w.accept({ sensor_type: "dc_load_amps", site_id: "site-north", unit: "A", value: 5, ts: "t1" });
  w.accept({ sensor_type: "dc_load_amps", site_id: "site-north", unit: "A", value: 7, ts: "t2" });
  w.accept({ sensor_type: "dc_load_amps", site_id: "site-south", unit: "A", value: 9, ts: "t3" });
  assert.equal(w.pending(), 3);
  assert.equal(w.groups.size, 2);
});

test("flush emits one batch and clears the groups", () => {
  const w = new Windower(10000);
  const seen = [];
  w.on("flush", (batch) => seen.push(batch));
  w.accept({ sensor_type: "battery_charge_pct", site_id: "site-north", unit: "%", value: 80, ts: "t1" });
  w.accept({ sensor_type: "battery_charge_pct", site_id: "site-north", unit: "%", value: 60, ts: "t2" });
  const batch = w.flush();
  assert.equal(batch.length, 1);
  assert.equal(batch[0].mean, 70);
  assert.equal(seen.length, 1);
  assert.equal(w.pending(), 0);
});

test("flush with nothing buffered emits no event", () => {
  const w = new Windower(10000);
  let fired = 0;
  w.on("flush", () => { fired += 1; });
  const batch = w.flush();
  assert.deepEqual(batch, []);
  assert.equal(fired, 0);
});

test("last_ts tracks the most recent reading in the group", () => {
  const w = new Windower(10000);
  w.accept({ sensor_type: "cabinet_temp_c", site_id: "site-south", unit: "degC", value: 30, ts: "a" });
  w.accept({ sensor_type: "cabinet_temp_c", site_id: "site-south", unit: "degC", value: 31, ts: "b" });
  const batch = w.flush();
  assert.equal(batch[0].window_start, "a");
  assert.equal(batch[0].window_end, "b");
});
