"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const FAKE_FOG_PORT = 18797;
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
    { sensor_type: "motor_temp_c", site_id: "tower-a", window_end: "t0", latest: 60, min: 55, max: 62, avg: 60, unit: "C", alerts: [] },
  ];
  const doc = { send: fakeSend({
    QueryCommand: () => ({ Items: items }),
    ScanCommand: () => ({ Count: 8 }),
  })};
  const sqs = { send: fakeSend({
    GetQueueUrlCommand: () => ({ QueueUrl: "http://q/eef-tower-agg" }),
    GetQueueAttributesCommand: () => ({ Attributes: { ApproximateNumberOfMessages: "2", ApproximateNumberOfMessagesNotVisible: "1", QueueArn: "arn" } }),
  })};
  const lambda = { send: fakeSend({
    GetFunctionCommand: () => ({ Configuration: { State: "Active" } }),
  })};
  return { doc, sqs, lambda };
}

function withServer(app, fn) {
  return new Promise((resolve, reject) => {
    app.listen(0, async () => {
      try {
        const { port } = app.address();
        await fn(`http://127.0.0.1:${port}`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        app.close();
      }
    });
  });
}

test("GET /api/readings returns items for a sensor type", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/readings?sensor_type=motor_temp_c&limit=10`);
    const body = await res.json();
    assert.equal(body.sensor_type, "motor_temp_c");
    assert.equal(body.items.length, 1);
  });
});

test("GET /api/readings rejects an unknown sensor_type with 400", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/readings?sensor_type=not_a_real_sensor`);
    assert.equal(res.status, 400);
  });
});

test("GET /api/towers lists both towers with a nominal flag", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/towers`);
    const body = await res.json();
    assert.equal(body.towers.length, 2);
    for (const tower of body.towers) {
      assert.equal(typeof tower.nominal, "boolean");
    }
  });
});

test("GET /api/towers/:towerId (router :param capture) returns one tower", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/towers/tower-a`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.site_id, "tower-a");
  });
});

test("GET /api/towers/:towerId returns 404 for an unknown tower id", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/towers/tower-z`);
    assert.equal(res.status, 404);
  });
});

test("GET /api/backend-stats reports queue and table counts", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/backend-stats`);
    const body = await res.json();
    assert.deepEqual(body.queue, { waiting: 2, in_flight: 1 });
    assert.equal(body.items_in_table, 8);
  });
});

test("GET /api/health reports lambda and queue truthy from fakes, gateway false without a live fog", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/health`);
    const body = await res.json();
    assert.equal(body.queue, true);
    assert.equal(body.lambda, true);
    assert.equal(body.gateway, false);
    assert.equal(body.pipeline, false);
  });
});

test("GET /api/thresholds proxies the fog gateway's real rules", async () => {
  const app = createApp(buildFakeClients());
  const fakeRules = { motor_temp_c: [{ field: "avg", op: ">", limit: 85, key: "motor_overheat_risk" }] };
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

test("GET / serves the static index.html", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /<!doctype html>/i);
  });
});

test("GET /unknown-path returns 404 json", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});
