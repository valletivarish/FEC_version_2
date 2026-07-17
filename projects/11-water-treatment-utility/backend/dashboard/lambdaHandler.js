"use strict";

// AWS Lambda entry point for the dashboard behind an API Gateway REST API.
// Dispatch is a single switch(true) statement whose cases are compound
// method-and-path boolean expressions. It reuses the same data functions the
// local HTTP server (server.js) calls, so both front doors serve identical
// responses from one set of query logic, with a wildcard cross-origin header on
// every response so the S3-hosted frontend can call it cross-origin.

const { openAwsClients } = require("./awsClients");
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

// Clients and derived deps are built once per container and reused across
// invocations. A pre-built clients object may be injected for unit tests.
let cachedDeps = null;
function resolveDeps(injected) {
  // Only a unit-test clients object (shaped {doc,sqs,lambda}) counts as injection.
  // AWS Lambda invokes the handler as (event, context, callback), so the third
  // arg is the runtime callback in production -- guard on the client shape so
  // that callback is never mistaken for injected clients.
  if (injected && injected.doc) return depsFromClients(injected);
  if (!cachedDeps) cachedDeps = depsFromClients(openAwsClients());
  return cachedDeps;
}
function depsFromClients(clients) {
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

// Each endpoint returns a plain {status, body}; the caller renders it.
async function readingsQuery(d, query) {
  const sensorType = query.sensor_type;
  const limit = parseInt(query.limit || "60", 10);
  if (!sensorType || !PLANT_SENSOR_TYPES.includes(sensorType)) {
    return { status: 400, body: { error: `sensor_type must be one of ${PLANT_SENSOR_TYPES.join(", ")}` } };
  }
  const siteId = query.site_id;
  let items = await recentWindowsFor(d.doc, d.tableName, sensorType, siteId ? limit * 4 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  return { status: 200, body: { sensor_type: sensorType, items } };
}

async function plantsQuery(d) {
  return { status: 200, body: { plants: await assemblePlantSummaries(d.doc, d.tableName) } };
}

async function plantDetailQuery(d, plantId) {
  const plant = await findPlantSummary(d.doc, d.tableName, plantId);
  if (!plant) return { status: 404, body: { error: `unknown plant: ${plantId}` } };
  return { status: 200, body: plant };
}

async function healthQuery(d) {
  const [gateway, queue, lambda, freshestAge] = await Promise.all([
    probeGatewayHealth(d.gatewayHealthUrl),
    probeQueueReachable(d.sqs, d.queueName),
    probeProcessorActive(d.lambda, d.functionName),
    newestReadingAgeSeconds(d.doc, d.tableName),
  ]);
  return { status: 200, body: { gateway, queue, lambda, pipeline: pipelineIsCurrent(freshestAge), freshest_age_seconds: freshestAge } };
}

async function backendStatsQuery(d) {
  const [queue, itemsInTable] = await Promise.all([
    sampleQueueDepth(d.sqs, d.queueName),
    tallyStoredReadings(d.doc, d.tableName),
  ]);
  return { status: 200, body: { queue, items_in_table: itemsInTable } };
}

async function thresholdsQuery(d) {
  const result = await fetchGatewayThresholds(d.gatewayThresholdsUrl);
  return { status: result.status, body: result.body };
}

function apiResponse(status, body) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...CORS },
    body: typeof body === "string" ? body : JSON.stringify(body),
  };
}

async function handler(event, _context, injectedClients) {
  const method = event.httpMethod || "GET";
  const path = event.path || "/";
  const query = event.queryStringParameters || {};
  if (method === "OPTIONS") return { statusCode: 200, headers: CORS, body: "" };

  const d = resolveDeps(injectedClients);
  const plantMatch = /^\/api\/plants\/([a-z0-9-]+)$/.exec(path);
  try {
    let result;
    switch (true) {
      case method === "GET" && path === "/api/readings":
        result = await readingsQuery(d, query); break;
      case method === "GET" && path === "/api/plants":
        result = await plantsQuery(d); break;
      case method === "GET" && plantMatch !== null:
        result = await plantDetailQuery(d, plantMatch[1]); break;
      case method === "GET" && path === "/api/health":
        result = await healthQuery(d); break;
      case method === "GET" && path === "/api/backend-stats":
        result = await backendStatsQuery(d); break;
      case method === "GET" && path === "/api/thresholds":
        result = await thresholdsQuery(d); break;
      default:
        result = { status: 404, body: { error: "not found" } };
    }
    return apiResponse(result.status, result.body);
  } catch (err) {
    return apiResponse(500, { error: err.message || "internal error" });
  }
}

module.exports = { handler };
