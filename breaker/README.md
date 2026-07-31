# ▮ The Wall

**A brick breaker where the paddle is something you aim with**, not a mirror
you bounce off. Where the ball lands across the paddle sets the angle it leaves
at — so every shot is a decision about where you want it to come back from.

No accounts, nothing tracked, works offline. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## What's here

```
index.html    markup, the counters, and this room's colour
look.css      the house style, shared with the other new rooms
levels.js     the walls, as formulas, and the check that they can be finished
game.js       the physics, in field units, with no canvas anywhere in it
app.js        input, painting, and the shape of a run
sw.js, manifest.webmanifest, icons/
```

## Four things worth explaining

**Everything is in field units.** The playing area is 1 unit wide and 1.5 tall,
and the renderer scales. That is not tidiness — pixel-based physics gives you a
ball that crosses a small screen in half the time it crosses a large one, and a
game that is a different game on every device.

**The ball cannot tunnel.** A fast ball moving more than its own diameter in a
frame can be on one side of a brick at frame *n* and the other side at *n+1*,
having passed through without ever overlapping. The usual fix — cap the speed —
caps the fun. Here the step is subdivided into slices no longer than a third of
the ball's radius, however fast it is going, so the cheap overlap test is
always valid. Speed costs arithmetic instead of correctness.

**Neither rut is allowed to exist.** A ball that ends up nearly *horizontal*
skims under the wall between the side walls forever. A ball that is perfectly
*vertical* — which is what a dead-centre paddle hit gives you — goes straight
up and straight down until the heat death of the universe once its column is
empty. Both are nudged back, and the vertical nudge is under seven degrees:
enough to walk the ball across the wall over a few bounces, far too little to
feel like the game is steering.

**Level 7 is always level 7.** The walls are generated, but from a formula
chosen by level number rather than at random, so everybody's level 7 is the
same level 7 and you can get better at it. Random walls are forgettable by
construction.

## Aiming with a thumb

On a touch screen the paddle moves **with** your thumb rather than **to** it:
put your finger anywhere and slide, and the paddle follows the movement. That
means your hand is never sitting on top of the bottom of the screen, which is
exactly where the interesting things happen. With a mouse it works the ordinary
way, because a cursor the paddle ignores feels broken — the game decides by
pointer type rather than by asking anybody.

## The score is about combos

A brick is worth ten, times how many you have broken since the ball last
touched the paddle. Six bricks in one trip is worth far more than six separate
ones, which is why getting the ball **behind** the wall is what everybody is
really playing for. The grey bricks never break — they are there to make the
pocket you are aiming at.

## Why it's honest

`tools/rules-check.js` builds the first forty levels and requires that none of
them is a token wall, and then walks each one from the floor upwards **through
bricks as well as gaps** — a brick behind a brick is reachable, because the one
in front is going to be broken; a brick behind a *solid* is not. That check
found a real bug: the generator's own version of the walk stopped at the first
brick, so it declared almost every level impossible, thinned solids until its
guard expired, and shipped walls it believed were broken.

It then plays the first twelve levels with a perfect paddle and requires all
twelve to be cleared with the ball never once leaving the field. If a perfect
paddle cannot clear a level, the physics has a hole in it rather than the
player having a problem.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/breaker/
```

```
node tools/rules-check.js
node tools/room-parity.js
node tools/open-check.js     # opens it in a real browser and plays it
```
