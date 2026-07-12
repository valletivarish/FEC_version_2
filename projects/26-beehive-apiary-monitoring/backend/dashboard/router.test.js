"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createRouter } = require("./router");

test("route() stores the handler as a nested plain object, table[method][path]", () => {
  const router = createRouter();
  const handler = () => "health-handler";
  router.route("GET", "/api/health", handler);
  assert.equal(router.table.GET["/api/health"], handler);
});

test("dispatch matches a route by exact method + pathname via O(1) object lookup", () => {
  const router = createRouter();
  const handler = () => "health-handler";
  router.route("GET", "/api/health", handler);

  const found = router.dispatch("GET", "/api/health");
  assert.ok(found);
  assert.equal(found.handler, handler);
  assert.equal(found.match, null);
});

test("dispatch returns null when the pathname matches but the method does not", () => {
  const router = createRouter();
  router.route("GET", "/api/readings", () => {});
  assert.equal(router.dispatch("POST", "/api/readings"), null);
});

test("dispatch returns null for a pathname with no matching entry", () => {
  const router = createRouter();
  router.route("GET", "/api/health", () => {});
  assert.equal(router.dispatch("GET", "/nope"), null);
});

test("routeParam falls back to a regex match only when the exact table misses", () => {
  const router = createRouter();
  router.route("GET", "/api/apiaries", () => "all-apiaries");
  router.routeParam("GET", /^\/api\/apiaries\/([a-z0-9-]+)$/, () => "one-apiary");

  const allFound = router.dispatch("GET", "/api/apiaries");
  assert.equal(allFound.handler(), "all-apiaries");
  assert.equal(allFound.match, null);

  const oneFound = router.dispatch("GET", "/api/apiaries/apiary-a");
  assert.ok(oneFound);
  assert.equal(oneFound.match[1], "apiary-a");
});

test("an empty router matches nothing", () => {
  const router = createRouter();
  assert.equal(router.dispatch("GET", "/anything"), null);
});
