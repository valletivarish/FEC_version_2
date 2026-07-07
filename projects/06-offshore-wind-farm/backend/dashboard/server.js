"use strict";

const path = require("node:path");
const express = require("express");
const { buildClients } = require("./awsClients");
const { buildReadingsRouter } = require("./routes/readings");
const { buildStatusRouter } = require("./routes/status");

const TABLE_NAME = process.env.TABLE_NAME || "owf-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "owf-turbine-agg";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "owf-processor";
const FOG_HEALTH_URL = process.env.FOG_HEALTH_URL || "http://fog:8000/health";
const FOG_THRESHOLDS_URL = process.env.FOG_THRESHOLDS_URL || "http://fog:8000/thresholds";

function buildDeps(clients) {
  return {
    doc: () => clients.doc,
    sqs: () => clients.sqs,
    lambda: () => clients.lambda,
    tableName: TABLE_NAME,
    queueName: QUEUE_NAME,
    functionName: FUNCTION_NAME,
    fogHealthUrl: FOG_HEALTH_URL,
    fogThresholdsUrl: FOG_THRESHOLDS_URL,
  };
}

function createApp(clients = buildClients()) {
  const app = express();
  const deps = buildDeps(clients);

  app.use(buildReadingsRouter(deps));
  app.use(buildStatusRouter(deps));

  app.use("/static", express.static(path.join(__dirname, "static"), { cacheControl: false }));
  app.get("/", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.sendFile(path.join(__dirname, "static", "index.html"));
  });

  return app;
}

function start() {
  const app = createApp();
  app.listen(8000, () => console.log("dashboard listening on :8000"));
}

if (require.main === module) {
  start();
}

module.exports = { createApp };
