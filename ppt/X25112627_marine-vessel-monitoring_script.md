# Marine Vessel Condition Monitoring - 4-Minute Presentation Script

Total: 515 spoken words - about 3 minutes 58 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning. I'm Gopi Krishnan, student ID X25112627, MSc in Cloud Computing at the National College of Ireland. For my Fog and Edge Computing project I built a condition-monitoring pipeline for marine vessels - and it is running live on AWS right now.

## Slide 2 (0:20-1:00)

Why this problem? On a ship, condition checks happen on a fixed rounds schedule, so a fuel-burn spike, a ballast imbalance, or rising hull vibration gets noticed at the next check - not when it starts. Continuous sensing fixes that, but creates a new problem: I'm modelling ten live sensor streams across two vessels, and a ship's link back to shore is narrow and unreliable - you can't stream every raw reading ashore. So the answer has to live on board, catching these four alert rules as they start.

## Slide 3 (1:00-1:45)

Here's how it works, left to right. On board, ten sensors feed a fog node, which buffers readings into rolling windows, reduces each window to a few statistics - minimum, maximum, average, latest - and checks the alert rules on the vessel itself. Only those compact summaries cross the link, in batches of up to ten per call, into Amazon SQS. The queue triggers an AWS Lambda function that writes each window into DynamoDB, and a live dashboard - static files on Amazon S3, data through API Gateway - compares both vessels side by side. Everything right of the vessel is fully serverless.

## Slide 4 (1:45-2:30)

This screenshot is the deployed dashboard in a browser, on a real AWS account - not an emulator. Three facts from the live verification. Every pipeline health check reports green - gateway, queue, Lambda, pipeline - with the freshest reading under one second old. One hundred and twenty automated tests pass, with the critical fixes re-verified against the live account. And the data is genuinely live: the stored item count climbed from fifty-nine to three-seventy-four to four-twenty-five during verification, with real alerts firing here - excessive fuel burn and hull stress.

## Slide 5 (2:30-3:35)

Now - the hardest part. After deploying to the real account, I opened the dashboard - and every panel was empty. What made it hard: every check I had was green. All one hundred and twenty tests, a full LocalStack integration run, every curl check on the JSON API returning live data. Nothing I was measuring was broken. The actual fault: the upload to S3 had flattened the static folder to the bucket root, so the page's stylesheet, script, and chart library all returned 404 - and nothing was testing the page's own asset requests. The fix: open the real page in a real browser and read its network requests - three 404s, immediately visible. I re-uploaded preserving the exact paths, then re-verified by watching the item count climb across reloads. The same lesson caught the two defects on the right. A green API check proves less than it looks.

## Slide 6 (3:35-4:00)

Three takeaways. Aggregate at the edge, so only compact summaries cross the ship-to-shore link. Go serverless where it counts - the backend scales per request, with nothing to patch. And always test the real thing: the live cloud and a real browser caught what green tests could not. Thank you - I'm happy to take questions.
