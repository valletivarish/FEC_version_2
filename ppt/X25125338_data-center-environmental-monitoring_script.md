# Data Center Environmental Monitoring - 4-Minute Presentation Script

Total: 514 spoken words - approximately 3 minutes 57 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning, everyone. I'm Nithin, student ID X25125338, MSc in Cloud Computing at National College of Ireland. For my Fog and Edge Computing project I built an environmental monitoring pipeline for a data center - and it's running live on AWS right now.

## Slide 2 (0:20-1:00)

First, the problem. Data centers depend on tight environmental control. An overheating server, humidity drifting toward condensation, or blocked airflow around a rack can each end in hardware failure or an unplanned outage. Yet a facility that relies on periodic inspection rounds finds those conditions only after the fact. The numbers on the right are my alert thresholds: a hall averaging above twenty-seven degrees, humidity above sixty percent, or airflow below four hundred CFM must be flagged the moment it happens, not on the next walk-through.

## Slide 3 (1:00-1:45)

Here's how it works, from the top left. Ten simulated sensors, five types in each of two server halls, stream readings into a fog node running beside them. The fog node does the edge work: it buffers readings, aggregates each time window, and evaluates the alert rules locally, so only compact summaries ever travel to the cloud. Those summaries land on an Amazon SQS queue, a Lambda function ingests them, and DynamoDB stores them. On the bottom row, a second, separate Lambda behind API Gateway serves the data back to a live dashboard hosted on S3. The whole backend is serverless.

## Slide 4 (1:45-2:25)

And this is the real thing - this screenshot is the deployed dashboard, served from S3, during live verification. In the top corner, all four pipeline health checks are green: gateway, queue, Lambda, and pipeline. Behind it sit one hundred and fourteen automated tests, all passing. And for scale, I fired three hundred messages at the real queue in about five and a half seconds - every one confirmed stored in DynamoDB, with fresh readings arriving within about three seconds.

## Slide 5 (2:25-3:30)

Now the hardest part - the two numbers at the top tell the story. All one hundred and fourteen tests passed, the full LocalStack integration run passed - and yet on real AWS, every database and queue call would have failed authentication. Why? Three files decided whether to use the emulator's dummy credentials by checking if the AWS access-key environment variable existed. Locally, that check happened to be right. But real Lambda and EC2 inject that exact variable automatically, with genuine session credentials - so the code threw the real credentials away and substituted hardcoded test ones. No emulator can reproduce that trigger, which is why it slipped through everything. The fix was to gate on something genuinely unique to local development: the explicit LocalStack endpoint override. I applied that in all three files, redeployed, and verified it live with an end-to-end database write and queue receive.

## Slide 6 (3:30-4:00)

So, three takeaways. Do the work at the edge - windowing and alerting at the fog node catches breaches in seconds, and only summaries cross the network. Build the backend serverless - it scales per request and costs nothing when idle. And always test on the real platform, because an emulator will happily pass code that production rejects. Thank you - I'm happy to take questions.
