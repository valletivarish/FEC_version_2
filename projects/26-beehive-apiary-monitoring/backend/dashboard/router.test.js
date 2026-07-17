"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { makeApiaryRouter } = require("./router");

test("pinExact stores the handler as a nested plain object, exactTable[method][path]", () => {
  const router = makeApiaryRouter();
  const handler = () => "health-handler";
  router.pinExact("GET", "/api/health", handler);
  assert.equal(router.exactTable.GET["/api/health"], handler);
});

test("resolveRoute matches a route by exact method + pathname via O(1) object lookup", () => {
  const router = makeApiaryRouter();
  const handler = () => "health-handler";
  router.pinExact("GET", "/api/health", handler);

  const found = router.resolveRoute("GET", "/api/health");
  assert.ok(found);
  assert.equal(found.handler, handler);
  assert.equal(found.match, null);
});

test("resolveRoute returns null when the pathname matches but the method does not", () => {
  const router = makeApiaryRouter();
  router.pinExact("GET", "/api/readings", () => {});
  assert.equal(router.resolveRoute("POST", "/api/readings"), null);
});

test("resolveRoute returns null for a pathname with no matching entry", () => {
  const router = makeApiaryRouter();
  router.pinExact("GET", "/api/health", () => {});
  assert.equal(router.resolveRoute("GET", "/nope"), null);
});

test("pinPattern falls back to a regex match only when the exact table misses", () => {
  const router = makeApiaryRouter();
  router.pinExact("GET", "/api/apiaries", () => "all-apiaries");
  router.pinPattern("GET", /^\/api\/apiaries\/([a-z0-9-]+)$/, () => "one-apiary");

  const allFound = router.resolveRoute("GET", "/api/apiaries");
  assert.equal(allFound.handler(), "all-apiaries");
  assert.equal(allFound.match, null);

  const oneFound = router.resolveRoute("GET", "/api/apiaries/apiary-a");
  assert.ok(oneFound);
  assert.equal(oneFound.match[1], "apiary-a");
});

test("an empty router matches nothing", () => {
  const router = makeApiaryRouter();
  assert.equal(router.resolveRoute("GET", "/anything"), null);
});
