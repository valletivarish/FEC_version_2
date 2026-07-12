"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { buildClients } = require("./awsClients");
const {
  SENSOR_TYPES,
  latestWindowsFor,
  buildSlopeSummaries,
  getSlopeSummary,
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

const TABLE_NAME = process.env.TABLE_NAME || "ska-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "ska-slope-agg";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "ska-processor";
const FOG_HEALTH_URL = process.env.FOG_HEALTH_URL || "http://fog:8000/health";
const FOG_THRESHOLDS_URL = process.env.FOG_THRESHOLDS_URL || "http://fog:8000/thresholds";

const STATIC_DIR = path.join(__dirname, "static");
const CONTENT_TYPES = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };
const SLOPE_ID_PATTERN = /^GET \/api\/slopes\/[a-z0-9-]+$/;

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

function tryServeStatic(req, res, pathname) {
  const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/static\//, "").replace(/^\//, "");
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
  const limit = parseInt(url.searchParams.get("limit") || "60", 10);
  if (!sensorType || !SENSOR_TYPES.includes(sensorType)) {
    return sendJson(res, 400, { error: `sensor_type must be one of ${SENSOR_TYPES.join(", ")}` });
  }
  const siteId = url.searchParams.get("site_id");
  let items = await latestWindowsFor(deps.doc, deps.tableName, sensorType, siteId ? limit * 4 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  sendJson(res, 200, { sensor_type: sensorType, items });
}

// Project-specific per-site grouping endpoint: GET /api/slopes lists both
// monitored slopes (each carrying a derived risk_level for the dashboard's
// gauge view), GET /api/slopes/:slopeId returns just one.
async function handleSlopes(deps, res) {
  sendJson(res, 200, { slopes: await buildSlopeSummaries(deps.doc, deps.tableName) });
}

async function handleSlopeDetail(deps, res, slopeId) {
  const slope = await getSlopeSummary(deps.doc, deps.tableName, slopeId);
  if (!slope) return sendJson(res, 404, { error: `unknown slope: ${slopeId}` });
  sendJson(res, 200, slope);
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

// HTTP routing dispatches on a template-literal key built as
// `${req.method} ${pathname}`, matched inside a switch(true) block -- the
// same mechanism as fog/app.js. Fixed routes match with `key === "..."`;
// the one path-parameterised route (per-slope detail) matches with a
// `SLOPE_ID_PATTERN.test(key)` case, with the id itself pulled back out of
// url.pathname inside that case rather than via a regex capture group. No
// sibling Node dashboard backend in this portfolio dispatches this way: 03/
// 06 use Express; 10/15 use hand-written if/else chains; 11's backend/
// dashboard/router.js and 18/22's router.js/trie all hold their own
// separate routing-table data structure rather than switching directly on
// a composed method+path string.
function buildRequestHandler(deps) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const key = `${req.method} ${url.pathname}`;

      // Every case below must `return await`, not just `return`: an
      // un-awaited async call's rejection escapes this try/catch entirely
      // (it becomes an unhandled promise rejection, not a caught exception)
      // and crashes the whole process instead of degrading to a 500.
      switch (true) {
        case key === "GET /api/readings":
          return await handleReadings(url, deps, res);

        case key === "GET /api/slopes":
          return await handleSlopes(deps, res);

        case SLOPE_ID_PATTERN.test(key):
          return await handleSlopeDetail(deps, res, url.pathname.split("/").pop());

        case key === "GET /api/health":
          return await handleHealth(deps, res);

        case key === "GET /api/backend-stats":
          return await handleBackendStats(deps, res);

        case key === "GET /api/thresholds":
          return await handleThresholds(deps, res);

        default:
          if (req.method === "GET" && tryServeStatic(req, res, url.pathname)) return;
          return sendJson(res, 404, { error: "not found" });
      }
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
