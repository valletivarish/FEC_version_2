"use strict";

// Same declarative routing-table mechanism as fog/router.js: an ordered
// array of [method, regex, handler] tuples, matched with RegExp.exec()
// against the request pathname, with capture groups surfaced as simple
// path parameters. Used here for the per-plant grouping endpoint
// (/api/plants/:plantId) below, exercised in router.test.js independently
// of http.createServer.
function createRouter() {
  const table = [];

  function route(method, pattern, handler) {
    table.push([method, pattern, handler]);
  }

  function dispatch(method, pathname) {
    for (const [routeMethod, pattern, handler] of table) {
      if (routeMethod !== method) continue;
      const match = pattern.exec(pathname);
      if (match) return { handler, match };
    }
    return null;
  }

  return { route, dispatch, table };
}

module.exports = { createRouter };
