# Smart Building Energy Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

A building manager asks two different things at once: is anything wrong right now, and how efficiently is this floor running overall. Those are not the same question. An exception is discrete — a peak load, stale air, a room too hot or too cold, a tap left running. A rating is a smooth summary, the kind a building energy certificate rolls into a single letter. So I keep them on separate axes across two floors and five signals each.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten streams across two floors feed a fog node where a single consumer thread owns the window buffers, aggregates, and raises four hard exception alarms at the edge. Amazon SQS carries the aggregates; a Lambda ingests each into DynamoDB; and S3 with API Gateway serve the scorecard. Exception alarms are decided at the edge, in the window they appear.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — gateway, queue, processor and pipeline all green. Second, the scorecard — an A-to-F grade badge per floor; both floors are graded A right now, with the numeric score beneath the letter still separating a floor running very lean from one just starting to drift toward heavier use. Third, scale — one hundred and thirty-three automated tests pass across every module, and a two-thousand-message burst from thirty-two senders was absorbed.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was grading the floor without storing the grade. The manager needs both an exception and a rating, but they belong on separate axes, and baking a rating into stored records would freeze the thresholds and blur the two questions together. So the fog answers the exception question at the edge, raising four hard alarms per window. The dashboard answers performance on read: it scores energy draw and air quality each from a hundred down to zero, averages them, and maps the number to an A-to-F letter, exactly like an energy-performance certificate. It is derived fresh on every read and never stored, so the thresholds can be retuned without touching a single saved record.
