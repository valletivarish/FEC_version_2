# Aquaculture Fish Farm Water Quality - 4-Minute Presentation Script

Total: 517 spoken words — approximately 3 minutes 59 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning, everyone. My name is Anjaneya Reddy Gurram, student ID 24288853, from the MSc in Cloud Computing at National College of Ireland. For my Fog and Edge Computing project, I built a live water-quality monitor for a two-pond fish farm.

## Slide 2 (0:20-1:00)

On most pond farms, water quality is still checked by hand — a technician draws a sample and runs a test kit once, maybe twice a day. But dissolved oxygen and ammonia don't keep to that schedule. One warm, still night can crash oxygen and push ammonia up within hours — right inside the gap on this timeline between two samples. And with aquaculture now supplying the majority of the world's aquatic animal production, that blind spot is getting expensive.

## Slide 3 (1:00-1:45)

Each pond has five sensors — temperature, dissolved oxygen, pH, ammonia, and feed — ten in total, all reporting to a fog gateway on site. The gateway does the heavy lifting at the edge: it collects readings into ten-second windows, computes count, min, max, and average, and evaluates the alert rules locally, so a hypoxia warning never waits on the cloud. Only compact window summaries move on, batched onto an Amazon SQS queue. An AWS Lambda function drains each batch into DynamoDB, and a second Lambda behind API Gateway serves the live dashboard hosted on S3.

## Slide 4 (1:45-2:25)

And this all runs on a real AWS account, not an emulator. This screenshot is the deployed dashboard, captured live. Top right, all four health checks are green: gateway, queue, Lambda, pipeline. The freshest reading was under two seconds old, sensor to screen. The alert banner shows four alerts firing across the two ponds — heat stress, hypoxia and acidic risk on pond one, alkaline on pond two — exactly matching the threshold rules. And behind it, one hundred and fifty-six automated tests pass across the four modules.

## Slide 5 (2:25-3:35)

Now, the hardest part. The fog gateway buffers every reading in one shared in-memory map: ten sensor streams write into it at once while a flush retires it every ten seconds, with deliberately no lock anywhere on that path. To prove that design, I wrote a stress test that hammers the buffer from sixty-four threads at once. And it failed — once. Readings silently vanished: nothing crashed — the data simply disappeared. That's what made it hard: no compiler warning, and a happy-path test never provokes it. The cause was one accumulator field that was still mutable, so two simultaneous merges could each read it before either wrote back. The fix: make the accumulator fully immutable, so every combine returns a fresh value — because the map's atomic merge is only guaranteed when the merge function has no side effects, a narrower promise than "thread-safe" sounds. The stress test now proves that not a single reading is lost.

## Slide 6 (3:35-4:00)

So, three takeaways. Fog aggregation pays for itself: ten sensors reduce to a handful of batched cloud writes, and alerts still fire right beside the pond. Serverless absorbs the bursts — a busy cycle becomes queue backlog, never failed calls. And green tests are not proof: a pre-deployment audit caught three defects the passing suite never could. Thank you — I'm happy to take questions.
