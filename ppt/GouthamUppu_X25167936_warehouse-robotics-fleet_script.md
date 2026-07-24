# Warehouse Robotics Fleet Monitoring — demo script

Target 2:30–2:45. Hard limit 4:00. One-to-one with the lecturer; skip the title slide, start with the problem.

## 1 · Motivation — Slide 1 (0:00–0:30)

Ten robots ferry totes across two warehouse zones, and their condition changes faster than any inspection round. Fleet health is usually read off nominal schedules, yet a battery degrades quietly and shows up in continuous telemetry well before outright failure — a periodic manual check misses the trend entirely. That is fifty live signals: ten robots, two zones, five channels each, and no walk-round keeps up with fifty moving numbers.

## 2 · High-level description — Slide 2 (0:30–1:00)

The shape of it: ten robot containers on EC2 feed a fog gateway that windows and aggregates the readings and checks alert thresholds. Amazon SQS carries batches of up to ten aggregates; a Lambda writes each closed window into DynamoDB; and API Gateway with an S3 frontend serve the fleet dashboard. Only compact window aggregates cross to the cloud — raw samples never leave the edge.

## 3 · Demo highlights — Slide 3, then switch to the live dashboard (1:00–2:15)

Live now. First, health — gateway, queue, Lambda and pipeline all green, the freshest window seconds old. Second, the fleet — ten robots across two zones, five channels each, with the stored count climbing during the check. Third, robustness and repeatability — one hundred and sixteen automated tests pass, a two-thousand-message burst went through thirty-two workers, and one Terraform apply provisioned all twenty-four resources with nothing copied by hand.

## 4 · Hardest challenge — Slide 4 (2:15–2:45)

The hardest part was a bug only real AWS could expose. All three cloud-facing components always built static test credentials for the emulator, and the fog publisher always applied its endpoint override — even on real AWS. Every one of the hundred-and-sixteen tests passed and the full stack ran clean on the emulator, but on real AWS the Lambdas would override their execution-role credentials and be rejected, and the fog node would crash on a missing endpoint. The fix gates on the endpoint itself: present means emulator, absent means the real role. Deployed with that in place, every health check came up green on the first attempt.
