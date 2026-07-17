# Smart Building Energy Monitoring - 4-Minute Presentation Script

Total: ~500 spoken words - about 3 minutes 50 seconds at ~130 words per minute.

## Slide 1 (0:00-0:15)

Good morning, everyone. This is Smart Building Energy Monitoring, my project for Fog and Edge Computing. It watches an office building live - ten sensor streams, five types on each of two floors - and turns them into a per-floor energy scorecard.

## Slide 2 (0:15-0:55)

Why build this? Because the way buildings are usually checked doesn't work. A monthly bill is one number - it can't tell you which floor, which hour, or which system is wasting energy. The costly events are short-lived: a packed meeting room pushes CO2 past a thousand parts per million in minutes, and by the next walkthrough the evidence is gone. And a pipe leaking at twenty litres a minute can flow all weekend before anyone reads a meter. The numbers on the right are the actual thresholds my pipeline watches - continuously, not monthly.

## Slide 3 (0:55-1:50)

Here's how it works, left to right. Ten sensors sample every two to five seconds and send readings to a fog node at the edge. The fog node is the heart of the design: it buffers each stream into time windows, computes one aggregate per window, and raises alerts locally - so raw readings never flood the cloud. Each aggregate goes onto an Amazon SQS queue, an AWS Lambda function consumes it and writes it into DynamoDB, and a live dashboard served from S3 behind API Gateway reads it back. All of this runs end-to-end today on Docker with a local AWS emulator, and because it's built on the real AWS SDK throughout, it deploys to a real AWS account with a single scripted step.

## Slide 4 (1:50-2:35)

This is the dashboard, captured from the running system. Each floor gets a letter grade from A to F, computed from its energy and air-quality averages - both floors are grading A here - with the five raw readings and the energy trend underneath. Notice the top corner: all four pipeline health checks are green - gateway, queue, processor, pipeline. Behind this screen sit a hundred and twenty-nine automated tests, plus a load test that pushed two thousand messages through the queue in one burst and watched it drain completely.

## Slide 5 (2:35-3:40)

Now, the hardest part of the project. The fog node handles every incoming sensor batch on its own operating-system thread - that keeps ingest fast, but all those threads need to update the same in-memory window buffers, and two writing at once can corrupt or silently drop readings. What made this genuinely hard is that a race like this throws no error. In light testing everything looks perfect; it only goes wrong under concurrent load, and never the same way twice, so you can't reproduce it on demand. The fix is the diagram on the right: a single-writer design. Request threads never touch the buffers - they just drop each batch onto a thread-safe hand-off queue and return. One dedicated background thread pulls from that queue, and it is the only code that ever writes into the buffers. One door into shared state - the race is designed away, not patched with locks. And tests that boot the real server and hit it over actual HTTP prove it holds.

## Slide 6 (3:40-4:00)

So, three things this project shows. Think at the edge: aggregate and alert before the cloud. Stay serverless: SQS, Lambda and DynamoDB soak up bursts with nothing to manage. And prove it works: every claim here is backed by a test or a live check. Thank you - I'm happy to take questions.
