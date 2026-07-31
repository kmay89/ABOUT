# 🂠 La Viuda

**A spare hand face down in the middle, and only the worst hand pays.** Also
called Whiskey Poker, and in the English card books Commerce.

Two to six players, three lives each. No accounts, nothing tracked, works
offline. Up to six phones join by typing four letters. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## You are not trying to win

Nothing is paid to the best hand. Only the **worst** hand loses a life, so the
question is never "is my hand good" — it is *"is my hand likely to be the worst
one at this table"*, and those two come apart constantly. A pair of sevens is a
disaster heads-up and perfectly comfortable at a table of six, because with six
of you somebody is holding king-high and it will not be you.

That sentence is the whole game, and it is what the strongest opponent here
computes and nothing else.

## Taking the widow is a present to the table

It is not a free draw. The five cards you throw away land **face up** in front
of the next player, who may take the lot — and everybody after that fishes
through them one card at a time. So the question is not "is the widow better
than my hand". It is "is the widow better than my hand *by more than my hand is
worth to the people behind me*".

And a knock is not a pass — it is a clock. Everybody else gets exactly one more
turn and the hands come down, which is a whole lap they do not get to improve
in. Knocking early with a middling hand is a real weapon against a table that
is still fishing.

## Three opponents, three different functions

| | what it is |
|---|---|
| **Hopeful** | compares categories: two pair beats a pair, so it takes a two-pair widow and swaps its lowest card for the widow's highest. Has never noticed that the hand it drops in the middle is a gift. |
| **Careful** | stops comparing categories and compares hands — all twenty-five trades scored exactly, which is where kickers and flush draws live — and prices the giveaway by how good the hand it would abandon is. Knows the bar moves with the number of players. |
| **The Widow** | stops evaluating its hand at all. It deals the unseen pack to the other chairs two hundred times, lets each of them take the widow if the widow beats what they were dealt — because that is what they will do, and it is why a widow improves as it travels — and plays the only number that pays: **the chance of being the worst hand when the cards come down.** |

The Widow will keep a busted hand that is merely unlikely to be last, and it
will break a made pair to avoid being the one that pays.

`tools/ai-check.js` seats each tier against two of the one below and requires
it to survive more often than its share. At a table of three, where chance is
33%: **Careful outlasts Hopeful 61%** of the time, and **The Widow outlasts
Careful 51%**. As in the euchre room, the sampling player is given its own
generator — not for secrecy but because a player drawing from the deal's
stream moves it, and the same seed then stops producing the same table when
the strong player changes chairs.

## The evaluator is exact, and it is checked exhaustively

Five-card poker ranking is the sort of thing that is right about ninety-nine
hands in a hundred and then costs somebody a life. Two mistakes account for
most of it: **the wheel** (A-2-3-4-5 is a straight, and the *lowest* one — an
ace counted only as high is the classic bug) and **tiebreak order** (a full
house is judged by its triple, two pair by the high pair then the low pair then
the kicker).

So `tools/rules-check.js` scores **all 2,598,960 five-card hands** and requires
the count in every category to match the known figure exactly — 40 straight
flushes, 624 fours, 3,744 full houses, 5,108 flushes, 10,200 straights, and so
on down. A ranking that is wrong anywhere moves at least two of those numbers.

## What's here

```
cards.js    the deck and the card painter (shared, byte-identical with hearts)
rules.js    the game, pure — plus the ranking, as one comparable integer
ai.js       three players, and a Monte Carlo estimate of being last
coach.js    the engine's own reasons, in English
gfx.js      a ring for up to six, and the widow as five separate cards
app.js      the conductor
room.js, net.js, table.js    the four-letter front door (shared)
```

## Six phones

One phone is the table. It deals, and sends each of the others **only their own
five cards** — the host never broadcasts the state. `tools/rules-check.js`
shuffles the unseen cards a few hundred times and requires each player's
message to come back byte-identical; if it cannot change, it cannot leak.

Empty chairs are played by the house, and a phone that drops leaves its chair
playing on.
