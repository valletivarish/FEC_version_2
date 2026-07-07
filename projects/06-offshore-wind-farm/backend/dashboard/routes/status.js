"use strict";

const express = require("express");
const { freshestAgeSeconds } = require("../readingsStore");
const {
  isQueueReachable,
  isLambdaActive,
  readQueueCounters,
  countTableItems,
  checkFogGateway,
  isPipelineFlowing,
} = require("../pipelineStatus");

function buildStatusRouter(deps) {
  const router = express.Router();

  router.get("/api/health", async (req, res) => {
    const [gatewayUp, queueUp, lambdaUp, freshestAge] = await Promise.all([
      checkFogGateway(deps.fogHealthUrl),
      isQueueReachable(deps.sqs(), deps.queueName),
      isLambdaActive(deps.lambda(), deps.functionName),
      freshestAgeSeconds(deps.doc(), deps.tableName),
    ]);
    res.json({
      fog_gateway: gatewayUp,
      queue: queueUp,
      lambda: lambdaUp,
      pipeline: isPipelineFlowing(freshestAge),
      freshest_age_seconds: freshestAge,
    });
  });

  router.get("/api/backend-stats", async (req, res) => {
    const [queue, itemsInTable] = await Promise.all([
      readQueueCounters(deps.sqs(), deps.queueName),
      countTableItems(deps.doc(), deps.tableName),
    ]);
    res.json({ queue, items_in_table: itemsInTable });
  });

  router.get("/api/thresholds", async (req, res) => {
    try {
      const upstream = await fetch(deps.fogThresholdsUrl, { signal: AbortSignal.timeout(5000) });
      res.type("application/json").send(await upstream.text());
    } catch {
      res.status(502).json({ error: "thresholds unavailable" });
    }
  });

  return router;
}

module.exports = { buildStatusRouter };
