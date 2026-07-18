"use strict";

const { buildClients } = require("./awsClients");
const { buildDeps, buildRouter } = require("./server");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

let warmRouter = null;
function routerFor(injected) {
  // Lambda invokes (event, context, callback); accept a third arg as clients only when it carries a doc client.
  if (injected && injected.doc) return buildRouter(buildDeps(injected));
  if (!warmRouter) warmRouter = buildRouter(buildDeps(buildClients()));
  return warmRouter;
}

function captureRes() {
  const captured = { status: 200, body: "" };
  return {
    captured,
    writeHead(status) { captured.status = status; return this; },
    end(text) { captured.body = text == null ? "" : String(text); },
  };
}

function reply(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...CORS },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

async function handler(event, _context, injectedClients) {
  const method = event.httpMethod || "GET";
  const rawPath = event.path || "/";
  if (method === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  const query = new URLSearchParams(event.queryStringParameters || {}).toString();
  const url = new URL(rawPath + (query ? `?${query}` : ""), "http://localhost");
  const res = captureRes();
  try {
    const matched = await routerFor(injectedClients).dispatch(method, url.pathname, {}, res, { url });
    if (!matched) return reply(404, { error: "not found" });
    return { statusCode: res.captured.status, headers: { "Content-Type": "application/json", ...CORS }, body: res.captured.body };
  } catch (err) {
    return reply(500, { error: err.message || "internal error" });
  }
}

module.exports = { handler, routerFor };
