# Smart Building Energy Monitoring - 4-Minute Presentation Script

Venkata Sai Mothukuri - Student ID X25181238 - Fog and Edge Computing (H9FECC)

Total: ~555 spoken words | approximately 4 minutes at ~140 wpm

## Slide 1 - Cover (0:00-0:15)

Good morning. Ask a building manager about a floor and you get two answers, not one. Is anything wrong right now? And how efficiently is it running overall? The first is an alarm; the second is a rating, the kind of single letter a building energy certificate gives a whole property. My project produces both, live, for each floor.

## Slide 2 - Two readings of a floor (0:15-1:05)

The two are genuinely different in kind. An exception is discrete and demands a response now: peak load, stale air, a floor too hot or too cold, a tap left running. A rating is a smooth summary of how leanly the floor runs, and it moves by degrees, not events. So the monitor watches five signals across two floors, ten live streams for energy, carbon dioxide, occupancy, air-conditioning temperature, and water. Every window, four hard rules run: peak load above fifty-five kilowatts, poor air above a thousand parts per million, a leak above twenty litres a minute, and comfort breached from either side, too hot above twenty-six degrees or too cold below eighteen. Occupancy is kept only as context.

## Slide 3 - From meter to scorecard (1:05-1:50)

The reading happens at the edge. Ten sensor processes post over HTTP to a fog node in the building. Because those posts arrive on many threads, one dedicated consumer thread owns the buffers and everything else just hands its batch to it, so ingest never contends for a lock. Every ten seconds the node closes a window, reduces each floor-and-signal stream to five numbers, and raises the exception alarms right there. Only the summary leaves the building, batched onto Amazon SQS. One Lambda drains the queue into DynamoDB; a second serves the scorecard from S3 through API Gateway. It all went onto a real AWS account in one infrastructure-as-code step, twenty-four resources, no manual clicking.

## Slide 4 - Live demonstration (1:50-2:30)

This is the live scorecard reading from the running stack, an A-to-F grade badge on each floor. Both floors are grading A, and the number under the letter tells them apart: one at a hundred, running very lean, the other a little lower as its air quality edges up. Along the top, four pipeline checks, all green. Behind the screen, one hundred and thirty-three automated tests pass, and a two-thousand-message burst from thirty-two parallel senders was absorbed and drained.

## Slide 5 - Grade the floor (2:30-3:35)

That grade is the idea the project turns on. The fog has already answered the exception question at the edge. The dashboard answers a different one, on every read: how well is this floor running? It takes the two signals that most define energy performance, the energy draw and the air quality, and scores each from a hundred when efficient down to zero when wasteful. It averages the two and maps the number onto a letter, the way a building earns an energy-performance certificate. The alarm and the grade are kept apart, each with its own thresholds, and the grade is computed fresh on every read and never stored, so the windows stay the single source of truth and the rating can be retuned without rewriting a record.

## Slide 6 - What to take away (3:35-3:58)

So the lesson I would carry beyond buildings is to rate as well as alarm. An exception is precise but narrow; a grade adds what it misses, how well the thing runs overall. Decide exceptions at the edge, derive the rating on read, give the operator both. Thank you. I am happy to take questions.
