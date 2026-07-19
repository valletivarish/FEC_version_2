import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as service from "./service.js";

const staticDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "static");

function sendJson(res, producer) {
  return (req) => {
    Promise.resolve(producer(req))
      .then((body) => res.json(body))
      .catch((err) => res.status(500).json({ error: err.message || "internal error" }));
  };
}

function buildApp(options = {}) {
  const clients = options.clients ?? null;
  const svc = options.service ?? service;
  const resolved = clients ?? svc.makeClients();

  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ methods: ["GET", "OPTIONS"] }));
  app.use((req, res, next) => {
    res.setHeader("x-request-id", crypto.randomUUID());
    next();
  });

  const api = express.Router();
  api.get("/sites", (req, res) => sendJson(res, () => svc.network(resolved))(req));
  api.get("/readings", (req, res) => sendJson(res, (r) => svc.readings(resolved, r.query.site, r.query.signal))(req));
  api.get("/health", (req, res) => sendJson(res, () => svc.health(resolved))(req));
  api.get("/backend-stats", (req, res) => sendJson(res, () => svc.backendStats(resolved))(req));
  api.get("/thresholds", (req, res) => {
    Promise.resolve(svc.thresholds())
      .then((body) => res.json(body))
      .catch((err) => res.status(502).json({ error: `fog unreachable: ${err.message}` }));
  });
  app.use("/api", api);

  app.use(express.static(staticDir));
  return app;
}

export { buildApp };
