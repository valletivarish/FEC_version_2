# Marine Vessel Condition Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Between fixed rounds, the bridge is blind. A fuel-burn spike, a ballast imbalance or rising hull vibration surfaces only at the next scheduled check, not when it starts. And continuous data will not fit the link: ten sensor streams across two vessels produce far more raw data than a narrow, unreliable ship-to-shore link can carry. So the answer must live on board — aggregate and evaluate readings on the vessel itself, and send ashore only compact window summaries.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: on each vessel, sensors produce ten streams and a fog node windows, aggregates and raises alerts, reducing each window to min, max, average, latest and count and checking the alert rules before anything leaves the ship. Ashore, it is fully serverless — Amazon SQS queues the summaries in batches of up to ten, a Lambda ingests each window, DynamoDB stores the aggregates, and S3 with API Gateway serve the Bridge Console. The dashboard stays up even when the vessel is offline.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — the endpoint reports gateway, queue, Lambda and pipeline all true, the freshest reading under a second old, and all five AWS resources verified healthy independently. Second, real data — stored items grew fifty-nine to three seventy-four to four twenty-five during verification, with excessive fuel burn and hull stress firing on the Bridge Console as thresholds are crossed. Third, confidence — one hundred and twenty tests pass, unit and real-socket HTTP across every module, re-verified against the live account.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Two runtimes, one routing table — keeping them honest was the hard part. The dashboard has to answer the same routes on my laptop and inside a cloud function, and they must stay identical, because any divergence between a local route and its cloud twin is a bug that only appears in production, after every local check has gone green. So routing is a single flat dispatch table pairing each path with its handler, and both the local server and the function read that one table. Adding or changing an endpoint is a single edit both runtimes inherit, the routes simply can't drift, and a real-browser check confirmed the live deployment matched the local server exactly.
