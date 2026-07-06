# FEC Project — Smart Agriculture Fog/Edge Pipeline (Design)

Module: Fog and Edge Computing (H9FECC), NCI. CA worth 40%. Brief: `FEC Project Descript.md`.

## Goal

A three-tier IoT pipeline for smart agriculture: simulated field sensors → virtual fog node (aggregation + alerting) → scalable cloud backend (queue + serverless-shaped processor + datastore) → responsive per-sensor dashboard. Phase 1 (this spec) runs entirely on Docker + LocalStack. Phase 2 (later) ports to real AWS and writes the IEEE report.

## Domain and sensors

Five sensor types, each simulating a field site:

- `soil_moisture` (%)
- `temperature` (°C)
- `humidity` (%)
- `light_intensity` (lux)
- `rainfall` (mm)

Each sensor is autonomous and timer-driven from container start — no manual triggering.

## Two configurable rates (brief line 26)

The brief requires **configurable frequency AND dispatch rates** as distinct knobs. Each sensor has:

- `SAMPLE_INTERVAL` — how often it generates a reading into its local buffer
- `DISPATCH_INTERVAL` — how often it flushes the buffered readings onward to the fog node

These are independent (e.g. sample every 2s, dispatch every 10s), modelling real edge behaviour: sample fast locally, transmit less often. Both set per-sensor via environment variables.

## Components

### sensors/
One codebase, parametrised per sensor type. Loop: generate value within a realistic range for the type → append to buffer → on dispatch tick, POST the buffered batch as JSON to the fog node's HTTP endpoint, clear buffer. Values drift plausibly (bounded random walk) rather than pure noise so charts look real and thresholds trip naturally.

### fog/
FastAPI service. Responsibilities:
- Ingest sensor batches over HTTP.
- Maintain a rolling time window per sensor type.
- Compute aggregates per window: min, max, avg, sample count, latest value.
- Apply threshold rules per sensor type to raise alert flags (e.g. soil_moisture below threshold → `irrigation_needed`; temperature above threshold → `heat_stress`).
- Dispatch **one aggregated message per window per sensor type** to SQS (data reduction at the edge — this is the fog "processing" the brief demands, not pass-through relaying).

Aggregated message shape: `sensor_type`, `window_start`, `window_end`, `min`, `max`, `avg`, `count`, `latest`, `alerts[]`.

### backend/processor/
Worker container polling the SQS queue. Core logic is a pure function `process(event) -> record` that shapes an SQS message into a DynamoDB item and writes it. Table keys: partition = `sensor_type`, sort = `window_end` (timestamp). `process()` is written so its body becomes the AWS Lambda handler verbatim in phase 2 (SQS event source mapping) — porting is a wrapper swap, not a rewrite.

### backend/dashboard/
FastAPI serving an HTML/Chart.js page. One chart per sensor type plotting the aggregate time series, plus a live alert indicator. Data via a JSON API route that queries DynamoDB. "Responsive" covered two ways: mobile-friendly CSS layout, and a ~2–3s client poll so the demo visibly updates live.

### infra/
`docker-compose.yml` wiring all containers + LocalStack. A bootstrap step creates the SQS queue and DynamoDB table on startup. All AWS access is via real `boto3` pointed at the LocalStack endpoint, so phase-2 AWS is an endpoint/IAM config change only.

### loadtest/
A burst generator that fires many readings per second, to produce scalability evidence: phase 1 shows the queue absorbing bursts; phase 2 shows Lambda concurrency in CloudWatch. Built now so the phase-2 test isn't forgotten.

### .github/workflows/
CI on push: run pytest, then `docker compose up` a smoke test that asserts data flows end-to-end. Satisfies the brief's explicit "continuous integration and deployment" requirement and gives the report a CI/CD artefact.

## Data flow

```
sensors → HTTP batch → fog (window + aggregate + alert) → SQS → processor process() → DynamoDB → dashboard API → Chart.js
```

## Testing

- pytest, pure functions: fog windowing/aggregation, threshold/alert logic, processor `process()`.
- pytest, fog HTTP endpoint: POST a batch → assert window state and alert flags (covers the ingest path, not just internal logic).
- pytest, dashboard route: GET the data API → assert JSON shape and values.
- Integration: `docker compose up`, wait for flow, assert records land in DynamoDB.
- Manual: dashboard in browser shows live-updating charts + alerts (Chart.js rendering eyeballed).

## Error handling

- Fog rejects malformed payloads with a 4xx rather than crashing; one bad batch never stops the pipeline.
- Processor treats SQS polling failures and single-message failures as retryable (message stays on queue / returns to visibility) rather than dropping data.
- Sensors tolerate the fog node being briefly unavailable (retry on next dispatch tick, keep buffering).

## Coding conventions

- Plain, human-style Python. Minimal comments — only for non-obvious *why*, not narrating *what*.
- No boilerplate docstrings, no premature abstraction, no defensive handling of impossible states.
- Small focused files per component; each independently testable.

## Phase-2 notes (deferred, tracked here so they aren't lost)

- DynamoDB in **on-demand** capacity mode (clearest autoscaling story).
- Decide fog deployment target (e.g. Fargate) vs. staying containerised on a cloud VM.
- Dashboard is the one non-serverless piece — acknowledge in report (could sit behind API Gateway + Lambda or ALB + ASG; out of scope this iteration).
- Cite any reused scaffolding (LocalStack config, boto3/FastAPI boilerplate) per the brief's reuse rule.
- Report: IEEE 2-column, 6–8 pages, include architecture + data-flow diagrams and the load-test result graph.

## Compliance check vs. brief

- 3–5 sensor types → 5. ✓
- Configurable frequency + dispatch rates → two distinct knobs. ✓
- Fog receives, processes, dispatches → windowed aggregation + alerts + SQS. ✓
- Scalable backend (queues/FaaS/autoscaling) → SQS + Lambda-shaped processor + on-demand DynamoDB. ✓ (evidence via loadtest)
- Responsive dashboards per sensor type → Chart.js per type, responsive CSS, live poll. ✓
- Deployed + tested → Docker now, AWS phase 2; automated tests across layers. ✓
- CI/CD → GitHub Actions. ✓
