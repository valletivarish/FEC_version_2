# Offshore Wind Farm Turbine Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Offshore turbines are reached by boat, the weather sets the schedule, and a technician visit can be weeks apart. In between, faults escalate — a bearing overheating, a gearbox losing lubrication pressure, a blade vibration growing worse — all invisible until the next inspection. Streaming raw data ashore is not the fix either: the link has limited, variable bandwidth, and a view that dies when connectivity dips fails during exactly the storms that stress turbines most. So the watching has to happen at sea.

## 2 · High-level description — Slide 2 (0:30–1:00)

Look at the diagram — six boxes. Five are the obvious cloud plumbing: SQS, a Lambda, DynamoDB, API Gateway, an S3 page. The one that isn't is the fog gateway, and that's where the work happens. Ten sensor streams across two turbines feed it; it windows and aggregates each one and runs four condition rules there, so a fault is flagged in the same window cycle it appears. Only compact summaries — up to ten a cycle — cross the sea link.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Here's the one thing to watch. Keep your eye on the stored-record count while I refresh: seventeen, then one thirty-two, then two hundred and four across successive polls — that number climbing is the whole system alive, data landing in real time. Everything behind it backs that up. Health shows four of four checks green within about a minute of start-up, and the freshest stored reading is around three seconds old. Both turbines report five metrics each with a cross-turbine power trend. And seventy-one automated tests pass across sensors, fog gateway, ingestion and dashboard.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The trap here was duplication. My dashboard is an Express app that already answers every route locally, and the easy shortcut for the cloud would have been a second set of routes just for the function — two copies of the same logic, quietly drifting apart over time. Instead I bridge each gateway event into the request and response objects Express expects, let the app handle it exactly like a local call, then translate the answer back. The business logic stays in one place, the bridge carries its own tests, and every reply — even the error replies — attaches the cross-origin header so the browser accepts responses from a different origin.
