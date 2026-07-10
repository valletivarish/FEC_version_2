"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { jsonResponse } = require("./handler");

test("jsonResponse builds an API Gateway AWS_PROXY-shaped response", () => {
  const resp = jsonResponse(200, { ok: true });
  assert.equal(resp.statusCode, 200);
  assert.equal(resp.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(resp.body), { ok: true });
});

test("the handler module exports a single exports.handler async function", () => {
  const { handler } = require("./handler");
  assert.equal(typeof handler, "function");
});

test("handler routes a well-formed API Gateway proxy event to a 404 for an unknown path", async () => {
  const { handler } = require("./handler");
  const event = { httpMethod: "GET", path: "/api/nope", queryStringParameters: null };
  const resp = await handler(event);
  assert.equal(resp.statusCode, 404);
  assert.equal(resp.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(resp.body), { error: "not found" });
});

test("handler returns a 500 JSON envelope when the event itself is malformed (top-level try/catch)", async () => {
  // Passing null makes `event.httpMethod` throw inside the handler before
  // any routing happens, exercising the top-level try/catch that turns any
  // uncaught exception into a well-formed API Gateway response instead of
  // an unhandled rejection reaching the Lambda runtime.
  const { handler } = require("./handler");
  const resp = await handler(null);
  assert.equal(resp.statusCode, 500);
  assert.equal(resp.headers["Content-Type"], "application/json");
  const body = JSON.parse(resp.body);
  assert.equal(typeof body.error, "string");
});
