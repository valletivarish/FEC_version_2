"use strict";

const http = require("node:http");
const { createStation, addReading, snapshotAndClear } = require("./intake");
const { summarizeWindow } = require("./aggregation");
const { evaluateAlerts, THRESHOLD_TABLE } = require("./alerts");
const publisher = require("./publisher");

const WINDOW_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "ska-slope-agg";
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

async function handleIngest(req, res, station) {
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
    addReading(station, body.sensor_type, body.site_id, body.unit, { ts: reading.ts, value: reading.value });
  }
  return sendJson(res, 202, { accepted: body.readings.length });
}

function sealGroup(group, windowStart, windowEnd) {
  const summary = summarizeWindow(group.sensorType, group.siteId, group.unit, group.readings, windowStart, windowEnd);
  summary.alerts = evaluateAlerts(summary);
  return summary;
}

function drainWindow(station, windowStart, windowEnd) {
  return snapshotAndClear(station).map((group) => sealGroup(group, windowStart, windowEnd));
}

async function flushOnce(station) {
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const messages = drainWindow(station, windowStart, windowEnd);
  for (const message of messages) {
    await publisher.publish(QUEUE_NAME, message);
  }
  return messages;
}

// HTTP routing dispatches on a template-literal key built as
// `${req.method} ${pathname}`, matched inside a switch(true) block -- one
// case per exact "METHOD /path" string, with a regex .test(key) case
// available for anything that needs pattern matching (not needed by this
// service's three fixed routes, but the mechanism is exercised by
// backend/dashboard/server.js's per-slope detail route). This is distinct
// from every sibling Node fog service in this portfolio: 03/06 both dispatch
// through Express; 10 uses a hand-written if/else chain; 11 uses a
// declarative [method, regex, handler] tuple table matched by RegExp.exec();
// 15 uses a simple sequential if-chain of prefix checks; 18 uses a
// segment-array middleware chain with next() continuations; 22 implements a
// real prefix trie. None of the seven builds a single composed
// method+path key and dispatches on it with switch(true).
function buildHandler(station) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");
      const key = `${req.method} ${url.pathname}`;

      switch (true) {
        case key === "GET /health":
          return sendJson(res, 200, { status: "ok" });

        case key === "GET /thresholds":
          return sendJson(res, 200, THRESHOLD_TABLE);

        case key === "POST /ingest":
          return handleIngest(req, res, station);

        default:
          return sendJson(res, 404, { error: "not found" });
      }
    } catch (err) {
      // Anything reaching this outer boundary is a genuine unexpected
      // failure (client input problems are already turned into a 400 inside
      // handleIngest), so it is reported as a 500.
      sendJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

function createApp(station = createStation()) {
  const server = http.createServer(buildHandler(station));
  server.station = station;
  return server;
}

function start() {
  const app = createApp();
  publisher.configure(ENDPOINT, REGION);

  setInterval(() => {
    flushOnce(app.station).catch((err) => console.log(`window flush error: ${err.message}`));
  }, WINDOW_SECONDS * 1000);

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, validateIngestBody, drainWindow, sealGroup, flushOnce };
