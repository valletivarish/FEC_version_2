# Offshore Wind Farm Turbine Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Offshore turbines are reached by boat, the weather sets the schedule, and a technician visit can be weeks apart. In between, faults escalate — a bearing overheating, a gearbox losing lubrication pressure, a blade vibration growing worse — all invisible until the next inspection. Streaming raw data ashore is not the fix either: the link has limited, variable bandwidth, and a view that dies when connectivity dips fails during exactly the storms that stress turbines most. So the watching has to happen at sea.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensor streams across two turbines feed a fog gateway. It windows and aggregates each stream and runs four condition rules at the edge, so a fault is flagged in the same window cycle it appears. One window cycle of up to ten summaries goes to Amazon SQS as a single batched call; a Lambda ingests and stores it in DynamoDB; and a read-only dashboard API behind API Gateway feeds the S3 page. Only compact summaries cross the sea link.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — four of four checks green within about a minute of start-up, the freshest stored data around three seconds old. Second, both turbines — five metrics each and a cross-turbine power trend, with the stored count climbing seventeen, one thirty-two, two hundred and four across successive polls, so it is genuinely live. Third, confidence — seventy-one automated tests pass across sensors, fog gateway, ingestion and dashboard.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was a credential trap. Two cloud-facing modules decided they were in local testing whenever the standard access-key variable was present, and swapped in fake, emulator-only credentials. But the serverless platform always injects that same variable to hand a function its real credentials — so in production both functions would throw away their real identity and fail their first call, while every local test kept passing, because locally the assumption is true. The fix gates on the emulator endpoint instead — the one signal that genuinely means local. A pre-deployment audit caught this and two more, all fixed before the first deploy, and every check was green on the first live poll.
