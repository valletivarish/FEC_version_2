"use strict";

// Declarative [method, regex, handler] table matched via RegExp.exec() for capture-group path params -- the fourth distinct dispatch mechanism in this portfolio, unlike 10-wildfire-forest-monitoring's hand-written if/else chain.
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
