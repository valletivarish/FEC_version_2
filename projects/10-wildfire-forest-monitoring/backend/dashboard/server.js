"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { buildClients } = require("./awsClients");
const {
  SENSOR_TYPES,
  latestWindowsFor,
  buildStationSummaries,
  freshestAgeSeconds,
} = require("./readingsStore");
const {
  isQueueReachable,
  isLambdaActive,
  readQueueCounters,
  countTableItems,
  checkGateway,
  isPipelineFlowing,
} = require("./pipelineStatus");
const { fetchThresholds } = require("./thresholdsProxy");

const TABLE_NAME = process.env.TABLE_NAME || "wfm-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "wfm-station-agg";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "wfm-processor";
const FOG_HEALTH_URL = process.env.FOG_HEALTH_URL || "http://fog:8000/health";
const FOG_THRESHOLDS_URL = process.env.FOG_THRESHOLDS_URL || "http://fog:8000/thresholds";

const STATIC_DIR = path.join(__dirname, "static");
const CONTENT_TYPES = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function serveStaticFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    res.end(data);
  });
}

// Static assets are served by resolving the request path under STATIC_DIR
// and rejecting any resolved path that escapes it (blocks ../ traversal),
// rather than pulling in a static-file middleware package.
function tryServeStatic(req, res, url) {
  const relPath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/static\//, "").replace(/^\//, "");
  const resolved = path.join(STATIC_DIR, relPath);
  if (!resolved.startsWith(STATIC_DIR)) return false;
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) return false;
  const ext = path.extname(resolved);
  serveStaticFile(res, resolved, CONTENT_TYPES[ext] || "application/octet-stream");
  return true;
}

function buildDeps(clients) {
  return {
    doc: clients.doc,
    sqs: clients.sqs,
    lambda: clients.lambda,
    tableName: TABLE_NAME,
    queueName: QUEUE_NAME,
    functionName: FUNCTION_NAME,
    gatewayHealthUrl: FOG_HEALTH_URL,
    gatewayThresholdsUrl: FOG_THRESHOLDS_URL,
  };
}

async function handleReadings(url, deps, res) {
  const sensorType = url.searchParams.get("sensor_type");
  const siteId = url.searchParams.get("site_id");
  const limit = parseInt(url.searchParams.get("limit") || "60", 10);
  if (!sensorType || !SENSOR_TYPES.includes(sensorType)) {
    return sendJson(res, 400, { error: `sensor_type must be one of ${SENSOR_TYPES.join(", ")}` });
  }
  let items = await latestWindowsFor(deps.doc, deps.tableName, sensorType, siteId ? limit * 4 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  sendJson(res, 200, { sensor_type: sensorType, items });
}

async function handleStations(deps, res) {
  sendJson(res, 200, { stations: await buildStationSummaries(deps.doc, deps.tableName) });
}

async function handleHealth(deps, res) {
  const [gatewayUp, queueUp, lambdaUp, freshestAge] = await Promise.all([
    checkGateway(deps.gatewayHealthUrl),
    isQueueReachable(deps.sqs, deps.queueName),
    isLambdaActive(deps.lambda, deps.functionName),
    freshestAgeSeconds(deps.doc, deps.tableName),
  ]);
  sendJson(res, 200, {
    gateway: gatewayUp,
    queue: queueUp,
    lambda: lambdaUp,
    pipeline: isPipelineFlowing(freshestAge),
    freshest_age_seconds: freshestAge,
  });
}

async function handleBackendStats(deps, res) {
  const [queue, itemsInTable] = await Promise.all([
    readQueueCounters(deps.sqs, deps.queueName),
    countTableItems(deps.doc, deps.tableName),
  ]);
  sendJson(res, 200, { queue, items_in_table: itemsInTable });
}

async function handleThresholds(deps, res) {
  const result = await fetchThresholds(deps.gatewayThresholdsUrl);
  sendJson(res, result.status, result.body);
}

// Manual URL parsing + hand-written dispatch, no Express/router package.
// Every branch is wrapped in the outer try/catch below so an uncaught
// exception anywhere in a handler still yields a structured 500 instead of
// killing the request (or the process).
function buildRequestHandler(deps) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");

      if (req.method === "GET" && url.pathname === "/api/readings") return await handleReadings(url, deps, res);
      if (req.method === "GET" && url.pathname === "/api/stations") return await handleStations(deps, res);
      if (req.method === "GET" && url.pathname === "/api/health") return await handleHealth(deps, res);
      if (req.method === "GET" && url.pathname === "/api/backend-stats") return await handleBackendStats(deps, res);
      if (req.method === "GET" && url.pathname === "/api/thresholds") return await handleThresholds(deps, res);

      if (req.method === "GET" && tryServeStatic(req, res, url)) return;

      return sendJson(res, 404, { error: "not found" });
    } catch (err) {
      sendJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

function createApp(clients = buildClients()) {
  const deps = buildDeps(clients);
  return http.createServer(buildRequestHandler(deps));
}

function start() {
  const app = createApp();
  app.listen(8000, () => console.log("dashboard listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, buildDeps };
