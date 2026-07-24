# Bridge Structural Health Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Most road authorities still assess a bridge by visual inspection, on a cycle measured in years, not days. Between those inspections the deck keeps working — strain cycles from traffic loading, thermal expansion and contraction at the joints, slow deformation — none of which a scheduled walk-through catches as it develops. Streaming every raw sample to a distant data centre is no answer either. So I close the gap with continuous sensing: five structural sensor types on each of two spans, aggregated at the edge, alerting in seconds.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors across two spans feed a fog node that windows, aggregates and alerts. Amazon SQS carries batched summaries to a Lambda ingest function, into a time-keyed DynamoDB store, surfaced by a dashboard on API Gateway and S3. Raw samples never leave the bridge; every ten-second window becomes one min, max and average per sensor, checked against four thresholds at the fog node, and the dashboard folds each span's strain and vibration into a zero-to-one-hundred structural integrity index.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — fog gateway, SQS queue, Lambda and data freshness all green, with a hundred records landing within a minute of bootstrap. Second, the index — Span A at a hundred percent, excellent with no active alerts, and Span B at seventy-six point eight, good and tracking real readings. Third, confidence — one hundred and fifteen tests pass across fourteen suites: windowing, thresholds, pagination, batching and real-socket HTTP routing.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was one risky Terraform apply. Every project here deploys through one shared module, and its local state already tracked a different live stack under the default workspace. Nothing in my code was wrong — but applied against that workspace, Terraform reconciles state and plans to destroy the other deployment's live resources, and the only warning is one line of plan output. The fix was process, not code: create a dedicated workspace first, then re-plan. It read twenty-four to add, zero to change, zero to destroy, and a single apply built all twenty-four resources, healthy within a minute. Never apply an unread plan. The same audit also caught a pagination undercount and unbatched publishing, both fixed before launch.
