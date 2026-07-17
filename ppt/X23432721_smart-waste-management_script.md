# Smart Waste Management - 4-Minute Presentation Script

Total spoken words: 517 · estimated duration ~3:59 at ~130 wpm.

## Slide 1 (0:00-0:20)

Good morning, everyone. I'm Gundeti Sachin Reddy, student ID X23432721, MSc in Cloud Computing at the National College of Ireland. My Fog and Edge Computing project is a smart waste management system: a live pipeline that decides when a bin needs a truck, instead of waiting for the calendar.

## Slide 2 (0:20-1:00)

Why does this matter? Municipal waste collection runs on a fixed schedule: the truck comes on Tuesday whether the bin is full or empty. That wastes runs on half-empty bins, and hazards stay invisible between visits. These four cards are what the system watches live: a bin passing eighty-five percent full, temperature above fifty-five degrees, gas above four hundred parts per million, and a lid opened more than eight times — likely tampering. A calendar catches none of these; live sensing catches them all.

## Slide 3 (1:00-1:50)

Here's how it works — follow the numbers. Ten simulated sensors, five types across two districts, stream readings to a fog node on EC2. Key idea: the fog node is not a relay. It buffers readings, aggregates each time window, and fires hazard alerts right at the edge. Only one compact summary per window crosses into the cloud, onto an Amazon SQS queue. The queue triggers an AWS Lambda function that writes each window into DynamoDB — no servers to size; it scales with the backlog. The dashboard is serverless too: a static site on S3, its API a second Lambda behind API Gateway.

## Slide 4 (1:50-2:30)

This is genuinely live on a real AWS account — the screenshot is the deployed dashboard during verification: priority list, both districts' readings, and the fill-level trend. Three facts: one hundred and fifteen automated tests pass across all four modules. All four pipeline health checks green, the freshest reading a tenth of a second old. And a three-hundred-message burst at the real queue drained before my follow-up check ran; the item count climbed from 4,083 to 4,093. Live data, not a cache.

## Slide 5 (2:30-3:40)

Now the hardest part, and the best lesson. The moment I deployed to real AWS, every database and queue call failed authentication. Why so hard? All one hundred and fifteen tests passed, the full LocalStack integration passed — nothing pointed at the code. The bug: whenever an access-key environment variable was present, my code swapped in the emulator's hardcoded test credentials. Locally that's correct — but real AWS always sets that variable, so production silently threw away its real credentials. The fix: gate on the one truly local signal — the explicit LocalStack endpoint override. And the academy account blocks CloudFront and public Lambda URLs: documented nowhere, found only by trying and reading the errors. So the API went through API Gateway, the frontend onto S3 over HTTPS, and every fix re-verified live: a real database write, a real two-hundred response. As the banner says: an emulator pass is not a deployment pass.

## Slide 6 (3:40-4:00)

Three takeaways. Fog earns its place: only compact summaries cross to the cloud. Serverless scales itself: the burst was absorbed with zero capacity planning. And deploy for real — three defects only showed up on the live cloud. Thank you. I'm happy to take questions.
