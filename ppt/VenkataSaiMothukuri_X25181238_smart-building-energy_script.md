# Smart Building Energy Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

A building manager asks two different things at once: is anything wrong right now, and how efficiently is this floor running overall. Those are not the same question. An exception is discrete — a peak load, stale air, a room too hot or too cold, a tap left running. A rating is a smooth summary, the kind a building energy certificate rolls into a single letter. So I keep them on separate axes across two floors and five signals each.

## 2 · High-level description — Slide 2 (0:30–1:00)

At the heart is the fog window. Ten streams from two floors land there, and a single consumer thread owns the window buffers — it aggregates each window and raises four hard exception alarms right at the edge, in the window they appear. From there the summary travels: Amazon SQS carries the aggregates, a Lambda ingests each one into DynamoDB, and S3 with API Gateway serve the scorecard.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Watching it live, the pipeline's already moving — gateway, queue, processor and pipeline all green as records land. The story worth seeing is the scorecard: each floor wears an A-to-F grade badge, and both are graded A right now — but the grade sits on a separate axis from the alarms. Four hard exception alarms fire at the edge, while the letter grade is derived fresh on read, so look under the letter and the numeric score still tells the floors apart, one running very lean, the other just starting to drift toward heavier use. Underneath it all, one hundred and thirty-three automated tests pass across every module, with a two-thousand-message burst from thirty-two senders absorbed cleanly.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Grading each floor without ever storing the grade was the challenge. The manager needs both an exception and a rating, but they belong on separate axes, and baking a rating into stored records would freeze the thresholds and blur the two questions together. So the fog answers the exception question at the edge, raising four hard alarms per window. The dashboard answers performance on read: it scores energy draw and air quality each from a hundred down to zero, averages them, and maps the number to an A-to-F letter, exactly like an energy-performance certificate. It is derived fresh on every read and never stored, so the thresholds can be retuned without touching a single saved record.
