"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { fetchThresholds } = require("./thresholdsProxy");

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

test("fetchThresholds returns the upstream JSON body on success", async () => {
  const rules = { temperature_c: [{ field: "avg", op: ">", limit: 42, key: "extreme_heat" }] };
  await withUpstream(
    (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(rules));
    },
    async (base) => {
      const result = await fetchThresholds(`${base}/thresholds`);
      assert.equal(result.ok, true);
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, rules);
    }
  );
});

test("fetchThresholds returns a 502 wrapper when the upstream is unreachable", async () => {
  // Nothing is listening on this port -- a real connection-refused case,
  // exercising the actual network failure path rather than a hand-rolled
  // rejected promise.
  const result = await fetchThresholds("http://127.0.0.1:1/thresholds");
  assert.equal(result.ok, false);
  assert.equal(result.status, 502);
  assert.deepEqual(result.body, { error: "thresholds unavailable" });
});

test("fetchThresholds returns a 502 wrapper when the upstream responds with an error status", async () => {
  await withUpstream(
    (req, res) => {
      res.writeHead(500);
      res.end("boom");
    },
    async (base) => {
      const result = await fetchThresholds(`${base}/thresholds`);
      assert.equal(result.ok, false);
      assert.equal(result.status, 502);
    }
  );
});

test("fetchThresholds takes the URL as a plain parameter, not a module-level captured env var", () => {
  assert.equal(fetchThresholds.length, 1, "fetchThresholds should accept exactly one parameter: the URL");
});
