# Cold Chain Logistics Monitoring - 4-Minute Presentation Script

Srinidhi Vutkoori - Student ID X25173243 - Fog and Edge Computing (H9FECC)

Total: ~534 spoken words | approximately 3 minutes 57 seconds at ~135 wpm

## Slide 1 - Cover (0:00-0:15)

Good afternoon. Picture a refrigerated container of vaccines or fresh seafood. The cargo inside is worth more than the truck carrying it, and it keeps that worth only while it stays inside a tight envelope. Let the average temperature drift above minus fifteen for a few minutes and the whole load is scrap. My project watches that envelope, live, for two containers at once.

## Slide 2 - Why periodic checking fails (0:15-1:00)

Damage in a cold chain builds in seconds, not hours. And it is not one number to watch but five at once on every container: storage temperature, humidity, door-open time, handling shock, and carbon dioxide. A person with a clipboard cannot keep up, and by the time a periodic check finds a breach, the load is already gone. So this system never stops watching: sensors sample every few seconds, and every container is re-scored every ten seconds.

## Slide 3 - How it works: sensors to live manifest (1:00-1:52)

Here is the path, from the container outward. Ten simulated sensors, five reading types across two containers, post to a fog node, the depot relay, on the edge host. Every ten seconds the relay closes a window, reduces each reading type to a summary, and screens that summary against the cargo's limits on the spot, so a breach is caught beside the container, not after a trip to the cloud. Only the summaries leave, batched to Amazon SQS. A Lambda function drains the queue into DynamoDB, and a second function serves the board from S3 through API Gateway. The whole cloud side goes up on a real AWS account in one scripted step.

## Slide 4 - Demonstration highlights (1:52-2:35)

This is the live board, reading from the running stack. Each container shows its five signals and a status, the header counts open exceptions, and here container-2 is flagged: its temperature and its door-open time are both over the line. The storage-temperature trend is drawn per container, and the strip along the bottom shows the pipeline healthy, relay online, queue reachable, Lambda deployed, records climbing. Behind it, seventy-six tests pass, and a two-thousand-message burst through thirty-two workers went through untouched.

## Slide 5 - The hardest part: the runtime is not the laptop (2:35-3:35)

The hardest part cost me nothing in testing and everything on deployment. The dashboard is a FastAPI app, and it refused to even start on Lambda, twice over. First, one of its dependencies has a compiled part, and I had packaged the copy built on my Mac, which the Lambda Linux machine cannot load. Second, the app mounts a folder of web assets as it starts, but that folder ships to S3, not into the function, so the import failed looking for a directory that was never there. Here is the catch: both passed all seventy-six local tests, because a test runs the code on the same machine that built it. They only broke on the real runtime. I rebuilt the package for Linux and made the mount optional, and the board came up healthy on the first live poll.

## Slide 6 - Takeaways (3:35-3:52)

Three things to take away. Decide at the edge: a breach is flagged within one ten-second window, with no cloud round-trip in the way. Serverless scales by configuration, not by rewriting. And green tests are not proof of a deployment; the two faults that mattered only ever showed on the real platform. Thank you. I am happy to take questions.
