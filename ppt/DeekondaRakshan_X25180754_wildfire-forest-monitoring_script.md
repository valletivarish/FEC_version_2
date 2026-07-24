# Wildfire Forest Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Wildfire risk moves faster than any inspection schedule. Ranger stations sit deep in remote forest, and patrols and hourly readouts leave long blind windows. Fire weather compounds quietly — heat, smoke, wind and drying soil each look tolerable on their own; the danger is the combination, and it can develop between two routine checks. So detection has to run continuously, right next to the sensors, not on a schedule.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten containerised sensors stream temperature, humidity, smoke, wind and soil moisture from two stations to a fog node. The node buffers readings, aggregates each window and raises fire alerts right at the edge. Amazon SQS receives each window's aggregates in batched sends; a Lambda consumes the queue and transforms every record into DynamoDB; and API Gateway with S3 serve the dashboard, with a zero-to-four fire-risk dial per station.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — a scripted check verifies sensors to fog to queue to ingest to store, live, end to end. Second, the stations — two ranger stations with five fire metrics each and a zero-to-four risk dial, and a fire-detection alert firing on a smoke spike. Third, robustness — ninety-five automated tests pass across every module, and a two-thousand-message burst from thirty-two senders drains without the consumer stalling.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was an invisible credential bug. Locally the pipeline signs its queue and database calls with the emulator's dummy credentials, and it decided when to use them by checking whether an AWS access-key variable was present. But real AWS injects that exact variable into every function it runs — so in production, every queue and database call would be signed with incomplete credentials and rejected. All ninety-five tests stayed green; nothing could fail until the first real deployment. The fix gates on a signal that only exists locally — the emulator's endpoint address. On real AWS it is absent, so the platform's own credentials take over automatically, and new tests pin that behaviour in both profiles.
