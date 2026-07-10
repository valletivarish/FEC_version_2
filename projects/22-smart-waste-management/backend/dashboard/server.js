"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { buildClients } = require("./awsClients");
const { createRouter } = require("./router");
const {
  SENSOR_TYPES,
  buildDistrictSummaries,
  getDistrictSummary,
  buildPriorityList,
  freshestAgeSeconds,
} = require("./readingsStore");
const { latestWindowsFor } = require("./readingsStore");
const {
  isQueueReachable,
  isLambdaActive,
  readQueueCounters,
  countTableItems,
  checkGateway,
  isPipelineFlowing,
} = require("./pipelineStatus");
const { fetchThresholds } = require("./thresholdsProxy");

const TABLE_NAME = process.env.TABLE_NAME || "swm-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "swm-district-agg";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "swm-processor";
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
// and rejecting anything that escapes it, kept as a fallback outside the
// trie router below rather than pulling in a static-file middleware
// package.
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
  let items = await latestWindowsFor(deps.doc, deps.tableName, sensorType, siteId ? limit * 2 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  sendJson(res, 200, { sensor_type: sensorType, items });
}

// Project-specific per-site grouping endpoint: GET /api/districts lists
// both collection districts, GET /api/districts/:districtId (path
// parameter captured by the trie router) returns just one.
async function handleDistricts(deps, res) {
  sendJson(res, 200, { districts: await buildDistrictSummaries(deps.doc, deps.tableName) });
}

async function handleDistrictDetail(deps, res, districtId) {
  const district = await getDistrictSummary(deps.doc, deps.tableName, districtId);
  if (!district) return sendJson(res, 404, { error: `unknown district: ${districtId}` });
  sendJson(res, 200, district);
}

// The primary structural view's backing endpoint: both districts flattened
// into one list and sorted by fill_level_pct descending (bins needing
// collection soonest first) -- see readingsStore.js's buildPriorityList.
async function handlePriority(deps, res) {
  const districts = await buildDistrictSummaries(deps.doc, deps.tableName);
  sendJson(res, 200, { bins: buildPriorityList(districts) });
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

function buildRouter(deps) {
  const router = createRouter();
  router.route("GET", "/api/readings", async (req, res, params, url) => handleReadings(url, deps, res));
  router.route("GET", "/api/districts", async (req, res) => handleDistricts(deps, res));
  router.route("GET", "/api/districts/:districtId", async (req, res, params) => handleDistrictDetail(deps, res, params.districtId));
  router.route("GET", "/api/priority", async (req, res) => handlePriority(deps, res));
  router.route("GET", "/api/health", async (req, res) => handleHealth(deps, res));
  router.route("GET", "/api/backend-stats", async (req, res) => handleBackendStats(deps, res));
  router.route("GET", "/api/thresholds", async (req, res) => handleThresholds(deps, res));
  return router;
}

// Every request passes through this outer try/catch, translating any
// uncaught exception into a structured 500 rather than a killed request.
function buildRequestHandler(router) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const found = router.dispatch(req.method, url.pathname);
      if (found) {
        await found.handler(req, res, found.params, url);
        return;
      }
      if (req.method === "GET" && tryServeStatic(req, res, url.pathname)) return;
      return sendJson(res, 404, { error: "not found" });
    } catch (err) {
      sendJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

function createApp(clients = buildClients()) {
  const deps = buildDeps(clients);
  const router = buildRouter(deps);
  return http.createServer(buildRequestHandler(router));
}

function start() {
  const app = createApp();
  app.listen(8000, () => console.log("dashboard listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, buildDeps, buildRouter };
