# Public Transit Fleet Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

A bus's condition changes minute by minute on the road, but a depot inspection only sees it once it is parked. Faults build mid-route — an overheating engine or a worn brake pad is hours old by the evening walk-around, and overcrowding or low fuel needs a response now, not tonight. That is two depots, five signals each, ten live streams, and no walk-around keeps up.

## 2 · High-level description — Slide 2 (0:30–1:00)

The brief asks for edge and cloud, so here's how I split the pieces. On the edge sit the ten streams — two depots, each reporting engine temperature, brake-pad wear, passenger count, fuel level and GPS speed — feeding a fog node that buffers, drains, aggregates and raises four hard fault alarms in the window they appear. The cloud side is the rest: Amazon SQS carries the aggregates, a Lambda ingests each into DynamoDB, and S3 with API Gateway serve the dashboard.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Come to the screen the way a depot operator would, reading top to bottom. Up top, the health strip is all green — gateway, queue, Lambda and pipeline. Below that sits the fleet: a roster of native-meter cards per depot, both depots streaming all five signals, and right now depot-a is raising an engine-overheat alarm while depot-b stays clear. That's the whole story an operator needs at a glance — what's live, and what's shouting. Behind it, one hundred and thirty-nine automated tests pass across every module, and a two-thousand-message burst from thirty-two senders was absorbed and drained without loss.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was keeping a busy gateway correct under concurrency. Ten streams post on many worker threads at once, and every reading must survive being held until the window drain — but a reading lost to a race does not crash anything, it just makes the fleet averages silently wrong, and locking every insert fixes the race only by making the senders queue behind each other. My answer is buffer first, group later: each arriving reading is a single lock-free enqueue onto a concurrent queue, and all the grouping by depot and signal is deferred to one thread that drains the whole queue once per window. Ingest stays contention-free. A stress test fires thirty-two threads writing two hundred readings each, and after the drain all six thousand four hundred are accounted for, zero lost.
