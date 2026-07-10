"use strict";

// A declarative routing table: an ordered array of [method, regex, handler]
// tuples, matched at request time with RegExp.exec() against the request
// pathname. Capture groups in the pattern surface as match[1], match[2], ...
// passed through to the handler, giving simple path-parameter support
// without pulling in a router package. This is a fourth distinct dispatch
// mechanism, still framework-free like 10-wildfire-forest-monitoring, but
// unlike 10's hand-written if/else chain (no declarative table, no
// path-parameter support), dispatch here is pattern matching over a table
// that can be built and exercised in isolation from any HTTP server at all
// -- see router.test.js, which never touches http.createServer.
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
