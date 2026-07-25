# kmay89.com — The Desk of Worlds

The personal site of Karl Meves: a cozy isometric desk at night, where
every trinket on the desk opens into a little world — the things I've
been lucky to make (ATM hardware, a bilingual book & doll, Hive Mind,
the Everything series, Borrowed Sunlight, SCQCS, ERRER Labs, securaCV),
plus a few rooms that exist purely for the joy of it: a pocket Rubik's
cube that teaches, a ray-marched Mandelbulb, a light bench, and
[the solving room](https://kmay89.com/cube/) — five twisty puzzles that
scramble and solve themselves with the real mathematics on display.

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
- `privacy/ terms/ legal/ accessibility/` — the small print, kept
  humane.
- `netlify.toml` — hosting config: canonical-host redirect and security
  headers. Netlify serves the repo as-is; every pull request gets a
  deploy preview automatically.

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
