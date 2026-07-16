"use strict";

const path = require("node:path");
const express = require("express");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
const { SQSClient } = require("@aws-sdk/client-sqs");
const { LambdaClient } = require("@aws-sdk/client-lambda");

const { recentWindows, buildPatients } = require("./dynamoHelper");
const { queueReachable, lambdaActive, queueDepth, scanCount } = require("./healthChecks");

const TABLE_NAME = process.env.TABLE_NAME || "fpv-readings";
const QUEUE_NAME = process.env.SQS_QUEUE_NAME || "fpv-vitals-agg";
const FUNCTION_NAME = process.env.LAMBDA_FUNCTION_NAME || "fpv-processor";
const GATEWAY_HEALTH_URL = process.env.FOG_HEALTH_URL || "http://fog:8000/health";
const GATEWAY_THRESHOLDS_URL = process.env.FOG_THRESHOLDS_URL || "http://fog:8000/thresholds";
const VITALS = ["heart_rate", "spo2", "body_temperature", "respiration_rate", "systolic_bp"];
const PATIENT_IDS = ["patient-1", "patient-2"];
const PIPELINE_FRESH_SECONDS = 30;

function awsClientConfig() {
  const config = { region: process.env.AWS_REGION || "eu-west-1" };
  if (process.env.AWS_ENDPOINT_URL) {
    config.endpoint = process.env.AWS_ENDPOINT_URL;
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "test",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "test",
    };
  }
  return config;
}

let cachedDoc, cachedSqs, cachedLambda;

function doc() {
  if (!cachedDoc) cachedDoc = DynamoDBDocumentClient.from(new DynamoDBClient(awsClientConfig()));
  return cachedDoc;
}

function sqs() {
  if (!cachedSqs) cachedSqs = new SQSClient(awsClientConfig());
  return cachedSqs;
}

function lambdaClient() {
  if (!cachedLambda) cachedLambda = new LambdaClient(awsClientConfig());
  return cachedLambda;
}

async function checkGatewayHealth(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return res.status === 200;
  } catch {
    return false;
  }
}

async function buildHealth() {
  const [gatewayOk, queueOk, lambdaOk] = await Promise.all([
    checkGatewayHealth(GATEWAY_HEALTH_URL),
    queueReachable(sqs(), QUEUE_NAME),
    lambdaActive(lambdaClient(), FUNCTION_NAME),
  ]);

  let freshestAge = null;
  for (const vital of VITALS) {
    const recent = await recentWindows(doc(), TABLE_NAME, vital, 1);
    if (!recent.length) continue;
    const age = (Date.now() - new Date(recent[recent.length - 1].window_end).getTime()) / 1000;
    if (freshestAge === null || age < freshestAge) freshestAge = age;
  }
  const pipelineOk = freshestAge !== null && freshestAge <= PIPELINE_FRESH_SECONDS;

  return { gateway: gatewayOk, queue: queueOk, lambda: lambdaOk, pipeline: pipelineOk, freshest_age_seconds: freshestAge };
}

async function buildBackendStats() {
  return {
    queue: await queueDepth(sqs(), QUEUE_NAME),
    items_in_table: await scanCount(doc(), TABLE_NAME),
  };
}

let thresholdsCache;
async function fetchThresholds() {
  if (!thresholdsCache) {
    const res = await fetch(GATEWAY_THRESHOLDS_URL, { signal: AbortSignal.timeout(5000) });
    thresholdsCache = await res.text();
  }
  return thresholdsCache;
}

function createApp() {
  const app = express();

  app.get("/api/patients", async (req, res) => {
    res.json({ patients: await buildPatients(doc(), TABLE_NAME, VITALS, PATIENT_IDS) });
  });

  app.get("/api/readings", async (req, res) => {
    const vital = req.query.sensor_type;
    const patientId = req.query.site_id;
    const limit = parseInt(req.query.limit || "60", 10);
    let items = await recentWindows(doc(), TABLE_NAME, vital, patientId ? limit * PATIENT_IDS.length : limit);
    if (patientId) items = items.filter((item) => item.site_id === patientId).slice(-limit);
    res.json({ sensor_type: vital, items });
  });

  app.get("/api/thresholds", async (req, res) => {
    try {
      res.type("application/json").send(await fetchThresholds());
    } catch {
      res.status(502).json({ error: "thresholds unavailable" });
    }
  });

  app.get("/api/health", async (req, res) => {
    res.json(await buildHealth());
  });

  app.get("/api/backend-stats", async (req, res) => {
    res.json(await buildBackendStats());
  });

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
