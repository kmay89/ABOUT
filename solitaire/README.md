# 🂡 The Card Table

**Klondike, with the one thing patience has always been missing:** this deal
has already been proved winnable before you saw it.

No accounts, nothing tracked, works offline. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## The problem this fixes

Roughly one Klondike deal in five cannot be won however well it is played, and
there is no way to tell by looking. Losing to one of those is not the same as
losing, and being unable to tell them apart is what makes people give up the
game rather than get better at it.

So a deal here is played out by a solver first, and thrown away until one turns
up that can be finished. The search is **bounded** — it will not spend more
than a few seconds looking — so "winnable" is a promise and "couldn't find one"
is not a claim about anything. It tells you which you got, and it never
pretends.

## The solver

A depth-first search with a transposition set and a node cap. Two rules make it
tractable:

**Safe automatic foundation play.** A card can always go up with nothing lost
if no card still in play could need it — an ace or a two always, and otherwise
once both foundations of the opposite colour have reached its rank minus one.
Playing those immediately, as one indivisible step, removes a huge amount of
pointless branching without ever removing a win.

**Never undo the last move.** A move that puts a card straight back where it
came from is not a move; without the transposition set the search spends its
whole budget shuffling one card between two columns.

At 150,000 nodes it finishes about three deals in four, which is close to the
true rate for draw-one, in about a second and a half each.

## What's here

```
index.html    markup, the counters, and this room's colour
look.css      the house style, shared with the other new rooms
core.js       the rules as integers, the solver, and the ranked hint
gfx.js        the table, the cards, and the elastic fan
app.js        drag, tap, undo, and the cascade
sw.js, manifest.webmanifest, icons/
```

## Three things worth explaining

**A tap is not a drag.** Tapping a card sends it somewhere sensible without
being asked where; dragging puts it exactly where you point. Both start with a
finger going down on the same card, so they are told apart by whether the
pointer moved. And "somewhere sensible" is a fixed, explainable order — the
foundation if it will go, otherwise the pile that uncovers the most, otherwise
any pile at all, and never a move that simply puts the card back. Guessing
wrong once is more annoying than not guessing at all.

**The fan is elastic.** Seven piles across a phone, and the longest can be
nineteen cards deep. Fixed offsets overflow; scaling the cards down until the
worst case fits makes every ordinary hand tiny. So the face-up offset shrinks
only as far as the *tallest pile currently on the table* requires, with a floor
at the point where the corner index would be covered — which is the real
constraint. A card in a fan needs exactly enough of itself showing to be
identified and hit, and not one pixel more. Face-down cards get a much smaller
offset, because they carry no information: they only need to say "there are
four of these".

**The hint is ranked, not random.** Any move is a move; almost none of them
help. It prefers, in order: a move that turns a face-down card over, a card
that can safely go home, a king that empties a column, and only then anything
else. If it says "turn the stock", that really is the best thing available.

## Two rules most versions quietly get wrong

A card already on a foundation **can be pulled back down** onto a column if it
fits. It is legal, it is occasionally the only way through, and most versions
forbid it.

And once every card on the table is face up the game is decided, so it
**finishes itself** — one card at a time up the foundations. The cascade is the
only reward this game has and it should be spent.

## Why it's honest

`tools/rules-check.js` checks that a deal is fifty-two distinct cards laid out
1,2,3,4,5,6,7 with only the last of each face up, that four hundred random
moves never change the size of the pack, and then the thing that makes the
"winnable" claim mean anything: **the solver has to finish some deals and not
others.** A solver that says yes to everything proves nothing at all.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/solitaire/
```

```
node tools/rules-check.js
node tools/room-parity.js
node tools/open-check.js     # opens it in a real browser and plays it
```
