# Retail Footfall and Inventory Monitoring - 4-Minute Presentation Script

Total: ~500 spoken words, about 3 minutes 50 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning, everyone. My project is retail footfall and inventory monitoring: a fog and edge computing pipeline for a small retail chain. Two stores, ten sensors, and one live pipeline that carries every reading from the shop floor all the way to a cloud dashboard. Let me show you why it exists and how it works.

## Slide 2 (0:20-1:00)

Here is the problem. Most small retailers still check things by walking around, and the left column shows what that misses. Shelves go empty between stock walks, and sales are quietly lost. A fridge can drift warm between rounds, which puts the whole cold chain at risk. And checkout queues build in minutes, so by the next walk-through the customers are already gone. On the right is the alternative I built: ten sensors across two stores, covering footfall, shelf stock, fridge temperature, queue length and energy draw, with four retail-health rules that raise an alert the moment a threshold is crossed.

## Slide 3 (1:00-1:45)

So how does it work? Just follow the arrows. The sensors sample every few seconds and send readings to a fog gateway sitting near the stores. The gateway does the edge work: it groups readings into short time windows, aggregates each window, and evaluates the alert rules right there, so only one compact aggregate per window travels on, onto an Amazon SQS queue. An AWS Lambda function picks each batch off the queue and writes it into DynamoDB, and the dashboard reads from there through API Gateway. The whole pipeline runs and is verified end to end locally, with Docker and an AWS emulator, and it deploys to real AWS with a single scripted step.

## Slide 4 (1:45-2:25)

This is the dashboard during that live end-to-end run. Along the top are the live KPI tiles: total footfall, understocked stores, average queue length and energy draw, with per-store detail and trend charts below. Notice the four green pills in the top corner: gateway, queue, Lambda and end-to-end pipeline, all reporting healthy. Behind what you see here, one hundred and eighteen automated tests pass across the four modules, and a burst load test pushed two thousand messages through the pipeline from thirty-two parallel senders.

## Slide 5 (2:25-3:30)

Now, the hardest part of the project. Every sensor reading arrives on its own web-server thread, many at once, and they all need to write into one in-memory buffer, while a timer keeps emptying that same buffer at the end of each window. That is a classic data race. And what made it genuinely hard is that the bad interleavings, the ones that silently drop readings, only appear under load, so you can't reliably reproduce them in a test. Locks looked like the easy answer, but they are exactly the kind of thing you get subtly wrong. My fix was to stop sharing the buffer at all. Only one dedicated thread ever touches it. A request just drops a message into that thread's mailbox queue, you can see the flow at the bottom, and returns immediately. Crucially, a flush is itself just another mailbox message, so it lines up behind the writes and can never interleave with them. The race isn't locked away; it's structurally impossible. And that design held up through the two-thousand-message burst test.

## Slide 6 (3:30-4:00)

Three things to take away. First, put the intelligence at the edge: windowing and alerting beside the shop floor turn raw readings into store-level decisions in seconds. Second, the pipeline is verified end to end and deploys to AWS with one scripted step. And third, when you hit concurrency, design the problem out rather than guarding it. Thank you, and I'm happy to take questions.
