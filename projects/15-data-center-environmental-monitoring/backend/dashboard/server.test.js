"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("./server");

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

test("GET / serves the static index.html", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/html/);
    const text = await res.text();
    assert.match(text, /<!doctype html>/i);
  });
});

test("GET /static/style.css is served with the right content type", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/static/style.css`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /text\/css/);
  });
});

test("GET /nowhere returns a 404 JSON error for an unknown non-api path", async () => {
  await withServer(createApp(), async (base) => {
    const res = await fetch(`${base}/nowhere`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not found" });
  });
});

test("GET /api/* returns 503 before the API Gateway invoke URL has been resolved", async () => {
  await withServer(createApp(null), async (base) => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 503);
  });
});

// This is the core "reverse proxy, do not implement /api/* yourself" test:
// the dashboard never builds the JSON response body itself, it forwards
// the request to the (fake, injected) proxy function and returns exactly
// what comes back, request path included.
test("GET /api/* reverse-proxies to the resolved invoke URL once one is set, forwarding the request path", async () => {
  const calls = [];
  const fakeProxy = async (invokeUrlBase, req) => {
    calls.push({ invokeUrlBase, url: req.url, method: req.method });
    return { status: 200, contentType: "application/json", body: Buffer.from(JSON.stringify({ halls: [] })) };
  };
  const app = createApp("http://localstack:4566/restapis/abc123/local/_user_request_", fakeProxy);
  await withServer(app, async (base) => {
    const res = await fetch(`${base}/api/halls`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { halls: [] });
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].invokeUrlBase, "http://localstack:4566/restapis/abc123/local/_user_request_");
  assert.equal(calls[0].url, "/api/halls");
});

test("the dashboard server holds no /api/* handling logic of its own -- server.js source has no api- route dispatch table", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const src = fs.readFileSync(path.join(__dirname, "server.js"), "utf8");
  assert.ok(!/DynamoDB|SQSClient|LambdaClient|@aws-sdk\/client-api-gateway/.test(src), "server.js must not talk to AWS services directly, only reverse-proxy via apiGatewayProxy.js");
});

test("setInvokeUrlBase/getInvokeUrlBase let the invoke URL be resolved exactly once, after listen()", async () => {
  const app = createApp(null);
  assert.equal(app.getInvokeUrlBase(), null);
  app.setInvokeUrlBase("http://localstack:4566/restapis/xyz/local/_user_request_");
  assert.equal(app.getInvokeUrlBase(), "http://localstack:4566/restapis/xyz/local/_user_request_");
});
