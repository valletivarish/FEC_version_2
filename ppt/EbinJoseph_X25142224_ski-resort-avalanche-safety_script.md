# Ski Resort Avalanche Safety — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Ebin Joseph, and this is my Ski Resort Avalanche Safety. Avalanche danger does not wait for the next patrol round: it develops, peaks and passes in the gaps between them. A seismic spike ahead of a slab release lasts only minutes and can pass entirely between two rounds, which are far sparser, while wind loading and a warming snowpack build danger silently in those gaps. So ten live sensors, five signal types on each of two slopes, never stop sampling, and a fog node on the mountain checks every window at the edge.

## 2 · High-level description — Slide 2 (0:30–1:00)

Six pieces carry it: ten sensors on two slopes, a fog node on the mountain, Amazon SQS, a Lambda, DynamoDB, and a static S3 page reached through API Gateway. The fog node is the load-bearing choice — it buffers raw readings, closes a window on a timer, aggregates them and checks four alert rules, so only one compact summary per window travels onward. Raw readings never leave the mountain.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

This is running on a real AWS account. Across the top, the health strip reads four of four true — gateway, queue, Lambda and pipeline all green. Drop into the middle and you're on slope-a: the risk gauge is sitting at HIGH, and with wind gusting to a hundred and eleven point eight kilometres an hour, the lift-wind-halt banner has tripped. Down in the store, records climb from zero to five hundred and sixty-nine in about ninety seconds, the pipeline keeping pace. Behind all of it, one hundred and twenty-one automated tests pass across every module.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Some of my routes carry a variable inside them, and that broke the easy approach. A slope identifier or a sensor type lives right in the URL, so plain exact-string matching isn't enough — the cloud function had to recognise a whole family of paths, pull the variable out, still serve the fixed routes, and behave exactly like the local server. So it uses a pattern-matcher dispatch: each route is a pattern that pins the literal segments and captures the variable ones, matched in order against the incoming path. The same patterns drive the local server and the function, so a parameterised request resolves identically in both, and every reply carries the cross-origin header the browser needs.
