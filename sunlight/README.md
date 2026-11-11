# Borrowed Sunlight — The Back of the World

An open-world adventure through the novel *Borrowed Sunlight*, opened from
the Game Boy on the desk (and from the book next to it). It runs in a
browser with no build step and no dependencies, works offline, and has no
image or audio files: every pixel, sound and note is made by code as it
runs.

The book belongs to the book: its story, words and people are the
novel's (all rights reserved, see `kmay89/borrowed-sunlight`). The code
here is MIT like the rest of this repository.

## The design

### The structure: keys, doors, an open hill

The old adventure-game structure — a world that opens as you earn the
things that open it, with a dungeon at the heart of each region — fits
this book unusually well, because the book already works that way: every
chapter has a goal and an open question, and every answer is a piece of
real science that lets Wren go somewhere new. So each **key** in the game
is a real idea, and each **door** is a place in the novel.

| Ch | Key (the science) | What it opens |
|---|---|---|
| 1 | **Patient eyes** — dark adaptation (rods, rhodopsin) | The cellar's own light; Gran's book |
| 2 | **The crank lantern** — electromagnetic induction | Light in dark places; a trickle of charge |
| 2 | **The scooter dynamo** — energy changes form | The phone, via the hill |
| 2 | **The water-drop lens** — refraction, surface tension | The small world, everywhere; Mo's voice |
| 3 | **Oats** — chemotaxis, Physarum shortest paths | The gold's way out under the garden |
| 4 | **Beck** — tracking, knowing how to look | The deer path into the woods |
| 4 | **Root sight** — the mycorrhizal network | The hidden fold; the hollow |
| 4 | **The fallen giant** — nurse logs | A new question: help it cross, not keep it |
| 5 | **Stillness** — granular flow, angle of repose | Out of the pile |
| 6 | **The water bears** — cryptobiosis | The courage to let Mo dry out |
| 7 | **A crumb in a jar** — dormancy (sclerotium) | Somewhere cold, wet and dark |
| 8 | **Look long** — perception is a guess that needs time | Mo, again |
| 9 | **One bar** — radio line of sight | Gran |
| 9 | **The next hand** — marginalia | The last blank page |

Between the story beats the hill is open: the garden, the field, the
road, Beck's side of the back field, and (once earned) the woods, the
hollow and the pond. Twenty-six **small things** are hidden across it
to find with the lens — a fly's compound eye on the kitchen pane, the
dew-drop lenses on a spider's web each holding the garden upside down,
sand at its angle of repose, diatoms in pond water — each with a true
field note. That's the collectible layer; there are no coins.

### The two felt engines, as systems

