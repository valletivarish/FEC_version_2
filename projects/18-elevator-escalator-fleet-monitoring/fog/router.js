"use strict";

// Middleware-chain router: routes hold multiple handlers composed via a next() continuation, Express-style.
function createRouter() {
  const routes = [];

  function use(method, path, ...handlers) {
    if (handlers.length === 0) throw new Error(`route ${method} ${path} needs at least one handler`);
    routes.push({ method, path, handlers, segments: splitPath(path) });
  }

  function splitPath(path) {
    return path.split("/").filter((segment) => segment.length > 0);
  }

  // Segment-by-segment match, capturing ":name" segments into a params object.
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

  // Walks the matched route's handler chain; a handler that skips next() short-circuits the rest.
  async function dispatch(method, pathname, req, res, ctx = {}) {
    const found = find(method, pathname);
    if (!found) return false;

    // One shared ctx object for the whole chain, so fields written by earlier handlers stay visible.
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
