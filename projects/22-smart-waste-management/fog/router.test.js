"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRouter } = require("./router");

test("dispatch matches a literal route with no parameters", () => {
  const router = createRouter();
  router.route("GET", "/health", () => "health");
  const found = router.dispatch("GET", "/health");
  assert.ok(found);
  assert.equal(found.handler(), "health");
  assert.deepEqual(found.params, {});
});

test("dispatch returns null for an unregistered path", () => {
  const router = createRouter();
  router.route("GET", "/health", () => "health");
  assert.equal(router.dispatch("GET", "/nope"), null);
});

test("dispatch returns null when the method does not match a registered path", () => {
  const router = createRouter();
  router.route("GET", "/districts", () => "list");
  assert.equal(router.dispatch("POST", "/districts"), null);
});

test("a :param segment captures the matching path segment by tree position, not regex", () => {
  const router = createRouter();
  router.route("GET", "/api/districts/:districtId", (params) => params);
  const found = router.dispatch("GET", "/api/districts/district-b");
  assert.ok(found);
  assert.deepEqual(found.params, { districtId: "district-b" });
});

test("param segments are URL-decoded", () => {
  const router = createRouter();
  router.route("GET", "/api/districts/:districtId", () => {});
  const found = router.dispatch("GET", "/api/districts/district%20a");
  assert.equal(found.params.districtId, "district a");
});

test("literal children and param children can coexist at the same tree depth", () => {
  const router = createRouter();
  router.route("GET", "/api/districts", () => "list");
  router.route("GET", "/api/districts/:districtId", () => "detail");
  assert.deepEqual(router.dispatch("GET", "/api/districts").params, {});
  assert.deepEqual(router.dispatch("GET", "/api/districts/district-a").params, { districtId: "district-a" });
});

test("routes of different lengths do not collide", () => {
  const router = createRouter();
  router.route("GET", "/api/readings", () => "readings");
  router.route("GET", "/api/readings/extra", () => "extra");
  assert.equal(router.dispatch("GET", "/api/readings").handler(), "readings");
  assert.equal(router.dispatch("GET", "/api/readings/extra").handler(), "extra");
  assert.equal(router.dispatch("GET", "/api/readings/extra/toolong"), null);
});

test("multiple methods can be registered on the same path independently", () => {
  const router = createRouter();
  router.route("GET", "/ingest", () => "get");
  router.route("POST", "/ingest", () => "post");
  assert.equal(router.dispatch("GET", "/ingest").handler(), "get");
  assert.equal(router.dispatch("POST", "/ingest").handler(), "post");
});
