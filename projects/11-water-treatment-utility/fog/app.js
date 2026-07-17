"use strict";

const http = require("node:http");
const { openReadingBuffer, bufferReading, flushBuffer, clusterByPlantSensor } = require("./ledger");
const { condensePlantWindow } = require("./aggregation");
const { breachesForWindow, THRESHOLD_CATALOG } = require("./alerts");
const { buildRouteTable } = require("./router");
const plantQueue = require("./publisher");

const WINDOW_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "wtu-plant-agg";
const ENDPOINT = process.env.AWS_ENDPOINT_URL;
const REGION = process.env.AWS_REGION || "eu-west-1";

const REQUIRED_FIELDS = ["sensor_type", "site_id", "readings"];

function checkIngestPayload(body) {
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

function readRequestJson(req) {
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

function writeJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

async function ingestReadings(req, res, ledger) {
  let body;
  try {
    body = await readRequestJson(req);
  } catch (err) {
    return writeJson(res, 400, { error: err.message });
  }
  const validationError = checkIngestPayload(body);
  if (validationError) {
    return writeJson(res, 400, { error: validationError });
  }
  for (const reading of body.readings) {
    bufferReading(ledger, {
      sensorType: body.sensor_type,
      siteId: body.site_id,
      unit: body.unit,
      ts: reading.ts,
      value: reading.value,
    });
  }
  return writeJson(res, 202, { accepted: body.readings.length });
}

function wireRoutes(ledger) {
  const router = buildRouteTable();
  router.addRoute("GET", /^\/health$/, async (req, res) => writeJson(res, 200, { status: "ok" }));
  router.addRoute("GET", /^\/thresholds$/, async (req, res) => writeJson(res, 200, THRESHOLD_CATALOG));
  router.addRoute("POST", /^\/ingest$/, async (req, res) => ingestReadings(req, res, ledger));
  return router;
}

function wrapHandler(router) {
  return async function respond(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const found = router.matchRoute(req.method, url.pathname);
      if (!found) return writeJson(res, 404, { error: "not found" });
      await found.handler(req, res, url, found.match);
    } catch (err) {
      writeJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

function finalizeGroup(group, windowStart, windowEnd) {
  const summary = condensePlantWindow(group.sensorType, group.siteId, group.unit, group.readings, windowStart, windowEnd);
  summary.alerts = breachesForWindow(group.sensorType, summary);
  return summary;
}

function harvestWindow(ledger, windowStart, windowEnd) {
  const entries = flushBuffer(ledger);
  const groups = clusterByPlantSensor(entries);
  return groups.map((group) => finalizeGroup(group, windowStart, windowEnd));
}

async function pushWindow(ledger) {
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const messages = harvestWindow(ledger, windowStart, windowEnd);
  if (messages.length > 0) {
    await plantQueue.sendWindow(QUEUE_NAME, messages);
  }
  return messages;
}

function buildFogServer(ledger = openReadingBuffer()) {
  const router = wireRoutes(ledger);
  const server = http.createServer(wrapHandler(router));
  server.ledger = ledger;
  return server;
}

function bootFog() {
  const app = buildFogServer();
  plantQueue.openGateway(ENDPOINT, REGION);

  setInterval(() => {
    pushWindow(app.ledger).catch((err) => console.log(`window flush error: ${err.message}`));
  }, WINDOW_SECONDS * 1000);

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  bootFog();
}

module.exports = { buildFogServer, checkIngestPayload, harvestWindow, finalizeGroup, pushWindow, wireRoutes };
