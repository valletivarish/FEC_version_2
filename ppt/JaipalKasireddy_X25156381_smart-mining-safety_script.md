# Smart Mining Safety Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Jaipal Kasireddy, and this is my Smart Mining Safety Monitoring. Underground, the hazards move faster than any inspection. Methane can be cleared by a ventilation fan in under a minute or left in place for an hour, depending on airflow. Carbon monoxide from blasting or exhaust displaces breathable air silently, with no visible warning. And ground vibration from an unstable face can precede a rockfall by seconds rather than hours. No inspection schedule is that fast, so I check every window against hard limits at the fog node itself.

## 2 · High-level description — Slide 2 (0:30–1:00)

The fog decides; the cloud only stores and serves. Ten sensors across two shafts stream five hazard types to a fog node that windows, aggregates and evaluates the alert thresholds at the edge, so alerts fire in the same process that measured the reading. Amazon SQS carries summaries in batches of up to ten, a Lambda stores each finished window in DynamoDB keyed per hazard and shaft, and API Gateway with S3 show SAFE, CAUTION or DANGER per shaft.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Look at the two shafts side by side. Shaft A is showing DANGER right now — a silica-dust breach tripped its threshold — while shaft B sits quietly at SAFE, exactly the SAFE, CAUTION or DANGER banding the board shows per shaft. Behind that, the health strip is honest: all four checks reported true on the very first check after deployment, with zero console or CORS errors. And the scale holds up — ninety automated tests pass across every module, and stored readings passed one thousand four hundred during the verification window and kept rising.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Underground, the feed is never clean — and the alarm still has to fire. A container might send malformed JSON, a readings field that isn't even a list, or a record with no timestamp. If one bad post could crash the window or drag the good readings down with it, the gas or rockfall alarm that protects the shaft would go silent at the worst possible moment. So my fog node validates every incoming post and rejects only the offending record, keeps the rest of the window intact, and returns a clean error instead of failing. Its tests deliberately feed it garbage, and the methane, carbon-monoxide and rockfall rules keep firing right through it.
