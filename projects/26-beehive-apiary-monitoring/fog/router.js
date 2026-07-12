"use strict";

// A nested plain-object dispatch table: table[method][exactPath] = handler.
// This is a genuinely different dispatch shape from every Node sibling in
// this portfolio: 03-patient-vitals and 06-offshore-wind-farm both use
// Express; 10-wildfire-forest-monitoring's fog/app.js and 15-data-center-
// environmental-monitoring's fog/app.js both use a hand-written if/else
// chain with no path-parameter support; 11-water-treatment-utility's
// fog/router.js and backend/dashboard/router.js (and 15's own
// backend/api/router.js) use an ordered array of [method, regex, handler]
// tuples matched at request time with RegExp.exec(); 18-elevator-escalator-
// fleet-monitoring uses a segment-array linear scan with an Express-style
// middleware next() chain; 22-smart-waste-management uses a prefix tree
// (trie), one node per path segment. None of those is a plain object keyed
// first by HTTP method and then by the exact path string.
//
// Dispatching an exact path here is a two-level property lookup,
// table[method][pathname] -- O(1) by construction, no scanning, no regex
// engine invoked at all for the common case. A path with a parameter (this
// project's GET /api/apiaries/:apiaryId on the dashboard side) cannot be
// expressed as an exact object key, so a short, deliberately secondary
// array of [method, regex, handler] tuples is consulted only when the exact
// lookup above misses -- registered via routeParam(), not route().
function createRouter() {
  const table = { GET: {}, POST: {}, PUT: {}, DELETE: {} };
  const fallback = [];

  function route(method, path, handler) {
    if (!table[method]) table[method] = {};
    table[method][path] = handler;
  }

  function routeParam(method, pattern, handler) {
    fallback.push([method, pattern, handler]);
  }

  function dispatch(method, pathname) {
    const exactHandler = table[method] && table[method][pathname];
    if (exactHandler) return { handler: exactHandler, match: null };

    for (const [fbMethod, pattern, handler] of fallback) {
      if (fbMethod !== method) continue;
      const match = pattern.exec(pathname);
      if (match) return { handler, match };
    }
    return null;
  }

  return { route, routeParam, dispatch, table, fallback };
}

module.exports = { createRouter };
