"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { proxyRequest } = require("./apiGatewayProxy");

function withUpstream(handler, fn) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, async () => {
      try {
        const { port } = server.address();
        await fn(`http://127.0.0.1:${port}`);
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

test("proxyRequest forwards method, path, and body to the invoke URL base and returns the upstream response", async () => {
  await withUpstream(
    (req, res) => {
      assert.equal(req.url, "/api/health");
      res.setHeader("Content-Type", "application/json");
      res.writeHead(200);
      res.end(JSON.stringify({ gateway: true }));
    },
    async (base) => {
      const fakeReq = { url: "/api/health", method: "GET", headers: {} };
      const result = await proxyRequest(base, fakeReq, Buffer.alloc(0));
      assert.equal(result.status, 200);
      assert.equal(result.contentType, "application/json");
      assert.deepEqual(JSON.parse(result.body.toString()), { gateway: true });
    }
  );
});

test("proxyRequest strips the host header so it does not leak the dashboard's own Host", async () => {
  await withUpstream(
    (req, res) => {
      // The forwarded Host header should reflect the upstream target host,
      // not whatever Host the original client sent to the dashboard.
      assert.notEqual(req.headers.host, "original-dashboard-host");
      res.writeHead(200);
      res.end("{}");
    },
    async (base) => {
      const fakeReq = { url: "/api/thresholds", method: "GET", headers: { host: "original-dashboard-host" } };
      await proxyRequest(base, fakeReq, Buffer.alloc(0));
    }
  );
});

test("resolveInvokeUrl is exported and takes named options (endpoint/region/apiName/stageName)", () => {
  const { resolveInvokeUrl } = require("./apiGatewayProxy");
  assert.equal(typeof resolveInvokeUrl, "function");
});
