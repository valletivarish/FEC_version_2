"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

// Point the fog health/thresholds URLs at a closed local port so the health
// check fails fast (gateway:false) instead of hanging on DNS for "fog".
process.env.FOG_HEALTH_URL = "http://127.0.0.1:1/health";
process.env.FOG_THRESHOLDS_URL = "http://127.0.0.1:1/thresholds";

const { handler } = require("./lambdaHandler");

function fakeSend(handlers) {
  return async (command) => {
    const name = command.constructor.name;
    return handlers[name] ? handlers[name](command) : {};
  };
}

function buildFakeClients() {
  const items = [
    { sensor_type: "ph_level", site_id: "plant-1", window_end: "2026-01-01T00:00:00Z", latest: 7.0, min: 6.8, max: 7.2, avg: 7.0, unit: "pH", alerts: [] },
    { sensor_type: "ph_level", site_id: "plant-2", window_end: "2026-01-01T00:00:00Z", latest: 6.9, min: 6.7, max: 7.1, avg: 6.9, unit: "pH", alerts: [] },
  ];
  return {
    doc: { send: fakeSend({
      QueryCommand: () => ({ Items: items }),
      ScanCommand: () => ({ Count: 12 }),
    }) },
    sqs: { send: fakeSend({
      GetQueueUrlCommand: () => ({ QueueUrl: "http://q/wtu-plant-agg" }),
      GetQueueAttributesCommand: () => ({ Attributes: { ApproximateNumberOfMessages: "0", ApproximateNumberOfMessagesNotVisible: "0", QueueArn: "arn:q" } }),
    }) },
    lambda: { send: fakeSend({
      GetFunctionCommand: () => ({ Configuration: { State: "Active" } }),
    }) },
  };
}

const evt = (method, path, query) => ({ httpMethod: method, path, queryStringParameters: query || null });

test("OPTIONS preflight short-circuits with a wildcard CORS header", async () => {
  const res = await handler(evt("OPTIONS", "/api/plants"), null, buildFakeClients());
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});

test("GET /api/plants returns both plants with CORS", async () => {
  const res = await handler(evt("GET", "/api/plants"), null, buildFakeClients());
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.plants));
  assert.equal(body.plants.length, 2);
});

test("GET /api/readings without sensor_type is a 400", async () => {
  const res = await handler(evt("GET", "/api/readings", {}), null, buildFakeClients());
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /sensor_type/);
});

test("GET /api/readings with a valid sensor_type returns items", async () => {
  const res = await handler(evt("GET", "/api/readings", { sensor_type: "ph_level" }), null, buildFakeClients());
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.sensor_type, "ph_level");
  assert.ok(Array.isArray(body.items));
});

test("GET /api/health returns the four pipeline fields", async () => {
  const res = await handler(evt("GET", "/api/health"), null, buildFakeClients());
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  for (const k of ["gateway", "queue", "lambda", "pipeline"]) assert.ok(k in body);
});

test("GET /api/backend-stats returns the item count", async () => {
  const res = await handler(evt("GET", "/api/backend-stats"), null, buildFakeClients());
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).items_in_table, 12);
});

test("GET /api/plants/:plantId path parameter is matched", async () => {
  const res = await handler(evt("GET", "/api/plants/plant-1"), null, buildFakeClients());
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});

test("an unknown route is a 404 that still carries CORS", async () => {
  const res = await handler(evt("GET", "/not-a-route"), null, buildFakeClients());
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});
