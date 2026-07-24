# Retail Footfall & Inventory Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

In a shop, empty shelves sit unnoticed between stock walks and sales are lost silently; a fridge drifts warm between rounds and the whole cold chain is at risk; checkout queues build in minutes, and by the next walk-through the customers are already gone. A periodic manual check simply cannot see any of that as it happens. So I watch ten sensors across two stores continuously and raise an alert the moment a window crosses its threshold.

## 2 · High-level description — Slide 2 (0:30–1:00)

Let me trace one reading. It leaves a sensor — say fridge temperature, one of five metrics with footfall, shelf stock, queue length and energy draw across two stores. It meets the fog gateway, which windows it, aggregates it and evaluates four retail-health rules. Only one aggregate per window crosses into Amazon SQS; a Lambda lands each batch in DynamoDB; API Gateway and S3 surface it on the estate dashboard. The thinking stays at the edge; the cloud keeps summaries.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Watch the top of the estate roll-up — an alert's just fired on live data, a window crossing its threshold in one of the two stores: the empty-shelf or warm-fridge moment a stock walk would miss, caught the instant it happens. Behind that, the health strip is green — gateway, queue, Lambda and end-to-end freshness all good. The KPI tiles and per-store cards track footfall, shelf stock, fridge temperature, queue length and energy draw across both stores, each with its trend chart. And under the hood, 122 JUnit tests pass across every module, with a 2,000-message burst driven through 32 parallel workers.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

One buffer, many writers — that was the hard part. Every reading arrives on its own web-server thread, and all of them write into one in-memory buffer while a timer empties it each window. The interleavings that drop a reading only show up under load and are nearly impossible to reproduce in a test — and a lost reading just makes the store numbers quietly wrong. Rather than guard the race with a lock, I designed it out: an actor mailbox, where only one dedicated thread ever touches the buffer. A request drops a message into that thread's mailbox and returns, and a flush is itself a mailbox message, so it can never interleave with a write. The race is structurally impossible.
