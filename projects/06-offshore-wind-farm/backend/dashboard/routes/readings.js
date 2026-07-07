"use strict";

const express = require("express");
const { latestWindowsFor, buildFarmGrid } = require("../readingsStore");

function buildReadingsRouter(deps) {
  const router = express.Router();

  router.get("/api/readings", async (req, res) => {
    const sensorType = req.query.sensor_type;
    const siteId = req.query.site_id;
    const limit = parseInt(req.query.limit || "60", 10);
    let items = await latestWindowsFor(deps.doc(), deps.tableName, sensorType, siteId ? limit * 4 : limit);
    if (siteId) items = items.filter((item) => item.site_id === siteId).slice(-limit);
    res.json({ sensor_type: sensorType, items });
  });

  router.get("/api/farm-grid", async (req, res) => {
    res.json({ tiles: await buildFarmGrid(deps.doc(), deps.tableName) });
  });

  return router;
}

module.exports = { buildReadingsRouter };
