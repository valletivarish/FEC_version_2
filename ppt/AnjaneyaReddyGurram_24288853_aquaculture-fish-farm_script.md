# Aquaculture Fish Farm Water Quality — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Standard practice on a pond farm is that a technician draws a sample and runs a test kit once or twice a day. But dissolved oxygen and ammonia do not change slowly — a warm, still night can crash oxygen and push ammonia up over a few hours, entirely inside the gap between two manual readings. A farm that samples at sunrise sees the excursion only after the fish are already stressed. So I watch two ponds continuously.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors across two ponds, five metrics each, feed a fog gateway. Every ten seconds it computes count, min, max and average and fires the alert rules on site. Amazon SQS receives one batched send per cycle, not one call per window; a Lambda drains each batch and writes records in parallel to DynamoDB; and API Gateway with an S3 static site serve the dashboard. Only compact summaries ever leave the pond.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live on a real AWS account. First, health — four of four checks green within a minute of boot, the freshest reading under two seconds old. Second, alerts on real data — heat stress, hypoxia and acidic risk on pond one, alkaline risk on pond two, with five hundred and ninety records stored and climbing. Third, confidence — one hundred and fifty-six automated tests pass across every module.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

This one came down to timing — two clocks inside one thread. Each sensor should sample often enough to trace a real signal, yet send rarely enough to spare the network, and dissolved oxygen, pH and ammonia each want a different balance. Splitting sampling and sending across separate threads for ten sensor-and-pond pairs would only have multiplied the ways they race. Instead every process keeps two deadlines in a single loop: it checks the clock against a next-sample time and a next-send time, takes a reading when the first passes, flushes the batch when the second passes, and sleeps until whichever comes sooner. No locks, no second thread, and readings genuinely batch up before crossing the network.
