"use strict";

const http = require("node:http");
const { createRouter } = require("./router");
const { openRunLedger, logReading, drainRunLedger } = require("./windowBuffer");
const { startDispatchCycle } = require("./scheduler");
const { rollUpRunWindow } = require("./aggregation");
const { engine, THRESHOLD_TABLE } = require("./alertEngine");
const publisher = require("./publisher");

const WINDOW_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "eef-tower-agg";
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

// Validation stage of POST /ingest: only calls next() when the payload is well-formed, else sends its own 400.
function makeValidateIngestMiddleware() {
  return async function validateIngestMiddleware(req, res, ctx, next) {
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
    ctx.body = body;
    await next();
  };
}

// Handler stage of POST /ingest: trusts the validated body and records each batch's unit against its sensor_type.
function makeIngestHandler(runLedger, unitRegistry) {
  return async function handleIngest(req, res, ctx) {
    const body = ctx.body;
    unitRegistry.record(body.sensor_type, body.unit);
    for (const reading of body.readings) {
      logReading(runLedger, body.sensor_type, body.site_id, { ts: reading.ts, value: reading.value });
    }
    return sendJson(res, 202, { accepted: body.readings.length });
  };
}

function buildRouter(runLedger, unitRegistry) {
  const router = createRouter();
  router.use("GET", "/health", async (req, res) => sendJson(res, 200, { status: "ok" }));
  router.use("GET", "/thresholds", async (req, res) => sendJson(res, 200, THRESHOLD_TABLE));
  router.use("POST", "/ingest", makeValidateIngestMiddleware(), makeIngestHandler(runLedger, unitRegistry));
  return router;
}

// Outer boundary: validation problems are already 400s, so anything reaching here is an unexpected 500.
function buildHandler(router) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const matched = await router.dispatch(req.method, url.pathname, req, res, { url });
      if (!matched) return sendJson(res, 404, { error: "not found" });
    } catch (err) {
      sendJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

// Tracks sensor_type -> unit, since readings carry a unit on the wire but the ledger key does not.
function makeUnitRegistry() {
  const units = new Map();
  return {
    record(sensorType, unit) {
      if (unit) units.set(sensorType, unit);
    },
    get(sensorType) {
      return units.get(sensorType) || "";
    },
  };
}

function sealCarWindow(group, unit, windowStart, windowEnd) {
  const summary = rollUpRunWindow(group.sensorType, group.siteId, unit, group.readings, windowStart, windowEnd);
  summary.alerts = engine.evaluate(group.sensorType, summary);
  return summary;
}

async function flushRunWindow(runLedger, unitRegistry) {
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const groups = drainRunLedger(runLedger);
  const messages = groups.map((group) => sealCarWindow(group, unitRegistry.get(group.sensorType), windowStart, windowEnd));
  await publisher.publishBatch(messages);
  return messages;
}

function createApp(runLedger = openRunLedger()) {
  const unitRegistry = makeUnitRegistry();
  const router = buildRouter(runLedger, unitRegistry);
  const server = http.createServer(buildHandler(router));
  server.runLedger = runLedger;
  server.unitRegistry = unitRegistry;
  return server;
}

function start() {
  const app = createApp();
  publisher.configure(ENDPOINT, REGION, QUEUE_NAME);

  startDispatchCycle(WINDOW_SECONDS, () =>
    flushRunWindow(app.runLedger, app.unitRegistry).catch((err) => console.log(`flush error: ${err.message}`))
  );

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, validateIngestBody, flushRunWindow, sealCarWindow, buildRouter, makeUnitRegistry };
