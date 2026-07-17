# Ski Resort Avalanche Safety - 4-Minute Presentation Script

Total spoken words: 515 · estimated duration at ~130 wpm: about 3 minutes 58 seconds.

## Slide 1 (0:00-0:20)

Good morning. I'm Ebin Joseph, student ID X25142224, MSc in Cloud Computing at the National College of Ireland. For my Fog and Edge Computing project I built a ski-resort avalanche-safety system that watches two slopes continuously — and it's deployed live on a real AWS account right now.

## Slide 2 (0:20-1:00)

Why build it? Because avalanche danger moves faster than a ski patrol. A seismic spike ahead of a slab release lasts only minutes — it can pass entirely between two patrol rounds. The answer is on the right: ten sensors, five signal types on each of two slopes — snowpack depth, snow temperature, wind, seismic vibration, and lift chairs — checked at the edge against four hard alert rules. If wind averages past eighty kilometres per hour, a lift-halt alert fires with nobody walking the slope.

## Slide 3 (1:00-1:50)

Here's how the data flows — just follow the numbers. Sensors post readings to a fog node on the mountain — the dark box: it buffers raw readings, closes a window on a timer, aggregates it, and checks the four alert rules right there. Only one compact summary per window travels to the cloud, onto an Amazon SQS queue. An AWS Lambda function wakes only when messages arrive and writes each aggregate into DynamoDB. The dashboard is a static page on Amazon S3, polling a second Lambda through API Gateway. So raw data never leaves the mountain, and everything past the fog node is serverless.

## Slide 4 (1:50-2:30)

This screenshot is the real deployed dashboard, served from S3 on a live AWS account. Top right, all four pipeline health checks are green: gateway, queue, Lambda, pipeline. Behind it, a hundred and twenty-one automated tests pass. During verification, DynamoDB climbed from zero to five hundred and sixty-nine records in about ninety seconds and kept going. And it caught a real event live: wind on slope-a hit a hundred and eleven kilometres per hour — you can see the gauge at HIGH and the lift-wind-halt alert firing.

## Slide 5 (2:30-3:40)

Now, the hardest part. Two defects existed only in the real cloud. The first — broken Lambda credentials — at least announced itself in the logs. The second was worse. On the left: every check said the system was healthy — the health endpoint reported all four fields true, curl returned live data, the browser showed zero errors and zero failed requests. Yet, on the right, every panel on the page stayed empty. The cause: my API responses carried no cross-origin header, so the browser silently blocked the page's calls before any code saw them, and the polling loop swallowed each failure into a quiet retry. Nothing was logged anywhere. The fix was one header on every response, then re-verifying in a real browser until every panel filled with live data. The real lesson: a green health check proves the API works — only a real browser proves the user sees it.

## Slide 6 (3:40-4:00)

Three takeaways. Fog aggregation earns its place: the cloud only ever sees compact, already-judged summaries. A fully serverless backend scales per request, with nothing to patch. And live deployment is the real test — no local suite could have found those defects. Thank you — I'm happy to take questions.
