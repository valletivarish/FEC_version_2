# Smart Mining Safety Monitoring - 4-Minute Presentation Script

Total: 513 spoken words, roughly 3 minutes 55 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning. I'm Jaipal Kasireddy, student ID X25156381, MSc in Cloud Computing at the National College of Ireland. For my Fog and Edge Computing project, I built Smart Mining Safety Monitoring: a fog-to-cloud hazard pipeline for two underground shafts, deployed live on a real AWS account.

## Slide 2 (0:20-1:00)

So why continuous monitoring? Underground hazards move faster than any inspection round. A ventilation fan can clear a methane pocket in under a minute, or leave it in place for an hour, depending on airflow. Carbon monoxide displaces breathable air with no visible warning. And ground vibration can come seconds before a rockfall. On the right are the four hard limits the system watches, from a thousand ppm of methane to twenty-five millimetres per second of vibration. No periodic walk-through can keep up with hazards on that clock.

## Slide 3 (1:00-1:55)

Here is how it works; follow the flow on the slide. Ten sensor containers, five hazard types in each of two shafts, post readings to a fog node at the edge. The fog node windows and aggregates them, evaluates the safety thresholds locally, and sends only compact summaries into Amazon SQS, batched ten at a time. On the cloud side, an AWS Lambda reads the queue and stores each window in Amazon DynamoDB. A second Lambda behind Amazon API Gateway serves the dashboard from S3, reducing each shaft to one verdict: SAFE, CAUTION, or DANGER. Raw readings never leave the mine, and alerts fire in the same process that measured them.

## Slide 4 (1:55-2:30)

This is the real deployment, not an emulator. The screenshot on the left is the dashboard in a live browser session. All four pipeline health checks, gateway, queue, Lambda and pipeline, reported true on the first check. You can see a silica-dust alert putting shaft A into DANGER while shaft B stays SAFE. Behind it, ninety automated tests pass across four modules, and during verification the stored readings climbed past fourteen hundred and kept rising.

## Slide 5 (2:30-3:40)

Now, the most difficult part. In a code audit before deployment, I found all three AWS-facing classes, dashboard, processor, and queue publisher, hardcoded a fixed pair of test credentials into every client they built. And it was invisible. LocalStack, the local emulator, expects exactly those values, so all ninety tests passed and every run looked perfect. But on real AWS, that same pair overrides the IAM role, and every call to DynamoDB, SQS or Lambda would have failed authentication on day one. The fix: build static credentials only when a LocalStack endpoint is configured, otherwise fall through to the Lambda role or EC2 instance profile. Then I checked all three constructors side by side, because a fix in one class is not a fix everywhere. The payoff is on the right: the first live health check came back four out of four. No outage, no fix-forward cycle.

## Slide 6 (3:40-4:00)

Three takeaways: alert at the edge, in the same process that took the reading. Scale with managed serverless services that cost nothing while the mine is quiet. Audit before you deploy, because an emulator will hide a fatal bug. Thank you, I'm happy to take questions.
