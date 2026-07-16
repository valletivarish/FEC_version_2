"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const FAKE_FOG_PORT = 18476;
process.env.FOG_THRESHOLDS_URL = `http://127.0.0.1:${FAKE_FOG_PORT}/thresholds`;

const { createHandler, normalizePath, buildQueryString } = require("./lambdaHandler");

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
    { sensor_type: "wind_speed_ms", site_id: "turbine-1", window_end: "t0", latest: 9, min: 7, max: 11, avg: 9, unit: "m/s", alerts: [] },
    { sensor_type: "wind_speed_ms", site_id: "turbine-2", window_end: "t0", latest: 4, min: 2, max: 6, avg: 4, unit: "m/s", alerts: [] },
  ];
  const doc = { send: fakeSend({
    QueryCommand: () => ({ Items: items }),
    ScanCommand: () => ({ Count: 3 }),
  })};
  const sqs = { send: fakeSend({
    GetQueueUrlCommand: () => ({ QueueUrl: "http://q/owf-turbine-agg" }),
    GetQueueAttributesCommand: () => ({ Attributes: { ApproximateNumberOfMessages: "1", ApproximateNumberOfMessagesNotVisible: "0", QueueArn: "arn" } }),
  })};
  const lambda = { send: fakeSend({
    GetFunctionCommand: () => ({ Configuration: { State: "Active" } }),
  })};
  return { doc, sqs, lambda };
}

// A client whose AWS SDK calls always throw -- used to prove a given
// request never actually reached the Express app (and therefore never
// touched a router that would have called into these clients).
function poisonedClients() {
  const boom = async () => { throw new Error("must not be called"); };
  return { doc: { send: boom }, sqs: { send: boom }, lambda: { send: boom } };
}

function apiEvent(overrides) {
  return {
    httpMethod: "GET",
    path: "/api/readings",
    queryStringParameters: null,
    headers: { Host: "example.com" },
    body: null,
    isBase64Encoded: false,
    ...overrides,
  };
}

test("GET /api/readings reaches the real Express handler and returns real data", async () => {
  const handler = createHandler(buildFakeClients());
  const res = await handler(apiEvent({ queryStringParameters: { sensor_type: "wind_speed_ms", limit: "10" } }));

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.sensor_type, "wind_speed_ms");
  assert.equal(body.items.length, 2);
  assert.deepEqual(body.items.map((i) => i.site_id).sort(), ["turbine-1", "turbine-2"]);
});

test("a query string parameter reaches req.query in the underlying route handler", async () => {
  const handler = createHandler(buildFakeClients());
  const res = await handler(apiEvent({
    queryStringParameters: { sensor_type: "wind_speed_ms", site_id: "turbine-2" },
  }));

  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  // readings.js only applies this filter by reading req.query.site_id --
  // the single turbine-2 row surviving proves the query string made it
  // through the bridge and into Express's own query-parsing middleware.
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].site_id, "turbine-2");
});

test("an unmatched /api route falls through to Express's own 404", async () => {
  const handler = createHandler(buildFakeClients());
  const res = await handler(apiEvent({ path: "/api/does-not-exist", queryStringParameters: null }));

  assert.equal(res.statusCode, 404);
  // Express's finalhandler renders an HTML "Cannot GET ..." document --
  // a different shape than the bridge's own JSON 404 below, confirming
  // this 404 genuinely came from inside the Express app, not the bridge.
  assert.match(res.body, /Cannot GET \/api\/does-not-exist/);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});

test("a non-API path is 404ed by the bridge itself, without invoking Express", async () => {
  const handler = createHandler(poisonedClients());

  const root = await handler(apiEvent({ path: "/", queryStringParameters: null }));
  assert.equal(root.statusCode, 404);
  assert.deepEqual(JSON.parse(root.body), { error: "not found" });
  assert.equal(root.headers["Content-Type"], "application/json");
  assert.equal(root.headers["Access-Control-Allow-Origin"], "*");

  const asset = await handler(apiEvent({ path: "/static/dashboard.js", queryStringParameters: null }));
  assert.equal(asset.statusCode, 404);
  assert.deepEqual(JSON.parse(asset.body), { error: "not found" });
});

