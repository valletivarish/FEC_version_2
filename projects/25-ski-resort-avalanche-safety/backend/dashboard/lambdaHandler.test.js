"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createHandler, findRoute, matchTemplate } = require("./lambdaHandler");

test("matchTemplate matches a literal path with no params", () => {
  assert.deepEqual(matchTemplate("/api/slopes", "/api/slopes"), {});
});

test("matchTemplate extracts a named path parameter", () => {
  assert.deepEqual(matchTemplate("/api/slopes/:slopeId", "/api/slopes/slope-a"), { slopeId: "slope-a" });
});

test("matchTemplate returns null when segment counts differ", () => {
  assert.equal(matchTemplate("/api/slopes/:slopeId", "/api/slopes/slope-a/extra"), null);
});

test("matchTemplate returns null when a literal segment does not match", () => {
  assert.equal(matchTemplate("/api/slopes", "/api/readings"), null);
});

test("findRoute locates every registered route by method and path", () => {
  assert.ok(findRoute("GET", "/api/readings"));
  assert.ok(findRoute("GET", "/api/slopes"));
  assert.ok(findRoute("GET", "/api/slopes/slope-b"));
  assert.ok(findRoute("GET", "/api/health"));
  assert.ok(findRoute("GET", "/api/backend-stats"));
  assert.ok(findRoute("GET", "/api/thresholds"));
});

test("findRoute returns null for an unregistered method or path", () => {
  assert.equal(findRoute("POST", "/api/slopes"), null);
  assert.equal(findRoute("GET", "/api/unknown"), null);
});

function fakeDeps(overrides = {}) {
  return {
    doc: { send: async () => ({ Items: [], Count: 0 }) },
    sqs: { send: async () => ({ Attributes: {} }) },
    lambda: { send: async () => ({ Configuration: { State: "Active" } }) },
    tableName: "ska-readings",
    queueName: "ska-slope-agg",
    functionName: "ska-processor",
    gatewayHealthUrl: "http://127.0.0.1:1/health",
    gatewayThresholdsUrl: "http://127.0.0.1:1/thresholds",
    ...overrides,
  };
}

test("handler returns a 200 API Gateway response shape for GET /api/slopes", async () => {
  const handler = createHandler(fakeDeps());
  const res = await handler({ httpMethod: "GET", path: "/api/slopes", queryStringParameters: null });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Content-Type"], "application/json");
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
  assert.ok(Array.isArray(JSON.parse(res.body).slopes));
});

test("handler extracts the slopeId path parameter for GET /api/slopes/:slopeId", async () => {
  const handler = createHandler(fakeDeps());
  const res = await handler({ httpMethod: "GET", path: "/api/slopes/slope-a", queryStringParameters: null });
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).site_id, "slope-a");
});

test("handler returns 404 for an unrecognised slopeId path parameter", async () => {
  const handler = createHandler(fakeDeps());
  const res = await handler({ httpMethod: "GET", path: "/api/slopes/slope-z", queryStringParameters: null });
  assert.equal(res.statusCode, 404);
  assert.equal(JSON.parse(res.body).error, "unknown slope: slope-z");
});

test("handler returns 400 for GET /api/readings with an invalid sensor_type", async () => {
  const handler = createHandler(fakeDeps());
  const res = await handler({
    httpMethod: "GET",
    path: "/api/readings",
    queryStringParameters: { sensor_type: "not_a_real_sensor" },
  });
  assert.equal(res.statusCode, 400);
});

test("handler returns 404 not found for an unmatched route", async () => {
  const handler = createHandler(fakeDeps());
  const res = await handler({ httpMethod: "GET", path: "/api/nope", queryStringParameters: null });
  assert.equal(res.statusCode, 404);
});

test("handler degrades to a 500 JSON body instead of throwing when a dependency rejects", async () => {
  const doc = { send: async () => { throw new Error("dynamo down"); } };
  const handler = createHandler(fakeDeps({ doc }));
  const res = await handler({ httpMethod: "GET", path: "/api/slopes", queryStringParameters: null });
  assert.equal(res.statusCode, 500);
  assert.equal(JSON.parse(res.body).error, "dynamo down");
});

test("handler strips a trailing slash before matching", async () => {
  const handler = createHandler(fakeDeps());
  const res = await handler({ httpMethod: "GET", path: "/api/slopes/", queryStringParameters: null });
  assert.equal(res.statusCode, 200);
});
