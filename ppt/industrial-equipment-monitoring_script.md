# Industrial Equipment Predictive Monitoring - 4-Minute Presentation Script

Total spoken words: 518 | Estimated duration at ~130 wpm: about 3 minutes 59 seconds

## Slide 1 (0:00-0:20)

Hello everyone. This is Industrial Equipment Predictive Monitoring, my project for Fog and Edge Computing. In one line: five machine signals watched continuously, alarm decisions made at the edge every ten seconds, forty-two automated tests behind it. Here is why that matters.

## Slide 2 (0:20-1:00)

On a real plant floor, machine health is checked by walking the line and reading gauges. The problem is timing: a walk-round reads each gauge once, but the fault develops in the minutes between rounds. The numbers on the right are this system's real alarm limits - a motor winding can sit above ninety-five degrees all shift, unnoticed. And failure rarely shows on one dial. It builds across heat, vibration, bearing noise, speed and power draw at once - five signals nobody reads together by hand.

## Slide 3 (1:00-1:45)

Here is how the system replaces that. Six simulated sensor units stream readings into a fog node - the yellow box. Every ten seconds it closes a window, aggregates each signal, and raises alarms right there at the edge. One compact aggregate per window travels on into an Amazon SQS queue; an AWS Lambda function consumes it and writes each record into DynamoDB; and a live dashboard reads it back, served from S3 with data through API Gateway. Today it runs end-to-end on Docker with an AWS emulator - real AWS is one scripted deployment step away.

## Slide 4 (1:45-2:30)

And here it is running - a real screenshot of the dashboard. One card per signal: current reading, the actual alarm limit, and the trend underneath, with the pipeline health footer along the bottom. Three facts. All four pipeline health checks are green - fog gateway, queue, Lambda, data flow. Forty-two automated tests pass across the four modules. And the load test pushed a two-thousand-message burst through with thirty-two senders in parallel. The end-to-end check confirms all five signal types land in the datastore.

## Slide 5 (2:30-3:40)

Now the hardest part - a bug local testing could never catch. Every cloud-facing component shipped with the emulator's dummy login hard-wired in. On the laptop that is exactly right - the emulator accepts it. But on real AWS, every component would introduce itself with fake credentials and be refused, and the fog node's queue connection would crash at startup. Why is that hard? Nothing local can surface it. The emulator accepts any credentials, so all forty-two tests pass and every health light stays green - with the bug sitting right there. The failure only exists in an environment the project had not reached yet. It was caught in a deliberate pre-deployment audit. The fix: attach the dummy login only when an emulator address is actually configured. In the real cloud that setting is absent, so each component falls through to the identity AWS itself issues at runtime. One guarded branch in each of five cloud clients - no rewrite.

## Slide 6 (3:40-4:00)

Three takeaways. Alarm decisions happen at the edge - the cloud gets one compact aggregate per window, not a firehose. The cloud side is fully serverless - SQS, Lambda, DynamoDB - nothing to patch. And it is verified end-to-end, one scripted step from real AWS, with the bug that would have broken that move already gone. Thank you - happy to take questions.
