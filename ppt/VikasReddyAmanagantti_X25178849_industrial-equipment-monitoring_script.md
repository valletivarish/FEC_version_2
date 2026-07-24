# Industrial Equipment Predictive Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Vikas Reddy Amanagantti, and this is my Industrial Equipment Predictive Monitoring. A walk-round inspection reads each gauge once, then moves on — and a machine rarely fails on one dial. It builds across heat, vibration, bearing noise, speed and power draw at the same time, in the minutes between rounds, while nobody is looking. My system watches all five signals on both production lines continuously and raises an alarm the instant one crosses its limit — motor temperature over ninety-five degrees, vibration over seven millimetres a second.

## 2 · High-level description — Slide 2 (0:30–1:00)

Start at the machines. Ten sensor units — probes, vibration pickups and bearing microphones — sit across two lines and feed a fog node beside them. Every ten seconds that node closes a window, aggregates each signal and tests the alarm limits at the edge. One compact aggregate per window goes to Amazon SQS; a Lambda drains the queue into DynamoDB; API Gateway and S3 render the live dashboard. Alarms are settled at the edge — the cloud never sees the raw firehose.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

The header pills are all green — fog gateway, queue, Lambda and data flow — and my end-to-end check confirms every one of the five signal types is landing in the datastore. Then the plant floor: one card per signal, each showing its current reading, its real alarm limit and its trend across both lines, so you see how near each is drifting. And it's alarming for real — line one is firing a rotation-speed underspeed alarm right now; rotation speed is the one signal faulted at both ends, too slow or too fast, so it carries a two-sided rule the others don't. Ninety-four automated tests pass across sensors, fog, processor and dashboard, and a two-thousand-message burst from thirty-two parallel senders was absorbed cleanly under load.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Sealing a window under concurrent writes was the hard part. Sensor posts land on several web-server threads while a timer has to close the ten-second window on its own thread, and both touch the same buffer. Hold a lock across the whole close and every arriving reading stalls behind it; drop the lock and a reading landing right on the boundary is lost or double-counted. The fix takes the lock only long enough to swap the full buffer aside and drop in an empty one, then does all the aggregation and alarm work on the swapped-out copy outside the lock. Ingest never waits, and every reading lands in exactly one window.
