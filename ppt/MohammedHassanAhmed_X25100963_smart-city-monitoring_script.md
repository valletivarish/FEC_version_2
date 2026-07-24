# Smart City Operations Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Congestion, a pollution spike, a car park filling up — in a city these build and fade within minutes, between any two manual checks. A patrol or a monthly meter read captures one moment, and the breach that matters happens right after the clipboard leaves. Streaming every raw reading to a distant cloud is the other extreme: heavy, slow and costly at city scale. So I watch continuously on the street and send only compact summaries and alerts onward.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten street sensors across two zones feed a fog relay. Every ten seconds it windows and aggregates each metric and checks five alert rules right at the edge. Only one compact summary per zone per metric goes to Amazon SQS; a Lambda function writes each record into DynamoDB; and API Gateway with S3 serve the live dashboard. The alerts are computed beside the sensors — the cloud never sees the raw firehose.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — edge relay online, queue reachable, Lambda deployed and records archiving, so the whole chain is running. Second, the city view — two zones reporting five metrics each, citywide trend charts, and five alert rules firing on real data: congestion, air quality, noise, parking and low visibility. Third, confidence — sixty-two automated tests pass across every module, and a two-thousand-message burst from thirty-two parallel workers was absorbed cleanly.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was a silent race at the window swap. Sensor posts run on four threads while a timer swaps the buffer out to flush it — and a reading landing at that exact instant could be written into the retired buffer after the flush had already read it, and just vanish. No exception, no log line, one number quietly missing. The fix makes each buffer a fenced generation: the flush closes the fence, waits for writers already inside, then reads; anyone arriving later retries into the fresh buffer. The path stays lock-free and every reading lands in exactly one window.
