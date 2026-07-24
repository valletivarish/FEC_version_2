# River Flood Early-Warning Monitoring — demo script

Target 2:30–2:50. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the two questions (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:35)

I'm Kavya Vegunta, and this is my River Flood Early-Warning Monitoring. A rising river asks two questions, not one. How high is the water — is it past the flood line? And how fast is it rising? Those are not the same question, and the second is the one that buys you time: a river can still be under its advisory mark and yet be the emergency, because it's climbing fast enough to cross that mark within the hour. Five signals on two river reaches, streamed raw, tell you neither on their own — you'd be staring at ten traces waiting to do the arithmetic in your head. My system does that arithmetic, and it decides where each of the two questions is answered.

## 2 · High-level description — Slide 2 (0:35–1:05)

Ten sensor gauges push river level, rainfall, flow, soil moisture and turbidity from two reaches into a fog relay on the riverside host. Every ten seconds the relay closes a window, reduces it in one pass, and raises the flood stage right there from the window's peak — so the "how high" question is answered at the edge, before anything travels. It sends only the finished summaries onto Amazon SQS; a Lambda writes each into DynamoDB, and API Gateway with S3 serve the dashboard. The part worth watching for is on that dashboard: the "how fast" question is answered a tier later, on read.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:05–2:20)

Here it is live. Each reach has a stage gauge drawn straight against the flood bands — advisory at three and a half metres, watch at four and a half, warning at five and a half — so you see how high the water stands at a glance. Now the piece I care about: next to each gauge is a rate of rise, in metres per hour. Watch this reach — it's flagged rising even while its level is still short of the line, and past eight metres an hour it raises a rapid-rise alarm. That's the leading indicator. Around it, flood-warning, torrential-rain and dangerous-current alarms fire per reach, the two-reach level trend draws against the same bands, and the health strip shows fog, queue, lambda and pipeline all green. For scale, sixty automated tests pass across every module, and I pushed a two-thousand-message burst through the queue with thirty-two parallel senders.

## 4 · Hardest challenge — Slide 4 (2:20–2:50)

The hardest part was realising the two questions belong on different tiers, and why. How high the water is is a property of one instant, so a single window answers it, and it belongs at the edge for an instant alarm. How fast it's rising isn't a property of any instant at all — a rate is a change across time, and no single ten-second window holds two moments to compare. I could have made the edge stateful, hoarding past windows, but that would trade away the lock-free simplicity that lets it keep up. So the rate of rise is derived on read, from the trend of stored windows over real elapsed time — computed where the history already lives, so the edge stays stateless and the leading indicator is still there when it matters.
