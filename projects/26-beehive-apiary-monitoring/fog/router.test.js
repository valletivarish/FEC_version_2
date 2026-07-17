"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApiaryRouter } = require("./router");

// All of these tests exercise resolveRoute() directly against plain method + pathname strings -- no http.createServer, no real socket, no fetch.

test("addRoute stores the handler as a nested plain object, routeTable[method][path]", () => {
  const router = createApiaryRouter();
  const handler = () => "health-handler";
  router.addRoute("GET", "/health", handler);
  assert.equal(router.routeTable.GET["/health"], handler);
});

test("resolveRoute matches a route by exact method + pathname via O(1) object lookup", () => {
  const router = createApiaryRouter();
  const handler = () => "health-handler";
  router.addRoute("GET", "/health", handler);

  const found = router.resolveRoute("GET", "/health");
  assert.ok(found);
  assert.equal(found.handler, handler);
  assert.equal(found.match, null, "an exact-path match carries no regex match object");
});

test("resolveRoute returns null when the pathname matches but the method does not", () => {
  const router = createApiaryRouter();
  router.addRoute("GET", "/ingest", () => {});
  assert.equal(router.resolveRoute("POST", "/ingest"), null);
});

test("resolveRoute returns null for a pathname with no matching entry", () => {
  const router = createApiaryRouter();
  router.addRoute("GET", "/health", () => {});
  assert.equal(router.resolveRoute("GET", "/nope"), null);
});

test("addParamRoute falls back to a regex match only when the exact table misses", () => {
  const router = createApiaryRouter();
  router.addRoute("GET", "/api/apiaries", () => "all-apiaries");
  router.addParamRoute("GET", /^\/api\/apiaries\/([a-z0-9-]+)$/, () => "one-apiary");

  const allFound = router.resolveRoute("GET", "/api/apiaries");
  assert.equal(allFound.handler(), "all-apiaries");
  assert.equal(allFound.match, null, "the exact match must win and skip the fallback array entirely");

  const oneFound = router.resolveRoute("GET", "/api/apiaries/apiary-a");
  assert.ok(oneFound);
  assert.equal(oneFound.match[1], "apiary-a");
});

test("an empty router matches nothing", () => {
  const router = createApiaryRouter();
  assert.equal(router.resolveRoute("GET", "/anything"), null);
});

test("multiple exact paths for the same method coexist without collision", () => {
  const router = createApiaryRouter();
  router.addRoute("GET", "/health", () => "health");
  router.addRoute("GET", "/thresholds", () => "thresholds");
  assert.equal(router.resolveRoute("GET", "/health").handler(), "health");
  assert.equal(router.resolveRoute("GET", "/thresholds").handler(), "thresholds");
});

test("fallback entries are matched in registration order, first match wins", () => {
  const router = createApiaryRouter();
  router.addParamRoute("GET", /^\/api\/apiaries\/a$/, () => "narrow");
  router.addParamRoute("GET", /^\/api\/apiaries\/([a-z0-9-]+)$/, () => "wide");
  assert.equal(router.resolveRoute("GET", "/api/apiaries/a").handler(), "narrow");
});
