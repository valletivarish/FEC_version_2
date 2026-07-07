"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const FAKE_FOG_PORT = 18475;
process.env.FOG_THRESHOLDS_URL = `http://127.0.0.1:${FAKE_FOG_PORT}/thresholds`;

const { createApp } = require("./server");

function withFakeFog(body, fn) {
  return new Promise((resolve, reject) => {
    const upstream = http.createServer((req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    });
    upstream.listen(FAKE_FOG_PORT, async () => {
      try {
        await fn();
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        upstream.close();
      }
    });
  });
}

function fakeSend(handlers) {
  return async (command) => {
    const name = command.constructor.name;
    if (handlers[name]) return handlers[name](command);
    return {};
  };
}

function buildFakeClients() {
  const items = [
    { sensor_type: "wind_speed_ms", site_id: "turbine-1", window_end: "t0", latest: 9, min: 7, max: 11, avg: 9, unit: "m/s", alerts: [] },
  ];
  const doc = { send: fakeSend({
    QueryCommand: () => ({ Items: items }),
    ScanCommand: () => ({ Count: 3 }),
  })};
  const sqs = { send: fakeSend({
    GetQueueUrlCommand: () => ({ QueueUrl: "http://q/owf-turbine-agg" }),
    GetQueueAttributesCommand: () => ({ Attributes: { ApproximateNumberOfMessages: "1", ApproximateNumberOfMessagesNotVisible: "0", QueueArn: "arn" } }),
  })};
  const lambda = { send: fakeSend({
    GetFunctionCommand: () => ({ Configuration: { State: "Active" } }),
  })};
  return { doc, sqs, lambda };
}

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

test("GET /api/readings returns items for a sensor type", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/readings?sensor_type=wind_speed_ms&limit=10`);
    const body = await res.json();
    assert.equal(body.sensor_type, "wind_speed_ms");
    assert.equal(body.items.length, 1);
  });
});

test("GET /api/farm-grid returns a tile per turbine", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/farm-grid`);
    const body = await res.json();
    assert.equal(body.tiles.length, 2);
    assert.ok(body.tiles.some((t) => t.site_id === "turbine-1"));
  });
});

test("GET /api/backend-stats reports queue and table counts", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/backend-stats`);
    const body = await res.json();
    assert.deepEqual(body.queue, { waiting: 1, in_flight: 0 });
    assert.equal(body.items_in_table, 3);
  });
});

test("GET /api/health reports lambda and queue truthy from fakes, gateway false without a live fog", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/health`);
    const body = await res.json();
    assert.equal(body.queue, true);
    assert.equal(body.lambda, true);
    assert.equal(body.fog_gateway, false);
  });
});

test("GET /api/thresholds proxies the fog gateway's real rules", async () => {
  const app = createApp(buildFakeClients());
  const fakeRules = { blade_vibration_mm: [{ field: "avg", op: ">", limit: 8, key: "structural_risk" }] };
  await withFakeFog(fakeRules, async () => {
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/thresholds`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), fakeRules);
    });
  });
});

test("GET /api/thresholds returns 502 when the fog gateway is unreachable", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/thresholds`);
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "thresholds unavailable" });
  });
});
