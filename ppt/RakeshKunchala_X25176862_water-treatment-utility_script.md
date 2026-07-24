# Water Treatment Utility Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Treatment quality moves second by second, but grab samples and periodic control-room rounds only ever see snapshots. Ten sensor points across two plants stream turbidity, pH, chlorine, flow and pressure every one to three seconds, far faster than any manual round — and transient events vanish into averages: a momentary pressure drop can mean a hydraulic fault even when the daily mean looks perfectly healthy. So I score every ten-second window as it closes.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten field sensors across two plants feed a fog node that closes ten-second windows, aggregates, and applies alert gates — checking the window minimum, not the average, so a brief dip cannot hide. Amazon SQS carries one summary per window, batched; a Lambda ingests each summary into a DynamoDB time-series store; and S3 with API Gateway serve the compliance board. Alerts fire the moment a window closes, on site.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — gateway, queue, Lambda and the end-to-end pipeline all green. Second, the board — a reading-by-plant matrix, compliance strips and cross-plant trends across both plants. Third, scale — one hundred and fifteen automated tests pass across every module, and a two-thousand-message burst was absorbed by the queue and drained by the consumer.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The twist in water treatment is that the danger is too little, not too much. Most monitoring fires when a number climbs too high — but here the breaches that matter are under-treatment: chlorine too low, pH too acidic, pressure too low. A rule set built around ceilings would have quietly passed exactly the failures a utility most needs to catch. So my fog rules are written as compliance bounds, most of them lower bounds, and each window is reduced through a small ledger that accumulates then evaluates, so a brief dip isn't lost between windows. Under-chlorination shows up as a named alert in its own right, not as the mere absence of a high alarm.
