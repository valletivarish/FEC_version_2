# Smart Parking Management - 4-Minute Presentation Script

Pooja - Student ID X25120921 - Fog and Edge Computing (H9FECC)

Total: ~540 spoken words | approximately 3 minutes 58 seconds at ~135 wpm

## Slide 1 - Cover (0:00-0:15)

Good morning. An operator watching a car park is really asking two questions at once, and they are not the same question. How full is each lot? And is anything wrong? My project answers both from the same stream, and it is careful never to confuse them.

## Slide 2 - Two questions, one car park (0:15-1:05)

A walk-round answers neither well: it samples a lot a few times a day, and both the fullness and the faults move faster than that. But the deeper point is that the two are different in kind. Fullness is a smooth quantity, a lot sliding from quiet to busy to nearly full across the day. A fault is a discrete event: a gate stuck faulting, a sudden inflow surge, a car that has dwelled far beyond a normal stay. And they are independent, a lot can be busy but perfectly healthy, or nearly empty yet faulted. So the monitor watches five signals across two lots, ten live streams, and every window it runs four hard fault rules: near-full above two hundred and seventy of three hundred bays, an inflow surge, a long stay, and a gate-fault on the peak count. The exit rate is kept only as context.

## Slide 3 - From sensor to console (1:05-1:50)

The reading happens at the edge. Ten sensor processes post over HTTP to a fog node running in the car park. Every ten seconds it closes a window, reduces each lot-and-signal stream to five numbers, and raises those fault alarms right there, so a fault is named in the window it appears. Only the summary leaves the building, batched onto Amazon SQS. One Lambda drains the queue into DynamoDB; a second serves the console from S3 through API Gateway. The whole cloud side went onto a real AWS account in one infrastructure-as-code step, twenty-four resources, no manual clicking.

## Slide 4 - Live demonstration (1:50-2:35)

This is the live console reading from the running stack. Two lots, five signals each, and four pipeline checks green along the top. Now watch the right-hand lot. It is nearly empty, yet flashing Alert, because a gate is faulting. A dashboard that scored only fullness would have called that lot Quiet and missed the fault entirely. Behind the screen, one hundred and twenty-seven automated tests pass, and a two-thousand-message burst from thirty-two parallel senders was absorbed and drained.

## Slide 5 - How full, and what is wrong (2:35-3:35)

That moment is the whole design. The fog node answers the fault question at the edge and stores the alarms on each window. The dashboard answers the fullness question on read: it turns each lot's latest occupancy into a percentage of capacity and buckets it, quiet below three-quarters, busy above, near-full above nine-tenths. Then the two are fused into one badge, and a fault always outranks the fullness tier, so a faulted lot reads Alert whether it is empty or full. The tier is never stored; it is derived fresh on every read, which keeps the stored windows the single source of truth and lets the thresholds be retuned without touching them.

## Slide 6 - What to take away (3:35-3:58)

So the lesson I would carry beyond car parks is this: when a system is really answering two questions, keep them on two axes, and fuse them only at the last step. Decide the faults at the edge, derive the tier on read, and let the more urgent of the two win the badge. Thank you. I am happy to take questions.
