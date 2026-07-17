"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { fetchGatewayThresholds } = require("./thresholdsProxy");

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

test("fetchGatewayThresholds returns the real upstream JSON on success (real HTTP request)", async () => {
  await withUpstream(
    (req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ph_level: [{ field: "avg", op: "<", limit: 6.5, key: "acidic_violation" }] }));
    },
    async (base) => {
      const result = await fetchGatewayThresholds(`${base}/thresholds`);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.equal(result.body.ph_level[0].limit, 6.5);
    }
  );
});

test("fetchGatewayThresholds returns a 502 shape when the upstream responds with an error status", async () => {
  await withUpstream(
    (req, res) => {
      res.writeHead(500);
      res.end("boom");
    },
    async (base) => {
      const result = await fetchGatewayThresholds(`${base}/thresholds`);
      assert.equal(result.ok, false);
      assert.equal(result.status, 502);
    }
  );
});

test("fetchGatewayThresholds returns a 502 shape when the upstream is unreachable (real connection failure)", async () => {
  const result = await fetchGatewayThresholds("http://127.0.0.1:1/thresholds");
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.match(result.body.error, /unavailable/);
});
