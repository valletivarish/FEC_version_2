# Industrial Equipment Predictive Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

A walk-round inspection reads each gauge once, then moves on — and a machine rarely fails on one dial. It builds across heat, vibration, bearing noise, speed and power draw at the same time, in the minutes between rounds, while nobody is looking. My system watches all five signals on both production lines continuously and raises an alarm the instant one crosses its limit — motor temperature over ninety-five degrees, vibration over seven millimetres a second.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensor units across two lines feed a fog node sitting beside the machines. Every ten seconds the fog node closes a window, aggregates each signal, and evaluates the alarm limits right there at the edge. Only one compact aggregate per window goes to Amazon SQS; a Lambda function consumes the queue and writes each record to DynamoDB; and API Gateway with S3 serve the live dashboard. Alarms are decided at the edge — the cloud never sees the raw firehose.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — fog gateway, queue, Lambda and data flow all green, and my end-to-end check confirms every one of the five signal types is landing in the datastore. Second, the plant floor — a card per signal showing its current reading, its real alarm limit and its trend, across both lines, with the health footer underneath. Third, robustness — ninety-four automated tests pass across sensors, fog, processor and dashboard, and in a load test a two-thousand-message burst from thirty-two parallel senders was absorbed cleanly.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was sealing a window under concurrent writes. Sensor posts land on several web-server threads while a timer has to close the ten-second window on its own thread, and both touch the same buffer. Hold a lock across the whole close and every arriving reading stalls behind it; drop the lock and a reading landing right on the boundary is lost or double-counted. The fix takes the lock only long enough to swap the full buffer aside and drop in an empty one, then does all the aggregation and alarm work on the swapped-out copy outside the lock. Ingest never waits, and every reading lands in exactly one window.
