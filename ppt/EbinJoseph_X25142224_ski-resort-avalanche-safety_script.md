# Ski Resort Avalanche Safety — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Avalanche danger does not wait for the next patrol round: it develops, peaks and passes in the gaps between them. A seismic spike ahead of a slab release lasts only minutes and can pass entirely between two rounds, which are far sparser, while wind loading and a warming snowpack build danger silently in those gaps. So ten live sensors, five signal types on each of two slopes, never stop sampling, and a fog node on the mountain checks every window at the edge.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten sensors on two slopes feed a fog node that buffers raw readings, closes a window on a timer, aggregates them, and checks four alert rules. Amazon SQS receives one compact summary per closed window; a Lambda wakes only when messages arrive and writes each aggregate to DynamoDB, one queryable record per slope per window; and a static S3 page polls a Lambda through API Gateway. Raw readings never leave the mountain.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live on a real AWS account. First, health — four of four checks reporting true: gateway, queue, Lambda and pipeline. Second, the slope — the slope-a risk gauge live at HIGH, with wind at a hundred and eleven point eight kilometres an hour tripping the lift-wind-halt banner, and the store climbing zero to five hundred and sixty-nine records in about ninety seconds. Third, confidence — one hundred and twenty-one automated tests pass across every module.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

Some of my routes carry a variable inside them, and that broke the easy approach. A slope identifier or a sensor type lives right in the URL, so plain exact-string matching isn't enough — the cloud function had to recognise a whole family of paths, pull the variable out, still serve the fixed routes, and behave exactly like the local server. So it uses a pattern-matcher dispatch: each route is a pattern that pins the literal segments and captures the variable ones, matched in order against the incoming path. The same patterns drive the local server and the function, so a parameterised request resolves identically in both, and every reply carries the cross-origin header the browser needs.
