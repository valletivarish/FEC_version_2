# Solar Farm Performance Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Mahek Naaz, and this is my Solar Farm Performance Monitoring. Solar panels lose conversion efficiency as they run hotter — an array's thermal health slides from a hundred at forty-five degrees down to zero at seventy-two — so heat quietly erodes output long before anything visibly breaks. Dust builds up gradually too. A fault that appears between manual inspections keeps costing energy, silently, until someone happens to look at that array. Ten sensor streams across two arrays are far too much to check by hand.

## 2 · High-level description — Slide 2 (0:30–1:00)

In one pass, ten sensors push irradiance, panel temperature, inverter output, DC voltage and soiling from two arrays into a fog node that buffers, windows, aggregates and raises alerts, emits one summary per window onto Amazon SQS, where a Lambda writes each into DynamoDB per array and sensor before S3 and API Gateway serve the dashboard. The non-obvious part: that dashboard renders a per-array efficiency heatmap.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Let me start where the value is: the live per-window efficiency heatmap. Each array gets a fused efficiency score per window, so you can watch one array's efficiency slip below the other at a glance, right beside its raw readings. On top of that sit threshold alerts for thermal derate risk, inverter underperformance, undervoltage and cleaning required. Behind it, the health strip shows gateway, queue, processor and pipeline all up. And for scale, ninety-nine automated tests pass across every module, and I pushed a two-thousand-message burst through the queue with thirty-two parallel senders.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Performance isn't one sensor — and that was the hard part. An operator doesn't want five raw numbers per array; they want to know how well each array is really doing. But performance is inverter output judged against the panel temperature that limits it, fused into a single figure, per window, without hiding the real faults underneath. So my serving layer combines output and temperature into a graded zero-to-a-hundred efficiency index, computed fresh on every read and drawn as a per-window heatmap, so a whole array's history reads at a glance. The hard underperformance and undervoltage alarms still fire on their own, so the grade summarises without ever masking a fault.
