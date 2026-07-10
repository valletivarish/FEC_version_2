"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { route } = require("./router");

// A single fake DynamoDB doc client covering both the Query calls
// (readingsStore) and the Scan call (pipelineStatus's countTableItems),
// plus fake sqs/lambda clients -- this test file never touches real AWS or
// LocalStack, matching the rest of the portfolio's unit-test discipline.
function fakeClients({ items = {}, tableCount = 3, queueOk = true, lambdaOk = true } = {}) {
  const doc = {
    send: async (command) => {
      if (command.constructor.name === "ScanCommand") return { Count: tableCount };
      const sensorType = command.input.ExpressionAttributeValues[":st"];
      const rows = items[sensorType] || [];
      return { Items: rows.slice().reverse().slice(0, command.input.Limit) };
    },
  };
  const sqs = {
    send: async (command) => {
      if (!queueOk) throw new Error("queue unreachable");
      if (command.constructor.name === "GetQueueUrlCommand") return { QueueUrl: "http://q/dce-hall-agg" };
      return { Attributes: { QueueArn: "arn:x", ApproximateNumberOfMessages: "2", ApproximateNumberOfMessagesNotVisible: "0" } };
    },
  };
  const lambda = {
    send: async () => {
      if (!lambdaOk) throw new Error("not found");
      return { Configuration: { State: "Active" } };
    },
  };
  return { doc, sqs, lambda };
}

function windowItem(sensorType, siteId, windowEnd, avg, alerts = []) {
  return { sensor_type: sensorType, site_id: siteId, window_end: windowEnd, avg, min: avg, max: avg, latest: avg, unit: "x", alerts };
}

test("GET /api/readings requires a valid sensor_type query param", async () => {
  const result = await route("GET", "/api/readings", {}, fakeClients());
  assert.equal(result.status, 400);
});

test("GET /api/readings returns items for a known sensor_type", async () => {
  const clients = fakeClients({ items: { temperature_c: [windowItem("temperature_c", "hall-1", "e1", 22)] } });
  const result = await route("GET", "/api/readings", { sensor_type: "temperature_c" }, clients);
  assert.equal(result.status, 200);
  assert.equal(result.body.sensor_type, "temperature_c");
  assert.equal(result.body.items.length, 1);
});

test("GET /api/halls returns both halls even with no data yet", async () => {
  const result = await route("GET", "/api/halls", {}, fakeClients());
  assert.equal(result.status, 200);
  assert.equal(result.body.halls.length, 2);
});

test("GET /api/halls/:hallId (regex capture group) returns just that hall", async () => {
  const result = await route("GET", "/api/halls/hall-2", {}, fakeClients());
  assert.equal(result.status, 200);
  assert.equal(result.body.site_id, "hall-2");
});

test("GET /api/halls/:hallId returns 404 for an unknown hall", async () => {
  const result = await route("GET", "/api/halls/hall-9", {}, fakeClients());
  assert.equal(result.status, 404);
});

test("GET /api/health aggregates gateway/queue/lambda/pipeline/freshest_age_seconds", async () => {
  await withFakeFog(200, async (healthUrl) => {
    process.env.FOG_HEALTH_URL = healthUrl;
    delete require.cache[require.resolve("./router")];
    const { route: routeFresh } = require("./router");
    const result = await routeFresh("GET", "/api/health", {}, fakeClients());
    assert.equal(result.status, 200);
    assert.equal(result.body.gateway, true);
    assert.equal(result.body.queue, true);
    assert.equal(result.body.lambda, true);
    assert.equal(result.body.pipeline, false, "no readings in the table means the pipeline cannot be flowing");
    assert.equal(result.body.freshest_age_seconds, null);
  });
});

test("GET /api/backend-stats reports queue counters and items_in_table", async () => {
  const result = await route("GET", "/api/backend-stats", {}, fakeClients({ tableCount: 7 }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.queue, { waiting: 2, in_flight: 0 });
  assert.equal(result.body.items_in_table, 7);
});

test("GET /api/backend-stats reports queue: null when SQS is unreachable", async () => {
  const result = await route("GET", "/api/backend-stats", {}, fakeClients({ queueOk: false }));
  assert.equal(result.body.queue, null);
});

test("GET /api/thresholds proxies the fog gateway's real threshold rules", async () => {
  await withFakeFog(200, async (healthUrl, thresholdsUrl) => {
    process.env.FOG_THRESHOLDS_URL = thresholdsUrl;
    delete require.cache[require.resolve("./router")];
    const { route: routeFresh } = require("./router");
    const result = await routeFresh("GET", "/api/thresholds", {}, fakeClients());
    assert.equal(result.status, 200);
    assert.equal(result.body.temperature_c[0].limit, 27);
  });
});

test("an unmatched method/path returns 404", async () => {
  const result = await route("GET", "/api/nope", {}, fakeClients());
  assert.equal(result.status, 404);
});

test("a non-GET method on a known path returns 404 (no route registered)", async () => {
  const result = await route("POST", "/api/halls", {}, fakeClients());
  assert.equal(result.status, 404);
});

function withFakeFog(status, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(status);
        return res.end(JSON.stringify({ status: "ok" }));
      }
      if (req.url === "/thresholds") {
        res.setHeader("Content-Type", "application/json");
        return res.end(JSON.stringify({ temperature_c: [{ field: "avg", op: ">", limit: 27, key: "overheat_risk" }] }));
      }
      res.writeHead(404).end();
    });
    server.listen(0, async () => {
      try {
        const { port } = server.address();
        const base = `http://127.0.0.1:${port}`;
        await fn(`${base}/health`, `${base}/thresholds`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
        delete process.env.FOG_HEALTH_URL;
        delete process.env.FOG_THRESHOLDS_URL;
      }
    });
  });
}
