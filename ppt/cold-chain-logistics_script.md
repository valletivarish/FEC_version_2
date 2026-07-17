# Cold Chain Logistics Monitoring - 4-Minute Presentation Script

Total spoken words: 508 - approximately 3 minutes 55 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning. My project is cold chain logistics monitoring - keeping refrigerated cargo safe from the truck to the store. Ten container sensors track five risk signals along that journey, and everything ends up on one live operations board.

## Slide 2 (0:20-1:00)

Why continuous monitoring? Because cargo risk builds in seconds. A container whose average temperature drifts above minus fifteen degrees is already breaching the cold chain, and a door open longer than five minutes raises an alert - both real rules from the system, the numbers on the right. Each container carries five separate signals - temperature, humidity, door time, shock and CO2 - more than any clipboard round can follow. A periodic check finds a breach after the damage. Here, sensors sample every few seconds and every container is re-scored every ten.

## Slide 3 (1:00-1:50)

Here's the pipeline - just follow the arrows. Ten simulated container sensors feed a depot relay - the fog node. Every ten seconds it closes a window: it aggregates each reading type, checks the exception rules, and ships one compact aggregate to an Amazon SQS queue, batched up to ten messages per call. An AWS Lambda function consumes the queue and stores every record in Amazon DynamoDB, where the live dashboard reads it - on AWS the front end sits behind API Gateway and S3. It all runs end-to-end on Docker with an AWS emulator, and moving to real AWS is a configuration change plus one scripted deploy step.

## Slide 4 (1:50-2:30)

This is the dashboard, captured from the running stack. On the left, the manifest table - one row per container, every reading side by side, with a status column. Below it, storage-temperature trends, and along the bottom the pipeline status strip: depot relay online, queue reachable, Lambda deployed, records archived. Three facts: all pipeline health checks are green; seventy-six automated tests pass across ten modules; and a load test pushed two thousand messages through with thirty-two parallel workers without disturbing the live data.

## Slide 5 (2:30-3:35)

Now the hardest part of the project. The dashboard shows a records-archived count, and that number was quietly wrong - or would have been, at scale. The counter asked DynamoDB to scan and count the table, but DynamoDB only answers with about one megabyte per call. So the counter only ever saw the first page of the table. What made this genuinely hard is that nothing ever failed. The call succeeds, the number looks plausible, and every test passed, because small test tables fit inside one page. The moment real data outgrows a page, the count silently drifts wrong - no error, ever. The fix, in the diagram at the bottom: follow the paging contract - keep requesting pages through DynamoDB's continuation key until none is left, and sum the counts. New regression tests prove multi-page tables now count in full - it can't silently come back.

## Slide 6 (3:35-4:00)

So, three takeaways. Push decisions to the edge - exceptions fire at the depot within a ten-second window, with no cloud round-trip in the alert path. Serverless scales by configuration, not rewrites. And green tests are not proof at scale - it took an audit to make one number honest. Thank you - any questions?
