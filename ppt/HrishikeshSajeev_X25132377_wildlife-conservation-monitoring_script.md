# Wildlife Conservation Habitat Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Hrishikesh Sajeev, and this is my Wildlife Conservation Habitat Monitoring. Fixed patrols learn about events late: a poaching incident, a drying waterhole, or a sudden movement surge is discovered only when a patrol reaches that spot, not when it starts. And the critical signals are short-lived — a gunshot-like acoustic spike lasts moments, so continuous sensing has to raise the alert as the window closes, while a ranger can still respond. Two reserves each stream five sensor types around the clock, far too many feeds for manual checking.

## 2 · High-level description — Slide 2 (0:30–1:00)

Start at the screen: the page comes off S3, showing both reserves side by side with a field-station log and live alert flags. Behind it, a second Lambda dashboard API sits behind API Gateway, reading a DynamoDB store that an AWS Lambda ingest fills from an Amazon SQS queue. Feeding that queue is a fog node on EC2 at the reserve edge, windowing, aggregating and evaluating all four alert rules on site from ten feeds across the two reserves.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Everything's green — four of four health checks true, the freshest reading under six seconds old — but here's the part that matters. This is the reserves view: both side by side with a field-station log, and alert flags tripping on real thresholds, exactly as a ranger would read them. Watch the counter move — during my verification the stored readings climbed from three sixty-two to three seventy-eight in just fifteen seconds, so that's live data landing, not a snapshot. And under all of it, eighty-two automated tests pass across all four modules.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

This bug only appeared at scale. The reserve's reading store grows without bound, and a naive query returns just the first page the database hands back. On real AWS that page caps at about a megabyte — so once enough readings pile up, the dashboard quietly undercounts, and every local test still passes because the test store fits in a single page. The fix follows the store's pagination cursor page by page until the scan is genuinely exhausted, with a switch-based dispatch keeping the function handler a thin router over the same query methods the local server uses. A regression test now pins the multi-page behaviour, and it even caught some unbatched writes on the ingestion side.
