"use strict";

// Prefix-tree (trie) path router. Every sibling Node service in this
// portfolio dispatches with either an ordered array of [method, regex,
// handler] tuples matched by RegExp.exec() (03/06's Express routers under
// the hood, 11's fog/router.js + backend/dashboard/router.js,
// 15-data-center-environmental-monitoring's backend/api/router.js ROUTES
// array), a hand-written if/else chain with no path parameters at all
// (10-wildfire-forest-monitoring's fog/app.js, 15's fog/app.js), or a
// segment-array linear scan with an Express-style next() middleware chain
// (18-elevator-escalator-fleet-monitoring's fog/router.js). This router is
// none of those: routes are registered into an actual tree, one node per
// path segment, and dispatch() walks that tree segment-by-segment instead
// of scanning a list of patterns. A ":name" segment becomes a single
// "param child" slot on its parent node (RFC-style path params, matching
// segments by tree position rather than by a regex capture group), so
// lookup cost tracks the path's depth, not the number of registered routes.
function createNode() {
  return { children: new Map(), paramChild: null, paramName: null, handlers: new Map() };
}

function splitPath(path) {
  return path.split("/").filter((segment) => segment.length > 0);
}

function createRouter() {
  const root = createNode();

  function route(method, path, handler) {
    let node = root;
    for (const segment of splitPath(path)) {
      if (segment.startsWith(":")) {
        if (!node.paramChild) node.paramChild = createNode();
        node.paramChild.paramName = segment.slice(1);
        node = node.paramChild;
      } else {
        if (!node.children.has(segment)) node.children.set(segment, createNode());
        node = node.children.get(segment);
      }
    }
    node.handlers.set(method, handler);
  }

  function dispatch(method, pathname) {
    let node = root;
    const params = {};
    for (const segment of splitPath(pathname)) {
      if (node.children.has(segment)) {
        node = node.children.get(segment);
      } else if (node.paramChild) {
        params[node.paramChild.paramName] = decodeURIComponent(segment);
        node = node.paramChild;
      } else {
        return null;
      }
    }
    const handler = node.handlers.get(method);
    if (!handler) return null;
    return { handler, params };
  }

  return { route, dispatch, root };
}

module.exports = { createRouter };
