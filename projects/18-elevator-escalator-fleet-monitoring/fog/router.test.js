"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRouter } = require("./router");

// All tests call dispatch() directly against method/pathname strings, no http.createServer or socket.

test("dispatch calls the single handler for an exact path match", async () => {
  const router = createRouter();
  let called = false;
  router.use("GET", "/health", async (req, res) => {
    called = true;
  });
  const matched = await router.dispatch("GET", "/health");
  assert.equal(matched, true);
  assert.equal(called, true);
});

test("dispatch returns false when no route matches", async () => {
  const router = createRouter();
  router.use("GET", "/health", async () => {});
  const matched = await router.dispatch("GET", "/nope");
  assert.equal(matched, false);
});

test("dispatch is method-sensitive", async () => {
  const router = createRouter();
  router.use("GET", "/ingest", async () => {});
  const matched = await router.dispatch("POST", "/ingest");
  assert.equal(matched, false);
});

test("dispatch captures :param segments into ctx.params", async () => {
  const router = createRouter();
  let seenParams = null;
  router.use("GET", "/api/towers/:towerId", async (req, res, ctx) => {
    seenParams = ctx.params;
  });
  await router.dispatch("GET", "/api/towers/tower-b");
  assert.deepEqual(seenParams, { towerId: "tower-b" });
});

test("dispatch composes multiple handlers in sequence, Express-style", async () => {
  const router = createRouter();
  const order = [];
  router.use(
    "POST",
    "/ingest",
    async (req, res, ctx, next) => {
      order.push("first");
      await next();
    },
    async (req, res, ctx, next) => {
      order.push("second");
    }
  );
  await router.dispatch("POST", "/ingest");
  assert.deepEqual(order, ["first", "second"]);
});

test("a handler that does not call next() short-circuits the remaining chain", async () => {
  const router = createRouter();
  const order = [];
  router.use(
    "POST",
    "/ingest",
    async (req, res, ctx, next) => {
      order.push("validate-failed");
      // deliberately does not call next()
    },
    async () => {
      order.push("handler-should-not-run");
    }
  );
  await router.dispatch("POST", "/ingest");
  assert.deepEqual(order, ["validate-failed"]);
});

test("a field written onto ctx by an earlier handler is visible to a later handler in the same chain", async () => {
  const router = createRouter();
  let seenBody = null;
  router.use(
    "POST",
    "/ingest",
    async (req, res, ctx, next) => {
      ctx.body = { sensor_type: "motor_temp_c" };
      await next();
    },
    async (req, res, ctx) => {
      seenBody = ctx.body;
    }
  );
  await router.dispatch("POST", "/ingest");
  assert.deepEqual(seenBody, { sensor_type: "motor_temp_c" });
});

test("a route with no handlers cannot be registered", () => {
  const router = createRouter();
  assert.throws(() => router.use("GET", "/x"));
});

test("segment length mismatch does not match", async () => {
  const router = createRouter();
  router.use("GET", "/api/towers/:towerId", async () => {});
  const matched = await router.dispatch("GET", "/api/towers/tower-a/extra");
  assert.equal(matched, false);
});

test("find() exposes the matched handlers and params without dispatching", () => {
  const router = createRouter();
  router.use("GET", "/api/towers/:towerId", async () => {});
  const found = router.find("GET", "/api/towers/tower-a");
  assert.equal(found.handlers.length, 1);
  assert.deepEqual(found.params, { towerId: "tower-a" });
});
