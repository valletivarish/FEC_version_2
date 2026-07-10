"use strict";

// Same trie-based dispatch as fog/router.js -- one node per path segment,
// walked directly rather than scanned against a regex table or a segment
// array. Used here for the per-district grouping endpoint
// (/api/districts/:districtId), exercised in router.test.js entirely
// independently of http.createServer.
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
