# Wildfire Forest Monitoring - 4-Minute Presentation Script

Total: 511 spoken words - approximately 3 minutes 56 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning, everyone. I'm Deekonda Rakshan, student ID X25180754, MSc in Cloud Computing at National College of Ireland. For Fog and Edge Computing, I built a wildfire forest monitoring pipeline — and these five arrows are the whole story: sense, aggregate, queue, store, visualise.

## Slide 2 (0:20-1:00)

This needs edge computing because wildfire risk moves faster than any inspection schedule. Ranger stations sit deep in remote forest, so patrols and hourly readouts leave long blind windows. Fire weather compounds quietly — heat, smoke, wind and drying soil each look tolerable alone; the danger is the combination. On the right: smoke is sampled every second, ten sensor feeds stream at once, and conditions can cross the forty-two-degree hard-alarm line between two routine checks. Detection has to live next to the sensors.

## Slide 3 (1:00-1:50)

Here's the pipeline in six steps. Ten containerised sensors across the two stations stream temperature, humidity, smoke, wind and soil moisture. They feed a fog node — an edge gateway that buffers readings, aggregates them into time windows, and raises fire alerts right at the edge. Each window's aggregates go to Amazon SQS in batched sends; an AWS Lambda function consumes the queue and writes every record into DynamoDB. Finally a live dashboard, hosted on S3 behind API Gateway, turns the data into a zero-to-four fire-risk dial per station. It all runs locally under Docker with an AWS emulator, and one scripted Terraform step deploys the same pipeline to AWS.

## Slide 4 (1:50-2:30)

Here it is running. This is the real dashboard, captured from the local end-to-end run. Each station gets a fire-risk dial — both reading safe, zero out of four — with the five raw readings underneath, and below that the smoke-density trend comparing both stations. Three highlights: ninety-five automated tests pass across all four modules; a scripted end-to-end check turns every pipeline health check green; and a burst of two thousand messages from thirty-two parallel senders was absorbed without the consumer stalling.

## Slide 5 (2:30-3:40)

Now, the hardest part — a bug invisible to every test I had. Locally the pipeline talks to an emulator, signing its queue and database calls with dummy credentials. My code chose the dummy set by checking whether an AWS access-key variable existed. Here's the trap: real AWS injects that exact variable into every function it runs. In production my code would build incomplete credentials, and every call to the queue or database would be rejected. That's what made it hard — all ninety-five tests stayed green, the emulator accepted the dummy keys, and the failure could only surface on the first real deployment. The fix flips the question: instead of "is there an access key", the code asks "is there an emulator endpoint address" — a signal that only exists locally. On real AWS it's absent, so the platform's own credentials take over automatically, and new tests now pin that behaviour down.

## Slide 6 (3:40-4:00)

Three takeaways. Decisions happen at the edge, so fire warnings never wait on the cloud. The cloud tier is fully serverless, and proven under a two-thousand-message burst. And the whole pipeline deploys to AWS in a single scripted Terraform step. Thank you — I'm happy to take questions.
