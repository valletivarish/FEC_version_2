# Water Treatment Utility Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Treatment quality moves second by second, but grab samples and periodic control-room rounds only ever see snapshots. Ten sensor points across two plants stream turbidity, pH, chlorine, flow and pressure every one to three seconds, far faster than any manual round — and transient events vanish into averages: a momentary pressure drop can mean a hydraulic fault even when the daily mean looks perfectly healthy. So I score every ten-second window as it closes.

## 2 · High-level description — Slide 2 (0:30–1:00)

Two functions carry the weight. One ingests — a Lambda writes each window's summary into a DynamoDB time-series store. The other serves — S3 and API Gateway present the compliance board. Feeding them: ten sensors across two plants and a fog node that closes ten-second windows, aggregates, and gates alerts on the window minimum, not the average, so a brief dip can't hide. Amazon SQS batches one summary per window; alerts fire as each window closes, on site.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Here's the board, live — a reading-by-plant matrix, compliance strips, and cross-plant trends, all running across both plants at once. That's every signal from both treatment plants landing and updating in front of you as I speak. Behind it, the health row reads all green: gateway, queue, Lambda, and the end-to-end pipeline. And it holds up under load — one hundred and fifteen automated tests pass across every module, and when I threw a two-thousand-message burst at it, the queue absorbed the lot and the consumer drained it clean.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The twist in water treatment is that the danger is too little, not too much. Most monitoring fires when a number climbs too high — but here the breaches that matter are under-treatment: chlorine too low, pH too acidic, pressure too low. A rule set built around ceilings would have quietly passed exactly the failures a utility most needs to catch. So my fog rules are written as compliance bounds, most of them lower bounds, and each window is reduced through a small ledger that accumulates then evaluates, so a brief dip isn't lost between windows. Under-chlorination shows up as a named alert in its own right, not as the mere absence of a high alarm.
