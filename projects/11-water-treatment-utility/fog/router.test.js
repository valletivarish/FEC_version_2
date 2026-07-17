"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildRouteTable } = require("./router");

test("dispatch matches a route by method and exact pathname", () => {
  const router = buildRouteTable();
  const handler = () => "health-handler";
  router.addRoute("GET", /^\/health$/, handler);

  const found = router.matchRoute("GET", "/health");
  assert.ok(found);
  assert.equal(found.handler, handler);
});

test("dispatch returns null when the pathname matches but the method does not", () => {
  const router = buildRouteTable();
  router.addRoute("GET", /^\/ingest$/, () => {});

  assert.equal(router.matchRoute("POST", "/ingest"), null);
});

test("dispatch returns null for a pathname with no matching pattern", () => {
  const router = buildRouteTable();
  router.addRoute("GET", /^\/health$/, () => {});

  assert.equal(router.matchRoute("GET", "/nope"), null);
});

test("dispatch surfaces regex capture groups as simple path parameters", () => {
  const router = buildRouteTable();
  router.addRoute("GET", /^\/api\/plants\/([a-z0-9-]+)$/, () => {});

  const found = router.matchRoute("GET", "/api/plants/plant-2");
  assert.ok(found);
  assert.equal(found.match[1], "plant-2");
});

test("routes are matched in registration order, first match wins", () => {
  const router = buildRouteTable();
  router.addRoute("GET", /^\/api\/plants$/, () => "all-plants");
  router.addRoute("GET", /^\/api\/plants\/([a-z0-9-]+)$/, () => "one-plant");

  const allFound = router.matchRoute("GET", "/api/plants");
  assert.equal(allFound.handler(), "all-plants");

  const oneFound = router.matchRoute("GET", "/api/plants/plant-1");
  assert.equal(oneFound.handler(), "one-plant");
});

test("an empty router matches nothing", () => {
  const router = buildRouteTable();
  assert.equal(router.matchRoute("GET", "/anything"), null);
});
