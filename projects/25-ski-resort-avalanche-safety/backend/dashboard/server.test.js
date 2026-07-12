"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const FAKE_FOG_PORT = 18881;
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
    { sensor_type: "seismic_vibration_mg", site_id: "slope-a", window_end: "t0", latest: 4.0, min: 2.0, max: 6.0, avg: 4.0, unit: "milli-g", alerts: [] },
  ];
  const doc = { send: fakeSend({
    QueryCommand: () => ({ Items: items }),
    ScanCommand: () => ({ Count: 6 }),
  })};
  const sqs = { send: fakeSend({
    GetQueueUrlCommand: () => ({ QueueUrl: "http://q/ska-slope-agg" }),
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
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/readings?sensor_type=seismic_vibration_mg&limit=10`);
    const body = await res.json();
    assert.equal(body.sensor_type, "seismic_vibration_mg");
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

test("GET /api/slopes lists both monitored slopes with a risk_level", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/slopes`);
    const body = await res.json();
    assert.equal(body.slopes.length, 2);
    for (const slope of body.slopes) {
      assert.ok(["LOW", "MODERATE", "HIGH", "EXTREME"].includes(slope.risk_level));
    }
  });
});

test("GET /api/slopes/:slopeId (switch(true) regex-matched route) returns one slope", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/slopes/slope-a`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.site_id, "slope-a");
  });
});

test("GET /api/slopes/:slopeId returns 404 for an unknown slope id", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/slopes/slope-z`);
    assert.equal(res.status, 404);
  });
});

test("GET /api/backend-stats reports queue and table counts", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/backend-stats`);
    const body = await res.json();
    assert.deepEqual(body.queue, { waiting: 1, in_flight: 0 });
    assert.equal(body.items_in_table, 6);
  });
});

test("GET /api/backend-stats degrades items_in_table to null instead of crashing when DynamoDB throws", async () => {
  const clients = buildFakeClients();
  clients.doc = { send: async (command) => {
    if (command.constructor.name === "ScanCommand") throw new Error("boom");
    return fakeSend({ QueryCommand: () => ({ Items: [] }) })(command);
  }};
  const app = createApp(clients);
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/backend-stats`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.items_in_table, null);
  });
});

test("GET /api/readings returns 500 instead of crashing when DynamoDB throws", async () => {
  const clients = buildFakeClients();
  clients.doc = { send: async () => { throw new Error("boom"); } };
  const app = createApp(clients);
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/readings?sensor_type=seismic_vibration_mg`);
    assert.equal(res.status, 500);
  });
});

test("GET /api/health degrades freshest_age_seconds to null instead of crashing when DynamoDB throws", async () => {
  const clients = buildFakeClients();
  clients.doc = { send: async () => { throw new Error("boom"); } };
  const app = createApp(clients);
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.freshest_age_seconds, null);
    assert.equal(body.pipeline, false);
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
  const fakeRules = { snow_temp_c: [{ field: "avg", op: ">", limit: 2, key: "snowpack_instability_risk" }] };
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
