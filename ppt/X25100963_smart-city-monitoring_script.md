# Smart City Operations Monitoring - 4-Minute Presentation Script

Mohammed Hassan Ahmed - Student ID X25100963 - Fog and Edge Computing (H9FECC)

Total: ~535 spoken words | approximately 3 minutes 58 seconds at ~135 wpm

## Slide 1 - Cover (0:00-0:16)

Good morning. My project watches a city district the way an operations desk would want to be watched. Five very different signals, traffic, air quality, noise, parking, and light, across two zones, and instead of five raw feeds it hands the operator one live answer: is any zone in trouble right now, and on which signal.

## Slide 2 - Why occasional checking fails (0:16-1:02)

The numbers that matter in a city move within minutes. Congestion builds, a pollution spike rises and fades, a car park fills, all between any two manual checks, and the breach that counts usually happens after the clipboard has left. So we measure continuously. But these signals do not even agree with each other: traffic in the hundreds a minute, light across tens of thousands of lux, noise in the decibels. And streaming every raw reading to a distant cloud is the other extreme, heavy and costly at city scale. What a city needs is continuous local watching, with only compact summaries and alerts ever leaving the street.

## Slide 3 - How it works: edge to cloud (1:02-1:52)

Here is the path, left to right. On the city edge, ten sensor containers, five signals across two zones, feed a fog gateway on the edge host. Every ten seconds it closes a window, reduces each zone-and-signal group to a summary, and evaluates the five civic rules right there beside the sensors: congestion, air quality, noise, parking, and low visibility. Only the summary leaves the edge, batched into one send to Amazon SQS. An AWS Lambda function drains the queue into DynamoDB, and a second, separate function serves the operations board from S3 through API Gateway. It went onto a real AWS account in one infrastructure-as-code step, twenty-four resources, no manual clicking.

## Slide 4 - Demonstration highlights (1:52-2:35)

This is the live board, reading from the running stack. Each zone is a card of its five signals with the current value, the recent range, and how fresh it is, and the header tells the operator how many zones are reporting and how many incidents are active. Along the bottom, four pipeline checks, all green. Behind it, sixty-two automated tests pass across the four modules, and a two-thousand-message burst through thirty-two parallel workers was absorbed without loss.

## Slide 5 - The hardest part: a silent race (2:35-3:35)

The hardest part never showed up as a failure. Every ten seconds the gateway hands its window buffer over to be flushed, while readings are arriving on several threads at once. So what happens to a reading that lands at the exact instant the buffer is swapped out? It can be written into the buffer that has just been retired, after the flush has already read it, and it vanishes. Nothing throws, nothing logs; one number is just missing, and the timing hole is microseconds wide, so every ordinary test passed. The fix was to make each buffer a fenced generation. The flush closes the fence, waits for any writer already inside to finish, and only then reads. A writer arriving after the fence retries into the fresh buffer instead, so every reading now lands in exactly one window.

## Slide 6 - Three things to take away (3:35-3:58)

Three things. Decide at the edge: the rules fire the moment a window closes. Ship summaries, not noise, so the cloud path stays lean whatever the sampling rate. And prove correctness rather than assume it, right down to a fence for the bug that never showed itself. Thank you, I am happy to take questions.
