"use strict";

const express = require("express");
const { summarizeWindow } = require("./aggregation");
const { checkVital, VITAL_LIMITS } = require("./alerts");
const { QueueGateway } = require("./queueGateway");

const WINDOW_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "fpv-vitals-agg";
const ENDPOINT = process.env.AWS_ENDPOINT_URL;
const REGION = process.env.AWS_REGION || "eu-west-1";
const KEY_SEP = " ";

function createApp() {
  const app = express();
  app.use(express.json());

  app.locals.pending = new Map();
  app.locals.units = new Map();

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.get("/thresholds", (req, res) => {
    const out = {};
    for (const [vital, rules] of Object.entries(VITAL_LIMITS)) {
      out[vital] = rules.map(([field, op, limit, key]) => ({ field, op, limit, key }));
    }
    res.json(out);
  });

  app.post("/ingest", (req, res) => {
    const { sensor_type: vital, site_id: patientId = "patient-1", unit, readings } = req.body;
    const key = vital + KEY_SEP + patientId;
    if (!app.locals.pending.has(key)) app.locals.pending.set(key, []);
    app.locals.pending.get(key).push(...readings);
    if (unit) app.locals.units.set(vital, unit);
    res.status(202).json({ accepted: readings.length });
  });

  return app;
}

function buildWindowMessages(snapshot, units, windowStart, windowEnd) {
  const messages = [];
  for (const [key, readings] of snapshot.entries()) {
    if (readings.length === 0) continue;
    const [vital, patientId] = key.split(KEY_SEP);
    const summary = summarizeWindow(vital, patientId, units.get(vital) || "", readings, windowStart, windowEnd);
    summary.alerts = checkVital(vital, summary);
    messages.push(summary);
  }
  return messages;
}

async function flushWindow(app, gateway) {
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();

  const snapshot = new Map(app.locals.pending);
  app.locals.pending.clear();
  const units = new Map(app.locals.units);

  const messages = buildWindowMessages(snapshot, units, windowStart, windowEnd);
  if (messages.length > 0) await gateway.sendBatch(messages);
}

async function start() {
  const app = createApp();
  const gateway = await new QueueGateway(ENDPOINT, REGION, QUEUE_NAME).init();

  setInterval(() => {
    flushWindow(app, gateway).catch((err) => console.log(`window flush failed: ${err.message}`));
  }, WINDOW_SECONDS * 1000);

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, buildWindowMessages };
