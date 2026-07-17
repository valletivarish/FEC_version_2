# Offshore Wind Farm Turbine Monitoring - 4-Minute Presentation Script

Total: 519 spoken words - just under 4 minutes at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning. I'm Vishvaksen Machana, student ID X25173421, MSc in Cloud Computing at National College of Ireland. For Fog and Edge Computing, I built a fog-to-cloud pipeline that continuously monitors an offshore wind farm - and it is running live on AWS right now.

## Slide 2 (0:20-1:00)

Why this problem? Offshore turbines are reached by boat, weather sets the schedule, and technician visits can be weeks apart. Faults don't wait: bearings overheat, blade vibration grows, gearboxes lose lubrication pressure. The number on the right is why continuous matters - one momentary dip below two-point-five bar is a lubrication fault, and an inspection weeks later would never see it. And streaming every raw reading ashore is no fix: the link is limited, and it dies in exactly the storms that stress turbines most.

## Slide 3 (1:00-1:50)

Here's the pipeline, left to right. Ten sensor streams - five per turbine - feed a fog gateway at the site. It folds readings into fixed time windows, computes summaries, and evaluates four condition rules, so a fault is flagged in the same cycle it appears. Only compact summaries cross to the cloud - one batched call per window instead of ten. From there everything is serverless: Amazon SQS buffers each batch, an AWS Lambda function stores the records in DynamoDB, and a second Lambda behind API Gateway serves the read-only dashboard, delivered as a static page from S3. The write path and the read path scale and fail separately.

## Slide 4 (1:50-2:25)

This is the real deployment - the dashboard in a browser, pointed at the live AWS account. Each turbine tile shows its five live metrics, and the footer down here shows all four health checks up and the freshest data about three seconds old. During live verification the stored record count climbed from seventeen, to one-thirty-two, to two-hundred-and-four. And underneath it all, seventy-one automated tests pass.

## Slide 5 (2:25-3:35)

Now, the hardest part. Two cloud-facing modules decided they were in local testing whenever the standard access-key variable existed in the environment, and swapped in fake, emulator-only credentials. Locally that assumption is always true, so every test passed. The trap: AWS Lambda always injects that exact variable - it's how a function receives its real credentials. Deployed as written, both functions would have discarded their real identity and failed their first call to the queue or the database. The same signal means opposite things in the two environments, so no local test could expose it. The fix was to key on the emulator endpoint variable instead - the one signal that genuinely means local - so deployed functions fall through to the platform's default credential chain. An audit caught this before deployment, plus a record-count undercount and a missing batching path. Zero defects reached the live account, and the first live health poll came back green.

## Slide 6 (3:35-4:00)

Three takeaways. Fog computing earns its place offshore - the analysis runs at the turbines, and only compact summaries cross the sea link. A serverless core keeps the cloud side elastic and nearly free when idle. And an emulator cannot prove production readiness - live verification turned works-locally into works-deployed. Thank you - I'm happy to take questions.
