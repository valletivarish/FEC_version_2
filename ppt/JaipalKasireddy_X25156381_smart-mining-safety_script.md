# Smart Mining Safety Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Underground, the hazards move faster than any inspection. Methane can be cleared by a ventilation fan in under a minute or left in place for an hour, depending on airflow. Carbon monoxide from blasting or exhaust displaces breathable air silently, with no visible warning. And ground vibration from an unstable face can precede a rockfall by seconds rather than hours. No inspection schedule is that fast, so I check every window against hard limits at the fog node itself.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors across two shafts, five hazard types, post continuously to a fog node that windows, aggregates and evaluates the alert thresholds at the edge. Amazon SQS carries compact summaries in batches of up to ten; a Lambda reads the queue and stores each finished window in DynamoDB, keyed per hazard and shaft; and API Gateway with S3 show SAFE, CAUTION or DANGER per shaft. Alerts fire in the same process that measured the reading.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — all four checks reported true on the very first check after deployment. Second, the shafts — SAFE, CAUTION or DANGER per shaft, with a silica-dust breach classifying shaft A as DANGER while shaft B stays SAFE, and zero console or CORS errors. Third, scale — ninety automated tests pass across every module, and stored readings passed one thousand four hundred during the verification window and kept rising.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was a credential defect — but the point is where it was caught. All three cloud-facing classes hardcoded a fixed pair of test credentials into every client they built. LocalStack expects exactly those values, so all ninety tests passed and every local run looked perfect. On real AWS, that same pair overrides the IAM role, and every call would fail authentication. The fix builds static credentials only when a LocalStack endpoint is configured; otherwise it falls through to the Lambda role or EC2 instance profile. I audited all three constructors side by side before deploying — so the bug never reached the live account, no outage, no fix-forward cycle, and the first live health check came back all green.
