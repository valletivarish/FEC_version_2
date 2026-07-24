# Wildfire Forest Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Wildfire risk moves faster than any inspection schedule. Ranger stations sit deep in remote forest, and patrols and hourly readouts leave long blind windows. Fire weather compounds quietly — heat, smoke, wind and drying soil each look tolerable on their own; the danger is the combination, and it can develop between two routine checks. So detection has to run continuously, right next to the sensors, not on a schedule.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten containerised sensors stream temperature, humidity, smoke, wind and soil moisture from two stations to a fog node. The node buffers readings, aggregates each window and raises fire alerts right at the edge. Amazon SQS receives each window's aggregates in batched sends; a Lambda consumes the queue and transforms every record into DynamoDB; and API Gateway with S3 serve the dashboard, with a zero-to-four fire-risk dial per station.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — a scripted check verifies sensors to fog to queue to ingest to store, live, end to end. Second, the stations — two ranger stations with five fire metrics each and a zero-to-four risk dial, and a fire-detection alert firing on a smoke spike. Third, robustness — ninety-five automated tests pass across every module, and a two-thousand-message burst from thirty-two senders drains without the consumer stalling.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

My hardest decision was where to put the grade. A hard alarm only tells a ranger that something is already dangerous — by the time smoke density crosses that line, a fire may already be established. What a station really needs is an escalation gradient: how close to danger it's drifting, right now. So the fog still raises hard alarms at the edge, but the dashboard derives a graded zero-to-four fire-risk index live on every read, from earlier and lower thresholds than the alarms use. It climbs ahead of any hard alarm, it's computed on read and never stored, and the two tiers stay completely independent.
