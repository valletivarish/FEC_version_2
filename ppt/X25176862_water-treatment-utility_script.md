# Water Treatment Utility Monitoring - 4-Minute Presentation Script

Total: 514 spoken words | approximately 3 minutes 57 seconds at ~130 wpm

## Slide 1 (0:00-0:20)

Good morning. This project is a fog and edge computing pipeline for a water treatment utility. Water quality gets checked continuously at the plant itself, along the path from intake to outflow that you can see here, and only compact summaries travel to the cloud. Let me show you why that matters.

## Slide 2 (0:20-1:00)

Water quality moves second by second, but traditional oversight is periodic - grab samples and control-room rounds. Snapshots. In this system, ten sensor points across two plants stream turbidity, pH, chlorine, flow and pressure every one to three seconds. The two cards on the right show why snapshots fail. A pressure dip below two bar is a hydraulic fault, so that rule checks each window's minimum, never its average - averaging is exactly how a brief dip hides. And if chlorine falls below zero point two parts per million, the under-chlorination alert fires in the same ten-second window it happens.

## Slide 3 (1:00-1:50)

Here's how it works, left to right. At the plant, on the edge, ten simulated sensors feed a fog node. Every ten seconds it closes a window, aggregates the readings, and runs the quality gates - the alert rules - right there on site. Instead of forwarding every raw reading, it sends one summary per window, in batches, to Amazon SQS. An AWS Lambda function consumes that queue and writes each summary into DynamoDB, and the live dashboard reads it back, served through S3 and API Gateway. The whole pipeline is verified end to end locally with Docker and an AWS emulator, and deploying to real AWS is one scripted step - it's the real AWS SDK throughout.

## Slide 4 (1:50-2:35)

This is the dashboard from that end-to-end run. On the left, a matrix of the five readings against both plants - each cell has a meter against its safe range - with per-plant compliance strips and cross-plant trends below. Three facts from the demo. All four pipeline health checks are green: gateway, queue, Lambda, and the end-to-end pipeline. A hundred and fifteen automated tests pass across sensors, fog, processor and dashboard. And a two-thousand-message burst went into the queue and came out the other side.

## Slide 5 (2:35-3:40)

Now, the hardest part: proving the pipeline survives a burst. Normal traffic is gentle - one summary every ten seconds - so to back any scalability claim, I fired two thousand messages at the queue from thirty-two parallel workers. From outside, a queue that isn't empty is ambiguous: a slow consumer and a dead one look identical. And the emulator runs the Lambda in a single container, so drain time swings wildly between runs - a naive pass-or-fail test either flakes or lies. The fix is the two-tier check in this chart. First, prove the queue absorbed the burst: the backlog must show the full two thousand right after sending. Then either the queue drains within the timeout, or the remaining count must sit strictly below that post-burst peak. A strictly decreasing backlog proves the consumer is alive and making real progress - not stalled.

## Slide 6 (3:40-4:00)

Three things to take away. Decide at the edge - alerts fire the moment a window closes, on site. Ship summaries, not noise - one aggregate per window keeps the cloud path lean and durable. And it's proven and portable - one scripted step from real AWS. Thank you - I'm happy to take questions.
