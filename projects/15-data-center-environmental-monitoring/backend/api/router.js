"use strict";

const {
  SENSOR_TYPES,
  latestWindowsFor,
  buildHallSummaries,
  getHallSummary,
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

const TABLE_NAME = process.env.TABLE_NAME || "dce-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "dce-hall-agg";
const PROCESSOR_FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "dce-processor";
const FOG_HEALTH_URL = process.env.FOG_HEALTH_URL || "http://fog:8000/health";
const FOG_THRESHOLDS_URL = process.env.FOG_THRESHOLDS_URL || "http://fog:8000/thresholds";

async function handleReadings(clients, query) {
  const sensorType = query.sensor_type;
  if (!sensorType || !SENSOR_TYPES.includes(sensorType)) {
    return { status: 400, body: { error: `sensor_type must be one of ${SENSOR_TYPES.join(", ")}` } };
  }
  const limit = parseInt(query.limit || "60", 10);
  const siteId = query.site_id;
  let items = await latestWindowsFor(clients.doc, TABLE_NAME, sensorType, siteId ? limit * 4 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  return { status: 200, body: { sensor_type: sensorType, items } };
}

// Project-specific per-site grouping endpoint: GET /api/halls lists both
// server halls, GET /api/halls/:hallId (path parameter captured by the
// route regex below) returns just one.
async function handleHalls(clients) {
  return { status: 200, body: { halls: await buildHallSummaries(clients.doc, TABLE_NAME) } };
}

async function handleHallDetail(clients, hallId) {
  const hall = await getHallSummary(clients.doc, TABLE_NAME, hallId);
  if (!hall) return { status: 404, body: { error: `unknown hall: ${hallId}` } };
  return { status: 200, body: hall };
}

async function handleHealth(clients) {
  const [gatewayUp, queueUp, lambdaUp, freshestAge] = await Promise.all([
    checkGateway(FOG_HEALTH_URL),
    isQueueReachable(clients.sqs, QUEUE_NAME),
    isLambdaActive(clients.lambda, PROCESSOR_FUNCTION_NAME),
    freshestAgeSeconds(clients.doc, TABLE_NAME),
  ]);
  return {
    status: 200,
    body: {
      gateway: gatewayUp,
      queue: queueUp,
      lambda: lambdaUp,
      pipeline: isPipelineFlowing(freshestAge),
      freshest_age_seconds: freshestAge,
    },
  };
}

async function handleBackendStats(clients) {
  const [queue, itemsInTable] = await Promise.all([
    readQueueCounters(clients.sqs, QUEUE_NAME),
    countTableItems(clients.doc, TABLE_NAME),
  ]);
  return { status: 200, body: { queue, items_in_table: itemsInTable } };
}

async function handleThresholds() {
  const result = await fetchThresholds(FOG_THRESHOLDS_URL);
  return { status: result.status, body: result.body };
}

// The Lambda's own internal path/method routing. By design this Lambda
// (dce-api) does its own routing rather than relying on
// per-route API Gateway resources -- deploy_api.sh wires exactly one
// {proxy+} resource (plus the root "/") to this single function, so every
// real /api/* decision happens here, in plain application code, matched
// against a small ordered array of [method, regex, handler] entries. This
// keeps the dispatch directly unit-testable with no Lambda runtime and no
// API Gateway involved at all -- see router.test.js, which calls route()
// with plain method/path/query arguments and fake AWS clients.
const ROUTES = [
  ["GET", /^\/api\/readings$/, (clients, query) => handleReadings(clients, query)],
  ["GET", /^\/api\/halls$/, (clients) => handleHalls(clients)],
  ["GET", /^\/api\/halls\/([a-z0-9-]+)$/, (clients, query, match) => handleHallDetail(clients, match[1])],
  ["GET", /^\/api\/health$/, (clients) => handleHealth(clients)],
  ["GET", /^\/api\/backend-stats$/, (clients) => handleBackendStats(clients)],
  ["GET", /^\/api\/thresholds$/, (clients) => handleThresholds(clients)],
];

async function route(method, path, query, clients) {
  for (const [routeMethod, pattern, handler] of ROUTES) {
    if (routeMethod !== method) continue;
    const match = pattern.exec(path);
    if (match) return handler(clients, query || {}, match);
  }
  return { status: 404, body: { error: "not found" } };
}

module.exports = {
  route,
  ROUTES,
  handleReadings,
  handleHalls,
  handleHallDetail,
  handleHealth,
  handleBackendStats,
  handleThresholds,
};
