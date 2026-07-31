# kmay89.com — The Desk of Worlds

The personal site of Karl Meves: a cozy isometric desk at night, where
every trinket on the desk opens into a little world — the things I've
been lucky to make (ATM hardware, a bilingual book & doll, Hive Mind,
the Everything series, Borrowed Sunlight, SCQCS, ERRER Labs, securaCV),
plus a few rooms that exist purely for the joy of it: a pocket Rubik's
cube that teaches, a ray-marched Mandelbulb, a light bench,
[the solving room](https://kmay89.com/cube/) — five twisty puzzles that
scramble and solve themselves with the real mathematics on display —
[the chess room](https://kmay89.com/chess/), chess
taught kindly: a 3D board, a patient coach, opening stories, and
same-room two-player with no accounts (the tiny set on the desk is
paused mid-Italian Game), and [the sudoku
room](https://kmay89.com/sudoku/), which shows you how its puzzles are
made and teaches the nineteen techniques that solve them (the folded
newspaper on the desk carries a real one), and [the domino
table](https://kmay89.com/domino/) — four seats and two *parejas*,
cantina style, with a pile of bones on the desk: four squared up with
the six-six on top the way it always ends up, and a few loose ones face
up beside them; and [the reading room](https://kmay89.com/library/) — a
block world you can walk through, opened by the console standing next to
the Game Boy; and [the kitchen table](https://kmay89.com/chili/) — the
chili I make for the kids, written as data so the page can resize the
pot for you, with a cook-along mode built for hands that tire (the bowl
is on the desk under a heap of cheddar, spoon still in it, a few oyster
crackers spilled beside it).

**Live:** <https://kmay89.com>

## What it is

- `index.html` — the whole desk. One hand-written file: the isometric
  scene, the dossiers, the pocket cube lesson, the Mandelbulb, the
  light bench. No frameworks, no build step, no trackers.
- `cube/` — the solving room: 2×2/3×3/4×4/5×5 cubes and a megaminx,
  solved by God's algorithm and Kociemba's two-phase algorithm (the big
  ones honestly unwind their own scramble), with a map of every
  position, a live statistical engine, a camera scanner, a turn-by-turn
  teacher, a sequence lab, and an augmented-reality door. Architecture
  notes in `cube/README.md`. Also published standalone at
  [kmay89.github.io/puzzles](https://kmay89.github.io/puzzles/)
  ([kmay89/puzzles](https://github.com/kmay89/puzzles)).
- `chess/` — the chess room: chess taught kindly, with a full 3D board
  (2D one tap away), a patient coach, opening stories, a tournament
  clock, and same-room two-player over WebRTC with no accounts. A
  mirror of [kmay89/puzzles](https://github.com/kmay89/puzzles)'s
  `chess/` (see its README there); update it by copying that directory
  over this one.
- `sudoku/` — the sudoku room: puzzles forged in front of you from a
  blank grid, five difficulties graded by *solving* rather than
  guessing, nineteen techniques taught from positions that genuinely
  arose, and a hint button that names, shows and explains before it
  ever fills a square. Every puzzle has exactly one answer and can be
  reasoned to the end — the generator refuses to ship a grid its own
  techniques cannot finish. A mirror of
  [kmay89/puzzles](https://github.com/kmay89/puzzles)'s `sudoku/` (see
  its README there); update it by copying that directory over this one.
- `domino/` — the domino table, cantina style (a pile of bones on the
  desk opens it). Four seats, partners across from each other, seven
  bones each and nothing left in the pile — which is the whole game,
  because every bone you cannot see is in somebody's hand and working
  out whose is the entire skill. Play alone against three who count the
  bones and hear every *paso*, or put four phones around one table. A
  mirror of [kmay89/puzzles](https://github.com/kmay89/puzzles)'s
  `domino/` (see its README there); update it by copying that directory
  over this one.
- `games/` — the games room: one page listing everything here that is a
  game, split by how many people it needs. It exists because the desk is
  a scene rather than an index, and eleven games do not fit on a desk.
- `checkers/ othello/ halma/ hearts/ euchre/` — five rooms built off the
  domino table, sharing its four-letter front door. Checkers is English
  draughts, where jumping is compulsory and that one rule is the whole
  game. Othello turns its discs one line at a time so you can see what
  caused it. `halma/` is Chinese checkers on the real 121-hole star, for
  two to six. Hearts and euchre are card games, which means their hands
  are secret — see **Hands on the wire**, below. Each has its own
  README.
- `solitaire/ minesweeper/ breaker/` — three rooms for one person.
  Klondike where the deal has already been proved winnable by a bounded
  solver before you see it; minesweeper where every field is dealt
  against a solver until one turns up that can be finished by reasoning
  alone; and a brick breaker with a curved paddle you aim with rather
  than a mirror you bounce off. Each has its own README.
- `library/` — the reading room: a voxel engine written from scratch
  that renders block worlds in a browser. An NBT reader and an Anvil
  region reader built from the documented formats, our own palette of
  materials, a greedy mesher and raw WebGL — so it ships none of
  Mojang's code and none of their artwork, and will render a Minecraft
  world you drop on it. It comes with an original library of its own,
  built in tribute to the Uncensored Library that Reporters Without
  Borders and BlockWorks put inside Minecraft in 2020. Reached from the
  desk by the console beside the Game Boy. A mirror of
  [kmay89/puzzles](https://github.com/kmay89/puzzles)'s `library/` (see
  its README there); update it by copying that directory over this one.
- `logic/` — *Yes or No*: Boolean logic explained from nothing, in
  plain language and entirely by hand. Flip two switches and watch a
  truth table fill itself in, race a ten-level wire against a two-level
  one under the same noise, add two numbers with AND and OR gates, wear
  out an analog tape while its digital twin stays perfect, and measure
  a qubit until the pattern shows. Reached from the desk by the light
  switch on the wall (below), or directly at
  [kmay89.com/logic](https://kmay89.com/logic/). A mirror of
  [kmay89/logic](https://github.com/kmay89/logic); update it by copying
  that repo's `index.html` over this one and re-adding the `<head>`
  block and the back-to-the-desk links.
- `chili/` — the kitchen table: my chili, written as data instead of
  prose. Every amount lives once in `chili/recipe.js`, per one pound of
  ground beef, and the page multiplies — set how much beef you have and
  the cans, the spoons, the broth, the number of bowls and the size of
  pot you need all follow, in American or metric with the other system
  in small print underneath. The four beans are shared out to whole cans
  by largest remainder, so a one-pound test batch asks for one dark
  kidney and one light rather than two-thirds of each. Cook mode shows
  one step at a time in type you can read from across the kitchen, with
  two big buttons pinned to the bottom of the screen, every step
  readable out loud, and nothing that has to be dragged, held,
  double-tapped or finished before a timer runs out — built for a cook
  who tires as much as for a teenager who has never made chili. Reached
  from the desk by the bowl beside Lupita's box. Format documented in
  `chili/README.md`.
- `privacy/ terms/ legal/ accessibility/` — the small print, kept
  humane.
- `netlify/functions/room.js` — the room mailbox, and the only
  server-side code on the site (see **One front door**, below).
- `tools/` — dev-only, never shipped. `room-check.js` runs the real
  mailbox and the real client against an in-memory store; `join-check.js`
  opens two browsers, links them with four letters, then cuts the wire
  and watches them put it back; `room-parity.js` proves every game's copy
  of the shared door is byte-identical and that every room's offline
  shell lists what the page actually loads; `rules-check.js` replays tens
  of thousands of games of the newer rooms in node and checks the
  invariants on every ply; `ai-check.js` plays each room's opponents
  against each other and requires every rung to actually beat the one
  below; `open-check.js` opens every new room in a real browser, plays
  it, and fails on any console error or on a board that turns out to be
  blank; `make-game-icons.js` draws every new room's icons analytically,
  so the repo carries no binary source asset nobody can regenerate.
- `netlify.toml` — hosting config: canonical-host redirect, security
  headers, and the one functions directory. Netlify serves the repo
  as-is; every pull request gets a deploy preview automatically.

## One front door

Every game here that two people can play together is joined the same
way: whoever starts it reads out four letters, and everybody else types
them. Same words, same screen, same four letters — the chess room, the
domino table, and HIVEMIND next door.

Behind it is `netlify/functions/room.js`, a pigeonhole that holds a
WebRTC handshake under a code for a few minutes and then forgets it. It
exists for one reason: a handshake is about 600 characters and can
never be read across a table, while four letters can. **Nothing about
any game passes through it** — no boards, no bones, no scores, no
accounts — and the moment two devices have shaken hands they talk
directly to each other and the mailbox is out of the picture.

Three things follow from that, and they are the point:

- **It is optional.** Offline, on `file://`, or on the GitHub Pages
  mirror, each game falls back by itself to the handshake it always had
  — a code you scan or paste — and says so plainly.
- **The link is watched.** A heartbeat rides the same channel the game
  does, so a chip on screen can show the round trip and tell the
  difference between somebody thinking and somebody in a tunnel.
- **It heals.** When a link dies, both sides find each other again
  under *the same four letters* — the host holds a key that reclaims
  them — and the game re-states itself. A chair keeps its seat, a board
  keeps its position and clocks, and nobody has to read out a new code,
  because there isn't one. The code and your seat are written down, so
  a phone that ran out of battery comes back to a **Rejoin** button.

`node tools/room-check.js` proves the mailbox and the client without a
browser; `node tools/join-check.js` proves the whole thing with two.

The door itself is now three files rather than one — `room.js` (the
mailbox client, the heartbeat, the healing loop), `table.js` (the whole
interface: the name box, the code in big letters, the lobby, the QR
fallback, the seating) and `cards.js` (a deck and a four-seat table,
shared by hearts and euchre). Each is copied into every folder that uses
it rather than loaded from one place, because every game here is a
self-contained folder that can be moved, mirrored or opened from a
`file://` path on its own. `room-parity.js` is what keeps that trade
honest: the copies must be byte-identical.

## Hands on the wire

The domino table set a rule that the two new card rooms inherit, and it
is the one architectural decision in this repository worth reading
twice: **a game with secret hands must not broadcast its state.**

A single shared snapshot would put four hands on four phones. Not
visible in the interface — but sitting in the message log of every
device, readable by anybody who opened a console. So the host never
broadcasts. It sends each seat *its own view*, built by the same
`publicView` the machine players reason from, and the other hands never
leave the host.

That claim is proved rather than asserted, by a permutation test: the
hidden hands are rearranged among themselves three hundred times and the
message is required to come back byte-identical. If it ever changes, it
encodes the split; if it cannot change, it cannot leak. Euchre's version
covers your *partner's* hand specifically — partners are not allowed to
see each other's cards, and a leak to your partner is a leak to the one
person best placed to use it.

## The light switch

There is a switch screwed to the wall behind the desk, right of the
window, at about the height a light switch actually lives. It is the
only thing in the room that isn't a world to pick up — it's a thing to
throw. Flipping it turns the room off for real: the lamp dies, the desk
goes dark, and the wall — which has had nothing to say all this time —
starts glowing. Follow the writing and you land in `logic/`, which is
the joke: every object on that desk, and the screen you're reading it
on, is made of the one question that switch can ask.

Escape turns the lights back on, for anyone who'd rather not hunt for
the switch in the dark.

## How it's made

By hand, on purpose. The site is raw HTML, CSS and JavaScript — the
graphics are hand-rolled WebGL and SVG, the physics (camera momentum,
rubber-band springs) is a few lines of damped-oscillator math, and the
puzzle mathematics is computed live rather than quoted (the 2×2's
statistics panel derives the published God's-number distribution from
its own breadth-first table every time it opens). Design system: six
colour tokens, two typefaces that ship with every computer, three rules
of motion — documented at the top of `cube/index.html`'s stylesheet.

## Why

Because a personal site can be a place instead of a résumé. Everything
here is something I wanted to exist: a desk you can rummage through,
toys that tell the truth about how they work, and mathematics presented
the way it deserves — visible, touchable, and a little theatrical. It's
also a working demonstration that the plain old web — one HTML file, no
dependencies — is still enough to build something alive.

## Clone it, run it

Everything is static; any file server works (the web workers and the
camera need http(s), not `file://`):

```
git clone https://github.com/kmay89/ABOUT
cd ABOUT
python3 -m http.server 8000        # or: npx http-server -p 8000
# open http://localhost:8000/  and  http://localhost:8000/cube/
```

The cube scanner and the AR door additionally want HTTPS when not on
localhost (Netlify and GitHub Pages both provide it).

## Update it

1. Branch, edit, commit. There is nothing to compile — refresh the
   browser and your change is live locally.
2. Open a pull request. Netlify posts a full deploy preview on every
   PR, so changes are reviewed against the real thing.
3. Merge to `main` and Netlify publishes to kmay89.com.

If you touch the solving room, `cube/README.md` maps the architecture,
and the engine/solver files run headless in node for testing —
geometry, both solvers, the scanner's colour classifier and the map
endpoints all have harnesses that verify hundreds of scramble→solve
round trips before anything ships.

If you touch any of the game rooms, run the checks first:

```
npm run check        # parity, then the rules, then the mailbox
npm run check:open   # opens every room in a real browser and plays it
npm run check:ai     # the strength ladders — the slow one, a few minutes
npm run icons        # redraws every new room's icons from scratch
```

`check:rules` is not a smoke test: it replays tens of thousands of games
in node and checks the properties that, if they broke, would make the
game a different game — conservation, compulsion, termination, and for
the card rooms, secrecy. And it bites. It found a real bug in the brick
game's level generator, which was declaring almost every wall impossible
because its reachability walk stopped at the first brick instead of
flooding through breakable ones.

`check:open` earns its keep for a different reason: node can prove the
rules and it cannot prove the page loads. It caught a bug nothing else
could — a canvas is a *replaced* element, so `position:absolute; inset:0`
does not stretch it, and every renderer here sets `canvas.width` from
`clientWidth` on the way past. That is a feedback loop. The canvases were
doubling every frame up to 2²⁵ pixels a side, and the board was one flat
colour somewhere off the bottom of it. Nothing threw. The console stayed
clean. What caught it was asking whether the board was actually *drawn*,
which is the question a smoke test is most likely to skip.

And whichever room you touch, bump `VERSION` in its `sw.js`, or everybody
who installed it keeps the old one forever.

## License

MIT — see [LICENSE](LICENSE). The words and the likeness of the desk
are mine; the code and the design tokens are yours to take and retune.
