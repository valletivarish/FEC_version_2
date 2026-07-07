"use strict";

const express = require("express");
const { openAccumulator, fold } = require("./accumulator");

const KEY_DELIM = "::";

function keyOf(sensorType, siteId) {
  return sensorType + KEY_DELIM + siteId;
}

function splitKey(key) {
  const parts = key.split(KEY_DELIM);
  return { sensorType: parts[0], siteId: parts[1] };
}

// station holds live accumulators plus unit metadata; a plain object rather
// than a class since the only behaviour needed is buffer/snapshot/clear.
function createStation() {
  return { buckets: new Map(), units: new Map() };
}

function buffer(station, body) {
  const sensorType = body.sensor_type;
  const siteId = body.site_id || "turbine-1";
  const unit = body.unit;
  const readings = body.readings || [];
  const key = keyOf(sensorType, siteId);
  let acc = station.buckets.get(key);
  if (!acc) {
    acc = openAccumulator();
    station.buckets.set(key, acc);
  }
  for (const reading of readings) fold(acc, reading.value);
  if (unit) station.units.set(sensorType, unit);
  return readings.length;
}

function snapshotAndClear(station) {
  const taken = station.buckets;
  station.buckets = new Map();
  const units = new Map(station.units);
  const groups = [];
  for (const [key, acc] of taken.entries()) {
    if (acc.count === 0) continue;
    const parts = splitKey(key);
    groups.push({ sensorType: parts.sensorType, siteId: parts.siteId, unit: units.get(parts.sensorType) || "", acc });
  }
  return groups;
}

function buildRouter(station) {
  const router = express.Router();
  router.post("/ingest", (req, res) => {
    const accepted = buffer(station, req.body);
    res.status(202).json({ accepted });
  });
  return router;
}

module.exports = { createStation, buffer, snapshotAndClear, buildRouter, keyOf, splitKey };
