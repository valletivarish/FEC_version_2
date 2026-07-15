"use strict";

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

async function routeReadings(deps, query) {
  const sensorType = query.sensor_type;
  const limit = parseInt(query.limit || "60", 10);
  if (!sensorType || !SENSOR_TYPES.includes(sensorType)) {
    return { status: 400, body: { error: `sensor_type must be one of ${SENSOR_TYPES.join(", ")}` } };
  }
  const siteId = query.site_id;
  let items = await latestWindowsFor(deps.doc, deps.tableName, sensorType, siteId ? limit * 4 : limit);
  if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
  return { status: 200, body: { sensor_type: sensorType, items } };
}

async function routeSlopes(deps) {
  return { status: 200, body: { slopes: await buildSlopeSummaries(deps.doc, deps.tableName) } };
}

async function routeSlopeDetail(deps, query, params) {
  const slope = await getSlopeSummary(deps.doc, deps.tableName, params.slopeId);
  if (!slope) return { status: 404, body: { error: `unknown slope: ${params.slopeId}` } };
  return { status: 200, body: slope };
}

async function routeHealth(deps) {
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
}

async function routeBackendStats(deps) {
  const [queue, itemsInTable] = await Promise.all([
    readQueueCounters(deps.sqs, deps.queueName),
    countTableItems(deps.doc, deps.tableName),
  ]);
  return { status: 200, body: { queue, items_in_table: itemsInTable } };
}

async function routeThresholds(deps) {
  const result = await fetchThresholds(deps.gatewayThresholdsUrl);
  return { status: result.status, body: result.body };
}

// `template` is a plain "/api/..." path with ":name" segments, not a RegExp or dict key.
const ROUTES = [
  { method: "GET", template: "/api/readings", handler: routeReadings },
  { method: "GET", template: "/api/slopes", handler: routeSlopes },
  { method: "GET", template: "/api/slopes/:slopeId", handler: routeSlopeDetail },
  { method: "GET", template: "/api/health", handler: routeHealth },
  { method: "GET", template: "/api/backend-stats", handler: routeBackendStats },
  { method: "GET", template: "/api/thresholds", handler: routeThresholds },
];

function matchTemplate(template, pathname) {
  const templateSegments = template.split("/").filter(Boolean);
  const pathSegments = pathname.split("/").filter(Boolean);
  if (templateSegments.length !== pathSegments.length) return null;
  const params = {};
  for (let i = 0; i < templateSegments.length; i++) {
    const templateSegment = templateSegments[i];
    if (templateSegment.startsWith(":")) {
      params[templateSegment.slice(1)] = pathSegments[i];
    } else if (templateSegment !== pathSegments[i]) {
      return null;
    }
  }
  return params;
}

function findRoute(method, pathname) {
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const params = matchTemplate(route.template, pathname);
    if (params) return { route, params };
  }
  return null;
}

function normalizePath(event) {
  const raw = event.path || event.rawPath || "/";
  return raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

// The S3-hosted frontend calls this API cross-origin, so every response needs
// Access-Control-Allow-Origin or the browser silently discards the body.
const RESPONSE_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

// deps defaults to real AWS clients so tests can inject fakes instead.
function createHandler(deps = buildDeps(buildClients())) {
  return async function handler(event) {
    const method = event.httpMethod || event.requestContext?.http?.method || "GET";
    const pathname = normalizePath(event);
    const query = event.queryStringParameters || {};

    const match = findRoute(method, pathname);
    if (!match) {
      return {
        statusCode: 404,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: "not found" }),
      };
    }

    try {
      const result = await match.route.handler(deps, query, match.params);
      return {
        statusCode: result.status,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify(result.body),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: RESPONSE_HEADERS,
        body: JSON.stringify({ error: err.message || "internal error" }),
      };
    }
  };
}

exports.handler = createHandler();
exports.createHandler = createHandler;
exports.buildDeps = buildDeps;
exports.findRoute = findRoute;
exports.matchTemplate = matchTemplate;
