"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const FAKE_FOG_PORT = 18791;
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
  const itemsBySensorType = {
    fill_level_pct: [
      { sensor_type: "fill_level_pct", site_id: "district-a", window_end: "t0", latest: 60, min: 55, max: 62, avg: 58, unit: "%", alerts: [] },
      { sensor_type: "fill_level_pct", site_id: "district-b", window_end: "t0", latest: 92, min: 88, max: 93, avg: 90, unit: "%", alerts: ["collection_needed"] },
    ],
  };
  const doc = { send: fakeSend({
    QueryCommand: (command) => {
      const sensorType = command.input.ExpressionAttributeValues[":st"];
      return { Items: itemsBySensorType[sensorType] || [] };
    },
    ScanCommand: () => ({ Count: 6 }),
  })};
  const sqs = { send: fakeSend({
    GetQueueUrlCommand: () => ({ QueueUrl: "http://q/swm-district-agg" }),
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
    const res = await fetch(`${base}/api/readings?sensor_type=fill_level_pct&limit=10`);
    const body = await res.json();
    assert.equal(body.sensor_type, "fill_level_pct");
    assert.equal(body.items.length, 2);
  });
});

test("GET /api/readings rejects an unknown sensor_type with 400", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/readings?sensor_type=not_a_real_sensor`);
    assert.equal(res.status, 400);
  });
});

test("GET /api/districts lists both collection districts with a compliant flag", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/districts`);
    const body = await res.json();
    assert.equal(body.districts.length, 2);
    for (const district of body.districts) {
      assert.equal(typeof district.compliant, "boolean");
    }
  });
});

test("GET /api/districts/:districtId (trie-routed path parameter) returns one district", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/districts/district-b`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.site_id, "district-b");
    assert.equal(body.compliant, false);
  });
});

test("GET /api/districts/:districtId returns 404 for an unknown district id", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/districts/district-z`);
    assert.equal(res.status, 404);
  });
});

test("GET /api/priority sorts bins by fill_level_pct descending -- district-b (92) before district-a (60)", async () => {
  const app = createApp(buildFakeClients());
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/priority`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.bins.length, 2);
    assert.equal(body.bins[0].site_id, "district-b");
    assert.equal(body.bins[0].fill_level_pct.latest, 92);
    assert.equal(body.bins[1].site_id, "district-a");
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
  const fakeRules = { fill_level_pct: [{ field: "avg", op: ">", limit: 85, key: "collection_needed" }] };
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
