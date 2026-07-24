# Bridge Structural Health Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Most road authorities still assess a bridge by visual inspection, on a cycle measured in years, not days. Between those inspections the deck keeps working — strain cycles from traffic loading, thermal expansion and contraction at the joints, slow deformation — none of which a scheduled walk-through catches as it develops. Streaming every raw sample to a distant data centre is no answer either. So I close the gap with continuous sensing: five structural sensor types on each of two spans, aggregated at the edge, alerting in seconds.

## 2 · High-level description — Slide 2 (0:30–1:00)

At the centre sits a queue that keeps sensing and processing apart. Ten sensors across two spans feed a fog node that windows, aggregates and alerts; from there, Amazon SQS carries batched summaries downstream, so ingest never waits on processing. A Lambda function drains that queue into a time-keyed DynamoDB store, surfaced through API Gateway and S3. Raw samples stay on the bridge — each ten-second window collapses to one min, max and average per sensor, checked against four thresholds, and the dashboard folds strain and vibration into a zero-to-one-hundred structural integrity index.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Here's the claim I want to back up: one hundred and fifteen tests pass across fourteen suites — windowing, thresholds, pagination, batching, real-socket HTTP routing — and now I'll show you they weren't lying. Watch the health strip: fog gateway, SQS queue, Lambda and data freshness all green, a hundred records landing within a minute of bootstrap. Then the index those tests compute — Span A sits at a hundred percent, excellent, no active alerts; Span B at seventy-six point eight, good, tracking real readings as they arrive. That's the number, and there it is running live.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The riskiest moment was a single Terraform apply. Every project here deploys through one shared module, and its local state already tracked a different live stack under the default workspace. Nothing in my code was wrong — but applied against that workspace, Terraform reconciles state and plans to destroy the other deployment's live resources, and the only warning is one line of plan output. The fix was process, not code: create a dedicated workspace first, then re-plan. It read twenty-four to add, zero to change, zero to destroy, and a single apply built all twenty-four resources, healthy within a minute. Never apply an unread plan. The same audit also caught a pagination undercount and unbatched publishing, both fixed before launch.
