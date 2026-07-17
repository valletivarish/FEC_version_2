# Solar Farm Performance Monitoring - 4-Minute Presentation Script

Total: 518 spoken words - just under 4 minutes at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning, everyone. My project is a solar farm performance monitoring system for the Fog and Edge Computing module. In one line: two panel arrays, ten live sensor streams, and a pipeline that watches them continuously - from edge sensors to a live cloud dashboard.

## Slide 2 (0:20-1:00)

So why build this? Because solar farms fail slowly, not loudly. Panels lose efficiency as they heat up - in my model, an array's thermal health falls from one hundred at forty-five degrees to zero at seventy-two. Dust builds up over weeks; a cleaning alert fires once average soiling passes twenty-five percent. These are gradual drifts - a scheduled inspection almost never catches them at the right moment, and with ten streams sampling every few seconds, no human can watch the raw data.

## Slide 3 (1:00-1:45)

Follow the arrows. Ten sensors - five types across two arrays - feed a fog node at the site. The fog node buffers readings, windows them, aggregates each window, and raises threshold alerts locally. Only one summary per window travels on, into an Amazon SQS queue. AWS Lambda picks each summary off the queue and stores it in DynamoDB, and a dashboard served from S3 through API Gateway shows a live efficiency heatmap per array. Everything is verified end to end on Docker with an AWS emulator, and one scripted step deploys the identical stack to real AWS.

## Slide 4 (1:45-2:25)

This is the dashboard during a real end-to-end run - an actual screenshot, not a mock-up. Top right, all four pipeline health checks are up: gateway, queue, processor and pipeline. The heatmap shows both arrays scoring in the mid-seventies, with five live readings per array underneath. Three numbers to remember: one hundred and ten automated tests pass across every component; all four health checks are green; and the load test pushed a two-thousand-message burst through the queue from thirty-two parallel senders - the pipeline absorbed it.

## Slide 5 (2:25-3:35)

The hardest part was a concurrency problem in the fog node. Every few seconds it must aggregate everything buffered so far into window summaries - but that buffer never sits still, because ten sensors keep writing into it. The obvious design, one shared buffer guarded by one lock, fails: aggregation blocks ingest, with every sensor stalled while data is copied out under the lock. Skip the lock and you lose readings or count them twice. A textbook reader-writer race. The fix is double buffering - the diagram at the bottom. Two buffers: one live, one flushing. When a window closes, the lock is held just long enough to swap the two pointers - instant, no copying. Aggregation then works on the swapped-out buffer while new readings flow into the fresh one, so neither side ever waits. A stress test hammers the buffer from concurrent writer threads while it swaps - not a single reading is lost.

## Slide 6 (3:35-4:00)

Three takeaways. Push work to the edge: one summary per window leaves the site, not a flood of raw readings. Keep the cloud serverless: SQS, Lambda and DynamoDB soaked up the burst with nothing to manage. Prove it works: one hundred and ten tests, a scripted end-to-end check, and one step to deploy to AWS. Thank you - happy to take questions.
