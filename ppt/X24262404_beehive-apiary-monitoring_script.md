# Beehive and Apiary Health Monitoring - 4-Minute Presentation Script

Total: ~515 spoken words | approximately 3 minutes 58 seconds at ~130 wpm

## Slide 1 - Cover (0:00-0:18)

Good morning. My project is a fog and edge computing pipeline for beehives. It watches two apiaries without ever opening a hive, and instead of streaming raw numbers, it hands the beekeeper a verdict on each colony. Let me show you why that framing matters.

## Slide 2 - A colony changes faster than the beekeeper visits (0:18-1:05)

A honeybee colony can slide into starvation, chilled brood, or the run-up to a swarm within a few days. Yet a hive is opened maybe once a fortnight, and opening it is itself disruptive - it chills the brood nest and provokes the bees. So there is a long blind gap, and the apiary is often out in a field, far from the keeper. This system fills that gap. Ten sensors across two apiaries stream weight, brood-nest temperature, humidity, acoustic buzz frequency, and entrance traffic, every one to three seconds. One signal is special: sound. A colony getting ready to swarm raises the pitch of its collective hum before its weight moves, so an acoustic rule gives the earliest, least invasive warning of all four.

## Slide 3 - How it works: hive to dashboard (1:05-1:55)

Here is the path, left to right. At the apiary, on the edge, ten sensors feed a fog node. Every ten seconds it closes a window, aggregates the readings, and runs the four colony rules right there on site - overheat, chilling, starvation, and that swarming precursor. Rather than forward every reading, it sends one summary per window, in batches, to Amazon SQS. An AWS Lambda function drains that queue into DynamoDB, and the live dashboard reads it back, served from S3 through API Gateway. It is verified end to end locally with Docker and an AWS emulator, and it went onto real AWS in a single infrastructure-as-code apply - twenty-four resources, no manual steps.

## Slide 4 - Demonstration highlights (1:55-2:40)

This is the live dashboard. Each apiary gets a colony-health card - a plain-language sentence, then its five current readings against their ranges. During this run both colonies ran hot: the banner names two brood-overheat alerts, and each narrative reads "weight rising, brood temperature has breached a safe threshold." All four pipeline checks are green - gateway, queue, Lambda, and the end-to-end pipeline - and a hundred and thirty-eight automated tests pass across the four modules.

## Slide 5 - The hardest part: a verdict, not a jittery number (2:40-3:40)

The hardest part was exactly that sentence. A beekeeper does not want five live graphs per hive; they want to know if the colony is thriving, stressed, or about to swarm. But a single ten-second window is noisy - bees are loud, entrance traffic spikes - so a naive per-reading rule cries wolf, and one reading cannot tell a real trend from a blip. The fix has two halves. First, every rule scores the window's mean or minimum, never a lone sample. Second, the verdict itself lives in the read tier, not the sensor: it pulls a short history of recent windows and reduces it to a weight trend and a brood-thermal state, then composes one sentence per apiary. The judgement sits where the history already is.

## Slide 6 - What to take away (3:40-3:58)

Three things. Decide at the edge - rules fire the moment a window closes. Ship summaries, not noise - one aggregate per window keeps the cloud path lean. And report a judgement, not a chart. Thank you - happy to take questions.
