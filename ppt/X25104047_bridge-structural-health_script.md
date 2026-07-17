# Bridge Structural Health Monitoring - 4-Minute Presentation Script

Total spoken words: 522 | Estimated duration: ~4 min 1 s at ~130 wpm

## Slide 1 (0:00-0:20)

Good morning. I'm Kasireddy Vadicherla, student ID X25104047, MSc in Cloud Computing at National College of Ireland. For my Fog and Edge Computing project I built a bridge structural health monitoring system — and it isn't a mock-up: it's running live on AWS right now.

## Slide 2 (0:20-1:00)

Why bridges? Most road authorities still assess bridge condition by visual inspection, on a cycle measured in years — not days. But the bridge doesn't wait. Between walk-throughs the deck accumulates strain cycles from traffic, the joints move with temperature, and slow deformation creeps in unseen. Streaming every raw sample to a data centre isn't the answer either: it wastes bandwidth and delays the moment that matters — a threshold breach. That blind spot is what this project closes.

## Slide 3 (1:00-1:50)

Here's the pipeline, left to right. The red boxes live at the bridge: ten sensors — five types on each of two spans — feeding a fog node on the same EC2 host. Every ten seconds it closes a window, reduces raw readings to min, max, and average summaries, and checks four alert thresholds right at the edge. Raw samples never leave the bridge. Only compact summaries cross into the blue serverless side: batched onto Amazon SQS, ingested by AWS Lambda into DynamoDB, and served through API Gateway to a dashboard hosted on S3. Each span's strain and vibration fold into one zero-to-a-hundred integrity index, built to hit zero exactly where an alert fires.

## Slide 4 (1:50-2:35)

This is the real deployed dashboard, captured live from the S3 and API Gateway endpoint. At the top, all four pipeline health checks are green — fog gateway, queue, Lambda, and data freshness. Behind it, 115 automated tests pass. When I verified it live, the freshest data was under ten seconds old, and a hundred records had landed in DynamoDB within a minute. The two gauges on the right: span A at one hundred percent, span B at 76.8 — that gap is real sensor data moving the score, not a fixture.

## Slide 5 (2:35-3:40)

The hardest part wasn't writing code — it was one Terraform command. My deployment goes through a shared Terraform module, whose state file already tracked a different live AWS stack under the default workspace. My configuration was fine — but Terraform reconciles state: applying it there would have destroyed that other live deployment to make the state match. The only warning is one line of plan output: the destroy count. That's what made it hard: nothing fails loudly; the danger sits outside your own code. The fix is on the terminal panel below: never apply an unread plan. I created a dedicated workspace first, re-planned, and read exactly what I wanted — twenty-four to add, zero to destroy. One apply later, everything was healthy within a minute. The same habit drove a pre-deployment audit that caught two silent defects — a DynamoDB pagination undercount and unbatched SQS publishing — both fixed and tested before launch.

## Slide 6 (3:40-4:00)

Three takeaways. Aggregate at the edge: send summaries, not samples, and let alerts fire locally. Let serverless absorb the load: it costs nothing while idle, and it ran green on a real AWS account. And read the plan before you apply. Thank you — I'm happy to take your questions.
