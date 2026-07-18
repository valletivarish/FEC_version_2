# Patient Vitals Remote Monitoring - 4-Minute Presentation Script

Total: 513 spoken words, approximately 3 minutes 57 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

Good morning. My project is Patient Vitals Remote Monitoring, for the Fog and Edge Computing module. The idea: take the numbers a nurse reads off a bedside monitor, heart rate, oxygen, temperature, blood pressure, and watch them continuously, with a fog node thinking beside the patient.

## Slide 2 (0:20-1:00)

Why build it? On a ward, vitals are checked in rounds. A manual observation is one snapshot, and between rounds nobody is watching the numbers. But deterioration is a trend: falling oxygen builds over minutes, and a single reading can still look normal. The key number is at the top right. Blood oxygen below ninety-two percent is the standard clinical trigger for a hypoxia alert. Catching that crossing takes data every few seconds, so this system samples every two to three seconds and checks every ten.

## Slide 3 (1:00-1:50)

Here is how it works, following the arrows. Ten simulated bedside sensors, five vitals for two patients, stream readings into a fog gateway. Every ten seconds the gateway closes a window, aggregates each vital, and checks the clinical alert rules at the edge, so alerts never wait for the cloud. One compact aggregate per vital goes to an Amazon SQS queue, in batches. An AWS Lambda function takes messages off the queue and stores them in DynamoDB, and the ward dashboard renders it live; on AWS it is served from S3 behind API Gateway. Today it all runs end to end on Docker, with LocalStack standing in for AWS, and one scripted step moves the same pipeline onto the real cloud.

## Slide 4 (1:50-2:30)

And it genuinely runs. This is the dashboard from the end-to-end run: two patients, each with a live heart-rate trace and four vitals as tiles. Look at patient one, oxygen at eighty-nine point seven, under the ninety-two threshold, so the hypoxia banner has fired. In the footer, every pipeline check is green: gateway online, queue reachable, Lambda deployed, forty-eight records archived. Behind it, forty-one automated tests across the four modules, all passing.

## Slide 5 (2:30-3:35)

The hardest part was a bug no local test could catch. The fog gateway's queue publisher shipped with the emulator's fake access keys hard-coded into every connection. Locally that is invisible, because the emulator accepts any credentials, so all forty-one tests and the full end-to-end check stayed green. On real AWS, every send would be rejected the moment we deployed. A deliberate cloud-readiness audit caught it, and surfaced two more silent assumptions: the record count read only the first page of the database scan, quietly undercounting as the table grows, and aggregates left the gateway one message at a time. The fix: fake keys are attached only when an emulator endpoint is configured, so on real AWS the toolkit falls back to its own identity chain. The count now follows every page, sends are batched ten to a call, and new regression tests lock all three fixes in.

## Slide 6 (3:35-4:00)

Three takeaways. Intelligence lives at the edge: alerts are decided at the bedside, and the cloud receives compact aggregates, not raw streams. The backbone is serverless, so it scales with nothing to manage. And it is verified, not assumed, down to the failures only the real cloud exposes. Thank you, happy to take questions.
