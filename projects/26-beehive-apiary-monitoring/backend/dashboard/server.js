"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { openHiveClients } = require("./awsClients");
const { makeApiaryRouter } = require("./router");
const {
  HIVE_SENSOR_TYPES,
  pullRecentWindows,
  assembleApiaryCards,
  findApiaryCard,
  youngestReadingAge,
} = require("./readingsStore");
const {
  combQueueReachable,
  processorAlive,
  readCombQueueDepth,
  tallyStoredReadings,
  pingHiveGateway,
  nectarFlowing,
} = require("./pipelineStatus");
const { relayAlertRules } = require("./thresholdsProxy");

const TABLE_NAME = process.env.TABLE_NAME || "bam-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "bam-apiary-agg";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "bam-processor";
const FOG_HEALTH_URL = process.env.FOG_HEALTH_URL || "http://fog:8000/health";
const FOG_THRESHOLDS_URL = process.env.FOG_THRESHOLDS_URL || "http://fog:8000/thresholds";

const STATIC_DIR = path.join(__dirname, "static");
const CONTENT_TYPES = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };

function flushJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function streamStaticAsset(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) return flushJson(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    res.end(data);
  });
}

function tryStaticAsset(req, res, pathname) {
  const relPath = pathname === "/" ? "index.html" : pathname.replace(/^\/static\//, "").replace(/^\//, "");
  const resolved = path.join(STATIC_DIR, relPath);
  if (!resolved.startsWith(STATIC_DIR)) return false; // reject any path escaping STATIC_DIR
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) return false;
  const ext = path.extname(resolved);
  streamStaticAsset(res, resolved, CONTENT_TYPES[ext] || "application/octet-stream");
  return true;
}

function bindDeps(clients) {
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

async function deliverReadings(url, deps, res) {
  const sensorType = url.searchParams.get("sensor_type");
  const limit = parseInt(url.searchParams.get("limit") || "60", 10);
  if (!sensorType || !HIVE_SENSOR_TYPES.includes(sensorType)) {
    return flushJson(res, 400, { error: `sensor_type must be one of ${HIVE_SENSOR_TYPES.join(", ")}` });
  }
  const siteId = url.searchParams.get("site_id");
  let items = await pullRecentWindows(deps.doc, deps.tableName, sensorType, siteId ? limit * 4 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  flushJson(res, 200, { sensor_type: sensorType, items });
}

async function deliverApiaries(deps, res) {
  flushJson(res, 200, { apiaries: await assembleApiaryCards(deps.doc, deps.tableName) });
}

async function deliverApiaryDetail(deps, res, apiaryId) {
  const apiary = await findApiaryCard(deps.doc, deps.tableName, apiaryId);
  if (!apiary) return flushJson(res, 404, { error: `unknown apiary: ${apiaryId}` });
  flushJson(res, 200, apiary);
}

async function deliverHealth(deps, res) {
  const [gatewayUp, queueUp, lambdaUp, freshestAge] = await Promise.all([
    pingHiveGateway(deps.gatewayHealthUrl),
    combQueueReachable(deps.sqs, deps.queueName),
    processorAlive(deps.lambda, deps.functionName),
    youngestReadingAge(deps.doc, deps.tableName),
  ]);
  flushJson(res, 200, {
    gateway: gatewayUp,
    queue: queueUp,
    lambda: lambdaUp,
    pipeline: nectarFlowing(freshestAge),
    freshest_age_seconds: freshestAge,
  });
}

async function deliverBackendStats(deps, res) {
  const [queue, itemsInTable] = await Promise.all([
    readCombQueueDepth(deps.sqs, deps.queueName),
    tallyStoredReadings(deps.doc, deps.tableName),
  ]);
  flushJson(res, 200, { queue, items_in_table: itemsInTable });
}

async function deliverThresholds(deps, res) {
  const result = await relayAlertRules(deps.gatewayThresholdsUrl);
  flushJson(res, result.status, result.body);
}

function wireApiaryRoutes(deps) {
  const router = makeApiaryRouter();
  router.pinExact("GET", "/api/readings", async (req, res, url) => deliverReadings(url, deps, res));
  router.pinExact("GET", "/api/apiaries", async (req, res) => deliverApiaries(deps, res));
  router.pinPattern("GET", /^\/api\/apiaries\/([a-z0-9-]+)$/, async (req, res, url, match) => deliverApiaryDetail(deps, res, match[1]));
  router.pinExact("GET", "/api/health", async (req, res) => deliverHealth(deps, res));
  router.pinExact("GET", "/api/backend-stats", async (req, res) => deliverBackendStats(deps, res));
  router.pinExact("GET", "/api/thresholds", async (req, res) => deliverThresholds(deps, res));
  return router;
}

function makeRequestListener(router) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const found = router.resolveRoute(req.method, url.pathname);
      if (found) {
        await found.handler(req, res, url, found.match);
        return;
      }
      if (req.method === "GET" && tryStaticAsset(req, res, url.pathname)) return;
      return flushJson(res, 404, { error: "not found" });
    } catch (err) {
      flushJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

function createDashboardServer(clients = openHiveClients()) {
  const deps = bindDeps(clients);
  const router = wireApiaryRoutes(deps);
  return http.createServer(makeRequestListener(router));
}

function boot() {
  const app = createDashboardServer();
  app.listen(8000, () => console.log("dashboard listening on :8000"));
}

if (require.main === module) {
  boot();
}

module.exports = { createDashboardServer, bindDeps, wireApiaryRoutes };
