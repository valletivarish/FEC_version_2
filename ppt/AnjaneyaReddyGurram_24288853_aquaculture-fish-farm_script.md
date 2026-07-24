# Aquaculture Fish Farm Water Quality — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Standard practice on a pond farm is that a technician draws a sample and runs a test kit once or twice a day. But dissolved oxygen and ammonia do not change slowly — a warm, still night can crash oxygen and push ammonia up over a few hours, entirely inside the gap between two manual readings. A farm that samples at sunrise sees the excursion only after the fish are already stressed. So I watch two ponds continuously.

## 2 · High-level description — Slide 2 (0:30–1:00)

Three tiers. At the edge, ten sensors across two ponds, five metrics each, feed a fog gateway that every ten seconds computes count, min, max and average and fires the alert rules on site. In the cloud, Amazon SQS takes one batched send per cycle, not one call per window, and a Lambda drains each batch, writing records in parallel to DynamoDB. The view: API Gateway and an S3 static site serve the dashboard. Only compact summaries leave the pond.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Everything you're seeing runs on a real AWS account, so let's start with the record counter — right now it reads five hundred and ninety stored, and if you watch, it keeps ticking up. That climb is the pipeline proving it's genuinely live: health shows four of four checks green within a minute of boot, and the freshest reading is under two seconds old. Now the alerts, on real data — heat stress, hypoxia and acidic risk on pond one, alkaline risk on pond two. And behind all of it, one hundred and fifty-six automated tests pass across every module.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

This one came down to timing — two clocks inside one thread. Each sensor should sample often enough to trace a real signal, yet send rarely enough to spare the network, and dissolved oxygen, pH and ammonia each want a different balance. Splitting sampling and sending across separate threads for ten sensor-and-pond pairs would only have multiplied the ways they race. Instead every process keeps two deadlines in a single loop: it checks the clock against a next-sample time and a next-send time, takes a reading when the first passes, flushes the batch when the second passes, and sleeps until whichever comes sooner. No locks, no second thread, and readings genuinely batch up before crossing the network.
