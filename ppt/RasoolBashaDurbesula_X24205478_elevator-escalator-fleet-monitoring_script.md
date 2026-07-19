# Elevator and Escalator Fleet Monitoring - 4-Minute Presentation Script

Rasool Basha Durbesula - Student ID X24205478 - Fog and Edge Computing (H9FECC)

Total: ~540 spoken words | approximately 3 minutes 58 seconds at ~135 wpm

## Slide 1 - Cover (0:00-0:15)

Good morning. Picture two failures in a lift. One takes weeks: a motor that runs a degree hotter each day until it seizes. The other takes ten seconds: a car loaded past its limit for a single trip. They sit at opposite ends of time, and my project catches both from the same handful of numbers.

## Slide 2 - Two ways a lift fails (0:15-1:05)

An engineer walks the machines a few times a week, and both of those failures hide in the gaps. The slow drift stays invisible until it is severe; the single overload is over before anyone arrives. So the monitor watches continuously instead: two towers, five signals each, ten live streams for motor temperature, door cycles, cab vibration, load, and speed. Every window, four rules run. But here is the idea the whole design turns on: those rules do not all read the same number. Overheating, a rough ride, and a stall are slow trends, so they are judged on the window's average. An overload is a single instant, so it is judged on the window's peak. Door cycles only count service, and raise no alarm.

## Slide 3 - From sensor to screen (1:05-1:50)

The reading happens at the edge. Ten sensor processes post over HTTP to a fog node running beside the machines. Every ten seconds it closes a window, reduces each tower-and-signal stream to five numbers, and applies those four rules right there. Only that summary leaves the building, batched onto Amazon SQS. One Lambda drains the queue into DynamoDB; a second serves the board from S3 through API Gateway. The cloud side went onto a real AWS account in one infrastructure-as-code step: twenty-four resources, no manual clicking.

## Slide 4 - Live demonstration (1:50-2:35)

This is the live board reading from the running stack. Two towers, five signals each. On the right, one tower has gone red: its cab vibration crossed the average limit and its load crossed the peak limit in the same window, so a ride-quality fault and an overload warning fire together, and the banner names them both. Along the top, four pipeline checks, all green. Behind the screen, one hundred and twenty-two automated tests pass across the four modules, and a two-thousand-message burst from thirty-two parallel senders was absorbed and drained.

## Slide 5 - The subtle part: peak or trend (2:35-3:35)

The decision that mattered most was choosing which number each rule reads. It would have been easy to average everything. But average the overload and it disappears: one heavy trip among nine ordinary ones sits below the limit while the car is genuinely overloaded. So the overload rule reads the window's maximum, not its mean, and only that rule does. There is a quieter half to this. The averages and peaks are only honest if the sampler keeps time, so each sensor schedules its next reading against a fixed clock rather than sleeping a fixed gap, and drift never builds up. A unit test locks it in: it fires the overload on a peak that the average leaves below the limit.

## Slide 6 - What to take away (3:35-3:58)

So the lesson I would carry beyond lifts is a small one: reduce the stream to a summary, then read the number the fault actually lives in. An average finds the slow slide; a peak finds the single bad instant; one summary serves both, decided at the edge and deployed to real cloud in a single step. Thank you. I am happy to take questions.
