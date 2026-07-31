# ✶ The Star

**Chinese checkers on the real 121-hole board**, for two, three, four or six.
Ten marbles across to the point directly opposite — and the marbles you leave
behind are the ladder the rest climb.

No accounts, nothing tracked, works offline. Up to six phones join by typing
four letters. Part of [The Games Room](../games/). No libraries, no build step,
MIT.

## The board, from one list

A hexagram: a hexagon of side five with a ten-hole triangle on each edge.
61 + 60 = **121 holes**, which is the board everybody actually owns.

It is built from one array — the width of each of the seventeen rows — and
everything else is derived. That matters more than it sounds, because the
alternative is a hand-written adjacency table with 121 entries and six
neighbours each, and a hand-written table is a table with a mistake in it.

Every hole gets a **half-column** coordinate, with each row centred, so that
two holes in the same row are neighbours when their half-columns differ by 2,
and two holes in adjacent rows are neighbours when they differ by 1. That is
the triangular lattice, exactly, in two comparisons — and the widths alternate
parity all the way down the board, which is what makes the diagonal rule work
without a special case anywhere.

## What's here

```
index.html    markup, and this room's colour
look.css      the house style, shared with the other new rooms
rules.js      the board, the six points, the jumps and chains, and the two
              fair-play rules
ai.js         three different answers to "how far have I got to go"
coach.js      the engine's own reasons, in English
gfx.js        the star, the marbles, and a chain drawn as a chain
room.js, net.js, table.js    the four-letter front door, with SEATS = 6
sw.js, manifest.webmanifest, icons/
```

## Three things worth explaining

**The evaluation is dominated by the worst piece.** The naive engine adds up
how far its ten marbles have to travel and plays whatever makes the total
smallest. It looks fine for twenty moves and then loses every game, because the
sum is happy to trade one enormous jump by a marble that is nearly home against
three that never move at all. You finish with seven packed into the point and
three stragglers eight steps back, and those three take the rest of the game.

You are not finished when your marbles are close. You are finished when your
**last** one arrives. So the cost is the sum *plus four times the furthest
marble's distance*, and that one term wins every game of sixteen against the
version without it.

**The strongest tier changes what distance means.** Not distance to the point
of the triangle, but distance to **the particular hole this marble has to end
up in**, assigned one marble at a time, hardest first. Near the end those are
different questions — a marble one step from the tip is no use if the tip is
taken and the last empty hole is four steps sideways. Worth every game of
twenty-four against the version measuring to the point.

**The tips are derived, not listed.** The obvious version is a table of six
indices into the six home arrays, and the obvious version is wrong: those
arrays are built row by row, so which end of each is the outer tip depends on
which way that triangle faces. Two of the six came out as the *inner* corner —
a mistake nothing catches until you notice the machine steering its marbles
into the mouth of the point and stopping there. The tip is the hole furthest
from the middle of the board, which is true of all six without a special case.

## The two fair-play rules

**You may not stop in somebody else's point.** Passing through and jumping over
are fine, but a marble may not end its move in a home triangle that is neither
where it started nor where it is going. Without this, the strongest strategy is
to move into an opponent's destination and sit there, and the game becomes a
blocking contest rather than a race.

**You must eventually get out of your own point.** The classic spoiler is to
leave one marble at home forever, so the player whose destination that is can
never finish. So after your twentieth move, if you still have marbles at home
and any legal move would take one out, those are the only moves you have.

Neither costs anybody playing in good faith a single move. Both can be turned
off.

## Tapping a hole two ways

More than one chain often ends on the same hole, and they are not the same
move — one may leave a rung behind and another may not. Tap a destination once
to see the shortest route and play it; tap it again to cycle through the
others, drawn as a dotted path. Nobody needs to know that to play, and it is
one tap away if you want it.

## Why it's honest

`tools/rules-check.js` checks the *geometry* before it checks anything else:
121 holes; six points of ten with none shared; every neighbour a neighbour
back; every point exactly sixteen steps from the one opposite; every point's
tip an outer corner with exactly two neighbours. Then it checks that two,
three, four and six players each get ten marbles in opposite points, that no
move ever stops in a foreign point, that the vacate rule actually bites, and
that fifteen hundred plies of random play never lose a marble.

`tools/ai-check.js` runs the ladder and requires each rung to beat the one
below — with an unfinished race going to whoever has less left to travel,
which is the honest reading of a game the weaker player could not close out.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/halma/
```

```
node tools/rules-check.js
node tools/ai-check.js
node tools/room-parity.js
node tools/open-check.js     # opens it in a real browser and plays it
```
