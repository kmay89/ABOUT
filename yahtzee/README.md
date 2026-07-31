# 🎲 The Sheet

**Yahtzee, with the arithmetic already done.** Five dice, three rolls,
thirteen boxes — and once you have rolled, every box you have not used yet
shows the number it would score with the dice on the table.

One to six players. No accounts, nothing tracked, works offline. Up to six
phones join by typing four letters. Part of [The Games Room](../games/). No
libraries, no build step, MIT.

## The three rules most versions get wrong

**Three of a kind scores all five dice.** So does four of a kind. Score the
triple alone and the whole game changes — 6-6-6-5-5 becomes eighteen instead
of twenty-eight, and suddenly the pair you are holding is worthless. It is the
single commonest bug in a Yahtzee implementation.

**A box, once written in, is written in — including a nought.** Having to
choose which box to throw away is most of the skill. An interface that quietly
stops you writing a zero has removed the game; this one asks first, because it
is the only genuinely irreversible move, and then lets you do it.

**The second Yahtzee is worth a hundred, and it is a joker.** With fifty
already in the Yahtzee box, every further Yahtzee is a hundred points *on top*
of wherever it goes — and it may go in its own number upstairs if that is
open, otherwise in any open box at all, at full value. Five threes into Large
straight is 40 + 100. With a **nought** in the Yahtzee box there is no bonus
and no joker. `Rules.jokerBoxes` is the authority and the interface asks it
rather than guessing.

## The strong player is exact, not clever

Five dice have only **252 distinct hands** once you stop caring which die is
which, and only 462 ways to keep some of them. So the whole reroll tree fits
in two small tables, built once at load, and "what should I keep" is answered
by an expectation over every outcome rather than a rule of thumb about pairs.

Three tiers, and they differ in kind rather than in strength:

| | what it is | average | takes the 63 |
|---|---|---|---|
| **The Cup** | keeps whatever there is most of, writes down whatever scores highest, has never heard of the sixty-three | 157 | 10% |
| **Counter** | exact expectation over the next roll, and plays for the upper bonus | 217 | 22% |
| **Ledger** | exact expectation over both remaining rolls, and prices every box against what that box is normally worth | 238 | 45% |

That last row is the interesting one. The score on the sheet is not the value
of the move: writing 22 in Chance spends Chance, and Chance is *worth* about
22, so it gains you nothing. Writing 22 in Four of a kind — normally worth
about 13 — gains you nine. Ledger judges by

```
what it scores  −  what that box usually gives you
```

which is the whole of "take it or hold it open" falling out of one
subtraction, and it is why Ledger will write a nought into Ones on purpose
while The Cup is busy filling Full house with rubbish.

The upper bonus is priced the same way: three of a number is par, and the
surplus over par is worth 35/63 of a point each — priced at nothing once the
table works out that 63 is no longer reachable, rather than assuming.

`tools/ai-check.js` plays whole seasons with a seed and requires each tier to
out-score the one below.

## What the sheet does for you

- **Every open box shows what these dice would score in it.** Nothing is
  hidden and nothing is chosen for you; it is the arithmetic, done. Tapping
  the box writes it there.
- **A nought asks first** — with how many rolls you have left, because that is
  usually why somebody tapped it by mistake.
- **The upper half carries its own countdown**, so the sixty-three is a number
  on the screen rather than a subtraction in your head.
- **A written nought is drawn as a dash, not as a 0.** They are completely
  different things: an empty box is a choice you still have, a nought is a
  choice you already made.

## What's here

```
rules.js    the game, pure — no DOM, no timers, no randomness it wasn't handed
ai.js       252 hands, 462 keeps, and three genuinely different players
coach.js    the engine's own tags, in English — it may only say what was used
gfx.js      the sheet and the dice, on one canvas so a box can light up
app.js      the conductor: roll, keep, roll, keep, roll, write
room.js     the four-letter front door (shared, byte-identical)
net.js      the star topology (shared; SEATS = 6)
table.js    seats, roster, deal (shared, byte-identical)
```

`rules.js` is pure and takes its randomness as an argument, so
`tools/rules-check.js` replays tens of thousands of turns with a seed and
checks the arithmetic on every box, both ways round the joker rule, and that
the thirty-five lands at exactly 63 and not at 62.

## Six phones

One phone is the table: it holds the sheet and rolls the dice. Everybody else
types four letters. Nothing is secret in Yahtzee — everybody watches everybody
else's dice — so the view each phone gets is the whole state. It still goes
through `Rules.publicView`, because the day a game here has a secret in it,
the machinery that keeps it should already be the machinery in use.

Empty chairs are played by the house. If somebody's phone drops, their chair
carries on.
