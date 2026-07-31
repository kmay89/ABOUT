# ⚑ The Field

**Stratego, and nobody can see your ranks — including the machine.** Forty
pieces a side, two lakes, and the one idea the game is built on: everything
you know, you worked out.

No accounts, nothing tracked, works offline. Two phones join by typing four
letters. Part of [The Games Room](../games/). No libraries, no build step, MIT.

## The machine plays from a view, not from the game

Every other room here sends each player a view because it is tidy. This room
sends one because it is the *only* way the game exists at all.

`AI.choose` is handed `Rules.publicView(state, seat)` — exactly what a person
sitting in that chair would see. It is not disciplined about not peeking; it
has nothing to peek at. That is a stronger promise than promising not to look,
and it is the version worth making.

The same function is what goes over the wire to a second phone.
`tools/rules-check.js` shuffles the unseen ranks three hundred times and
requires the message to come back byte-identical.

## The pieces wear insignia, not numbers

A tile with a number and a truncated five-letter name on it is what a
spreadsheet looks like. A real Stratego piece is known by its **shape** — you
see a pickaxe and you know it is a Miner without reading anything, which is
faster than reading and is most of the pleasure.

So every rank carries a mark, and the marks are a *system* rather than twelve
unrelated doodles:

- **The fighting ranks climb, and you can count them.** One, two, three
  chevrons for Sergeant, Lieutenant and Captain. One, two, three stars for
  Major, Colonel and General. A laurel round the Marshal's star. More marks is
  stronger; stars beat chevrons. Across a whole board you can read the strength
  of a line without reading a word — which is the point, because you are
  looking at forty tiles at once.
- **The five with special *rules* get pictures**, because they are not ordinary
  soldiers and behave nothing like them: a flag, the spy's mask, the scout's
  arrow, the miner's pick, a bomb.

The number stays, small, in the corner — where it is on a real piece — for
people who think in numbers and for anybody who has not yet learned that stars
beat chevrons.

The key inside "How it's played" is painted by the *same function* that draws
the board (`Gfx.insignia`), into a grid of small canvases, so the legend cannot
drift from the pieces it is explaining.

Two of the marks took a second pass, and both failures were the same kind — a
shape that was almost right and read as something else entirely. The Miner's
pick, stroked as an even-width arc on a stick, is a mushroom; it needed a
crescent head tapering to a point at each tip. And the Marshal's laurel, drawn
as a shallow arc across the bottom, is a smile; a wreath is a near-complete
ring that opens at the *top*.

## What the board shows you, and why

On an enemy piece, two things and no more:

- **a dot if it has ever moved.** Public, free, and enormous: a piece that has
  moved is not a Bomb and is not the Flag. Everybody watched it happen. Most
  people hold about a third of those in their head, so the board holds them
  for you.
- **its rank if it has been in a fight**, because both pieces turn face up when
  they strike and you were sitting right there.

And nothing else. Which unmoved piece is the Flag, what the odds are on a given
square, how many Miners they have left — all derivable, none of it drawn.
Working that out is the game. (The menu will add up what has been *taken*,
because that is arithmetic on pieces lying face up beside the board.)

## What's here

```
index.html    markup, and this room's colour
look.css      the house style, shared with the other rooms
rules.js      the board, the army, the four lines of combat, and the view
ai.js         a belief, and the expectation over it
coach.js      the engine's own reasons, in English — from a view, so it
              cannot form a sentence about a rank it was not shown
gfx.js        the field, the lakes, the tiles, and the fight
room.js, net.js, table.js    the four-letter front door, SEATS = 2
sw.js, manifest.webmanifest, icons/
```

## Three things worth explaining

**Stratego cannot be searched.** Not "is expensive to search" — cannot. The
position you would search is one of about 10²³ consistent arrangements of forty
unseen ranks, and picking one and searching it is a machine confidently solving
a board that isn't there. So this keeps a belief and acts on its expectation,
which is what a good human does.

**Winning is worth four hundred, not infinity.** The first version priced the
Flag at a million. Any unmoved unknown piece might be the Flag at about one in
thirty, and one-in-thirty of a million dwarfs every other term — so every
strike on every unmoved square scored the same enormous number, the player
picked arbitrarily among them, and what came out was **random play wearing a
belief system.** It drew with a bot that moved at random, which is exactly the
symptom you would expect, and exactly how it was found.

**The draw clock is in the evaluation, and it has to be.** Attacking an unknown
has negative expected value on average, so a purely rational player never
strikes first — and two of them never strike at all. Real players commit
because of the clock, not the arithmetic, so the clock is in the arithmetic:
as the moves-since-a-capture count rises, a gamble beats a draw. Without it,
29 games in 30 ended in a shuffle.

## There are two opponents, not three

Recruit plays its first game: if something is next to you, hit it; otherwise
walk forwards. Officer adds the whole apparatus — the roster count, every fight
it has seen, the movement inference, the expected value of a strike. **Officer
takes 75% of games off Recruit.**

A third was written. It probed with Scouts, came home to meet anything walking
into its half, attacked with the cheapest piece that would do, and traded only
when ahead — four real Stratego skills that real players will tell you about.
Measured over sixty games each against the Officer, they came to **47%, 49%,
45% and 53%**: neutral or slightly harmful, every one.

The honest reading is that a one-ply evaluator is at the ceiling of what it can
express here, and beating Officer needs planning over several moves rather than
a better opinion about one. So there is no third rung. Shipping one that lost
to the second would be exactly the decoration the rest of this repository
spends its time avoiding — and `tools/ai-check.js` would have failed on it,
which is what it is for.

## Setting out

Placing forty pieces one at a time is how you get somebody to close the tab.
So the default deployment is already a decent one — Flag off centre on the back
row, three Bombs around it (three, not four: a fully ringed square is a
signpost), the Spy beside the Marshal, Scouts forward — and editing is
shuffle-until-you-like-it plus tap-two-to-swap. The four or five you actually
care about are worth moving by hand; the rest never were.

## Why it's honest

`tools/rules-check.js` checks the combat table directly — Spy beats Marshal
attacking and loses defending, Miner defuses, equal ranks kill each other —
then plays random games checking that nothing ever stands in a lake, that
Bombs and Flags never move, that every generated move is recognised by
`find()`, and that games end. Then the permutation test.

`tools/ai-check.js` runs the ladder. `tools/open-check.js` opens the room in a
real browser, sets an army out, starts the game and plays a move.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/stratego/
```

```
node tools/rules-check.js
node tools/ai-check.js
node tools/room-parity.js
node tools/open-check.js     # opens it in a real browser and plays it
```
