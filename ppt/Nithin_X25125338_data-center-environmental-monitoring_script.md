# Data Center Environmental Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Nithin, and this is my Data Center Environmental Monitoring. An overheating server, a humidity swing toward condensation, or restricted airflow around a rack can each trigger a hardware failure or a costly unplanned outage. When a facility relies on fixed inspection rounds, these conditions surface only after they have already occurred. So I replace the walk-through with continuous sensing: ten sensors across two server halls, with every aggregation window evaluated against explicit threshold rules the moment it closes.

## 2 · High-level description — Slide 2 (0:30–1:00)

Follow it by the clock. Every few seconds, ten sensors across two halls each report five metrics into the fog node. As each window closes, the node aggregates it and raises any alerts right there at the edge. Only then does a summary cross the wire — through Amazon SQS to a Lambda that writes readings into DynamoDB. A second Lambda serves the dashboard API behind API Gateway, and the page is a static site on S3.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Let me go deep on one feature — the hall view. These are live readings for both server halls. The moment a hall's window closes, every metric is checked against that hall's own threshold rules, and if one crosses, the alert surfaces — the edge decides, no trip to the cloud. That's the design working in front of you. To back it up: four of four health checks are green — gateway, queue, Lambda and pipeline — one hundred and fourteen tests pass across all five modules, and a three-hundred-message burst cleared the real queue in five and a half seconds, every one confirmed stored in DynamoDB.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The brief itself set my hardest constraint: an individually-deployed API function behind a real API Gateway, separate from the ingestion function — not one monolith. That meant splitting the read path from the write path into two independently deployed functions that still had to agree on one table schema and one set of thresholds. My dashboard-API function sits behind its own API Gateway stage, reading the store, the queue depth, the processor metadata and the fog health, while the queue-triggered processor owns every write. They share only the table and the thresholds, so each scales and deploys on its own, and the dashboard never touches the ingestion code.
