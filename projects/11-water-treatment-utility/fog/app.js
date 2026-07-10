"use strict";

const http = require("node:http");
const { createLedger, appendEntry, drainEntries, groupByKey } = require("./ledger");
const { summarizeWindow } = require("./aggregation");
const { evaluateAlerts, THRESHOLD_TABLE } = require("./alerts");
const { createRouter } = require("./router");
const gateway = require("./publisher");

const WINDOW_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "wtu-plant-agg";
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

async function handleIngest(req, res, ledger) {
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
    appendEntry(ledger, {
      sensorType: body.sensor_type,
      siteId: body.site_id,
      unit: body.unit,
      ts: reading.ts,
      value: reading.value,
    });
  }
  return sendJson(res, 202, { accepted: body.readings.length });
}

function buildRouter(ledger) {
  const router = createRouter();
  router.route("GET", /^\/health$/, async (req, res) => sendJson(res, 200, { status: "ok" }));
  router.route("GET", /^\/thresholds$/, async (req, res) => sendJson(res, 200, THRESHOLD_TABLE));
  router.route("POST", /^\/ingest$/, async (req, res) => handleIngest(req, res, ledger));
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
      await found.handler(req, res, url, found.match);
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

// Two-phase flush: drain the flat ledger, group by (sensor_type, site_id)
// only now, then seal each group into a window summary. See ledger.js for
// why grouping/aggregation is deferred to exactly this call.
function drainWindow(ledger, windowStart, windowEnd) {
  const entries = drainEntries(ledger);
  const groups = groupByKey(entries);
  return groups.map((group) => sealGroup(group, windowStart, windowEnd));
}

async function flushOnce(ledger) {
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const messages = drainWindow(ledger, windowStart, windowEnd);
  for (const message of messages) {
    await gateway.publish(QUEUE_NAME, message);
  }
  return messages;
}

function createApp(ledger = createLedger()) {
  const router = buildRouter(ledger);
  const server = http.createServer(buildHandler(router));
  server.ledger = ledger;
  return server;
}

function start() {
  const app = createApp();
  gateway.configure(ENDPOINT, REGION);

  setInterval(() => {
    flushOnce(app.ledger).catch((err) => console.log(`window flush error: ${err.message}`));
  }, WINDOW_SECONDS * 1000);

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, validateIngestBody, drainWindow, sealGroup, flushOnce, buildRouter };
