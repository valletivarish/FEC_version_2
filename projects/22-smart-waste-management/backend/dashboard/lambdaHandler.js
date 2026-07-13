"use strict";

const { buildClients } = require("./awsClients");
const { createRouter } = require("./router");
const { buildDeps, buildRouter } = require("./server");

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

function fakeResponse() {
  const state = { status: 200, headers: {}, body: "" };
  return {
    state,
    writeHead(status, headers) {
      state.status = status;
      Object.assign(state.headers, headers || {});
    },
    end(body) {
      state.body = body || "";
    },
  };
}

let cachedRouter;
function router() {
  if (!cachedRouter) cachedRouter = buildRouter(buildDeps(buildClients()));
  return cachedRouter;
}

// Function URL entry point: reuses the same router/handlers server.js uses
// for the Docker-hosted dashboard, via a fake ServerResponse shim, so the
// business logic (readingsStore/pipelineStatus/thresholdsProxy) is not
// duplicated between the container and Lambda deployment targets.
exports.handler = async (event) => {
  const method = event.requestContext?.http?.method || "GET";
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  const pathname = event.rawPath || "/";
  const query = new URLSearchParams(event.rawQueryString || "");
  const url = { pathname, searchParams: query };
  const found = router().dispatch(method, pathname);

  if (!found) {
    return { statusCode: 404, headers: { "Content-Type": "application/json", ...CORS_HEADERS }, body: JSON.stringify({ error: "not found" }) };
  }

  const res = fakeResponse();
  await found.handler({ method }, res, found.params, url);
  const headers = {};
  for (const [key, value] of Object.entries({ ...res.state.headers, ...CORS_HEADERS })) {
    headers[key] = String(value);
  }
  return {
    statusCode: res.state.status,
    headers,
    body: res.state.body,
  };
};
