# Solar Farm Performance Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Solar panels lose conversion efficiency as they run hotter — an array's thermal health slides from a hundred at forty-five degrees down to zero at seventy-two — so heat quietly erodes output long before anything visibly breaks. Dust builds up gradually too. A fault that appears between manual inspections keeps costing energy, silently, until someone happens to look at that array. Ten sensor streams across two arrays are far too much to check by hand.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors stream irradiance, panel temperature, inverter output, DC voltage and soiling across two arrays into a fog node that buffers, windows, aggregates and raises alerts, producing one summary per window. Amazon SQS queues the summaries; a Lambda ingests each into DynamoDB per array and sensor; and S3 with API Gateway serve the dashboard, which shows a per-array efficiency heatmap.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — gateway, queue, processor and pipeline all up. Second, the arrays — per-array readings and a live per-window efficiency heatmap, with threshold alerts covering thermal derate risk, inverter underperformance, undervoltage and cleaning required. Third, scale — ninety-nine automated tests pass across every module, and a two-thousand-message burst was pushed through the queue by thirty-two parallel senders.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was a buffer that never sits still. Every few seconds the fog node must take everything buffered so far and aggregate it, while ten sensors keep writing new readings into that same buffer. One shared buffer with one lock means aggregation blocks ingest — copying under the lock stalls every sensor at every window, and skipping the lock loses or double-counts readings. It is a textbook reader-writer race. The fix is double buffering: two buffers, one live and one flushing, and the lock is held only for an instant pointer swap of the two. Aggregation then works on the swapped-out data while new readings flow into the fresh buffer. A concurrent-writer stress test proves it — nothing lost, nothing copied.
