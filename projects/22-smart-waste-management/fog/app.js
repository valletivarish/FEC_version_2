"use strict";

const http = require("node:http");
const { createRouter } = require("./router");
const { createDoubleBuffer, addReading, swapAndDrain } = require("./doubleBuffer");
const { summarizeWindow } = require("./aggregation");
const { evaluateAlerts, THRESHOLD_TABLE } = require("./alerts");
const publishQueue = require("./publishQueue");

const WINDOW_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "swm-district-agg";
const ENDPOINT = process.env.AWS_ENDPOINT_URL;
const REGION = process.env.AWS_REGION || "eu-west-1";

const REQUIRED_FIELDS = ["sensor_type", "site_id", "readings"];

function validateIngestBody(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return "request body must be a JSON object";
  }
  for (const field of REQUIRED_FIELDS) {
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

function readJsonBody(req) {
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

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

async function handleIngest(req, res, buffer) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  const validationError = validateIngestBody(body);
  if (validationError) {
    return sendJson(res, 400, { error: validationError });
  }
  for (const reading of body.readings) {
    addReading(buffer, body.sensor_type, body.site_id, body.unit, { ts: reading.ts, value: reading.value });
  }
  return sendJson(res, 202, { accepted: body.readings.length });
}

function buildRouter(buffer) {
  const router = createRouter();
  router.route("GET", "/health", async (req, res) => sendJson(res, 200, { status: "ok" }));
  router.route("GET", "/thresholds", async (req, res) => sendJson(res, 200, THRESHOLD_TABLE));
  router.route("POST", "/ingest", async (req, res) => handleIngest(req, res, buffer));
  return router;
}

// Every request passes through this outer try/catch: a validation problem
// is already turned into a 400 inside handleIngest, so anything reaching
// this boundary is a genuine unexpected failure and is reported as a 500.
function buildHandler(router) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const found = router.dispatch(req.method, url.pathname);
      if (!found) return sendJson(res, 404, { error: "not found" });
      await found.handler(req, res, found.params);
    } catch (err) {
      sendJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

function sealGroup(group, windowStart, windowEnd) {
  const summary = summarizeWindow(group.sensorType, group.siteId, group.unit, group.readings, windowStart, windowEnd);
  summary.alerts = evaluateAlerts(group.sensorType, summary);
  return summary;
}

function drainWindow(buffer, windowStart, windowEnd) {
  return swapAndDrain(buffer).map((group) => sealGroup(group, windowStart, windowEnd));
}

async function flushOnce(buffer) {
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const messages = drainWindow(buffer, windowStart, windowEnd);
  for (const message of messages) {
    await publishQueue.publish(QUEUE_NAME, message);
  }
  return messages;
}

function createApp(buffer = createDoubleBuffer()) {
  const router = buildRouter(buffer);
  const server = http.createServer(buildHandler(router));
  server.buffer = buffer;
  return server;
}

function start() {
  const app = createApp();
  publishQueue.configure(ENDPOINT, REGION);

  setInterval(() => {
    flushOnce(app.buffer).catch((err) => console.log(`window flush error: ${err.message}`));
  }, WINDOW_SECONDS * 1000);

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, validateIngestBody, drainWindow, sealGroup, flushOnce, buildRouter };
