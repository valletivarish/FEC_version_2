"use strict";

// Middleware-chain router: dispatch() composes a matched route's handlers via a next() continuation.
function createRouter() {
  const routes = [];

  function use(method, path, ...handlers) {
    if (handlers.length === 0) throw new Error(`route ${method} ${path} needs at least one handler`);
    routes.push({ method, path, handlers, segments: splitPath(path) });
  }

  function splitPath(path) {
    return path.split("/").filter((segment) => segment.length > 0);
  }

  function matchSegments(routeSegments, pathname) {
    const pathSegments = splitPath(pathname);
    if (routeSegments.length !== pathSegments.length) return null;
    const params = {};
    for (let i = 0; i < routeSegments.length; i++) {
      const routeSegment = routeSegments[i];
      const pathSegment = pathSegments[i];
      if (routeSegment.startsWith(":")) {
        params[routeSegment.slice(1)] = decodeURIComponent(pathSegment);
        continue;
      }
      if (routeSegment !== pathSegment) return null;
    }
    return params;
  }

  function find(method, pathname) {
    for (const route of routes) {
      if (route.method !== method) continue;
      const params = matchSegments(route.segments, pathname);
      if (params) return { handlers: route.handlers, params };
    }
    return null;
  }

  async function dispatch(method, pathname, req, res, ctx = {}) {
    const found = find(method, pathname);
    if (!found) return false;

    const chainCtx = { ...ctx, params: found.params };
    let index = 0;
    async function next() {
      if (index >= found.handlers.length) return;
      const handler = found.handlers[index];
      index += 1;
      await handler(req, res, chainCtx, next);
    }
    await next();
    return true;
  }

  return { use, find, dispatch, routes };
}

module.exports = { createRouter };
