"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { handleRequest, normalizePath } = require("./lambdaHandler");

function sendAnswering(handlers) {
  return {
    send: async (command) => {
      const name = command.constructor.name;
      if (!(name in handlers)) throw new Error(`unexpected command ${name}`);
      return handlers[name](command);
    },
  };
}

function windowItem(overrides = {}) {
  return {
    sensor_type: "smoke_density_ppm",
    site_id: "station-1",
    latest: 40,
    min: 30,
    max: 55,
    avg: 41.5,
    unit: "ppm",
    window_end: new Date().toISOString(),
    alerts: [],
    ...overrides,
  };
}

function stubDeps() {
  const doc = sendAnswering({
    QueryCommand: () => ({ Items: [windowItem(), windowItem({ site_id: "station-2" })] }),
    ScanCommand: () => ({ Count: 12 }),
  });
  const sqs = sendAnswering({
    GetQueueUrlCommand: () => ({ QueueUrl: "http://q" }),
    GetQueueAttributesCommand: () => ({
      Attributes: { QueueArn: "arn", ApproximateNumberOfMessages: "1", ApproximateNumberOfMessagesNotVisible: "0" },
    }),
  });
  const lambda = sendAnswering({
    GetFunctionCommand: () => ({ Configuration: { State: "Active" } }),
  });
  return {
    doc,
    sqs,
    lambda,
    tableName: "wfm-readings",
    queueName: "wfm-station-agg",
    functionName: "wfm-processor",
    // Port 1 is never listening, so gateway checks fail fast and honestly.
    gatewayHealthUrl: "http://127.0.0.1:1/health",
    gatewayThresholdsUrl: "http://127.0.0.1:1/thresholds",
  };
}

function event(path, query = null, method = "GET") {
  return { httpMethod: method, path, queryStringParameters: query };
}

test("normalizePath strips a trailing slash but leaves the root alone", () => {
  assert.equal(normalizePath("/api/stations/"), "/api/stations");
  assert.equal(normalizePath("/api/stations"), "/api/stations");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath(undefined), "/");
});

test("GET /api/readings rejects an unknown sensor type with 400", async () => {
  const resp = await handleRequest(event("/api/readings", { sensor_type: "lava_flow" }), stubDeps());
  assert.equal(resp.statusCode, 400);
  assert.match(JSON.parse(resp.body).error, /sensor_type must be one of/);
});

test("GET /api/readings returns items and filters by site_id", async () => {
  const resp = await handleRequest(
    event("/api/readings", { sensor_type: "smoke_density_ppm", site_id: "station-2", limit: "5" }),
    stubDeps(),
  );
  assert.equal(resp.statusCode, 200);
  const body = JSON.parse(resp.body);
  assert.equal(body.sensor_type, "smoke_density_ppm");
  assert.ok(body.items.every((item) => item.site_id === "station-2"));
});

test("GET /api/stations returns both stations with a fire risk index", async () => {
  const resp = await handleRequest(event("/api/stations"), stubDeps());
  assert.equal(resp.statusCode, 200);
  const { stations } = JSON.parse(resp.body);
  assert.deepEqual(stations.map((s) => s.site_id), ["station-1", "station-2"]);
  for (const station of stations) assert.equal(typeof station.fire_risk_index, "number");
});

test("GET /api/health reports queue and lambda true, gateway false when fog is unreachable", async () => {
  const resp = await handleRequest(event("/api/health"), stubDeps());
  assert.equal(resp.statusCode, 200);
  const body = JSON.parse(resp.body);
  assert.equal(body.queue, true);
  assert.equal(body.lambda, true);
  assert.equal(body.gateway, false);
});

test("GET /api/backend-stats returns counters and the paginated item count", async () => {
  const resp = await handleRequest(event("/api/backend-stats"), stubDeps());
  assert.equal(resp.statusCode, 200);
  const body = JSON.parse(resp.body);
  assert.equal(body.items_in_table, 12);
  assert.deepEqual(body.queue, { waiting: 1, in_flight: 0 });
});

test("GET /api/thresholds degrades to the proxy's 502 wrapper when fog is down", async () => {
  const resp = await handleRequest(event("/api/thresholds"), stubDeps());
  assert.equal(resp.statusCode, 502);
});

test("an unknown path falls off the end of the chain as a 404", async () => {
  const resp = await handleRequest(event("/api/nope"), stubDeps());
  assert.equal(resp.statusCode, 404);
});

test("a matching path under the wrong method also declines to a 404", async () => {
  const resp = await handleRequest(event("/api/stations", null, "POST"), stubDeps());
  assert.equal(resp.statusCode, 404);
});

test("every response carries the CORS header, including errors", async () => {
  const deps = stubDeps();
  for (const path of ["/api/stations", "/api/nope", "/api/readings"]) {
    const resp = await handleRequest(event(path), deps);
    assert.equal(resp.headers["Access-Control-Allow-Origin"], "*", `missing CORS header on ${path}`);
  }
});

test("a handler exception surfaces as a structured 500, not a crash", async () => {
  const deps = stubDeps();
  deps.doc = { send: async () => { throw new Error("table gone"); } };
  const resp = await handleRequest(event("/api/readings", { sensor_type: "smoke_density_ppm" }), deps);
  assert.equal(resp.statusCode, 500);
  assert.equal(JSON.parse(resp.body).error, "table gone");
  assert.equal(resp.headers["Access-Control-Allow-Origin"], "*");
});
