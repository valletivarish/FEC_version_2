"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const FAKE_FOG_PORT = 18881;
process.env.FOG_THRESHOLDS_URL = `http://127.0.0.1:${FAKE_FOG_PORT}/thresholds`;

const { createDashboardServer } = require("./server");

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
    { sensor_type: "hive_weight_kg", site_id: "apiary-a", window_end: "t0", latest: 35.0, min: 34.0, max: 36.0, avg: 35.0, unit: "kg", alerts: [] },
  ];
  const doc = { send: fakeSend({
    QueryCommand: () => ({ Items: items }),
    ScanCommand: () => ({ Count: 6 }),
  })};
  const sqs = { send: fakeSend({
    GetQueueUrlCommand: () => ({ QueueUrl: "http://q/bam-apiary-agg" }),
    GetQueueAttributesCommand: () => ({ Attributes: { ApproximateNumberOfMessages: "1", ApproximateNumberOfMessagesNotVisible: "0", QueueArn: "arn" } }),
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
  const app = createDashboardServer(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/readings?sensor_type=hive_weight_kg&limit=10`);
    const body = await res.json();
    assert.equal(body.sensor_type, "hive_weight_kg");
    assert.equal(body.items.length, 1);
  });
});

test("GET /api/readings rejects an unknown sensor_type with 400", async () => {
  const app = createDashboardServer(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/readings?sensor_type=not_a_real_sensor`);
    assert.equal(res.status, 400);
  });
});

test("GET /api/apiaries lists both apiaries with a compliant flag and a health narrative", async () => {
  const app = createDashboardServer(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/apiaries`);
    const body = await res.json();
    assert.equal(body.apiaries.length, 2);
    for (const apiary of body.apiaries) {
      assert.equal(typeof apiary.compliant, "boolean");
      assert.equal(typeof apiary.health.sentence, "string");
    }
  });
});

test("GET /api/apiaries/:apiaryId (regex fallback path parameter) returns one apiary", async () => {
  const app = createDashboardServer(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/apiaries/apiary-a`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.site_id, "apiary-a");
  });
});

test("GET /api/apiaries/:apiaryId returns 404 for an unknown apiary id", async () => {
  const app = createDashboardServer(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/apiaries/apiary-z`);
    assert.equal(res.status, 404);
  });
});

test("GET /api/backend-stats reports queue and table counts", async () => {
  const app = createDashboardServer(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/backend-stats`);
    const body = await res.json();
    assert.deepEqual(body.queue, { waiting: 1, in_flight: 0 });
    assert.equal(body.items_in_table, 6);
  });
});

test("GET /api/health reports lambda and queue truthy from fakes, gateway false without a live fog", async () => {
  const app = createDashboardServer(buildFakeClients());
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
  const app = createDashboardServer(buildFakeClients());
  const fakeRules = { hive_weight_kg: [{ field: "avg", op: "<", limit: 20, key: "colony_starvation_risk" }] };
  await withFakeFog(fakeRules, async () => {
    await withServer(app, async (base) => {
      const res = await fetch(`${base}/api/thresholds`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), fakeRules);
    });
  });
});

test("GET /api/thresholds returns 502 when the fog gateway is unreachable", async () => {
  const app = createDashboardServer(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/thresholds`);
    assert.equal(res.status, 502);
    assert.deepEqual(await res.json(), { error: "thresholds unavailable" });
  });
});

test("GET / serves the static index.html", async () => {
  const app = createDashboardServer(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.match(text, /<!doctype html>/i);
  });
});

test("GET /unknown-path returns 404 json", async () => {
  const app = createDashboardServer(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});
