# Smart Parking Management - 4-Minute Presentation Script

Total: ~518 spoken words — just under 4 minutes at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning, everyone. My project is Smart Parking Management: a fog and edge computing pipeline that watches two multi-storey car parks in real time and turns raw sensor traffic into a live capacity console. I'll show you what it does, how it works, and the hardest problem I solved.

## Slide 2 (0:20-1:00)

First, why does this need edge computing? The numbers on the right say it all: six hundred spaces across two lots, ten continuous sensor streams, a fresh reading every two to five seconds. No manual process keeps up. A walk-through count is stale the moment it's written down, and a faulty entry gate can quietly choke a whole level between rounds. And at ninety percent full — two hundred and seventy of three hundred spaces — drivers need redirecting now, not at the next round.

## Slide 3 (1:00-1:50)

Here's how the pipeline handles it — follow the arrows. Ten sensors — occupancy, entry and exit rates, dwell time and gate faults — stream into a fog node at the car park. The key decision: the fog node windows and aggregates each stream locally and raises alerts at the edge, so only one compact aggregate per window travels on — never every raw reading. Then a serverless chain: the aggregate lands on an Amazon SQS queue, an AWS Lambda function transforms it, DynamoDB stores every window, and the dashboard reads it back through API Gateway, hosted on S3. Today it runs on Docker with a local AWS emulator; it deploys to AWS with one scripted step.

## Slide 4 (1:50-2:30)

And this is it running. On the left, the dashboard captured from the live pipeline: both lots with capacity gauges, entry and exit rates, dwell times and gate faults — and along the top, all four health checks green: gateway, queue, processor, pipeline. Behind that screen, a hundred and twenty-seven automated tests pass, from window maths to real HTTP tests against live servers. And a load test fires two thousand messages at the queue and proves the pipeline drains them.

## Slide 5 (2:30-3:35)

Now, the hardest part. The fog node absorbs nonstop posts from ten sensors and holds their readings between windows. It serves requests on real operating-system threads, so readings from both car parks can land at the same instant, in the same shared buffer. Neither failure shows up in a quick demo: an open-ended buffer only exhausts memory after hours of traffic, and a thread race only bites when two writes collide in the same microsecond. Everything looks fine — until it isn't. The fix is the strip on the right: a bounded ring buffer per sensor stream, capped at five hundred readings — the newest comes in, the oldest is silently evicted — with one lock guarding every write. To prove it, tests push the buffer past its cap and watch the eviction happen, and the burst test is written to fail if the pipeline ever stalls.

## Slide 6 (3:35-4:00)

Three things to remember. Push intelligence to the edge — aggregate and alert before the cloud is involved. Trust comes from evidence — every claim on these slides is backed by a test. Build cloud-ready from day one — this pipeline deploys to AWS in one scripted step. Thank you — I'm happy to take questions.
