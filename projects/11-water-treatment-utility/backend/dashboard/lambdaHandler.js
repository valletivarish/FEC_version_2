"use strict";

// AWS Lambda entry point for the dashboard behind an API Gateway REST API.
// Dispatch here is a single switch(true) statement whose cases are compound
// method-and-path boolean expressions -- a distinct shape from every other
// project's dashboard router (flat method+path map, template-segment matcher,
// ordered regex list, string/pattern switch, enum/sealed registry, chain of
// responsibility, or an Express/WSGI/Mangum bridge). It reuses the same data
// functions the local HTTP server (server.js) calls, so both front doors serve
// identical responses from one set of query logic, with a wildcard cross-origin
// header on every response so the S3-hosted frontend can call it cross-origin.

const { buildClients } = require("./awsClients");
const {
  SENSOR_TYPES,
  latestWindowsFor,
  buildPlantSummaries,
  getPlantSummary,
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
let cached = null;
function getDeps(injected) {
  if (injected) return depsFrom(injected);
  if (!cached) cached = depsFrom(buildClients());
  return cached;
}
function depsFrom(clients) {
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
async function readings(d, query) {
  const sensorType = query.sensor_type;
  const limit = parseInt(query.limit || "60", 10);
  if (!sensorType || !SENSOR_TYPES.includes(sensorType)) {
    return { status: 400, body: { error: `sensor_type must be one of ${SENSOR_TYPES.join(", ")}` } };
  }
  const siteId = query.site_id;
  let items = await latestWindowsFor(d.doc, d.tableName, sensorType, siteId ? limit * 4 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  return { status: 200, body: { sensor_type: sensorType, items } };
}

async function plants(d) {
  return { status: 200, body: { plants: await buildPlantSummaries(d.doc, d.tableName) } };
}

async function plantDetail(d, plantId) {
  const plant = await getPlantSummary(d.doc, d.tableName, plantId);
  if (!plant) return { status: 404, body: { error: `unknown plant: ${plantId}` } };
  return { status: 200, body: plant };
}

async function health(d) {
  const [gateway, queue, lambda, freshestAge] = await Promise.all([
    checkGateway(d.gatewayHealthUrl),
    isQueueReachable(d.sqs, d.queueName),
    isLambdaActive(d.lambda, d.functionName),
    freshestAgeSeconds(d.doc, d.tableName),
  ]);
  return { status: 200, body: { gateway, queue, lambda, pipeline: isPipelineFlowing(freshestAge), freshest_age_seconds: freshestAge } };
}

async function backendStats(d) {
  const [queue, itemsInTable] = await Promise.all([
    readQueueCounters(d.sqs, d.queueName),
    countTableItems(d.doc, d.tableName),
  ]);
  return { status: 200, body: { queue, items_in_table: itemsInTable } };
}

async function thresholds(d) {
  const result = await fetchThresholds(d.gatewayThresholdsUrl);
  return { status: result.status, body: result.body };
}

function respond(status, body) {
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

  const d = getDeps(injectedClients);
  const plantPath = /^\/api\/plants\/([a-z0-9-]+)$/.exec(path);
  try {
    let result;
    switch (true) {
      case method === "GET" && path === "/api/readings":
        result = await readings(d, query); break;
      case method === "GET" && path === "/api/plants":
        result = await plants(d); break;
      case method === "GET" && plantPath !== null:
        result = await plantDetail(d, plantPath[1]); break;
      case method === "GET" && path === "/api/health":
        result = await health(d); break;
      case method === "GET" && path === "/api/backend-stats":
        result = await backendStats(d); break;
      case method === "GET" && path === "/api/thresholds":
        result = await thresholds(d); break;
      default:
        result = { status: 404, body: { error: "not found" } };
    }
    return respond(result.status, result.body);
  } catch (err) {
    return respond(500, { error: err.message || "internal error" });
  }
}

module.exports = { handler };
