# Smart City Operations Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Congestion, a pollution spike, a car park filling up — in a city these build and fade within minutes, between any two manual checks. A patrol or a monthly meter read captures one moment, and the breach that matters happens right after the clipboard leaves. Streaming every raw reading to a distant cloud is the other extreme: heavy, slow and costly at city scale. So I watch continuously on the street and send only compact summaries and alerts onward.

## 2 · High-level description — Slide 2 (0:30–1:00)

The real work happens on the street. Ten sensors across two zones feed a fog relay sitting right beside them. Every ten seconds that relay windows and aggregates each metric and runs five alert rules on the spot — the decisions are made next to the sensors, never in the cloud. Everything downstream is standard serverless: one compact summary per zone per metric to Amazon SQS, a Lambda writing each record into DynamoDB, and API Gateway with S3 serving the dashboard.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Let me start with the alerts, because that's the point. On live data, all five rules are firing across the two zones — congestion, air quality, noise, parking and low visibility — and the air-quality one is a real PM2.5 breach, one zone tipping over the thirty-five microgram limit. Each zone reports its five metrics with citywide trend charts underneath. Behind that, the health strip confirms the whole chain is up: the edge relay online, the queue reachable, and Lambda deployed and archiving records. And for confidence, sixty-two automated tests pass across every module, and a two-thousand-message burst from thirty-two parallel workers was absorbed cleanly.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

A silent race at the window swap could have cost me data. Sensor posts run on four threads while a timer swaps the buffer out to flush it — and a reading landing at that exact instant could be written into the retired buffer after the flush had already read it, and just vanish. No exception, no log line, one number quietly missing. The fix makes each buffer a fenced generation: the flush closes the fence, waits for writers already inside, then reads; anyone arriving later retries into the fresh buffer. The path stays lock-free and every reading lands in exactly one window.
