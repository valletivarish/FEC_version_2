# Smart Port Container Terminal Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

At a container terminal, two berths feed ten live sensor streams — crane load, container stacks, wind, occupancy and reefer temperature. Sensors sample every two to four seconds, but a manual walk-round sees each berth only minutes apart, and the dangerous moments are transient: one gust over the wind limit, one overloaded lift, one reefer drifting warm. A paper log catches these after the fact, when the crane, the cargo or the cold chain is already at risk.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten units across two berths feed a fog node that windows, aggregates and raises alerts. The node publishes one batched message per cycle to Amazon SQS, which triggers a Lambda for serverless ingest into a time-ordered DynamoDB store; and a dashboard on S3 with API Gateway serves the live view. At the edge, every ten-second window collapses the raw readings into one aggregate per sensor per berth and the safety rules fire right there, so raw noise never leaves the terminal.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live on the real AWS account. First, health — four of four checks green, the freshest data only seconds old. Second, the berths — crane, wind and cold-chain alerts across both berths, with every alert tracing to a real, code-defined threshold. Third, scale — ninety-five automated tests pass across every module, and a two-thousand-message burst drains fully through the queue while live berth data stays untouched.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Not every signal deserves an alarm, and getting that right was the hard part. A container terminal streams two kinds of signal: some carry a real safety rule — crane overload, reefer temperature, a high-wind crane halt — and some, like container stack height, are useful context that should never raise an alarm. If the dashboard advertised a threshold for every signal, the operator's alarm list would fill with numbers that can never fire. So the fog gateway only publishes thresholds for signals with an active rule; the context-only ones are still aggregated and trended, but deliberately left off the list. A test asserts stack height never appears — so what reads as monitored for breach is exactly what the edge will alarm on.
