# Smart Parking Management — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Pooja, and this is my Smart Parking Management. An operator asks two different things about a car park at once: how full is each lot, and is anything wrong. They are not the same question. Fullness is a smooth quantity that climbs and falls with the day; a fault is a discrete event — a gate stuck faulting, an inflow surge, a car dwelling far too long. A lot can be busy but perfectly healthy, or nearly empty yet faulted, so the two belong on separate axes.

## 2 · High-level description — Slide 2 (0:30–1:00)

Notice what never leaves the car park: the raw streams. Ten of them across two lots — occupied spaces, entry rate, exit rate, average dwell time and gate-fault events — hit a fog node that windows, aggregates and raises four hard fault alarms right at the edge. Only those summaries travel on. Amazon SQS carries the aggregates, a Lambda ingests each into DynamoDB, and S3 with API Gateway serve the console. Alarms are decided in the window they appear.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Here's the live console — the whole estate at a glance, both lots streaming all five signals with a capacity gauge and a four-tier badge on each, Quiet through Near-full. The health strip underneath reads gateway, queue, processor and pipeline all green. Now drill in: one lot sits at Normal, but its neighbour is flashing Alert — a gate-fault alarm firing even though occupancy is low, exactly the case the design was built for, a lot that's quiet yet faulted. The occupied-spaces trend tracks both lots, so a filling lot shows before it's full. And underneath, one hundred and twenty-seven automated tests pass across every module, with a two-thousand-message burst from thirty-two senders absorbed and drained clean.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was answering how full and what is wrong at the same time without letting one hide the other. The fog answers the fault question at the edge, raising four hard alarms per window. The dashboard answers fullness on read, turning each lot's latest occupancy into a percentage and bucketing it into Quiet, Busy or Near-full. Then the two fuse into one badge, and a fault outranks the fullness tier — any active fault forces the badge to Alert, whether the lot is empty or full, so the operator always sees the more urgent of the two at a glance. The tier is derived fresh on every read and never stored, so the thresholds can be retuned without touching the stored windows.
