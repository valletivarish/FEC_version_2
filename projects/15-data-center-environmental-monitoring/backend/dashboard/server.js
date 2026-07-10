"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { resolveInvokeUrl, proxyRequest } = require("./apiGatewayProxy");

const ENDPOINT = process.env.AWS_ENDPOINT_URL || "http://localstack:4566";
const REGION = process.env.AWS_REGION || "eu-west-1";
const API_NAME = process.env.API_GATEWAY_NAME || "dce-api-gateway";
const STAGE_NAME = process.env.API_STAGE_NAME || "local";

const STATIC_DIR = path.join(__dirname, "static");
const CONTENT_TYPES = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function tryServeStatic(req, res, pathname) {
  const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/static\//, "").replace(/^\//, "");
  const resolved = path.join(STATIC_DIR, relPath);
  if (!resolved.startsWith(STATIC_DIR)) return false;
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) return false;
  const ext = path.extname(resolved);
  const data = fs.readFileSync(resolved);
  res.writeHead(200, { "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(data);
  return true;
}

// Deliberately simple: a manual `req.url.startsWith("/api/")` check, no
// declarative routing table and no Express framework anywhere in this
// service. This project's real architectural novelty lives in
// backend/api/ (a separate Lambda, "dce-api", fronted by a real API
// Gateway REST API) -- this static/proxy front door stays as plain as
// possible on purpose so that novelty budget reads clearly in one place.
// proxyFn is injected (defaults to the real proxyRequest) purely so
// server.test.js can exercise the /api/ branch without a live API
// Gateway.
function buildHandler(getInvokeUrlBase, proxyFn = proxyRequest) {
  return async function handler(req, res) {
    try {
      if (req.url.startsWith("/api/")) {
        const invokeUrlBase = getInvokeUrlBase();
        if (!invokeUrlBase) {
          res.writeHead(503, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ error: "API Gateway not yet resolved" }));
        }
        const rawBody = await readRawBody(req);
        const upstream = await proxyFn(invokeUrlBase, req, rawBody);
        res.writeHead(upstream.status, { "Content-Type": upstream.contentType });
        return res.end(upstream.body);
      }

      const pathname = new URL(req.url, "http://localhost").pathname;
      if (req.method === "GET" && tryServeStatic(req, res, pathname)) return;

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    } catch (err) {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "upstream error" }));
    }
  };
}

function createApp(invokeUrlBase = null, proxyFn = proxyRequest) {
  let cached = invokeUrlBase;
  const server = http.createServer(buildHandler(() => cached, proxyFn));
  server.setInvokeUrlBase = (url) => {
    cached = url;
  };
  server.getInvokeUrlBase = () => cached;
  return server;
}

async function start() {
  const app = createApp();
  app.listen(8000, () => console.log("dashboard listening on :8000"));
  try {
    const invokeUrlBase = await resolveInvokeUrl({ endpoint: ENDPOINT, region: REGION, apiName: API_NAME, stageName: STAGE_NAME });
    app.setInvokeUrlBase(invokeUrlBase);
    console.log(`resolved API Gateway invoke URL: ${invokeUrlBase}`);
  } catch (err) {
    console.log(`failed to resolve API Gateway invoke URL: ${err.message}`);
  }
}

if (require.main === module) {
  start();
}

module.exports = { createApp, buildHandler, tryServeStatic };
