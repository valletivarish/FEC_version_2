"use strict";

const express = require("express");
const { seal } = require("./accumulator");
const { inspect, THRESHOLD_TABLE } = require("./alerts");
const { createStation, snapshotAndClear, buildRouter } = require("./ingestRouter");
const { createPublisher } = require("./publisher");

const WINDOW_SECONDS = parseFloat(process.env.WINDOW_SECONDS || "10");
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "owf-turbine-agg";
const ENDPOINT = process.env.AWS_ENDPOINT_URL;
const REGION = process.env.AWS_REGION || "eu-west-1";

function createApp(station = createStation()) {
  const app = express();
  app.use(express.json());
  app.locals.station = station;

  app.get("/health", (req, res) => res.json({ status: "ok" }));

  app.get("/thresholds", (req, res) => res.json(THRESHOLD_TABLE));

  app.use(buildRouter(station));

  return app;
}

function sealWindow(group, windowStart, windowEnd) {
  const summary = seal(group.acc, {
    sensorType: group.sensorType,
    siteId: group.siteId,
    unit: group.unit,
    windowStart,
    windowEnd,
  });
  summary.alerts = inspect(group.sensorType, summary);
  return summary;
}

function drainWindow(station, windowStart, windowEnd) {
  return snapshotAndClear(station).map((group) => sealWindow(group, windowStart, windowEnd));
}

async function flushOnce(app, publisher) {
  const windowEnd = new Date().toISOString();
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  const messages = drainWindow(app.locals.station, windowStart, windowEnd);
  for (const message of messages) {
    await publisher.publish(message);
  }
  return messages;
}

async function start() {
  const app = createApp();
  const publisher = await createPublisher({ endpoint: ENDPOINT, region: REGION, queueName: QUEUE_NAME });

  setInterval(() => {
    flushOnce(app, publisher).catch((err) => console.log(`window flush error: ${err.message}`));
  }, WINDOW_SECONDS * 1000);

  app.listen(8000, () => console.log("fog listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, drainWindow, sealWindow, flushOnce };
