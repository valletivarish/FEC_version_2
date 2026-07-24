# Smart Agriculture Field Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

A field inspected on a fixed schedule reveals a dry root zone, an overnight frost, or a fungal-risk humidity spell only after the damage is already done — at the next walk-through. My smart-agriculture pipeline closes that gap: it takes a reading every two to four seconds and checks six alert rules at the edge, the moment data arrives. Soil moisture under twenty percent, or a dip below three degrees, is flagged in seconds, not days later.

## 2 · High-level description — Slide 2 (0:30–1:00)

Here is the shape of it. Five sensor types feed a fog node sitting beside them. Every ten seconds the fog node closes a window — it reduces each stream to a minimum, maximum and average and raises alerts locally. Only that compact summary goes onward, batched, to Amazon SQS; a Lambda function fires on each one and writes a single record to DynamoDB; and API Gateway with S3 serve the live dashboard. The key idea: raw readings never leave the edge, only ten-second summaries cross into the cloud.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Let me show it running. First, health — fog node, queue, Lambda and end-to-end freshness all report green, the freshest reading about two seconds old, so the whole pipeline is live right now. Second, the field data — per-sensor panels and trend charts for two fields, each with its threshold band drawn in, and an alert banner across the top the moment a rule trips. Third, scale — I fired a burst of three hundred messages at the live queue; they were absorbed in about four and a half seconds and every one was stored, confirmed directly in DynamoDB. Thirty-nine automated tests back all of this.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was a defect the emulator hid. The dashboard counted its stored records with a single DynamoDB scan — and a scan silently caps at about one megabyte, so past the first page the count just stops. Nothing failed: all thirty-nine tests passed, the emulator run passed, the number even looked right on small data. It only surfaced on real AWS. The fix follows DynamoDB's pagination cursor and sums every page, locked in by a three-page test and re-verified against the live table. The lesson: the emulator is more forgiving than the cloud.
