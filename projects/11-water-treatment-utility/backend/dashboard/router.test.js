"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { makeRouteTable } = require("./router");

test("resolve matches the per-plant detail route and captures the plant id", () => {
  const router = makeRouteTable();
  router.register("GET", /^\/api\/plants\/([a-z0-9-]+)$/, () => {});

  const found = router.resolve("GET", "/api/plants/plant-2");
  assert.ok(found);
  assert.equal(found.captures[1], "plant-2");
});

test("resolve matches the all-plants route with no capture group", () => {
  const router = makeRouteTable();
  router.register("GET", /^\/api\/plants$/, () => "all");

  const found = router.resolve("GET", "/api/plants");
  assert.equal(found.handler(), "all");
});

test("resolve returns null for a method that does not match any route", () => {
  const router = makeRouteTable();
  router.register("GET", /^\/api\/health$/, () => {});
  assert.equal(router.resolve("POST", "/api/health"), null);
});

test("routes are matched in registration order", () => {
  const router = makeRouteTable();
  router.register("GET", /^\/api\/plants$/, () => "all");
  router.register("GET", /^\/api\/plants\/([a-z0-9-]+)$/, () => "one");
  assert.equal(router.resolve("GET", "/api/plants").handler(), "all");
  assert.equal(router.resolve("GET", "/api/plants/plant-1").handler(), "one");
});
