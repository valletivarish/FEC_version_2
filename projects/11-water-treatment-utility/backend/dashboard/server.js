"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { openAwsClients } = require("./awsClients");
const { makeRouteTable } = require("./router");
const {
  PLANT_SENSOR_TYPES,
  recentWindowsFor,
  assemblePlantSummaries,
  findPlantSummary,
  newestReadingAgeSeconds,
} = require("./readingsStore");
const {
  probeQueueReachable,
  probeProcessorActive,
  sampleQueueDepth,
  tallyStoredReadings,
  probeGatewayHealth,
  pipelineIsCurrent,
} = require("./pipelineStatus");
const { fetchGatewayThresholds } = require("./thresholdsProxy");

const TABLE_NAME = process.env.TABLE_NAME || "wtu-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "wtu-plant-agg";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "wtu-processor";
const FOG_HEALTH_URL = process.env.FOG_HEALTH_URL || "http://fog:8000/health";
const FOG_THRESHOLDS_URL = process.env.FOG_THRESHOLDS_URL || "http://fog:8000/thresholds";

const STATIC_ROOT = path.join(__dirname, "static");
const MIME_BY_EXT = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript" };

function writeJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

function streamStaticFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) return writeJson(res, 404, { error: "not found" });
    res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
    res.end(data);
  });
}

// Static assets are served by resolving the request path under STATIC_ROOT
// and rejecting anything that escapes it, kept as a fallback outside the
// declarative route table below (a wildcard-per-file-extension entry in the
// table would be more awkward than useful here) rather than pulling in a
// static-file middleware package.
function attemptStaticServe(req, res, pathname) {
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/static\//, "").replace(/^\//, "");
  const resolvedPath = path.join(STATIC_ROOT, relativePath);
  if (!resolvedPath.startsWith(STATIC_ROOT)) return false;
  if (!fs.existsSync(resolvedPath) || fs.statSync(resolvedPath).isDirectory()) return false;
  const ext = path.extname(resolvedPath);
  streamStaticFile(res, resolvedPath, MIME_BY_EXT[ext] || "application/octet-stream");
  return true;
}

function assembleDeps(clients) {
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

async function serveReadings(url, deps, res) {
  const sensorType = url.searchParams.get("sensor_type");
  const limit = parseInt(url.searchParams.get("limit") || "60", 10);
  if (!sensorType || !PLANT_SENSOR_TYPES.includes(sensorType)) {
    return writeJson(res, 400, { error: `sensor_type must be one of ${PLANT_SENSOR_TYPES.join(", ")}` });
  }
  const siteId = url.searchParams.get("site_id");
  let items = await recentWindowsFor(deps.doc, deps.tableName, sensorType, siteId ? limit * 4 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  writeJson(res, 200, { sensor_type: sensorType, items });
}

// Project-specific per-site grouping endpoint: GET /api/plants lists both
// treatment plants, GET /api/plants/:plantId (path parameter captured by
// the router below) returns just one.
async function servePlants(deps, res) {
  writeJson(res, 200, { plants: await assemblePlantSummaries(deps.doc, deps.tableName) });
}

async function servePlantDetail(deps, res, plantId) {
  const plant = await findPlantSummary(deps.doc, deps.tableName, plantId);
  if (!plant) return writeJson(res, 404, { error: `unknown plant: ${plantId}` });
  writeJson(res, 200, plant);
}

async function serveHealth(deps, res) {
  const [gatewayUp, queueUp, lambdaUp, freshestAge] = await Promise.all([
    probeGatewayHealth(deps.gatewayHealthUrl),
    probeQueueReachable(deps.sqs, deps.queueName),
    probeProcessorActive(deps.lambda, deps.functionName),
    newestReadingAgeSeconds(deps.doc, deps.tableName),
  ]);
  writeJson(res, 200, {
    gateway: gatewayUp,
    queue: queueUp,
    lambda: lambdaUp,
    pipeline: pipelineIsCurrent(freshestAge),
    freshest_age_seconds: freshestAge,
  });
}

async function serveBackendStats(deps, res) {
  const [queue, itemsInTable] = await Promise.all([
    sampleQueueDepth(deps.sqs, deps.queueName),
    tallyStoredReadings(deps.doc, deps.tableName),
  ]);
  writeJson(res, 200, { queue, items_in_table: itemsInTable });
}

async function serveThresholds(deps, res) {
  const result = await fetchGatewayThresholds(deps.gatewayThresholdsUrl);
  writeJson(res, result.status, result.body);
}

function wireRoutes(deps) {
  const router = makeRouteTable();
  router.register("GET", /^\/api\/readings$/, async (req, res, url) => serveReadings(url, deps, res));
  router.register("GET", /^\/api\/plants$/, async (req, res) => servePlants(deps, res));
  router.register("GET", /^\/api\/plants\/([a-z0-9-]+)$/, async (req, res, url, captures) => servePlantDetail(deps, res, captures[1]));
  router.register("GET", /^\/api\/health$/, async (req, res) => serveHealth(deps, res));
  router.register("GET", /^\/api\/backend-stats$/, async (req, res) => serveBackendStats(deps, res));
  router.register("GET", /^\/api\/thresholds$/, async (req, res) => serveThresholds(deps, res));
  return router;
}

// Every request passes through this outer try/catch, translating any
// uncaught exception into a structured 500 rather than a killed request.
function makeRequestListener(router) {
  return async function onRequest(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const found = router.resolve(req.method, url.pathname);
      if (found) {
        await found.handler(req, res, url, found.captures);
        return;
      }
      if (req.method === "GET" && attemptStaticServe(req, res, url.pathname)) return;
      return writeJson(res, 404, { error: "not found" });
    } catch (err) {
      writeJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

function createDashboardServer(clients = openAwsClients()) {
  const deps = assembleDeps(clients);
  const router = wireRoutes(deps);
  return http.createServer(makeRequestListener(router));
}

function launch() {
  const app = createDashboardServer();
  app.listen(8000, () => console.log("dashboard listening on :8000"));
}

if (require.main === module) {
  launch();
}

module.exports = { createDashboardServer, assembleDeps, wireRoutes };
