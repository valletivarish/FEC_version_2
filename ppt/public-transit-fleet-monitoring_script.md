# Public Transit Fleet Monitoring - 4-Minute Presentation Script

Total spoken words: 508 - roughly 3 minutes 55 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning, everyone. This is Public Transit Fleet Monitoring, my project for Fog and Edge Computing. The idea in one line, and you can follow it along the route at the bottom of the slide: a bus fleet across two depots streams live telemetry into a fog gateway at the edge, and only compact summaries travel on to a serverless cloud and a live dashboard.

## Slide 2 (0:20-1:00)

So why build this? Because a bus's condition changes minute by minute while it's on the road, but a depot inspection only sees the vehicle once it's parked. Engine overheating and brake wear build up mid-route - by the evening walk-around, the damage is hours old. And some problems, like overcrowding or low fuel, need a response right now, not a line in an end-of-shift report. The numbers on the right show the scale: five metrics per depot, two depots - that's ten continuous telemetry streams. Nobody watches that reliably by hand.

## Slide 3 (1:00-1:50)

Here's how it works, following the numbered route. Ten simulated bus sensors - engine temperature, brake wear, passenger count, fuel and speed - post readings to a fog gateway. That gateway is the edge-computing heart of the project: it windows the readings, aggregates each stream per depot, and checks four safety rules locally. Only one compact aggregate per window goes onto an Amazon SQS queue. From there an AWS Lambda function consumes the queue and batch-writes records into DynamoDB, and a live dashboard reads them back - on AWS that's served through S3 and API Gateway. The whole pipeline runs end-to-end today on Docker with LocalStack, an AWS emulator, and deploys to AWS with a single scripted step.

## Slide 4 (1:50-2:30)

This is the system actually running - a real screenshot, not a mock-up. Point to the top right: all four pipeline health checks are green - gateway, queue, Lambda, and the end-to-end pipeline itself. And notice the red card - that's a genuine overcrowding alert firing for depot A, raised by the fog gateway's own rules. Behind this screen, 130 automated tests pass across the four modules, and a load test pushed a burst of two thousand messages through the pipeline from thirty-two parallel workers.

## Slide 5 (2:30-3:35)

Now, the hardest part. Ten sensor streams post readings into one fog gateway at the same time - and at that same moment, a timer thread is draining the buffer to build the window aggregates. Every reading has to survive that handover. What makes this genuinely hard is that failure is silent. A reading dropped in the race doesn't crash anything - the fleet averages are just quietly wrong, and nothing tells you. The obvious fix, locking every insert, swaps that race for a bottleneck: ten senders queueing behind one lock. The solution was to make ingest lock-free. Each arriving reading is one atomic enqueue, nothing else - all the grouping by depot and sensor type is deferred to a single-threaded drain at flush time. And it's proven, not hoped: a stress test fires thirty-two threads at the intake, two hundred readings each, and all six thousand four hundred come out the other side. Zero lost.

## Slide 6 (3:35-4:00)

Three things to take away. Intelligence lives at the edge, so the cloud stores summaries, not noise. The backend is serverless, so it scales with the fleet. And it's verified - 130 tests, an end-to-end checked pipeline, one scripted step from AWS. Thank you - I'm happy to take questions.
