# Industrial Equipment Predictive Monitoring - 4-Minute Presentation Script

Vikas Reddy Amanagantti - Student ID X25178849 - Fog and Edge Computing (H9FECC)

Total: ~535 spoken words | approximately 3 minutes 58 seconds at ~135 wpm

## Slide 1 - Cover (0:00-0:15)

Good morning. A production machine almost never fails without warning. It first runs a little rougher, a little hotter, a little louder, drifts off its rated speed, or draws a little more current than the work needs. My project reads those early signs across two production lines and names a fault while it is still just a warning.

## Slide 2 - Why periodic checks miss the failure (0:15-1:02)

The cost on a plant floor is unplanned downtime, and a walk-round inspection is the wrong tool for catching it. It reads each gauge once and the fault keeps developing in the minutes until the next round. Worse, machine failure rarely shows on one dial: it builds across heat, vibration, bearing noise, speed, and power draw at the same time, and no single gauge reads all five together. Two lines run in parallel, and line one running cool tells you nothing about line two. So I watch all five signals continuously, on both lines, and let a rule decide when a reading has crossed from normal into a fault.

## Slide 3 - How it works (1:02-1:52)

Here is the path, left to right. Ten sensor processes, five signals across two lines, post over HTTP to a fog node on the plant-floor host. Every ten seconds it closes a window, reduces each machine-and-signal group to a summary, and runs the alarm rules right there. Four signals worsen only as they climb, so each has one ceiling; rotation speed is the exception and carries two limits, a floor and a ceiling, because a healthy machine has to stay inside a speed band, not just below a top. Only the summary and any alarm leave the floor, batched into Amazon SQS. One Lambda drains the queue into DynamoDB; a second serves the board from S3 through API Gateway. It went onto a real AWS account in one infrastructure-as-code step, twenty-four resources.

## Slide 4 - Demonstration highlights (1:52-2:35)

This is the live board reading from the running stack. Each line is a column of its five signals, every signal showing its current value against its alarm limit, a short history, and a trend. The banner names any firing fault by line, and the health strip along the top shows four pipeline checks, all green. Behind it, ninety-four automated tests pass across the four modules, and a two-thousand-message burst through thirty-two parallel workers was absorbed without loss.

## Slide 5 - The hardest part: sealing a window under concurrent writes (2:35-3:35)

The hardest part was the window boundary. Sensor posts arrive on several server threads at once, while a timer has to seal the ten-second window on its own thread, and both touch the same buffer. Hold a lock across the whole window close and every arriving reading stalls behind the summary work. Drop the lock and a reading landing on the boundary is lost or counted twice. The answer was to take the lock for one job only: swap the filled buffer aside, install an empty one, release. All the aggregation and the alarm checks then run on the swapped-out copy, outside the lock. The ingest path never waits on a slow close, and every reading still lands in exactly one window.

## Slide 6 - Takeaways (3:35-3:58)

Three things. Decide at the edge, so a fault is named in the window it appears. Match the rule to the physics: a signal that can fail at both ends needs two limits, not one. And hold a lock only for the swap, never for the work. Thank you, I am happy to take questions.
