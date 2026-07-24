# Retail Footfall & Inventory Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

In a shop, empty shelves sit unnoticed between stock walks and sales are lost silently; a fridge drifts warm between rounds and the whole cold chain is at risk; checkout queues build in minutes, and by the next walk-through the customers are already gone. A periodic manual check simply cannot see any of that as it happens. So I watch ten sensors across two stores continuously and raise an alert the moment a window crosses its threshold.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: five metrics across two stores — footfall, shelf stock, fridge temperature, queue length and energy draw — feed a fog gateway that windows, aggregates and evaluates four retail-health rules. Only one aggregate per window goes to Amazon SQS; a Lambda ingests each batch into DynamoDB; and API Gateway with S3 serve the estate dashboard. The intelligence is at the edge — the cloud stores compact summaries, not raw readings.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — gateway, queue, Lambda and end-to-end freshness all green on the estate roll-up. Second, the stores — KPI tiles and per-store cards showing footfall, shelf stock, fridge temperature, queue length and energy draw across both stores, with trend charts. Third, robustness — one hundred and twenty-two JUnit tests pass across every module, and a two-thousand-message burst went through thirty-two parallel workers.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was one buffer with many writers. Every reading arrives on its own web-server thread, and all of them write into one in-memory buffer while a timer empties it each window. The interleavings that drop a reading only show up under load and are nearly impossible to reproduce in a test — and a lost reading just makes the store numbers quietly wrong. Rather than guard the race with a lock, I designed it out: an actor mailbox, where only one dedicated thread ever touches the buffer. A request drops a message into that thread's mailbox and returns, and a flush is itself a mailbox message, so it can never interleave with a write. The race is structurally impossible.
