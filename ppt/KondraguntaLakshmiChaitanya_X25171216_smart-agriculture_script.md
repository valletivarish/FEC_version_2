# Smart Agriculture Field Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

A field inspected on a fixed schedule reveals a dry root zone, an overnight frost, or a fungal-risk humidity spell only after the damage is already done — at the next walk-through. My smart-agriculture pipeline closes that gap: it takes a reading every two to four seconds and checks six alert rules at the edge, the moment data arrives. Soil moisture under twenty percent, or a dip below three degrees, is flagged in seconds, not days later.

## 2 · High-level description — Slide 2 (0:30–1:00)

Think of it as six jobs. Sense: five sensor types. Aggregate: a fog node beside them closes a window every ten seconds, reducing each stream to a minimum, maximum and average, and raising alerts locally. Buffer: only that summary, batched, into Amazon SQS. Ingest: a Lambda fires on each one. Store: it writes a single record to DynamoDB. Serve: API Gateway and S3 push the live dashboard. Raw readings never leave the edge — only ten-second summaries cross into the cloud.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Watch the freshness clock: the newest reading is about two seconds old, so this pipeline is live right now — fog node, queue, Lambda and end-to-end freshness all reporting green. From there, the field data: per-sensor panels and trend charts for two fields, each with its threshold band drawn in, and an alert banner that drops across the top the moment a rule trips. To prove it scales, I fired a burst of three hundred messages at the live queue; they were absorbed in about four and a half seconds, and every one landed, confirmed directly in DynamoDB. Thirty-nine automated tests back all of this.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was running an entire web framework inside a single function. My dashboard is a FastAPI app — it expects a long-running server that speaks a protocol called ASGI, but API Gateway hands it raw events and JSON. Rather than rewrite every route for the cloud, I wrapped the app in a Mangum adapter: it turns each gateway event into the scope FastAPI expects and turns the answer back again, so the exact same routes and validation run on my laptop and in the cloud. I also made the static-file mount tolerant of a missing folder, since S3 serves the frontend, not the function. One app, two homes, no second copy to maintain.
