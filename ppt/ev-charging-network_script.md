# EV Charging Network Monitoring - 4-Minute Presentation Script

513 spoken words, approximately 3 minutes 55 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning everyone. This project is a fog and edge computing pipeline that watches an electric vehicle charging network in real time. In four minutes I'll cover the problem, how the pipeline works, and the hardest bug I had to solve.

## Slide 2 (0:20-1:00)

Why does this need edge computing? Because conditions at a charging bay move in seconds. Ten sensors across two hubs sample current, battery charge, temperature, grid load and session time every two to five seconds. The four numbers on the right are the system's real alert rules: average current past thirty-two amps or a cabinet past forty-five degrees is a hardware risk right now. A manual round or an hourly poll misses it for the whole gap between checks, so the decision has to happen next to the hardware.

## Slide 3 (1:00-1:45)

Here's the pipeline. At the edge, ten sensors feed a fog node. It buffers each sensor's readings, closes a time window, computes one aggregate per sensor per window, and checks the alert rules on the spot. Only that small summary crosses to the cloud: it lands on an Amazon SQS queue, an AWS Lambda function picks it up and writes it into DynamoDB, and the live dashboard reads it back through an API. Today this runs on Docker against a full AWS emulator, verified end to end, and one scripted step deploys the same code to real AWS.

## Slide 4 (1:45-2:25)

This is the dashboard during a live run. Top right, all four pipeline health checks are green: gateway, queue, processor and pipeline. Each hub card shows its five live readings, and the page re-checks itself every two and a half seconds. Behind this sit one hundred and eighteen automated tests, including real HTTP tests against live servers. And for scale, a burst test pushed two thousand messages at the queue in just over a second; it absorbed the spike instantly and drained steadily.

## Slide 5 (2:25-3:30)

Now the hardest part of the project. The dashboard reports how many records the pipeline has stored: the number that tells you nothing is being lost. That count was wrong in the worst way. The database returns scan results one page at a time, with a hard size cap per page, and my count trusted the first page and stopped. Why was this hard? Because nothing ever failed. Every unit test passed, every demo looked perfect, since a small table fits in one page. The bug only appears at scale, exactly when you rely on the number, and then a healthy pipeline looks like it's quietly dropping data. The fix is on the right: follow the continuation marker the database hands back, page after page, and sum every page. A test that feeds it a multi-page table makes sure it never quietly comes back.

## Slide 6 (3:30-3:55)

So, three things to take away. Push the decision to the edge: raw readings stay local and alerts fire next to the hardware. Let managed cloud services absorb the bursts, because the queue and the serverless function did that without any code change. And trust nothing you haven't tested. Thank you very much, I'm happy to take questions.
