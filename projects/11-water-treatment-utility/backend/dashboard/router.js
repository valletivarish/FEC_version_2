"use strict";

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
