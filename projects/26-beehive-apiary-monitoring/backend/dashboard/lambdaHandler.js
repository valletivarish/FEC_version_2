"use strict";

const { openHiveClients } = require("./awsClients");
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

let cachedHiveDeps = null;
function hiveDeps(injected) {
  // Gotcha: AWS Lambda passes (event, context, callback), so a truthy third arg may be the runtime callback, not injected clients — check its shape first.
  if (injected && injected.doc) return assembleDeps(injected);
  if (!cachedHiveDeps) cachedHiveDeps = assembleDeps(openHiveClients());
  return cachedHiveDeps;
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

async function serveReadings(d, query) {
  const sensorType = query.sensor_type;
  const limit = parseInt(query.limit || "60", 10);
  if (!sensorType || !HIVE_SENSOR_TYPES.includes(sensorType)) {
    return { status: 400, body: { error: `sensor_type must be one of ${HIVE_SENSOR_TYPES.join(", ")}` } };
  }
  const siteId = query.site_id;
  let items = await pullRecentWindows(d.doc, d.tableName, sensorType, siteId ? limit * 4 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  return { status: 200, body: { sensor_type: sensorType, items } };
}

async function serveApiaries(d) {
  return { status: 200, body: { apiaries: await assembleApiaryCards(d.doc, d.tableName) } };
}

async function serveApiaryDetail(d, apiaryId) {
  const apiary = await findApiaryCard(d.doc, d.tableName, apiaryId);
  if (!apiary) return { status: 404, body: { error: `unknown apiary: ${apiaryId}` } };
  return { status: 200, body: apiary };
}

async function serveHealth(d) {
  const [gateway, queue, lambda, freshestAge] = await Promise.all([
    pingHiveGateway(d.gatewayHealthUrl),
    combQueueReachable(d.sqs, d.queueName),
    processorAlive(d.lambda, d.functionName),
    youngestReadingAge(d.doc, d.tableName),
  ]);
  return { status: 200, body: { gateway, queue, lambda, pipeline: nectarFlowing(freshestAge), freshest_age_seconds: freshestAge } };
}

async function serveBackendStats(d) {
  const [queue, itemsInTable] = await Promise.all([
    readCombQueueDepth(d.sqs, d.queueName),
    tallyStoredReadings(d.doc, d.tableName),
  ]);
  return { status: 200, body: { queue, items_in_table: itemsInTable } };
}

async function serveThresholds(d) {
  const result = await relayAlertRules(d.gatewayThresholdsUrl);
  return { status: result.status, body: result.body };
}

function jsonEnvelope(status, body) {
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

  const d = hiveDeps(injectedClients);
  const apiaryPath = /^\/api\/apiaries\/([a-z0-9-]+)$/.exec(path);
  try {
    let result;
    switch (true) {
      case method === "GET" && path === "/api/readings":
        result = await serveReadings(d, query); break;
      case method === "GET" && path === "/api/apiaries":
        result = await serveApiaries(d); break;
      case method === "GET" && apiaryPath !== null:
        result = await serveApiaryDetail(d, apiaryPath[1]); break;
      case method === "GET" && path === "/api/health":
        result = await serveHealth(d); break;
      case method === "GET" && path === "/api/backend-stats":
        result = await serveBackendStats(d); break;
      case method === "GET" && path === "/api/thresholds":
        result = await serveThresholds(d); break;
      default:
        result = { status: 404, body: { error: "not found" } };
    }
    return jsonEnvelope(result.status, result.body);
  } catch (err) {
    return jsonEnvelope(500, { error: err.message || "internal error" });
  }
}

module.exports = { handler };
