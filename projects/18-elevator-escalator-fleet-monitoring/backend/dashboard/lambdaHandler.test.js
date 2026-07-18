"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const { handler } = require("./lambdaHandler");

const fakeClients = () => ({ doc: { send: async () => ({ Items: [] }) }, sqs: {}, lambda: {} });

test("OPTIONS preflight returns 200 with CORS and empty body", async () => {
  const res = await handler({ httpMethod: "OPTIONS", path: "/api/towers" });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers["Access-Control-Allow-Origin"], "*");
  assert.strictEqual(res.body, "");
});

test("unknown path returns 404 json", async () => {
  const res = await handler({ httpMethod: "GET", path: "/api/nope" }, {}, fakeClients());
  assert.strictEqual(res.statusCode, 404);
  assert.match(res.body, /not found/);
});

test("GET /api/readings without sensor_type returns 400 (behaviour preserved)", async () => {
  const res = await handler({ httpMethod: "GET", path: "/api/readings" }, {}, fakeClients());
  assert.strictEqual(res.statusCode, 400);
});

test("GET /api/towers returns 200 with a towers list and CORS", async () => {
  const res = await handler({ httpMethod: "GET", path: "/api/towers" }, {}, fakeClients());
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.headers["Access-Control-Allow-Origin"], "*");
  assert.ok(JSON.parse(res.body).towers);
});

test("a runtime callback as third arg is not mistaken for clients (no crash)", async () => {
  const res = await handler({ httpMethod: "OPTIONS", path: "/api/health" }, {}, () => {});
  assert.strictEqual(res.statusCode, 200);
});
