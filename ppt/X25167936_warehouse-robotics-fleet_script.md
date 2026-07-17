# Warehouse Robotics Fleet Monitoring - 4-Minute Presentation Script

Total spoken words: 509 | Estimated duration at ~130 wpm: about 3 minutes 55 seconds

## Slide 1 (0:00-0:20)

Good morning, everyone. I'm Goutham Uppu, student ID X25167936, from the MSc in Cloud Computing at National College of Ireland. For my Fog and Edge Computing project I built a live health-monitoring pipeline for ten warehouse robots across two zones.

## Slide 2 (0:20-1:00)

So why does this need building? Warehouse robots are usually checked on a schedule, but a schedule tells you what a robot should be doing, not what condition it is in. The research makes two points. Dispatch decisions get measurably better when battery, position and task load are known live. And battery degradation shows up in continuous telemetry well before an outright failure, so a manual check misses the trend. With ten robots each reporting five channels, that is fifty moving numbers no inspection round can keep up with.

## Slide 3 (1:00-1:50)

Here is how it works; follow the arrows. Ten sensor containers on an EC2 instance produce the robots' telemetry: battery, payload, motor temperature, position drift and task queue. They feed a fog gateway right beside them, which does the real edge work: it windows the readings, aggregates them per robot and per zone, and checks alert thresholds locally. Only compact window summaries go to the cloud, in batches of up to ten, through Amazon SQS. A Lambda function consumes the queue and writes each window into DynamoDB, and a second Lambda behind API Gateway serves the live dashboard hosted on S3. Raw samples never leave the edge.

## Slide 4 (1:50-2:30)

And this is the real thing, not a mock-up. This screenshot comes straight from the deployed system on AWS. You can see the two-zone roster with its sparklines and status LEDs, and in the bottom row all four pipeline health checks reporting healthy: gateway, queue, Lambda, and data flowing. Behind it, one hundred and sixteen automated tests pass across the four modules, plus a two-thousand-message burst test through thirty-two workers. And the entire cloud side, all twenty-four resources, came up from a single Terraform apply.

## Slide 5 (2:30-3:40)

Now, the hardest part of the project. Everything I just showed you passed every test, and it still would have failed in production. All three AWS-facing components built static test credentials for the local emulator unconditionally, and the fog publisher also applied its emulator endpoint unconditionally. Why was this so hard to catch? Because locally, nothing looks wrong. All one hundred and sixteen tests were green, and the whole stack ran perfectly on the emulator. The bug only exists on real AWS. There, a Lambda would override its own execution-role credentials with a pair AWS rejects, and the fog node would crash on startup because the endpoint value is null. The fix was to gate on the endpoint setting itself: present means the emulator, absent means the real AWS role. Deployed with that fix, every health check came up green on the first attempt.

## Slide 6 (3:40-4:00)

So, three takeaways. The edge does the heavy lifting, and only summaries cross to the cloud. Green tests are not cloud-proof, because real defects hide at boundaries emulators mask. And a declared deployment beats a scripted one. Thank you. I'm happy to take questions.
