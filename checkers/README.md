# ⛀ The Checkers Board

**English draughts, where jumping is compulsory.** That single rule is the
whole game: you do not win checkers by taking pieces, you win it by *offering*
one so that the reply is forced and the reply after that is a two-for-one. A
move that gives a man away is often the strongest move on the board.

No accounts, no server worth the name, nothing tracked. Installable, works on
a bus. Part of [The Games Room](../games/). No libraries, no build step, MIT.

## The three rules people argue about

**Jumping is compulsory.** If a capture exists anywhere, every legal move is a
capture.

**The longest jump is not compulsory.** That is Italian draughts. Here any
jump will do — but once you start one you must finish it.

**Crowning ends the move.** A man that lands on the far row is crowned and
stops there, even with another jump waiting. That one rule decides more
endgames than any other, and knowing it is how you set the trap or avoid it.

And the one people forget: **you lose by having nothing to move**, not only by
running out of pieces. Which is why the engine here would rather take your
moves than your men.

## What's here

```
index.html    markup, and the six lines of colour that make this room this room
look.css      the house style, shared with every other new room here
rules.js      the rules, complete and pure: chains, crowning, the compulsion,
              and the numbering anybody who has read a book will recognise
ai.js         alpha-beta with the one extension draughts actually needs —
              a forced exchange costs no depth
coach.js      turns the engine's own recorded reasons into sentences
gfx.js        the board and the men, drawn from numbers
room.js       the four-letter front door — byte-identical everywhere
net.js        two seats over WebRTC, the domino table's star with SEATS = 2
table.js      the door's interface, shared with the other new rooms
sw.js         offline shell + update notice (bump VERSION on release)
manifest.webmanifest, icons/
```

## Two things worth explaining

**A forced sequence is not a ply.** Because jumping is compulsory, a position
where a jump exists has no choice in it worth the name — the side to move is
going to capture, and whatever it captures may hand the exchange straight
back. Counting those against the depth budget is how an engine "sees" eight
moves ahead and still walks into a three-for-one: it stopped counting in the
middle of the exchange and scored the half that looked good. So a node whose
every move is a jump does not spend depth. That is the quiescence rule for
this game, and it is unusually clean here — the rules themselves tell you when
the position is quiet.

**The search spends a budget, not a depth.** A draughts position has anywhere
from one legal move to a dozen, so a fixed depth is instant in one position
and a five-second freeze in the next, and it is the same number either way. A
node budget spends the same thought everywhere, and because it deepens
iteratively the shallow passes are not wasted — they order the deep ones. The
strongest tier reaches depth 6 in the opening and further as the board empties.

## Why it's honest

- **The rules are proved, not asserted.** `tools/rules-check.js` replays five
  hundred games and checks on every ply: that nothing appears or vanishes,
  that a jump takes exactly what it claims, that nothing ever stands on a
  light square, that every generated move is recognised by `find()` — the
  function that has to accept a move arriving over the wire — and that where a
  jump exists, *every* legal move is a jump.
- **The opponents are measured against each other.** `tools/ai-check.js` plays
  the ladder and requires each rung to actually beat the one below. A result
  near 50% is the signal that matters: it means two tiers are the same player
  under different names.
- **The door is checked for being shared.** `tools/room-parity.js` requires
  `room.js` and `table.js` to be byte-identical everywhere they appear, the
  chair count in `net.js` to match, the mailbox to answer to this game's name,
  and the offline shell to list every script the page actually loads.

## Run it locally

Any static file server (the service worker wants http(s)):

```
python3 -m http.server 8000
# open http://localhost:8000/checkers/
```

Before shipping:

```
node tools/rules-check.js     # the rules, on every ply of five hundred games
node tools/ai-check.js        # the strength ladder (the slow one)
node tools/room-parity.js     # the shared door, and every room's shell
node tools/open-check.js      # opens it in a real browser and plays it
node tools/make-game-icons.js # redraws the icons from scratch
```

…and bump `VERSION` in `sw.js` so installed players hear about it.
