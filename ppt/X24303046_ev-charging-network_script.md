# EV Charging Network Monitoring - 4-Minute Presentation Script

Total: 514 spoken words, about 3 minutes 57 seconds at ~130 words per minute.

## Slide 1 (0:00-0:20)

The whole design of this project rests on one decision: where the thinking happens. I'm Nemi Ishwarlal Vikani, and my Fog and Edge Computing project monitors an electric-vehicle charging network. The answer it argues for is simple: decide at the edge, scale in the cloud, and prove it on a real deployment, not just a description of one.

## Slide 2 (0:20-1:00)

So why can't a periodic check do the job? Because a charging hub moves in seconds. Ten sensors across two hubs sample charging current, battery charge, station temperature, grid load and session time every two to five seconds. The four rules on this slide are the fog node's live thresholds: average current past thirty-two amps is an overcurrent, a cabinet past forty-five degrees is an overheat risk, grid draw past eighty kilowatts is grid strain, and a session past a hundred and eighty minutes is stalled. A manual round, or even an hourly poll, is blind for the whole gap between checks, so the decision has to sit next to the hardware.

## Slide 3 (1:00-1:45)

Here is how that decision is split. At the edge, ten sensors feed a fog node that windows each sensor, computes one aggregate per window, and checks those rules on the spot, so only compact summaries ever leave the hub. In the cloud, the path is serverless end to end: Amazon SQS carries each summary, an AWS Lambda ingests it, DynamoDB is the durable store, and a static S3 site behind API Gateway serves the dashboard. And this is not an emulator, it is deployed live on a real AWS account through a single infrastructure-as-code apply.

## Slide 4 (1:45-2:25)

This is the deployed dashboard, served from S3 and calling the API through the gateway. All four pipeline health checks are green on the live account, with the freshest reading a few seconds old. A hundred and twenty-one automated tests stand behind it. During verification the stored record count climbed from twenty-six to two hundred and eighty-nine, so this is genuinely live data. And two safety alerts are firing on hub one right now: an overheat risk and a grid-strain alert, both raised at the fog node.

## Slide 5 (2:25-3:35)

Now the hardest part, an architecture problem rather than a bug. The dashboard is a Flask application, but API Gateway does not send an HTTP request; it invokes a Lambda with a proxy event, so the same code had to answer in two worlds. Re-declaring the routes for the cloud would drift from the local server, and an adapter is one more dependency. My fix is a small hand-rolled bridge that turns the proxy event into the standard Python web-server interface and runs the existing Flask app unchanged, with a cross-origin header on every response. The usual traps were all checked before deployment and were already correct: a paginated count, unbatched publishing, and a shadowed credential.

## Slide 6 (3:35-4:00)

Three points to take away. Decide at the edge: one windowed summary and an instant alert, right next to the hardware. Let the cloud absorb the load, because a managed queue and serverless functions scale per request and cost nothing while idle. And trust is tested, not assumed: a hundred and twenty-one tests and a live end-to-end run on real AWS stand behind every number here. Thank you, I am happy to take questions.
