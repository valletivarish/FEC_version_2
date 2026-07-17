# Elevator and Escalator Fleet Monitoring - 4-Minute Presentation Script

Total: 508 spoken words, roughly 3 minutes 55 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning. My project is a fog and edge monitoring pipeline for a fleet of elevators and escalators. Picture two office towers full of lifts that people step into without a second thought. This system watches ten live sensor streams across those towers and raises a safety alert the moment something starts to drift.

## Slide 2 (0:20-1:00)

So why build this? Because periodic checking simply cannot keep up. Each tower reports five metrics, motor temperature, door cycles, cab vibration, load weight and travel speed, and some sensors sample every single second. The four rules on the right are the ones that matter: a motor averaging above eighty-five degrees, vibration above six millimetres, a load over a tonne, or a cab crawling below half a metre per second. A clipboard round captures one moment in time. By the time an engineer is standing in front of the unit, the fault has already grown.

## Slide 3 (1:00-1:50)

Here is how it works, left to right. Ten sensor units post readings to a fog node at the edge of the building. The fog node groups them into short time windows, aggregates each window into a summary, and evaluates the safety rules right there, so alerts are decided next to the machines. Only one compact message per window travels on, into an Amazon SQS queue. An AWS Lambda function consumes the queue and stores each record in DynamoDB, and a live dashboard, served from S3 through API Gateway, shows the whole fleet. The pipeline runs end to end today on Docker with an AWS emulator, and because it is built on the real AWS SDK, moving it to actual AWS is a single scripted step.

## Slide 4 (1:50-2:30)

This is the dashboard during a live run, real data, not a mock-up. In the header you can see all four pipeline health checks green: gateway, queue, Lambda, and end-to-end freshness. Behind it sit one hundred and seventeen automated tests across the sensor, fog, ingest and dashboard modules. And to prove it scales, I fired a burst of two thousand messages from thirty-two parallel senders at the queue, and the pipeline kept draining without stalling. When a rule trips, an alert chip lights up on that tower's card immediately.

## Slide 5 (2:30-3:35)

Now, the hardest part of the whole project. The fog node sends its window summaries to the queue through a Node stream pipeline, and here is the catch. A stream happily accepts a write, but it never tells you whether that particular message actually reached the queue. There is no built-in signal that says message forty-two was delivered. Worse, streams treat an error as fatal for the whole pipe, so one failed send would not just lose that message, it could tear the pipeline down and break every window after it. The fix is the diagram at the bottom. Before a message enters the stream it gets a small ticket number, and the publisher holds a pending promise for each ticket. When the queue sink finishes a send, it settles exactly that one ticket, success or failure. A bad send rejects one caller, and everything else keeps flowing. And that is not hopeful thinking: the unit tests deliberately fail one send and prove its neighbours are untouched.

## Slide 6 (3:35-4:00)

Three things to take away. Decisions happen at the edge, so raw readings never leave the building. Everything is tested, one hundred and seventeen tests plus a scripted end-to-end check and a burst load test. And it is cloud-ready, the same code deploys to real AWS in one scripted step. Thank you, I am happy to take questions.
