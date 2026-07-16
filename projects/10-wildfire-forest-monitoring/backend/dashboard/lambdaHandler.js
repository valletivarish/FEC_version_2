"use strict";

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

let cachedDeps;
function defaultDeps() {
  if (cachedDeps) return cachedDeps;
  const clients = buildClients();
  cachedDeps = {
    doc: clients.doc,
    sqs: clients.sqs,
    lambda: clients.lambda,
    tableName: TABLE_NAME,
    queueName: QUEUE_NAME,
    functionName: FUNCTION_NAME,
    gatewayHealthUrl: FOG_HEALTH_URL,
    gatewayThresholdsUrl: FOG_THRESHOLDS_URL,
  };
  return cachedDeps;
}

// Dispatch is a chain of responsibility: ATTEMPTS is an ordered list of
// async functions that each inspect the request and either claim it by
// returning { status, body }, or decline by returning null so the walk
// moves on. There is no route table, matcher, or registry separate from
// the handlers -- each attempt owns its own match condition.
const ATTEMPTS = [
  async (req, deps) => {
    if (req.method !== "GET" || req.path !== "/api/readings") return null;
    const sensorType = req.query.sensor_type;
    const siteId = req.query.site_id;
    const limit = parseInt(req.query.limit || "60", 10);
    if (!sensorType || !SENSOR_TYPES.includes(sensorType)) {
      return { status: 400, body: { error: `sensor_type must be one of ${SENSOR_TYPES.join(", ")}` } };
    }
    let items = await latestWindowsFor(deps.doc, deps.tableName, sensorType, siteId ? limit * 4 : limit);
    if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
    return { status: 200, body: { sensor_type: sensorType, items } };
  },

  async (req, deps) => {
    if (req.method !== "GET" || req.path !== "/api/stations") return null;
    return { status: 200, body: { stations: await buildStationSummaries(deps.doc, deps.tableName) } };
  },

  async (req, deps) => {
    if (req.method !== "GET" || req.path !== "/api/health") return null;
    const [gatewayUp, queueUp, lambdaUp, freshestAge] = await Promise.all([
      checkGateway(deps.gatewayHealthUrl),
      isQueueReachable(deps.sqs, deps.queueName),
      isLambdaActive(deps.lambda, deps.functionName),
      freshestAgeSeconds(deps.doc, deps.tableName),
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
  },

  async (req, deps) => {
    if (req.method !== "GET" || req.path !== "/api/backend-stats") return null;
    const [queue, itemsInTable] = await Promise.all([
      readQueueCounters(deps.sqs, deps.queueName),
      countTableItems(deps.doc, deps.tableName),
    ]);
    return { status: 200, body: { queue, items_in_table: itemsInTable } };
  },

  async (req, deps) => {
    if (req.method !== "GET" || req.path !== "/api/thresholds") return null;
    const result = await fetchThresholds(deps.gatewayThresholdsUrl);
    return { status: result.status, body: result.body };
  },
];

// A trailing slash never changes which endpoint is meant.
function normalizePath(rawPath) {
  const p = rawPath || "/";
  return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

// The frontend is served from S3, a different origin, so every response --
// success, client error, or failure -- must carry the CORS header or the
// browser silently discards it.
function respond(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify(body),
  };
}

async function handleRequest(event, deps) {
  try {
    const req = {
      method: event.httpMethod,
      path: normalizePath(event.path),
      query: event.queryStringParameters || {},
    };
    for (const attempt of ATTEMPTS) {
      const outcome = await attempt(req, deps);
      if (outcome) return respond(outcome.status, outcome.body);
    }
    return respond(404, { error: "not found" });
  } catch (err) {
    return respond(500, { error: err.message || "internal error" });
  }
}

exports.handler = (event) => handleRequest(event, defaultDeps());
exports.handleRequest = handleRequest;
exports.normalizePath = normalizePath;
