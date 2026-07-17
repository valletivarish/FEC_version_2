# Smart Port Container Terminal Monitoring - 4-Minute Presentation Script

Total: 516 spoken words, about 3 minutes 58 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Picture a working container terminal: quay cranes swinging forty-tonne boxes over a berth, refrigerated containers holding cargo cold, and a wind that can force every lift to stop. I'm Uday Kiran Reddy Dodda, and my Fog and Edge Computing project turns that quayside into something you can watch live, second by second, instead of reading it off a clipboard after the fact.

## Slide 2 (0:20-1:00)

So why does a paper log fall short? Two berths carry ten live sensor streams: crane load, container-stack height, wind, berth occupancy, and reefer temperature. They change every two to four seconds, but a manual walk-round only sees each berth every few minutes. The dangerous moments are the brief ones, a single gust over the limit, one overloaded lift, one reefer drifting warm. The four limits on this slide are the fog node's real, code-defined rules: thirty-four knots halts crane lifts, thirty-two thousand kilograms flags an overload, minus ten degrees breaks the cold chain, and ninety percent occupancy raises congestion.

## Slide 3 (1:00-1:50)

Let me trace one reading through the system. It starts at a berth sensor and reaches a fog gateway sharing the edge host. The gateway is the important part: it does not just relay. It buffers the reading, and every ten seconds it collapses that whole window into one aggregate per sensor and checks the safety rules right there, so raw noise never leaves the terminal. Only that compact summary crosses into the cloud, onto an Amazon SQS queue. The queue triggers an AWS Lambda that writes it into DynamoDB, keyed so the newest windows read back instantly. The dashboard is serverless too: a static page on S3, its API a second Lambda behind API Gateway.

## Slide 4 (1:50-2:30)

And this is it running on a real AWS account, not an emulator. The screenshot is the deployed dashboard, served from S3 through the gateway. Three facts. All four pipeline health checks are green, with the freshest data seconds old. Ninety-five automated tests pass across the sensor, fog, processor and dashboard modules. And a two-thousand-message burst was absorbed straight through the queue while the live berth data kept flowing untouched.

## Slide 5 (2:30-3:35)

Now the hardest part. Every ten seconds the fog node has to close the current window and publish it, while ten sensors keep posting into the very same buffer. Lock that buffer and every flush stalls incoming readings. Clear it naively, and any reading that lands mid-drain is either lost or counted twice in the next window. My fix is a numbered-ticket scheme: every reading takes a ticket in arrival order, a flush snapshots the latest number as a boundary and seals only the readings below it, and anything that arrives during the drain simply rolls into the next window. No locks, nothing lost, nothing double-counted. It is backed by the fog module's forty-eight tests, including ingest driven over a real network socket.

## Slide 6 (3:35-4:00)

Three things this proved. Fog windowing turns ten raw telemetry streams into a handful of meaningful safety signals before anything reaches the cloud. The serverless backend absorbed a two-thousand-message burst with no servers to manage. And every alert on screen traces back to a real, code-defined threshold, verified end to end by ninety-five automated tests. Thank you, I am happy to take questions.
