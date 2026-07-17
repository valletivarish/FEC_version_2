"use strict";

// Same declarative routing-table mechanism as fog/router.js: an ordered
// array of [method, regex, handler] tuples, matched with RegExp.exec()
// against the request pathname, with capture groups surfaced as simple
// path parameters. Used here for the per-plant grouping endpoint
// (/api/plants/:plantId) below, exercised in router.test.js independently
// of http.createServer.
function makeRouteTable() {
  const entries = [];

  function register(method, pattern, handler) {
    entries.push([method, pattern, handler]);
  }

  function resolve(method, pathname) {
    for (const [routeMethod, pattern, handler] of entries) {
      if (routeMethod !== method) continue;
      const captures = pattern.exec(pathname);
      if (captures) return { handler, captures };
    }
    return null;
  }

  return { register, resolve, entries };
}

module.exports = { makeRouteTable };
