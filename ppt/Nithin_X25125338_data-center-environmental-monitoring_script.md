# Data Center Environmental Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

An overheating server, a humidity swing toward condensation, or restricted airflow around a rack can each trigger a hardware failure or a costly unplanned outage. When a facility relies on fixed inspection rounds, these conditions surface only after they have already occurred. So I replace the walk-through with continuous sensing: ten sensors across two server halls, with every aggregation window evaluated against explicit threshold rules the moment it closes.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors across two halls, five metrics each, feed a fog node that windows, aggregates and raises alerts at the edge. Window summaries flow through Amazon SQS to a Lambda ingest function, which stores readings in DynamoDB; a second Lambda serves the dashboard API behind API Gateway; and the page itself is a static site on S3. Alerts fire at the edge, so only compact summaries cross into the cloud.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — four of four checks green on the live deployment: gateway, queue, Lambda and pipeline. Second, the halls — live per-hall readings for both server halls, each checked against its threshold rules the moment a window closes. Third, scale — one hundred and fourteen automated tests pass across all five modules, and a three-hundred-message burst hit the real queue in five and a half seconds with every one confirmed stored in DynamoDB.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was a fault only real AWS revealed. Whenever the AWS access-key variable existed, three files swapped in hardcoded emulator credentials — and real Lambda and EC2 inject that exact variable automatically. So genuine session credentials were thrown away, and every call to DynamoDB or SQS would have failed authentication. Locally the condition happened to be correct, so all one hundred and fourteen tests and the full emulator run passed; the emulator cannot reproduce the trigger at all. The fix gates the emulator credentials on a signal unique to local development — the explicit endpoint override — across all three files, then redeploys and verifies live with a real write and receive. The same testing also caught a pagination undercount, now covered by two new tests.
