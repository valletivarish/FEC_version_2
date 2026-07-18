# Solar Farm Monitoring - 4-Minute Presentation Script

Mahek Naaz - Student ID X24217808 - Fog and Edge Computing (H9FECC)

Total: ~535 spoken words | approximately 3 minutes 58 seconds at ~135 wpm

## Slide 1 - Cover (0:00-0:15)

Good morning. A solar array rarely breaks outright. It just quietly makes less power than it should, as panels run hot and dust builds up, and the loss is invisible until someone happens to check that array. My project turns that slow, silent decline into a live efficiency reading across two arrays.

## Slide 2 - The problem: periodic checks miss slow failures (0:15-1:02)

The failures that cost a solar farm are gradual, and a scheduled walk-through almost never times them right. Panels lose conversion efficiency as they heat: I model an array's thermal health falling from one hundred at forty-five degrees to zero at seventy-two, so heat erodes output long before anything visibly breaks. Dust is the same story: soiling drifts up slowly, and a cleaning crew sent on a fixed calendar is usually too early or too late. Ten sensor streams run across the two arrays, each sampling every couple of seconds, far too much to watch by hand. So the watching has to be continuous, and it has to turn raw readings into a judgement about efficiency, not just a wall of numbers.

## Slide 3 - How it works: edge first, cloud second (1:02-1:52)

Left to right: ten sensor processes stream irradiance, panel temperature, inverter output, DC voltage, and soiling across two arrays to a fog node on the site host. Every ten seconds it windows the readings, reduces each array-and-signal group to a summary, and raises threshold alerts for thermal derate risk, inverter underperformance, undervoltage, and cleaning required. Only the summary leaves the site, batched into Amazon SQS. One Lambda drains the queue into DynamoDB; a second serves the board from S3 through API Gateway. It went onto a real AWS account in one infrastructure-as-code step, twenty-four resources.

## Slide 4 - Demonstration highlights (1:52-2:35)

This is the live board from the running stack. The centre is a per-array efficiency heatmap that fuses inverter output and panel temperature into a single graded score per window, so a manager reads array health at a glance rather than reading five dials. Around it, per-array readings and the firing alerts. Four pipeline checks along the top, all green. Behind it, ninety-nine automated tests pass across the four modules, and a two-thousand-message burst through thirty-two parallel workers was absorbed in the load test.

## Slide 5 - The hardest part: a buffer that never sits still (2:35-3:35)

The hardest part was that the fog buffer is never idle. Every few seconds the node must take everything buffered so far and aggregate it, while ten sensors keep writing new readings into that same buffer. One buffer and one lock means aggregation blocks ingest: copy under the lock and every sensor stalls at every window; skip the lock and readings are lost or double-counted. My answer was double buffering. There are two buffers, one live and one flushing, and the lock is held only for an instant, just long enough to swap which is which. Aggregation then works on the swapped-out buffer while new readings flow straight into the fresh one. A concurrent-writer stress test confirmed it: nothing lost, nothing copied twice.

## Slide 6 - Takeaways (3:35-3:58)

Three things. Push the work to the edge, so a constant stream becomes one graded summary per window before anything leaves the site. Fuse signals into a decision, the efficiency score, rather than shipping raw dials. And swap buffers under a momentary lock instead of blocking ingest. Thank you, I am happy to take questions.
