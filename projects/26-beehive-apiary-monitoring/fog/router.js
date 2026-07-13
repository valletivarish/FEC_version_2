"use strict";

// Nested plain-object dispatch table (table[method][exactPath] = handler) giving O(1) exact-path lookup, with a secondary [method, regex, handler] tuple array consulted only for parameterized routes -- a dispatch shape distinct from this portfolio's other Node routers (Express, if/else chains, regex-tuple arrays, middleware chains, tries).
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
