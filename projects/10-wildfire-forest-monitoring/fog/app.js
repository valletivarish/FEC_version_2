"use strict";

const http = require("node:http");
const { createStation } = require("./buffer");
const { summarizeWindow } = require("./aggregation");
const { evaluateAlerts, THRESHOLD_TABLE } = require("./alerts");
const { publish, buildClient } = require("./publisher");

const WINDOW_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "wfm-station-agg";
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

// Plain http.createServer with manual URL parsing and hand-written path
// dispatch -- no Express anywhere in this service. This mirrors the Java
// siblings' deliberate avoidance of a web framework (JDK HttpServer there,
// Node's built-in http module here) and is a genuine departure from both
// 03 and 06, which both use Express (inline routes vs. split Router files
// respectively).
function buildHandler(station, publishFn) {
  return async function handler(req, res) {
    try {
      const url = new URL(req.url, "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { status: "ok" });
      }

      if (req.method === "GET" && url.pathname === "/thresholds") {
        return sendJson(res, 200, THRESHOLD_TABLE);
      }

      if (req.method === "POST" && url.pathname === "/ingest") {
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
        station.submit(body.sensor_type, body.site_id, body.unit, body.readings);
        return sendJson(res, 202, { accepted: body.readings.length });
      }

      return sendJson(res, 404, { error: "not found" });
    } catch (err) {
      // Anything reaching this outer boundary is a genuine unexpected
      // failure (not a client input problem, which is caught and turned
      // into a 400 above), so it is reported as a 500.
      sendJson(res, 500, { error: err.message || "internal error" });
    }
  };
}

function sealGroup(group, windowStart, windowEnd) {
  const summary = summarizeWindow(group.sensorType, group.siteId, group.unit, group.readings, windowStart, windowEnd);
  summary.alerts = evaluateAlerts(group.sensorType, summary);
  return summary;
}

function drainWindow(station, windowStart, windowEnd) {
  return station.snapshotAndClear().map((group) => sealGroup(group, windowStart, windowEnd));
}

async function flushOnce(station, sqsClient) {
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const messages = drainWindow(station, windowStart, windowEnd);
  for (const message of messages) {
    await publish(sqsClient, QUEUE_NAME, message);
  }
  return messages;
}

function createApp(station = createStation()) {
  const server = http.createServer(buildHandler(station));
  server.station = station;
  return server;
}

function start() {
  const app = createApp();
  const sqsClient = buildClient(ENDPOINT, REGION);

  setInterval(() => {
    flushOnce(app.station, sqsClient).catch((err) => console.log(`window flush error: ${err.message}`));
  }, WINDOW_SECONDS * 1000);

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, validateIngestBody, drainWindow, sealGroup, flushOnce };
