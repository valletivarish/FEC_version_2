# Aquaculture Fish Farm Water Quality — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Standard practice on a pond farm is that a technician draws a sample and runs a test kit once or twice a day. But dissolved oxygen and ammonia do not change slowly — a warm, still night can crash oxygen and push ammonia up over a few hours, entirely inside the gap between two manual readings. A farm that samples at sunrise sees the excursion only after the fish are already stressed. So I watch two ponds continuously.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors across two ponds, five metrics each, feed a fog gateway. Every ten seconds it computes count, min, max and average and fires the alert rules on site. Amazon SQS receives one batched send per cycle, not one call per window; a Lambda drains each batch and writes records in parallel to DynamoDB; and API Gateway with an S3 static site serve the dashboard. Only compact summaries ever leave the pond.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live on a real AWS account. First, health — four of four checks green within a minute of boot, the freshest reading under two seconds old. Second, alerts on real data — heat stress, hypoxia and acidic risk on pond one, alkaline risk on pond two, with five hundred and ninety records stored and climbing. Third, confidence — one hundred and fifty-six automated tests pass across every module.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was a hidden concurrency race. The fog gateway buffers every reading in one shared in-memory map — ten streams writing at once while a ten-second flush retires it, deliberately with no lock. A sixty-four-thread stress test failed once and readings silently vanished: one field in the accumulator was still mutable, so two simultaneous merges could each read it before either wrote back. Nothing crashed; data just disappeared. The fix makes the accumulator fully immutable, so every combine returns a fresh value — because the map's atomic merge is only guaranteed when the merge function has no side effects, a narrower promise than thread-safe sounds. The suite replays that collision from sixty-four threads, and now not one reading is lost.
