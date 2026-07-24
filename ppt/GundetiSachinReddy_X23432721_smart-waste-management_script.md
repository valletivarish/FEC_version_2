# Smart Waste Management — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Municipal waste collection runs on a fixed calendar, not on what is actually happening inside each bin. Trucks roll out to bins that are not yet full, wasting collection runs, while overflow, fire, gas build-up and tampering stay invisible until the next scheduled visit. So I monitor two collection districts continuously, so the busiest bin is always collected first, and four hazard rules watch every bin live.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors, five types across two districts, feed a fog node on EC2 that buffers readings, aggregates each window and fires hazard alerts locally. Amazon SQS then a Lambda absorb bursts and scale with the backlog with no servers to size; DynamoDB stores every window keyed by type, time and district; and a static S3 site with a second Lambda behind API Gateway serve the dashboard. Only compact summaries cross into the cloud.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — four of four checks green, with the freshest reading just over a tenth of a second old. Second, genuinely live data — two health polls fifteen seconds apart show the stored count climbing four thousand and eighty-three to four thousand and ninety-three, live data, not a cache. Third, scale — one hundred and fifteen tests pass across all four modules, and a three-hundred-message burst sent at about forty-nine a second was absorbed by Lambda before the follow-up check ran.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was what only the real cloud revealed. On the first deployment, every DynamoDB and SQS call failed authentication across fog, processor and dashboard, and CloudFront and public Lambda Function URLs turned out to be blocked outright in the academy account. All one hundred and fifteen tests and the full emulator run had passed cleanly, so nothing pointed at the code — but the client swapped in hardcoded emulator credentials whenever an access-key variable was present, and real AWS always sets that variable. The fix gates those credentials on the one truly local signal, the explicit endpoint override, and serves the API through API Gateway with the frontend on S3 over HTTPS to route around the account blocks. Every fix was re-verified live with a real write and a real two-hundred through the gateway. An emulator pass is not a deployment pass.
