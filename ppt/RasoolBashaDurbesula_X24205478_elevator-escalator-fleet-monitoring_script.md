# Elevator & Escalator Fleet Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Rasool Basha Durbesula, and this is my Elevator & Escalator Fleet Monitoring. A lift fails two ways. Slowly, as a motor creeps hot or a ride roughens over weeks; and suddenly, as one overweight trip loads the car past its limit in a single instant. A clipboard round sees one moment, but the fleet changes state every second, around the clock. That is two towers, five signals each, ten live streams — motor temperature, door cycles, cab vibration, load weight and travel speed.

## 2 · High-level description — Slide 2 (0:30–1:00)

Behind API Gateway sit two serverless tiers. On the write side, ten streams across two towers feed a fog node that windows, aggregates and raises alerts; Amazon SQS carries those aggregates, and a Lambda ingests each one into DynamoDB. On the read side, S3 serves the dashboard. Alerts are decided at the edge, in the window they appear. And the whole stack went to a real AWS account in one infrastructure-as-code step — twenty-four resources, no manual clicking.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Three things to watch, and I'll tick each one off. Is it up? Is it seeing the fleet? And does it hold under load? Start with up: the health strip shows gateway, queue, Lambda and pipeline all green — tick. Seeing the fleet: both towers are streaming all five signals, and one tower is alerting on a ride-quality fault and an overload warning at once — tick. Holding under load: one hundred and twenty-two automated tests pass across every module, and a two-thousand-message burst from thirty-two senders was absorbed and drained — tick.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The subtle part was choosing peak or trend. Every window reduces to the same five numbers — count, minimum, maximum, average and latest. If every rule read the average, the overload would slip through: one overweight trip among nine ordinary ones averages out below the limit while the car is genuinely overloaded. So each rule reads the number its fault lives in — overheating, rough riding and stalling are trends, so they read the window average; overload is a single instant, so it reads the window maximum. And the samplers are drift-corrected, so every window covers a like span of time and the peak that trips an overload is real, not an artefact of a clock that slipped. A unit test fires the overload on a peak the average leaves safely below the limit.
