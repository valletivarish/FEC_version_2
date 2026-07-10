"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRouter } = require("./router");

// All of these tests exercise dispatch() directly against plain method +
// pathname strings -- no http.createServer, no real socket, no fetch --
// proving the routing table logic is independently testable.

test("dispatch matches a route by method and exact pathname", () => {
  const router = createRouter();
  const handler = () => "health-handler";
  router.route("GET", /^\/health$/, handler);

  const found = router.dispatch("GET", "/health");
  assert.ok(found);
  assert.equal(found.handler, handler);
});

test("dispatch returns null when the pathname matches but the method does not", () => {
  const router = createRouter();
  router.route("GET", /^\/ingest$/, () => {});

  assert.equal(router.dispatch("POST", "/ingest"), null);
});

test("dispatch returns null for a pathname with no matching pattern", () => {
  const router = createRouter();
  router.route("GET", /^\/health$/, () => {});

  assert.equal(router.dispatch("GET", "/nope"), null);
});

test("dispatch surfaces regex capture groups as simple path parameters", () => {
  const router = createRouter();
  router.route("GET", /^\/api\/plants\/([a-z0-9-]+)$/, () => {});

  const found = router.dispatch("GET", "/api/plants/plant-2");
  assert.ok(found);
  assert.equal(found.match[1], "plant-2");
});

test("routes are matched in registration order, first match wins", () => {
  const router = createRouter();
  router.route("GET", /^\/api\/plants$/, () => "all-plants");
  router.route("GET", /^\/api\/plants\/([a-z0-9-]+)$/, () => "one-plant");

  const allFound = router.dispatch("GET", "/api/plants");
  assert.equal(allFound.handler(), "all-plants");

  const oneFound = router.dispatch("GET", "/api/plants/plant-1");
  assert.equal(oneFound.handler(), "one-plant");
});

test("an empty router matches nothing", () => {
  const router = createRouter();
  assert.equal(router.dispatch("GET", "/anything"), null);
});
