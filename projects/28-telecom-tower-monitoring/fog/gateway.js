import process from "node:process";
import { fileURLToPath } from "node:url";
import express from "express";
import { Windower } from "./windower.js";
import { Dispatcher } from "./dispatcher.js";
import { evaluate, thresholds } from "./alarms.js";

function validate(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return "body must be a JSON object";
  const { sensor_type, site_id, readings } = body;
  if (typeof sensor_type !== "string" || sensor_type.length === 0) return "sensor_type is required";
  if (typeof site_id !== "string" || site_id.length === 0) return "site_id is required";
  if (!Array.isArray(readings) || readings.length === 0) return "readings must be a non-empty array";
  for (const r of readings) {
    if (!r || typeof r.value !== "number" || Number.isNaN(r.value)) return "each reading needs a numeric value";
  }
  return null;
}

function enrich(batch) {
  return batch.map((w) => ({ ...w, alerts: evaluate(w) }));
}

function buildApp(options = {}) {
  const windowMs = options.windowMs ?? Number(process.env.WINDOW_SECONDS || 10) * 1000;
  const windower = options.windower ?? new Windower(windowMs);
  const sink = options.sink ?? (async () => {});

  windower.on("flush", (batch) => {
    Promise.resolve(sink(enrich(batch))).catch((err) => console.error(`sink failed: ${err.message}`));
  });

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.locals.windower = windower;

  app.post("/ingest", (req, res) => {
    const problem = validate(req.body);
    if (problem) return res.status(400).json({ error: problem });
    const { sensor_type, site_id, unit } = req.body;
    const now = new Date().toISOString();
    for (const r of req.body.readings) {
      windower.accept({ sensor_type, site_id, unit, value: r.value, ts: r.ts || now });
    }
    return res.status(202).json({ accepted: req.body.readings.length });
  });

  app.get("/health", (req, res) => res.json({ status: "ok", pending: windower.pending() }));
  app.get("/thresholds", (req, res) => res.json(thresholds()));

  return app;
}

async function main() {
  const port = Number(process.env.PORT || 8000);
  const dispatcher = new Dispatcher();
  await dispatcher.configure();
  const app = buildApp({ sink: (windows) => dispatcher.publish(windows) });
  app.locals.windower.start();
  app.listen(port, () => console.log(`tower gateway listening on :${port}`));
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { buildApp, validate, enrich };
