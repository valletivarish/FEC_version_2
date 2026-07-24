# Patient Vitals Remote Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

A ward round reads each patient's vitals once, then moves on — but deterioration is a trend. Blood oxygen falls, a heart rate climbs, over minutes, and any single reading in isolation can still look normal. Between rounds, nobody is watching the numbers. My system monitors five vitals for two patients around the clock and checks every ten-second window against clinical limits — so a blood-oxygen level dropping below ninety-two percent raises a hypoxia alert in seconds, not at the next round.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten bedside streams — five vitals across two patients — feed a fog gateway. Every ten seconds the gateway aggregates each vital and checks the clinical alert rules right there. Only one compact aggregate per vital per window goes onward, batched, to Amazon SQS; a Lambda triggered off the queue writes each record into DynamoDB; and API Gateway with S3 serve the ward dashboard. The intelligence lives at the edge — the cloud sees aggregates, not raw streams.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live. First, health — the edge gateway is online, the queue reachable, the Lambda deployed, and windowed records are archiving, so the whole chain is running. Second, the monitor — two patients streaming all five vitals, and a hypoxia banner firing on real data the moment blood oxygen crosses the ninety-two percent trigger, around eighty-nine point seven. Third, confidence — forty-one automated tests pass across the sensor, fog gateway, processor and dashboard modules.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

One argument nearly caused a silent bug. My dashboard handler takes an optional bag of cloud clients so the tests can inject fakes — but the serverless runtime quietly slips its own completion callback into that same argument slot. The handler could mistake the runtime's callback for real clients and try to query it as if it were the database. The fix was to judge the argument by its shape, not just its presence: treat it as clients only when it genuinely carries a store client, otherwise build my own. Now the test path and the production path are unmistakably separate, and the runtime's callback can never be read as a client.
