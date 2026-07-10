"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRouter } = require("./router");

test("dispatch matches a literal route with no parameters", () => {
  const router = createRouter();
  router.route("GET", "/api/health", () => "health");
  const found = router.dispatch("GET", "/api/health");
  assert.ok(found);
  assert.equal(found.handler(), "health");
});

test("dispatch returns null for an unregistered path", () => {
  const router = createRouter();
  router.route("GET", "/api/health", () => "health");
  assert.equal(router.dispatch("GET", "/nope"), null);
});

test("a :districtId param segment captures by tree position", () => {
  const router = createRouter();
  router.route("GET", "/api/districts/:districtId", (params) => params);
  const found = router.dispatch("GET", "/api/districts/district-b");
  assert.deepEqual(found.params, { districtId: "district-b" });
});

test("/api/districts and /api/districts/:districtId coexist without collision", () => {
  const router = createRouter();
  router.route("GET", "/api/districts", () => "list");
  router.route("GET", "/api/districts/:districtId", () => "detail");
  assert.equal(router.dispatch("GET", "/api/districts").handler(), "list");
  assert.equal(router.dispatch("GET", "/api/districts/district-a").params.districtId, "district-a");
});

test("dispatch returns null when the method does not match", () => {
  const router = createRouter();
  router.route("GET", "/api/readings", () => "get");
  assert.equal(router.dispatch("DELETE", "/api/readings"), null);
});
