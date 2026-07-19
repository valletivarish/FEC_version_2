# Public Transit Fleet Monitoring - 4-Minute Presentation Script

Sumalatha Kambhampati - Student ID X25156420 - Fog and Edge Computing (H9FECC)

Total: ~545 spoken words | approximately 3 minutes 58 seconds at ~135 wpm

## Slide 1 - Cover (0:00-0:15)

Good morning. A bus depot's edge gateway is one of the busiest places in this system: ten sensor streams from two depots, all posting at once. My project is about how that gateway holds every reading without either losing one or making the senders queue behind a lock. The answer is to buffer first and group later.

## Slide 2 - Two depots, ten streams, one busy gateway (0:15-1:05)

A bus changes state on the road, but a depot only sees it parked, and some faults will not wait for the evening walk-around. So the monitor watches five signals across two depots, ten live streams: engine temperature, brake-pad wear, passenger count, fuel level, and speed. Every window, four hard rules run on the summaries: an engine running hot on average, brake pads worn past eighty per cent, a tank below fifteen, and a peak passenger count over seventy-five, which reads the window's maximum because one overcrowded moment is a safety fact an average would hide. Speed is kept only as context.

## Slide 3 - From sensor to serverless cloud (1:05-1:50)

The reading happens at the edge. Ten sensor processes post over HTTP to a fog node at the depot. Every ten seconds it closes a window, reduces each depot-and-signal stream to five numbers, and raises those alarms right there, so a fault is named in the window it appears. Only the summary leaves the depot, batched onto Amazon SQS. One Lambda drains the queue into DynamoDB; a second serves the dashboard from S3 through API Gateway. The cloud side went onto a real AWS account in one infrastructure-as-code step, twenty-four resources, no manual clicking.

## Slide 4 - Live demonstration (1:50-2:30)

This is the live dashboard, a roster of native-meter cards per depot. Both depots are streaming all five signals, and depot-a is flagged red: its engine temperature has climbed past the limit, firing an engine-overheat alarm on the card and in the banner, while depot-b stays clear. Along the top, four pipeline checks, all green. Behind the screen, one hundred and thirty-nine automated tests pass, and a two-thousand-message burst from thirty-two parallel senders was absorbed and drained.

## Slide 5 - The hardest part: buffer first, group later (2:30-3:35)

Here is the part that took the most thought. Those ten streams arrive on many worker threads at once, and each reading has to be held until the window drains. A reading lost to a race does not crash anything; it just makes the fleet averages silently wrong, the worst kind of bug. The obvious fix, a lock around a shared buffer, trades the race for a queue of senders waiting their turn. So I did the opposite: each arriving reading is a single lock-free enqueue onto a concurrent queue, and nothing is grouped on arrival. All the grouping by depot and signal is deferred to one thread that drains the whole queue once per window. Ingest stays contention-free, and the grouping work is not avoided, only moved off the hot path. A stress test proves it: thirty-two threads write two hundred readings each, and after the drain all six thousand four hundred are there, none lost.

## Slide 6 - What to take away (3:35-3:58)

So the lesson I would carry beyond buses is about where to pay for structure. When a gateway is busy and concurrent, buffer first with a cheap lock-free write, and group later, once, on the thread that is about to use the result. Decide the faults at the edge, and deploy to real cloud in one step. Thank you. I am happy to take questions.
