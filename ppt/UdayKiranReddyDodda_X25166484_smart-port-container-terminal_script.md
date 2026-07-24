# Smart Port Container Terminal Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Uday Kiran Reddy Dodda, and this is my Smart Port Container Terminal Monitoring. At a container terminal, two berths feed ten live sensor streams — crane load, container stacks, wind, occupancy and reefer temperature. Sensors sample every two to four seconds, but a manual walk-round sees each berth only minutes apart, and the dangerous moments are transient: one gust over the wind limit, one overloaded lift, one reefer drifting warm. A paper log catches these after the fact, when the crane, the cargo or the cold chain is already at risk.

## 2 · High-level description — Slide 2 (0:30–1:00)

Start with what survives: if the edge host drops, the dashboard serves — S3 with API Gateway, serverless. Feeding it, ten units across two berths reach a fog node that windows, aggregates and raises alerts, then publishes one batched message per cycle to Amazon SQS. That triggers a Lambda for serverless ingest into a time-ordered DynamoDB store. Each ten-second window collapses raw readings into one aggregate per sensor per berth, rules fire right there, so raw noise never leaves the terminal.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

This runs on the real AWS account. My scripted check walks the whole path end to end — a sensor reading is emitted, batched to the queue, ingested by Lambda and landed in the store — and I watch the freshest data come back only seconds old, with four of four health checks green. From there, the visible side: crane, wind and cold-chain alerts across both berths, every one tracing to a real, code-defined threshold. And for scale, ninety-five automated tests pass across every module, while a two-thousand-message burst drains fully through the queue and live berth data stays untouched.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Not every signal deserves an alarm, and getting that right was the hard part. A container terminal streams two kinds of signal: some carry a real safety rule — crane overload, reefer temperature, a high-wind crane halt — and some, like container stack height, are useful context that should never raise an alarm. If the dashboard advertised a threshold for every signal, the operator's alarm list would fill with numbers that can never fire. So the fog gateway only publishes thresholds for signals with an active rule; the context-only ones are still aggregated and trended, but deliberately left off the list. A test asserts stack height never appears — so what reads as monitored for breach is exactly what the edge will alarm on.
