# Smart Parking Management — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

An operator asks two different things about a car park at once: how full is each lot, and is anything wrong. They are not the same question. Fullness is a smooth quantity that climbs and falls with the day; a fault is a discrete event — a gate stuck faulting, an inflow surge, a car dwelling far too long. A lot can be busy but perfectly healthy, or nearly empty yet faulted, so the two belong on separate axes.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten streams across two lots — occupied spaces, entry rate, exit rate, average dwell time and gate-fault events — feed a fog node that windows, aggregates and raises four hard fault alarms at the edge. Amazon SQS carries the aggregates; a Lambda ingests each into DynamoDB; and S3 with API Gateway serve the console. Fault alarms are decided at the edge, in the window they appear.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — gateway, queue, processor and pipeline all green. Second, the fusion itself — both lots stream all five signals, and right now one lot reads Normal while the other reads Alert on a gate-fault alarm despite a low occupancy, which is exactly the case the design is built for. Third, scale — one hundred and twenty-seven automated tests pass across every module, and a two-thousand-message burst from thirty-two senders was absorbed and drained.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was answering how full and what is wrong at the same time without letting one hide the other. The fog answers the fault question at the edge, raising four hard alarms per window. The dashboard answers fullness on read, turning each lot's latest occupancy into a percentage and bucketing it into Quiet, Busy or Near-full. Then the two fuse into one badge, and a fault outranks the fullness tier — any active fault forces the badge to Alert, whether the lot is empty or full, so the operator always sees the more urgent of the two at a glance. The tier is derived fresh on every read and never stored, so the thresholds can be retuned without touching the stored windows.
