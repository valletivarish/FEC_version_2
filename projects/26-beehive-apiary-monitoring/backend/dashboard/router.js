"use strict";

// Exact-match table is the O(1) common path; the regex fallback list is only consulted on a miss, for the one parameterized route (GET /api/apiaries/:apiaryId).
function makeApiaryRouter() {
  const exactTable = { GET: {}, POST: {}, PUT: {}, DELETE: {} };
  const patternRoutes = [];

  function pinExact(method, path, handler) {
    if (!exactTable[method]) exactTable[method] = {};
    exactTable[method][path] = handler;
  }

  function pinPattern(method, pattern, handler) {
    patternRoutes.push([method, pattern, handler]);
  }

  function resolveRoute(method, pathname) {
    const exactHandler = exactTable[method] && exactTable[method][pathname];
    if (exactHandler) return { handler: exactHandler, match: null };

    for (const [fbMethod, pattern, handler] of patternRoutes) {
      if (fbMethod !== method) continue;
      const match = pattern.exec(pathname);
      if (match) return { handler, match };
    }
    return null;
  }

  return { pinExact, pinPattern, resolveRoute, exactTable, patternRoutes };
}

module.exports = { makeApiaryRouter };
