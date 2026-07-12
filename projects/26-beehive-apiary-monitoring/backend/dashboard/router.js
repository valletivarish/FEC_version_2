"use strict";

// Same nested plain-object dispatch table as fog/router.js -- see that
// file's header comment for the full comparison against every sibling
// project's routing idiom. table[method][exactPath] = handler is an O(1)
// lookup for the common case; a short fallback array of
// [method, regex, handler] tuples (registered via routeParam()) is only
// consulted when the exact lookup misses, which is what lets this service's
// one parameterized route -- GET /api/apiaries/:apiaryId -- work without
// making every other route pay for regex matching.
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
