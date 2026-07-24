# Beehive & Apiary Health Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; open with the one-line intro below, then go straight to the problem (don't read the rest of the title slide).

## 1 · Motivation — Slide 1 (0:00–0:30)

I'm Yashaswini Penumarthi, and this is my Beehive & Apiary Health Monitoring. A honeybee colony can slide into starvation, chilled brood, or the run-up to a swarm within days, yet a hive is opened only every week or two — and opening it is itself disruptive: it chills the brood nest and provokes the bees, so inspection is deliberately rare, and the apiary is often far from the keeper. Ten sensor points across two apiaries stream weight, brood temperature, humidity, acoustic buzz and entrance traffic, and sound actually leads the other signals: a colony preparing to swarm raises the pitch of its hum before its weight moves.

## 2 · High-level description — Slide 2 (0:30–1:00)

The alert decision lives beside the hives, not in the cloud. A fog node gathers ten sensors across two apiaries, closes a window every ten seconds, aggregates, and scores four colony rules — including that acoustic swarming precursor — so a rule fires the moment a window closes, on site. Then the tail runs: Amazon SQS carries one summary per window in batches, a Lambda ingests each into a DynamoDB time-series store, and S3 with API Gateway serve the colony-health cards.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Watch the alert banner first — it's naming two brood-overheat conditions firing at once on live data, brood temperature breaching a safe threshold while the hive's weight is still rising. There's a subtler rule too: the acoustic one flags a rising hum above three hundred and fifty hertz, so sound can lead the other signals into a swarm warning. Below sits a colony-health card per apiary, each with a plain-language verdict — thriving, stressed or about to swarm — and its five readings against their ranges. Health is green across gateway, queue, Lambda and the pipeline, and one hundred and thirty-eight automated tests pass across every module.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The goal was a verdict, not a jittery number. A beekeeper does not want five live graphs per hive; the useful answer is whether a colony is thriving, stressed, or about to swarm. But a single ten-second window is noisy — bees are loud and entrance traffic spikes — so a naive per-reading rule cries wolf, and one reading cannot tell a rising trend from a blip. So the rules score the window mean or minimum, never a single sample; then the read tier reads a short history of recent windows and reduces it to a weight trend and a brood-thermal state, composed into one sentence per apiary. The judgement lives in the read tier, where that history is already at hand, so the dashboard says weight rising, brood temperature has breached a safe threshold, rather than a number to interpret.
