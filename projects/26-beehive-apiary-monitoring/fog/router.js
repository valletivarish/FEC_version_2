"use strict";

// Exact-path lookup via routeTable[method][path]; parameterized paths fall back to a [method, regex, handler] scan.
function createApiaryRouter() {
  const routeTable = { GET: {}, POST: {}, PUT: {}, DELETE: {} };
  const paramRoutes = [];

  function addRoute(method, path, handler) {
    if (!routeTable[method]) routeTable[method] = {};
    routeTable[method][path] = handler;
  }

  function addParamRoute(method, pattern, handler) {
    paramRoutes.push([method, pattern, handler]);
  }

  function resolveRoute(method, pathname) {
    const directHandler = routeTable[method] && routeTable[method][pathname];
    if (directHandler) return { handler: directHandler, match: null };

    for (const [pmMethod, pattern, handler] of paramRoutes) {
      if (pmMethod !== method) continue;
      const match = pattern.exec(pathname);
      if (match) return { handler, match };
    }
    return null;
  }

  return { addRoute, addParamRoute, resolveRoute, routeTable, paramRoutes };
}

module.exports = { createApiaryRouter };
