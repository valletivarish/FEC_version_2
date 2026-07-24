# Wildlife Conservation Habitat Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Fixed patrols learn about events late: a poaching incident, a drying waterhole, or a sudden movement surge is discovered only when a patrol reaches that spot, not when it starts. And the critical signals are short-lived — a gunshot-like acoustic spike lasts moments, so continuous sensing has to raise the alert as the window closes, while a ranger can still respond. Two reserves each stream five sensor types around the clock, far too many feeds for manual checking.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten feeds across two reserves reach a fog node running at the reserve edge on EC2, which windows, aggregates and evaluates all four alert rules on site. It feeds an Amazon SQS queue, an AWS Lambda ingest and a DynamoDB store; a second Lambda dashboard API behind API Gateway reads the store; and the page is served from S3, showing both reserves side by side with a field-station log and live alert flags.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — four of four checks true, the freshest reading under six seconds old. Second, the reserves — both reserves side by side with a field-station log, and alert flags tripping on real thresholds; stored readings climbed from three sixty-two to three seventy-eight in fifteen seconds during verification. Third, confidence — eighty-two automated tests pass across all four modules.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was a silent DynamoDB undercount. The dashboard's stored-readings count came from a single scan — and one scan call returns only about a megabyte of data and hands back a cursor for the rest, so the count silently stops short, with no error raised anywhere. All eighty-two local tests and a full emulator run stayed green, because a small local table fits in one page, so nothing could expose the missing pages; only a real table growing past that boundary makes the number wrong. The fix follows the cursor page by page with the SDK's own paginator, locked in by a four-page regression test that sums one thousand two hundred and eighty-seven items, and re-verified against the live account. The same audit also caught unbatched sends, now grouped ten per call.
