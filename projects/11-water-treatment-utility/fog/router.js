"use strict";

function buildRouteTable() {
  const routeList = [];

  function addRoute(method, pattern, handler) {
    routeList.push([method, pattern, handler]);
  }

  function matchRoute(method, pathname) {
    for (const [routeMethod, pattern, handler] of routeList) {
      if (routeMethod !== method) continue;
      const match = pattern.exec(pathname);
      if (match) return { handler, match };
    }
    return null;
  }

  return { addRoute, matchRoute, routeList };
}

module.exports = { buildRouteTable };
