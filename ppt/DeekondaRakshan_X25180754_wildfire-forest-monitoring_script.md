# Wildfire Forest Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Deekonda Rakshan, and this is my Wildfire Forest Monitoring. Wildfire risk moves faster than any inspection schedule. Ranger stations sit deep in remote forest, and patrols and hourly readouts leave long blind windows. Fire weather compounds quietly — heat, smoke, wind and drying soil each look tolerable on their own; the danger is the combination, and it can develop between two routine checks. So detection has to run continuously, right next to the sensors, not on a schedule.

## 2 · High-level description — Slide 2 (0:30–1:00)

Here's the one idea behind it: raw readings never leave the edge — only ten-second summaries cross. Ten containerised sensors stream temperature, humidity, smoke, wind and soil moisture from two stations to a fog node, which buffers readings, aggregates each window and raises fire alerts at the edge. Amazon SQS receives each window's aggregates in batched sends; a Lambda drains the queue and transforms every record into DynamoDB; and API Gateway with S3 serve the dashboard's zero-to-four fire-risk dial per station.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Remember the blind window between two routine checks — that's the gap this closes. Watch: smoke spikes at one of the two ranger stations, and within that same aggregation window the fire-detection alert fires, no patrol required. Each station shows its five fire metrics and a zero-to-four risk dial live on screen. Behind that, a scripted check verifies the whole path end to end — sensors to fog to queue to ingest to store. And for robustness, ninety-five automated tests pass across every module, while a two-thousand-message burst from thirty-two senders drains without the consumer stalling.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

My hardest decision was where to put the grade. A hard alarm only tells a ranger that something is already dangerous — by the time smoke density crosses that line, a fire may already be established. What a station really needs is an escalation gradient: how close to danger it's drifting, right now. So the fog still raises hard alarms at the edge, but the dashboard derives a graded zero-to-four fire-risk index live on every read, from earlier and lower thresholds than the alarms use. It climbs ahead of any hard alarm, it's computed on read and never stored, and the two tiers stay completely independent.
