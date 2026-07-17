# Wildlife Conservation Habitat Monitoring - 4-Minute Presentation Script

Total spoken words: 513 · estimated duration at ~130 wpm: about 3 minutes 56 seconds.

## Slide 1 (0:00-0:20)

Good morning. I'm Hrishikesh Sajeev, student ID X25132377, MSc in Cloud Computing at National College of Ireland. For Fog and Edge Computing I built a wildlife conservation habitat monitoring pipeline, and it is running live on AWS: two reserves, ten sensor feeds, a fog node, and a serverless backend.

## Slide 2 (0:20-1:00)

Here's the problem. A ranger on a fixed patrol learns about a poaching incident, a drying waterhole, or a movement surge only when the patrol reaches that spot, not when it starts. And these signals are short-lived. On the right are two of my alert thresholds: an average acoustic level above seventy-five decibels flags possible gunshot or chainsaw activity, and a waterhole below twenty centimetres flags drought stress. Five sensor types per reserve means ten continuous feeds no manual schedule can watch.

## Slide 3 (1:00-1:50)

How does it work? Follow the top row. Ten sensor feeds post readings to a fog node at the reserve edge. It does the edge computing: windows the readings, reduces each window to a few summary figures, and evaluates the alert rules locally, so the raw stream never leaves the reserve. The compact summaries go onto an Amazon SQS queue, AWS Lambda drains it, and each aggregate lands in DynamoDB. The bottom row is the serve path: a second Lambda behind Amazon API Gateway reads everything back, and the dashboard is a static page on Amazon S3. Fully serverless, nothing for me to patch.

## Slide 4 (1:50-2:35)

This is the real deployed dashboard, not a mock-up: both reserves' field-station logs and the waterhole trend chart, as it rendered during the live browser check. Three facts from that verification. All four pipeline health checks came back true, with the freshest reading under six seconds old. Eighty-two automated tests pass across the four modules. And the stored-readings count climbed from three sixty-two to three seventy-eight in fifteen seconds, with alert flags tripping on the real thresholds. The pipeline isn't just up, it's visibly moving.

## Slide 5 (2:35-3:40)

Now, the hardest part. The dashboard reports how many readings sit in the table, and my count came from a single DynamoDB scan. The catch: one scan call returns only about a megabyte of data, then hands back a cursor, and unless you follow it the count silently stops short. No exception, no warning, just a wrong number. And it was invisible. All eighty-two local tests were green, and a full emulator integration run was green too, because a small local table always fits in one page. Only a real AWS table growing past that boundary exposes it. The fix follows the cursor page by page using the SDK's own paginator, locked in by a regression test that sums four pages to exactly twelve eighty-seven items, and re-verified live, where the count kept climbing. The same audit caught unbatched queue sends too, now grouped ten per call.

## Slide 6 (3:40-4:00)

Three takeaways. Decide at the edge, where the data is born. Go serverless where it scales, with nothing to patch. And deployment is the real test: two defects passed every local test, and only the live cloud exposed them. Thank you, I'm happy to take questions.
