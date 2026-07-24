# Smart Waste Management — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Municipal waste collection runs on a fixed calendar, not on what is actually happening inside each bin. Trucks roll out to bins that are not yet full, wasting collection runs, while overflow, fire, gas build-up and tampering stay invisible until the next scheduled visit. So I monitor two collection districts continuously, so the busiest bin is always collected first, and four hazard rules watch every bin live.

## 2 · High-level description — Slide 2 (0:30–1:00)

Ten sensors — five types across two districts — stream into a fog node on EC2. The instant a window closes, that node reduces the buffered readings, checks its hazard rules, and raises alerts locally, so only a compact summary crosses. Amazon SQS and a Lambda absorb bursts and scale with the backlog, no servers to size; DynamoDB keeps every window keyed by type, time and district; and a static S3 site with a second Lambda behind API Gateway serves the dashboard.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Let me start with what's on screen right now. Both districts are streaming every bin signal — fill level, temperature, gas and lid activity — and the hazard rules are firing live: overflow, fire risk, gas and tampering, each decided at the edge. The health panel shows four of four checks green, the freshest reading just over a tenth of a second old. To prove it isn't a cached snapshot, watch the stored count over two polls fifteen seconds apart — it climbs from four thousand and eighty-three to four thousand and ninety-three, real windows landing as we speak. And one hundred and fifteen tests pass across all four modules, with a three-hundred-message burst at about forty-nine a second absorbed before my follow-up check ran.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The dashboard started life in the wrong place. It first ran as a process on the edge host, which meant the whole read path depended on that one instance staying up — a single point of failure for a fleet that's meant to be always observable. And this account blocked the obvious serverless front doors, so the usual escape route was closed. I migrated the dashboard to a fully serverless tier: its logic repackaged behind a function and a real API Gateway, with the static frontend on S3. Now the read path doesn't depend on the edge host at all — only fresh data and one health field still do — so the dashboard stays up whether or not the instance is running.
