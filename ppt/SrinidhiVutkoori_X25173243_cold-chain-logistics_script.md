# Cold Chain Logistics Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

A refrigerated container whose window-average temperature drifts above minus fifteen degrees is already breaching the cold chain. Every container carries five independent risk signals at once — storage temperature, humidity, door-open time, shock and CO2 — far more than a clipboard round can track, and a manual check discovers the breach only after the damage is done, with nothing connecting the door left open to the load that spoiled. So I re-score every container every ten seconds, continuously.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten container sensors feed a depot relay. Every ten seconds it aggregates each reading type and flags exceptions right there. Only one aggregate per window goes to Amazon SQS, batched ten to a call; a Lambda function reshapes each record into DynamoDB; and API Gateway with S3 serve the live manifest. Exceptions are decided at the edge — there is no cloud round-trip in the alert path.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — depot relay online, queue reachable, Lambda deployed and records archiving and climbing. Second, the manifest — a per-container board with storage-temperature trends, and any container whose window-average rises above minus fifteen flagged within ten seconds. Third, confidence — seventy-six automated tests run with pytest across ten modules, and a two-thousand-message burst was absorbed, batched ten per queue call, with the live board untouched.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part taught me the runtime is not the laptop. The FastAPI dashboard would not even start on Lambda, for two reasons at once. A dependency with a compiled native part had been packaged as the copy built on my Mac, which the Linux runtime cannot import; and a static-asset folder was mounted at import time even though that folder ships to S3, not into the function. Both are import-time failures, and both passed all seventy-six local tests, because a test imports the code on the same machine that built it. The fix builds the package against the Linux runtime's own platform and makes the static mount tolerant of an absent folder. The dashboard answered on the first live poll.