* **The dark fills with light.** A darkness layer with holes cut in it by
  every light, plus your eyes' own adaptation, which builds while you
  stand still in the dark and is undone by bright light (the lantern
  cranked hard, the phone's screen, the work lights). The cellar's
  foxfire is only visible to adapted eyes; on Thursday the work lights
  wash it out completely, the way a porch light drowns the stars.
* **The dead phone becomes an eye.** The lens needs the phone; the phone
  needs charge; charge comes from cranking (your arm tires — there's a
  meter) or from the scooter ride, where the dynamo's whine is pulled
  toward real notes as it speeds up ("almost a note, almost music").

### The set pieces

* **The ride** (Ch2, Ch9): down the winding road from the crest, steering
  through the curves, off-road grass slowing you and ruts jolting the
  charge out. Gravity → motion → electricity → a sliver of green.
* **The oats** (Ch3): a Physarum simulation on a garden grid. The gold
  grows toward food it can smell within reach, explores every corridor at
  once, then prunes back to the shortest path. It won't cross sunlit
  ground (it avoids light and drying). Two puzzles.
* **The pit** (Ch5): stealth along the fence behind the culvert pipe, the
  foreman's sight-cone blocked by pipe and trailer; then the working
  pile, drawn at its 34° angle of repose. Struggling sinks you; stillness
  starves the flow; one single lunge gets you out — mash and the sand
  takes each grab.
* **The water bears** (Ch6): dry tuns under the lens; one drop of pond
  water; a fat ridiculous bear walking.
* **The long dark** (Ch7): the work lights, the pump, the jar, Mo's voice
  cut off mid-word.
* **Look long** (Ch8): the dry crumb under the lens. Hold perfectly still
  for about twenty seconds while the reasonable voice — gray text, from
  everywhere — tells you it's nothing. Move and it says "See? Nothing."
* **One bar** (Ch9): at the very top of the hill, hold still until the
  signal locks.

### Canon the game keeps

* Wren is never gendered: the sprite has no gendered cue, nobody uses a
  pronoun for Wren, and Beck's "granddaughter. Grandkid." is the book's
  own line.
* **Mo's voice is never resolved.** It has no name tag, no speech box, no
  direction — gold italic text in the middle of the screen, with a soft
  chord from nowhere.
* Gran is alive and well; she is only ever a voice on the phone and a
  hand in the book.
* The clock is always Friday keys, Thursday dewatering, Monday pour. The
  HUD shows what Wren knows when Wren knows it ("Mon?" until the board).
* The antagonist is the cynic's *it's just —* in Wren's own head. Nobody
  is a villain: the workmen are kind, Dad is tired.
* US spelling throughout.

### The look

A toy diorama under a low sun, painted by code (`art.js`):

* The ground is painted in chunks. A soft color field per material sits
  underneath, with its edges wandered by noise so paths meander and grass
  laps over stone. On top go thousands of seeded strokes: blades, daisies,
  buttercups, pebbles with highlights, leaves with veins, mushrooms. Chunks
  are cached, and the ring around the view is warmed one chunk a frame, so
  walking never stalls.
* Everything that stands up has height, a light from the upper left, and
  a soft shadow down-right: fences, plump hedges, raised beds, the tap,
  chain-link, the houses (weatherboard, tiled roof, window boxes still
  full of Gran's geraniums), the shed leaning on one hip, the trailer, and
  the culvert pipes.
* People are round-headed and small-bodied with soft shading. They blink,
  breathe when they stand still, and bob when they walk.
* Life in the wind: long-grass tufts and lavender sway, and part when you
  walk through them. Trees rock. Dust puffs rise from your feet. Bees,
  the butterfly, frogs and fireflies move about.
* Light: a soft darkness layer with lights cut into it, bloom on warm
  lights, sunbeams laid across the house floor, slats of light in the
  shed, light shafts through the woods canopy, drifting cloud shadows,
  and water that shimmers by day and holds the stars by night.
* The lens: a warm/cool grade, a vignette, and a **tilt-shift focus** that
  softens the top and bottom of the frame, so the hill reads as a small
  real thing on a table. It can be turned off in the menu.
* Playability: a smooth camera with look-ahead, eased movement, a twinkle
  on anything you can interact with, and a gold pointer toward the next
  thing (it can be turned off).
* **Dynamic resolution:** the loop measures its own frame time and trades
  a little sharpness to hold the frame rate.

### The soundscapes

All synthesized in `audio.js`: the house's silence with edges, the fly,
Dad's tape — *rrrip, thunk* — placed where Dad sits, the third board's
groan; the cellar's cold drone, drips and your heartbeat; bees in the
lavender, grasshoppers, birds; the shed's warm creaks and a wasp; wind
and the dynamo on the ride; woodpecker and the spring in the woods; the
frog chorus at the pond; the pit's diesel, conveyor, backup beeper and a
radio playing an original country tune (Karplus–Strong strings) to
nobody; the pump's roar. Music is sparse and generative — a piano in
another room — and Gran's theme plays on the title and at the end.
Captions for meaningful sounds are on by default.

## Files

| File | What it does |
|---|---|
| `world.js` | The overworld (generated from shapes, seeded) and three hand-drawn interiors |
| `art.js` | Tiles, people (outlined pixel sprites), buildings, creatures — all painted by code |
| `audio.js` | Ambiences, positional one-shots, loops (dynamo, wind, pump, heartbeat), music |
| `lens.js` | The field guide (26 entries with real science) and the micro-scenes |
| `icons.js` | The item icons |
| `engine.js` | Loop, input (keys, touch, gamepad), collision, lighting, HUD, dialogue, lens |
| `minis.js` | The ride, the oats, the pile, the board, the signal |
| `story.js` | Every beat, chapter by chapter, and everything you can press E on |
| `ui.js` | Title, Gran's book (pages, field notes, seen, map, phone, your page), menu, ending |

`tools/make-icons.js` regenerates the app icons (needs Playwright's
Chromium). `?beat=pit` (any beat id in `story.js`'s `ORDER`) jumps
straight to a chapter for testing; it is not linked anywhere.

## Accessibility

Every word is HTML over the canvas (sized by the reader's own settings,
read by screen readers through a polite live region). Captions for
sounds; adjustable text speed (to instant); larger text; reduced motion
(honored from the OS too); haptics toggle; full keyboard, touch and
gamepad play; nothing time-critical except the ride, which can't be lost.
Saves on the device only; nothing is sent anywhere.
