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
the Game Boy.

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
- `privacy/ terms/ legal/ accessibility/` — the small print, kept
  humane.
- `netlify.toml` — hosting config: canonical-host redirect and security
  headers. Netlify serves the repo as-is; every pull request gets a
  deploy preview automatically.

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

## License

MIT — see [LICENSE](LICENSE). The words and the likeness of the desk
are mine; the code and the design tokens are yours to take and retune.
