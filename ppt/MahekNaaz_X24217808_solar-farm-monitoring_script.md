# Solar Farm Performance Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Solar panels lose conversion efficiency as they run hotter — an array's thermal health slides from a hundred at forty-five degrees down to zero at seventy-two — so heat quietly erodes output long before anything visibly breaks. Dust builds up gradually too. A fault that appears between manual inspections keeps costing energy, silently, until someone happens to look at that array. Ten sensor streams across two arrays are far too much to check by hand.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors stream irradiance, panel temperature, inverter output, DC voltage and soiling across two arrays into a fog node that buffers, windows, aggregates and raises alerts, producing one summary per window. Amazon SQS queues the summaries; a Lambda ingests each into DynamoDB per array and sensor; and S3 with API Gateway serve the dashboard, which shows a per-array efficiency heatmap.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — gateway, queue, processor and pipeline all up. Second, the arrays — per-array readings and a live per-window efficiency heatmap, with threshold alerts covering thermal derate risk, inverter underperformance, undervoltage and cleaning required. Third, scale — ninety-nine automated tests pass across every module, and a two-thousand-message burst was pushed through the queue by thirty-two parallel senders.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Performance isn't one sensor — and that was the hard part. An operator doesn't want five raw numbers per array; they want to know how well each array is really doing. But performance is inverter output judged against the panel temperature that limits it, fused into a single figure, per window, without hiding the real faults underneath. So my serving layer combines output and temperature into a graded zero-to-a-hundred efficiency index, computed fresh on every read and drawn as a per-window heatmap, so a whole array's history reads at a glance. The hard underperformance and undervoltage alarms still fire on their own, so the grade summarises without ever masking a fault.
