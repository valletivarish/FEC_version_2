"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp, drainWindow } = require("./app");
const { createStation, buffer } = require("./ingestRouter");

function withServer(app, fn) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const { port } = server.address();
        await fn(`http://127.0.0.1:${port}`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test("GET /health returns ok", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/health`);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});

test("GET /thresholds exposes the real alert rules", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/thresholds`);
    const body = await res.json();
    assert.equal(body.generator_temp_c[0].limit, 95);
    assert.equal(body.gearbox_pressure_bar[0].key, "lubrication_fault");
  });
});

test("POST /ingest accepts and buffers readings", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sensor_type: "power_output_kw",
        site_id: "turbine-1",
        unit: "kW",
        readings: [{ ts: "t0", value: 900 }, { ts: "t1", value: 950 }],
      }),
    });
    assert.equal(res.status, 202);
    assert.deepEqual(await res.json(), { accepted: 2 });
  });
});

test("drainWindow seals accumulators and attaches alerts", () => {
  const station = createStation();
  buffer(station, {
    sensor_type: "blade_vibration_mm",
    site_id: "turbine-1",
    unit: "mm",
    readings: [{ ts: "t0", value: 8.2 }, { ts: "t1", value: 9.0 }],
  });
  const messages = drainWindow(station, "start", "end");
  assert.equal(messages.length, 1);
  assert.equal(messages[0].avg, 8.6);
  assert.deepEqual(messages[0].alerts, ["structural_risk"]);
});

test("drainWindow handles multiple sensor/site groups independently", () => {
  const station = createStation();
  buffer(station, { sensor_type: "wind_speed_ms", site_id: "turbine-1", unit: "m/s", readings: [{ ts: "t0", value: 10 }] });
  buffer(station, { sensor_type: "wind_speed_ms", site_id: "turbine-2", unit: "m/s", readings: [{ ts: "t0", value: 30 }] });
  const messages = drainWindow(station, "s", "e");
  assert.equal(messages.length, 2);
  const t2 = messages.find((m) => m.site_id === "turbine-2");
  assert.deepEqual(t2.alerts, ["high_wind_shutdown_risk"]);
});
