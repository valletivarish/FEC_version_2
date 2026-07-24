# Data Center Environmental Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

An overheating server, a humidity swing toward condensation, or restricted airflow around a rack can each trigger a hardware failure or a costly unplanned outage. When a facility relies on fixed inspection rounds, these conditions surface only after they have already occurred. So I replace the walk-through with continuous sensing: ten sensors across two server halls, with every aggregation window evaluated against explicit threshold rules the moment it closes.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors across two halls, five metrics each, feed a fog node that windows, aggregates and raises alerts at the edge. Window summaries flow through Amazon SQS to a Lambda ingest function, which stores readings in DynamoDB; a second Lambda serves the dashboard API behind API Gateway; and the page itself is a static site on S3. Alerts fire at the edge, so only compact summaries cross into the cloud.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — four of four checks green on the live deployment: gateway, queue, Lambda and pipeline. Second, the halls — live per-hall readings for both server halls, each checked against its threshold rules the moment a window closes. Third, scale — one hundred and fourteen automated tests pass across all five modules, and a three-hundred-message burst hit the real queue in five and a half seconds with every one confirmed stored in DynamoDB.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The brief itself set my hardest constraint: an individually-deployed API function behind a real API Gateway, separate from the ingestion function — not one monolith. That meant splitting the read path from the write path into two independently deployed functions that still had to agree on one table schema and one set of thresholds. My dashboard-API function sits behind its own API Gateway stage, reading the store, the queue depth, the processor metadata and the fog health, while the queue-triggered processor owns every write. They share only the table and the thresholds, so each scales and deploys on its own, and the dashboard never touches the ingestion code.
