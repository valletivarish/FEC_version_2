"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRouter } = require("./router");

// All of these tests exercise dispatch() directly against plain method +
// pathname strings -- no http.createServer, no real socket, no fetch --
// proving the routing table logic is independently testable.

test("route() stores the handler as a nested plain object, table[method][path]", () => {
  const router = createRouter();
  const handler = () => "health-handler";
  router.route("GET", "/health", handler);
  assert.equal(router.table.GET["/health"], handler);
});

test("dispatch matches a route by exact method + pathname via O(1) object lookup", () => {
  const router = createRouter();
  const handler = () => "health-handler";
  router.route("GET", "/health", handler);

  const found = router.dispatch("GET", "/health");
  assert.ok(found);
  assert.equal(found.handler, handler);
  assert.equal(found.match, null, "an exact-path match carries no regex match object");
});

test("dispatch returns null when the pathname matches but the method does not", () => {
  const router = createRouter();
  router.route("GET", "/ingest", () => {});
  assert.equal(router.dispatch("POST", "/ingest"), null);
});

test("dispatch returns null for a pathname with no matching entry", () => {
  const router = createRouter();
  router.route("GET", "/health", () => {});
  assert.equal(router.dispatch("GET", "/nope"), null);
});

test("routeParam falls back to a regex match only when the exact table misses", () => {
  const router = createRouter();
  router.route("GET", "/api/apiaries", () => "all-apiaries");
  router.routeParam("GET", /^\/api\/apiaries\/([a-z0-9-]+)$/, () => "one-apiary");

  const allFound = router.dispatch("GET", "/api/apiaries");
  assert.equal(allFound.handler(), "all-apiaries");
  assert.equal(allFound.match, null, "the exact match must win and skip the fallback array entirely");

  const oneFound = router.dispatch("GET", "/api/apiaries/apiary-a");
  assert.ok(oneFound);
  assert.equal(oneFound.match[1], "apiary-a");
});

test("an empty router matches nothing", () => {
  const router = createRouter();
  assert.equal(router.dispatch("GET", "/anything"), null);
});

test("multiple exact paths for the same method coexist without collision", () => {
  const router = createRouter();
  router.route("GET", "/health", () => "health");
  router.route("GET", "/thresholds", () => "thresholds");
  assert.equal(router.dispatch("GET", "/health").handler(), "health");
  assert.equal(router.dispatch("GET", "/thresholds").handler(), "thresholds");
});

test("fallback entries are matched in registration order, first match wins", () => {
  const router = createRouter();
  router.routeParam("GET", /^\/api\/apiaries\/a$/, () => "narrow");
  router.routeParam("GET", /^\/api\/apiaries\/([a-z0-9-]+)$/, () => "wide");
  assert.equal(router.dispatch("GET", "/api/apiaries/a").handler(), "narrow");
});
