# EV Charging Network Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Conditions at a charging hub move in seconds. Ten sensors across two hubs sample current, battery charge, temperature, grid load and session time every two to five seconds, and a manual round or an hourly poll leaves an overloaded or overheating bay unnoticed for the whole gap between checks. Streaming every raw reading to the cloud is the wasteful alternative — the decision has to happen close to the hardware.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors across two hubs, five metrics each, feed a fog node that windows, aggregates and applies four alert rules. Raw readings stay at the edge; the node sends one aggregate per sensor per window to Amazon SQS. A Lambda ingests each summary into DynamoDB, and API Gateway with an S3 static site serve the dashboard — deployed live on a real AWS account through one infrastructure-as-code apply, not only an emulator.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — four of four checks green on the live account, the freshest reading a few seconds old. Second, the hubs — stored records climbed from twenty-six to two hundred and eighty-nine across the verification window, confirming genuinely live data, with two safety alerts firing on hub one: overheat risk and grid strain, both raised at the fog node. Third, confidence — one hundred and twenty-one automated tests pass across every module.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was one Flask app with two front doors. The dashboard is a Flask application, but API Gateway invokes a Lambda with a proxy event, not an HTTP request — so the same code had to answer in both worlds. Re-declaring every route for Lambda would drift from the local server over time, and a third-party adapter would add a dependency to maintain. The fix is a small hand-rolled bridge that turns the proxy event into a standard Python web-server environment and invokes the existing Flask app unchanged, with a cross-origin header on every response. And a pre-deployment audit confirmed the recurring pitfalls — paginated counting, batched publishing, credentials — were already correct, so nothing else needed fixing there.
