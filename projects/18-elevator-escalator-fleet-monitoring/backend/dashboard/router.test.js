"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRouter } = require("./router");

test("dispatch calls the single handler for an exact path match", async () => {
  const router = createRouter();
  let called = false;
  router.use("GET", "/api/health", async () => {
    called = true;
  });
  const matched = await router.dispatch("GET", "/api/health");
  assert.equal(matched, true);
  assert.equal(called, true);
});

test("dispatch returns false when no route matches", async () => {
  const router = createRouter();
  router.use("GET", "/api/health", async () => {});
  const matched = await router.dispatch("GET", "/nope");
  assert.equal(matched, false);
});

test("dispatch captures :towerId into ctx.params for the per-site grouping endpoint", async () => {
  const router = createRouter();
  let seen = null;
  router.use("GET", "/api/towers/:towerId", async (req, res, ctx) => {
    seen = ctx.params.towerId;
  });
  await router.dispatch("GET", "/api/towers/tower-b");
  assert.equal(seen, "tower-b");
});

test("dispatch composes multiple handlers in sequence", async () => {
  const router = createRouter();
  const order = [];
  router.use(
    "GET",
    "/api/readings",
    async (req, res, ctx, next) => {
      order.push("auth-style-middleware");
      await next();
    },
    async () => {
      order.push("handler");
    }
  );
  await router.dispatch("GET", "/api/readings");
  assert.deepEqual(order, ["auth-style-middleware", "handler"]);
});

test("a shared ctx object carries values from an earlier handler to a later one", async () => {
  const router = createRouter();
  let seen = null;
  router.use(
    "GET",
    "/api/readings",
    async (req, res, ctx, next) => {
      ctx.marker = "set-by-first-handler";
      await next();
    },
    async (req, res, ctx) => {
      seen = ctx.marker;
    }
  );
  await router.dispatch("GET", "/api/readings");
  assert.equal(seen, "set-by-first-handler");
});
