"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRouter } = require("./router");

test("dispatch matches the per-plant detail route and captures the plant id", () => {
  const router = createRouter();
  router.route("GET", /^\/api\/plants\/([a-z0-9-]+)$/, () => {});

  const found = router.dispatch("GET", "/api/plants/plant-2");
  assert.ok(found);
  assert.equal(found.match[1], "plant-2");
});

test("dispatch matches the all-plants route with no capture group", () => {
  const router = createRouter();
  router.route("GET", /^\/api\/plants$/, () => "all");

  const found = router.dispatch("GET", "/api/plants");
  assert.equal(found.handler(), "all");
});

test("dispatch returns null for a method that does not match any route", () => {
  const router = createRouter();
  router.route("GET", /^\/api\/health$/, () => {});
  assert.equal(router.dispatch("POST", "/api/health"), null);
});

test("routes are matched in registration order", () => {
  const router = createRouter();
  router.route("GET", /^\/api\/plants$/, () => "all");
  router.route("GET", /^\/api\/plants\/([a-z0-9-]+)$/, () => "one");
  assert.equal(router.dispatch("GET", "/api/plants").handler(), "all");
  assert.equal(router.dispatch("GET", "/api/plants/plant-1").handler(), "one");
});