test("OPTIONS returns 200 with no body and never reaches Express", async () => {
  // poisonedClients() would blow up the instant any router handler ran,
  // so a clean 200 here proves the preflight was answered by the bridge.
  const handler = createHandler(poisonedClients());
  const res = await handler(apiEvent({ httpMethod: "OPTIONS", path: "/api/readings" }));

  assert.equal(res.statusCode, 200);
  assert.equal(res.body, "");
  assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
});

test("CORS header is present on every response shape: success, 404, and a real error", async () => {
  const handler = createHandler(buildFakeClients());

  const ok = await handler(apiEvent({ queryStringParameters: { sensor_type: "wind_speed_ms" } }));
  const notFound = await handler(apiEvent({ path: "/api/nope", queryStringParameters: null }));
  const preflight = await handler(apiEvent({ httpMethod: "OPTIONS" }));

  for (const res of [ok, notFound, preflight]) {
    assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
  }

  // No fake fog server is listening on FOG_THRESHOLDS_URL here, so this
  // exercises status.js's own catch block -- a genuine downstream error,
  // not just an unmatched route.
  const thresholdsFailure = await handler(apiEvent({ path: "/api/thresholds", queryStringParameters: null }));
  assert.equal(thresholdsFailure.statusCode, 502);
  assert.equal(thresholdsFailure.headers["Access-Control-Allow-Origin"], "*");
  assert.deepEqual(JSON.parse(thresholdsFailure.body), { error: "thresholds unavailable" });
});

test("GET /api/thresholds proxies the fog gateway's real rules through the bridge", async () => {
  const handler = createHandler(buildFakeClients());
  const fakeRules = { blade_vibration_mm: [{ field: "avg", op: ">", limit: 8, key: "structural_risk" }] };

  await withFakeFog(fakeRules, async () => {
    const res = await handler(apiEvent({ path: "/api/thresholds", queryStringParameters: null }));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(JSON.parse(res.body), fakeRules);
    assert.equal(res.headers["Access-Control-Allow-Origin"], "*");
  });
});

test("GET /api/farm-grid and /api/health also flow through the bridge unchanged", async () => {
  const handler = createHandler(buildFakeClients());

  const grid = await handler(apiEvent({ path: "/api/farm-grid", queryStringParameters: null }));
  assert.equal(grid.statusCode, 200);
  assert.ok(JSON.parse(grid.body).tiles.length >= 1);

  const health = await handler(apiEvent({ path: "/api/health", queryStringParameters: null }));
  assert.equal(health.statusCode, 200);
  const healthBody = JSON.parse(health.body);
  assert.equal(healthBody.queue, true);
  assert.equal(healthBody.lambda, true);
});

test("a JSON request body is decoded and delivered on the request stream", async () => {
  const handler = createHandler(buildFakeClients());
  const payload = JSON.stringify({ probe: true });

  // No route in this app reads a body, so this only needs to prove the
  // bridge doesn't choke on translating event.body -- it should behave
  // exactly like the equivalent bodiless request for an existing GET route.
  const res = await handler(apiEvent({
    queryStringParameters: { sensor_type: "wind_speed_ms" },
    headers: { "Content-Type": "application/json" },
    body: payload,
  }));

  assert.equal(res.statusCode, 200);
});

test("a base64-encoded body is decoded before being handed to the request stream", async () => {
  const handler = createHandler(buildFakeClients());
  const res = await handler(apiEvent({
    queryStringParameters: { sensor_type: "wind_speed_ms" },
    body: Buffer.from(JSON.stringify({ probe: true })).toString("base64"),
    isBase64Encoded: true,
  }));

  assert.equal(res.statusCode, 200);
});

test("normalizePath trims a single trailing slash but leaves the root alone", () => {
  assert.equal(normalizePath("/api/readings/"), "/api/readings");
  assert.equal(normalizePath("/api/readings"), "/api/readings");
  assert.equal(normalizePath("/"), "/");
  assert.equal(normalizePath(undefined), "/");
});

test("buildQueryString encodes multiple parameters and skips undefined values", () => {
  assert.equal(buildQueryString(null), "");
  assert.equal(buildQueryString({}), "");
  assert.equal(buildQueryString({ a: "1", b: undefined }), "?a=1");
  const qs = buildQueryString({ sensor_type: "wind speed", limit: "5" });
  assert.equal(qs, "?sensor_type=wind+speed&limit=5");
});
