# ⚑ The Minefield

**Minesweeper with the coin toss taken out.** Every field is dealt over and
over until one turns up that can be finished by reasoning alone — so if you
lose, you were wrong.

No accounts, nothing tracked, works offline. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## The problem this fixes

Minesweeper's one real flaw as a game is that a well-played board can still
kill you. You deduce forty squares perfectly, arrive at a 50/50 in the corner,
pick wrong, and the last ten minutes are gone — not because you played badly
but because the board never contained the information. That is not difficulty,
it is a coin toss wearing difficulty's coat.

So the field here is **generated against a solver**. A candidate layout is
played out by a machine that only ever makes deductions a person could make,
from the same first click; if that machine gets stuck anywhere, the layout is
thrown away and another is dealt.

## The solver

Three rules, and the third is the one people leave out.

**The two obvious ones.** For an open square showing *n*, with *f* flagged
neighbours and *U* unknown ones: if *n − f* is 0 every square in *U* is safe;
if *n − f* equals |*U*| every square in *U* is a mine.

**Subsets.** For two constraints (U₁, n₁) and (U₂, n₂) with U₁ ⊂ U₂, the
difference U₂∖U₁ contains exactly n₂ − n₁ mines. This is the rule behind every
"1-2-1" and "1-2-2-1" pattern anybody has ever learned by shape, and without it
a solver rejects boards that are perfectly ordinary to play.

**The count.** The mines left over. If every remaining unknown square is
accounted for, they are all mines; if no mines remain, they are all safe.
Endgames turn on this constantly.

The solver is deliberately **not** exhaustive: it does not enumerate every
consistent mine arrangement, because a board only solvable that way is not one
a person can solve either. Being weaker than perfect is the point — it is a
model of a good player, and the boards it approves are the boards a good player
can finish.

It finds one first time at 9×9, in about two deals at 16×16, and inside fifteen
at 30×16 — a few milliseconds either way.

## The first tap

The field is not laid out until you tap. That is what lets the first tap be
safe *and* lets the whole board be checked for solvability from that exact
square. Dealing at the start and then moving one mine out of the way — the
usual trick — cannot promise either. It also means the opening is always a
clearing rather than a single number.

## What's here

```
index.html    markup, the counters, and this room's colour
look.css      the house style, shared with the other new rooms
core.js       the field, the solver, and the hint that uses the same solver
gfx.js        the tiles, the numbers, the flags and the mines
app.js        touch, chording, panning, zooming, and the clock
sw.js, manifest.webmanifest, icons/
```

## Touch, which is where most versions fall down

A mouse has two buttons and minesweeper needs both. A finger has none, and the
usual invention — long-press to flag — is the wrong default: flagging is the
*rarer* action and long-press is the slower gesture, so the common case pays
for the rare one on every single tap. Both exist here, and the tray carries an
explicit flag mode, because the fastest way to flag twelve squares in a row is
to stop being asked which you meant.

**A tap that moved is a drag, not a tap.** The pointer has to come up within a
few pixels of where it went down, or the field pans and nothing is opened.
Without that rule, panning a big board detonates it — the single most
infuriating bug this game can have.

**Chording shows its work.** Hold a number whose flags are all placed and the
squares it would open are drawn pressed, before you commit. And a chord refuses
to open a **?**, so parking a doubt actually protects you.

## Why it's honest

`tools/rules-check.js` deals eighty fields across the three sizes and requires
every one of them to be finishable by reasoning alone, with the right number of
mines, and with the first tap always opening a clearing. It then checks the
thing that makes all of that mean something: **the solver has to be able to
say no.** Sixty dense fields are put to it with no-guess turned off, and it has
to reject some — a solver that says yes to everything proves nothing at all.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/minesweeper/
```

```
node tools/rules-check.js
node tools/room-parity.js
node tools/open-check.js     # opens it in a real browser and plays it
```
