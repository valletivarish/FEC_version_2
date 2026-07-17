# Smart Agriculture Field Monitoring - 4-Minute Presentation Script

Total: 520 spoken words - just under 4 minutes at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning. I'm Kondragunta Lakshmi Chaitanya, student ID X25171216, MSc in Cloud Computing at the National College of Ireland. For my Fog and Edge Computing project I built a smart agriculture field monitoring pipeline, and everything I'll show you is deployed live on a real AWS account.

## Slide 2 (0:20-1:00)

Why does that matter? A field inspected on a fixed schedule reveals a dry root zone, an overnight frost, or a fungal-risk humidity spell only after the fact, at the next walk-through. The examples on the right use my real alert thresholds: soil moisture under twenty percent means irrigation is already overdue; a dip below three degrees damages crops within hours. My system takes a reading every two to four seconds and checks six alert rules at the edge, the moment data arrives.

## Slide 3 (1:00-1:50)

Here's how it works, following the numbers. Five sensor types, soil moisture, temperature, humidity, light, and rainfall, feed a fog node sitting beside them. Every ten seconds the fog node closes a window: it aggregates each stream to a minimum, maximum, and average, and raises alerts locally. Only that compact summary goes onward, batched, to Amazon SQS, a managed queue that levels the load. Each summary triggers an AWS Lambda function, which writes one record into Amazon DynamoDB. At the front, Amazon API Gateway serves the data API and Amazon S3 hosts the dashboard page. The key idea sits in the bottom line: raw readings never leave the edge.

## Slide 4 (1:50-2:30)

This is the deployed dashboard, served from S3, exactly as it looked during live verification: per-sensor panels, trend charts, and an active alert banner along the top. Three facts. Every pipeline health check reports green, the freshest reading just one point eight eight seconds old. Thirty-nine automated tests pass across sensors, fog logic, and dashboard. And three hundred messages fired at the live queue in four and a half seconds were all processed and stored, verified directly in DynamoDB.

## Slide 5 (2:30-3:35)

Now, the hardest part. The dashboard reports how many records are stored, and it counted them with a single DynamoDB scan. What I hadn't appreciated is that DynamoDB caps every scan at roughly one megabyte: past the first page, the count simply stops. No error, no warning, just a smaller number that looks plausible. Here's why it was hard: nothing ever failed. All thirty-nine tests passed. The full emulator-backed integration run passed. My demo data was small enough that the number even looked right. With no failing signal to chase, the defect only surfaced once the pipeline ran on the real AWS account. The fix walks DynamoDB's pagination cursor and sums every page. I locked it in with a three-page test, five hundred plus five hundred plus two fourteen equals twelve fourteen, and re-verified it against the live table. The lesson: the emulator was more forgiving than the cloud.

## Slide 6 (3:35-4:00)

Three takeaways. Edge-first design pays off: raw readings stay local and alerts fire within seconds. Serverless scales without provisioning: that sixty-seven-message-per-second burst was absorbed with nothing pre-sized. And an emulator is not the cloud: two defects passed every local test and only appeared on real AWS. Thank you. I'm happy to take questions.
