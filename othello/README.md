# ⚫ The Othello Board

**A minute to learn, and the opposite of what everybody assumes.** Through most
of an Othello game you want *fewer* discs than your opponent. Every disc you
own is a disc that can be turned back, and a player who takes the biggest flip
every turn builds a huge fragile blob, runs out of safe moves, and hands over a
corner.

No accounts, nothing tracked, works offline. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## The one effect this room is built around

A disc that changes hands is not repainted, it is **rotated** — squashed to
nothing about its own vertical axis, swapped at the moment it is edge-on, and
opened out again in the other colour. And the discs do not all turn at once:
each is delayed by its distance from the square that was just played, so the
flip travels outward along the rays that caused it.

A six-disc capture then *shows you why it happened* — you watch the line run —
instead of presenting the result and leaving you to work backwards. It costs
one cosine.

## What's here

```
index.html    markup, and this room's colour
look.css      the house style, shared with the other new rooms
rules.js      the rules, complete and pure — including the two that are easy
              to get subtly wrong: a move must flip, and passing is not a choice
ai.js         corners, the squares that give them away, mobility, frontier
              discs, and an exact solve for the last dozen squares
coach.js      the engine's own reasons, in English — with flip counts kept
              firmly at the bottom of the order
gfx.js        the cloth, the discs, and the turn
room.js, net.js, table.js    the four-letter front door
sw.js, manifest.webmanifest, icons/
```

## Three things worth explaining

**Passing is not a choice.** A side with no legal move loses its turn
automatically and silently — it never gets to decline. The game ends only when
*neither* side can move, which is usually but not always when the board is
full. Getting this wrong produces a game that either hangs on a full board or
lets a player skip a turn to improve their position, and the second one is not
a small bug: half of endgame Othello is manoeuvring your opponent into having
no move at all.

**The evaluation barely counts discs.** It weighs corners, the X- and C-squares
that hand a corner over, mobility, and frontier discs — the ones still touching
an empty square, which are the ones that can still be flipped. The disc count
is ramped, worth almost nothing at ply 20 and everything at ply 58. The
beginner tier is the one that *does* count discs greedily, on purpose, because
that is exactly how not to play and it is what a real beginner does.

**The endgame is solved, not evaluated.** With few enough squares left the
search stops guessing and plays it out exactly. Which is all-or-nothing: if the
solve will not fit in the budget it is abandoned for the ordinary search rather
than reported half-done, because a partial solve is a lie and not an
approximation.

## Why it's honest

- **The rules are proved.** `tools/rules-check.js` replays fifteen hundred
  games checking on every ply that exactly one disc is placed, that every
  legal move flips something, that discs are turned and never removed, and
  that games end both ways — full boards *and* stuck ones, which is the case a
  naive implementation never produces.
- **The fast path is checked against the honest one.** The search uses an
  `applyFast` that skips the history; the check requires it to agree with
  `apply` about the board, the turn and the pass count on every move of a
  game. A fast path nobody compares is a second implementation of the rules.
- **The opponents are measured against each other**, in `tools/ai-check.js`,
  and each rung has to actually beat the one below.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/othello/
```

```
node tools/rules-check.js
node tools/ai-check.js
node tools/room-parity.js
node tools/open-check.js     # opens it in a real browser and plays it
```

…and bump `VERSION` in `sw.js` on release.
