"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { handler } = require("./lambdaHandler");

const evt = (method, path, query) => ({ httpMethod: method, path, queryStringParameters: query || null });
const fakeClients = { doc: {}, sqs: {}, lambda: {} };

test("OPTIONS returns 200 with the CORS origin header", async () => {
  const res = await handler(evt("OPTIONS", "/api/apiaries"), null, fakeClients);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});

test("an unknown route returns 404", async () => {
  const res = await handler(evt("GET", "/nope"), null, fakeClients);
  assert.equal(res.statusCode, 404);
});

test("readings without a sensor_type returns 400", async () => {
  const res = await handler(evt("GET", "/api/readings", {}), null, fakeClients);
  assert.equal(res.statusCode, 400);
});

test("every response carries the CORS origin header", async () => {
  const res = await handler(evt("GET", "/api/readings", {}), null, fakeClients);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});

test("a Lambda callback in the third arg is not mistaken for injected clients", async () => {
  const res = await handler(evt("OPTIONS", "/api/health"), null, () => {});
  assert.equal(res.statusCode, 200);
});
