# Retail Footfall and Inventory Monitoring - 4-Minute Presentation Script

Adithya Reddy Madireddy - Student ID X25120280 - Fog and Edge Computing (H9FECC)

Total: ~535 spoken words | approximately 3 minutes 58 seconds at ~135 wpm

## Slide 1 - Cover (0:00-0:15)

Good morning. A shop leaks money in two opposite directions at the same time, and my project watches both. A shelf that empties is a shortfall to top up; a warm chiller or a long checkout queue is a pressure to relieve. Two stores, five signals, one live answer for the floor.

## Slide 2 - Why periodic checking fails (0:15-1:02)

A manager can only walk the floor a few times an hour, and the losses gather in the gaps. A shelf that empties mid-morning sells nothing until someone notices. A case that drifts warm risks its stock before the next look. A queue builds in minutes and turns shoppers away. These are continuous quantities, and a walk-round samples them far too coarsely. But here is the twist that shapes the whole design: they do not fail in the same direction. Stock hurts when it falls, so it needs a floor. Temperature, queue, and footfall hurt when they rise, so they need ceilings. One rule shape would miss half the problem.

## Slide 3 - How it works (1:02-1:52)

So the reading happens at the edge, left to right. Ten sensor processes, five signals across two stores, post over HTTP to a fog gateway running in the store. Every ten seconds it closes a window, reduces each store-and-signal group to a summary, and evaluates four retail rules right there: a restock floor on shelf stock, and ceilings on refrigeration, queue length, and footfall. Energy draw is summarised but carries no rule at all, kept as context that explains the rest. Only the summary leaves the store, batched into Amazon SQS. One Lambda drains the queue into DynamoDB; a second serves the board from S3 through API Gateway. It went onto a real AWS account in one infrastructure-as-code step, twenty-four resources, no manual clicking.

## Slide 4 - Demonstration highlights (1:52-2:35)

This is the live board reading from the running stack. The top row folds both stores into the totals a manager actually acts on: floor-wide footfall, how many stores are understocked, the average queue, the total energy draw. Below it, a card per store with its five signals, and the banner naming any firing alert. Along the top, four pipeline checks, all green. Behind it, one hundred and twenty-two automated tests pass across the four modules, and a two-thousand-message burst through thirty-two parallel workers was absorbed without loss.

## Slide 5 - The hardest part: one buffer, many writers (2:35-3:35)

The hardest part never showed as a failure. Ten sensor posts arrive on separate web-server threads while a timer empties one shared window buffer every ten seconds. A reading landing at the exact instant of the flush can be dropped, and nothing throws; the timing hole is microseconds wide, so ordinary tests pass every time. Instead of wrapping the buffer in a lock, I gave it a single owner. Every other thread reaches it only by leaving a message in a mailbox, and the flush is itself a message in that same line. Because the flush can never run in the middle of a write, the lost-reading case is not guarded against, it is designed out.

## Slide 6 - What to take away (3:35-3:58)

Three things. Let each signal choose its own direction, so replenish and relieve stay distinct. Ship summaries, not raw noise, so the cloud path stays lean. And remove a race rather than lock around it. Thank you, I am happy to take questions.
