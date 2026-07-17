"use strict";

const http = require("node:http");
const { createApiaryStation, depositReadings, harvestAndReset } = require("./ringBuffer");
const { condenseHiveWindow } = require("./aggregation");
const { detectHiveAlerts, HIVE_THRESHOLD_SHEET } = require("./alerts");
const { createApiaryRouter } = require("./router");
const hiveGateway = require("./publisher");

const WINDOW_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "bam-apiary-agg";
const ENDPOINT = process.env.AWS_ENDPOINT_URL;
const REGION = process.env.AWS_REGION || "eu-west-1";

const REQUIRED_INGEST_FIELDS = ["sensor_type", "site_id", "readings"];

function checkIngestPayload(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return "request body must be a JSON object";
  }
  for (const field of REQUIRED_INGEST_FIELDS) {
    if (!(field in body)) return `missing required field: ${field}`;
  }
  if (typeof body.sensor_type !== "string" || body.sensor_type.length === 0) {
    return "sensor_type must be a non-empty string";
  }
  if (typeof body.site_id !== "string" || body.site_id.length === 0) {
    return "site_id must be a non-empty string";
  }
  if (!Array.isArray(body.readings) || body.readings.length === 0) {
    return "readings must be a non-empty array";
  }
  for (const reading of body.readings) {
    if (reading === null || typeof reading !== "object") return "each reading must be an object";
    if (typeof reading.value !== "number" || Number.isNaN(reading.value)) {
      return "each reading must have a numeric value";
    }
    if (typeof reading.ts !== "string") return "each reading must have a string ts";
  }
  return null;
}

function readJsonRequest(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error("request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (raw.length === 0) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`invalid JSON: ${err.message}`));
      }
    });
    req.on("error", reject);
  });
}

function respondJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

async function ingestReadings(req, res, station) {
  let body;
  try {
    body = await readJsonRequest(req);
  } catch (err) {
    return respondJson(res, 400, { error: err.message });
  }
  const payloadError = checkIngestPayload(body);
  if (payloadError) {
    return respondJson(res, 400, { error: payloadError });
  }
  depositReadings(station, body.sensor_type, body.site_id, body.unit, body.readings);
  return respondJson(res, 202, { accepted: body.readings.length });
}

function wireApiaryRoutes(station) {
  const router = createApiaryRouter();
  router.addRoute("GET", "/health", async (req, res) => respondJson(res, 200, { status: "ok" }));
  router.addRoute("GET", "/thresholds", async (req, res) => respondJson(res, 200, HIVE_THRESHOLD_SHEET));
  router.addRoute("POST", "/ingest", async (req, res) => ingestReadings(req, res, station));
  return router;
}

// Validation already returned a 400 inside ingestReadings, so anything reaching this boundary is a genuine unexpected failure and becomes a 500.
function wrapRequestHandler(router) {
  return async function serveApiaryRequest(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const found = router.resolveRoute(req.method, url.pathname);
      if (!found) return respondJson(res, 404, { error: "not found" });
      await found.handler(req, res, url, found.match);
    } catch (err) {
      respondJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

function sealHiveWindow(group, windowStart, windowEnd) {
  const summary = condenseHiveWindow(group.sensorType, group.siteId, group.unit, group.readings, windowStart, windowEnd);
  summary.alerts = detectHiveAlerts(summary);
  return summary;
}

function harvestWindow(station, windowStart, windowEnd) {
  return harvestAndReset(station).map((group) => sealHiveWindow(group, windowStart, windowEnd));
}

// A window's messages (at most one per sensor_type/site_id pair) go out as real SQS batches; the generator's suspended state is the backpressure between SendMessageBatch calls.
async function emitWindowBatch(station) {
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const messages = harvestWindow(station, windowStart, windowEnd);
  for await (const result of hiveGateway.dispatchHiveBatches(QUEUE_NAME, messages)) {
    void result;
  }
  return messages;
}

function createFogServer(station = createApiaryStation()) {
  const router = wireApiaryRoutes(station);
  const server = http.createServer(wrapRequestHandler(router));
  server.station = station;
  return server;
}

function startFogNode() {
  const app = createFogServer();
  hiveGateway.configureGateway(ENDPOINT, REGION);

  setInterval(() => {
    emitWindowBatch(app.station).catch((err) => console.log(`window flush error: ${err.message}`));
  }, WINDOW_SECONDS * 1000);

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  startFogNode();
}

module.exports = { createFogServer, checkIngestPayload, harvestWindow, sealHiveWindow, emitWindowBatch, wireApiaryRoutes };
