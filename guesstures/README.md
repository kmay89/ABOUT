# 🤸 The Charades Clock

**Four cards, thirty seconds, no talking — and whatever you don't finish is
gone.** Two teams, one phone.

Your team draws four cards worth one, two and three points. Mime them in order;
every card they get is yours. When the clock runs out, everything still in your
hand is **lost** — not scored, not returned to the deck, gone.

No accounts, nothing tracked, works offline, nothing to join. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## The rule most versions drop

Losing the cards you did not finish. It is the rule that makes the clock hurt,
and it is quietly removed all the time because losing things feels bad. It
feels bad, and it is the game: it turns every turn into the same real decision.
Rush the three-pointer while everybody is fresh, or clear the easy ones and
hope there is time? Both are wrong sometimes.

Which is why **the rest of the hand is on screen** — you can see the pointer
values still to come. Knowing a three is queued behind this one is what makes
*give up on this one* a decision rather than an admission.

The hand is dealt one card from each level plus a spare rather than four at
random, so it is always that decision and never four impossible ones.

## Why this clock is enormous and the one next door is hidden

The describing room on this site hides its timer, because there the tension is
**not knowing** when the buzzer comes. Here it is the biggest thing on the
screen, because the tension is **watching it go** while somebody in your team
keeps shouting "kettle?" at something that is plainly not a kettle.

Same component, opposite decision, same reason in both: whichever one makes the
room louder. As next door, the deadline is a wall-clock timestamp rather than a
countdown, so a phone that gets pocketed mid-turn still runs out on time.

## The list

`words.js` is shared byte-identical with the describing game and holds two
separate lists, because the two games want genuinely different words — *
threading a needle* is a joy to mime and takes four words to describe, at which
point you have said it. Everything in the acting list is something a body can
do standing up, in a room, in under thirty seconds, with no props.

`tools/room-parity.js` checks the two copies have not drifted.

## What's here

```
words.js    the two lists (shared, byte-identical with catchphrase/)
rules.js    the hand, the scoring, and the losing — pure, and clockless
app.js      the conductor, and the only thing here that knows what time it is
```
