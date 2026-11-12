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

### The moments

* **Places say their names:** walk into the hollow, the pond or the pit,
  and the name rises at the top with a line of description and a
  two-note harp.
* **People have faces and voices:** each speaker gets a portrait in the
  dialogue box that blinks and bobs as they talk. Each also has a little
  instrument voice — Dad low, Beck bright and quick, Gran warm with a
  wobble. Gran's portrait is the phone, since she is only ever a voice.
* **Mo's words surface one by one** out of a blur, each few words with a
  soft celesta note from a slowly rising scale, while gold motes drift
  up the screen. Mo still has no name tag and no source.
* **A held chord rises under each big beat:** wonder as your eyes adapt
  and the foxfire brightens in a wave; Mo's chord before "Oh. You can
  see us."; joy when Beck arrives, when she forgives, and when the bear
  walks; tension as the pile lets go and the work lights snap on; and
  silence, then sadness, when the pump takes the cold out of the air.
* **When something becomes yours,** gold bursts from Wren, rays turn
  slowly behind the card, and the name catches the light.
* **The revival grows:** gold races through the fallen giant over
  several seconds, with motes rising off it.
* **The hill is inhabited:** sparrows hop and peck, and burst away if
  you come close. Frogs plop into the pond. The butterfly shies off, and
  something rises in the pond now and then.
* **Feet leave prints** in sand and mud that slowly fill back in, and
  water rings out where something touches it.
* **The ride** streams speed lines, and at the bottom the battery fills
  in front of you with a little chime.
* **The time of day eases between states,** so sunsets happen rather
  than snap. The lens forms like a drop; prompts pop in with a twinkle.

### Pacing: Nintendo-short, novel-true

* **Narration** shows one short line on screen — the book's own first
  sentence, or a hand-cut line from the passage — and the **whole
  passage** goes into Gran's book under **Story**, so the novel's words
  are all there for anyone who wants them. (Menu setting to read the
  full text as you play.)
* **Speech** is trimmed to the lines that carry the scene and paged
  into short bubbles of a sentence or two.
* **A title screen** where the painted hill slowly pans behind the logo
  at golden hour; **How to play** in three cards (shown once, before
  the first game, and from the title any time).
* **Goals:** a chapter card in the corner (chapter, progress pips, the
  next step, with counters like parts 2/4 and rides 1/3) and the full
  checklist in the book. Each chapter card opens with a **✓ chapter
  complete** line and your tally.
* **Discoveries:** Wren holds the new thing up in a pool of light before
  its card; each new small thing seen through the lens flies into the
  book, which pulses; badges at 3, 8, 15 and all 26.

### Holding it up to the light

Every key, and Gran's plum jam, gets an **inspect view** like the ones in
big adventure games. Wren holds the thing up, the world goes dark, and
it spins in out of nowhere, settles with a flash, and turns slowly in a
pool of light. You can turn it in your hands (drag, arrows, the stick)
and lean in (wheel or pinch).

The objects are real 3D, built from lathed profiles, boxes and tubes in
`inspect.js` and drawn by a small painter's-algorithm renderer on a 2D
canvas: key and rim light, specular glints, see-through glass, parts
that glow. The models are:

* the jam, with its label and gold lid
* Gran's book, with Mo's gold threads across the cover
* the crank lantern
* the phone, with its water-drop lens
* the oats
* the scooter, with the lantern taped on
* the jar holding the crumb
* the mossy rock
* the fallen log, with its seedlings
* the root, furred with white threads
* the pen
* the phone, with its one bar of signal

Abstract keys spin as gold coins.

A beat later the card arrives: what it is, the science, what it opens.
It also shows the collection: a bar filling to the new count, the new
slot popping in among the gold ones, the empty slots marked "?", and a
line saying how many keys are still out there. It can't be dismissed for
the first second, so nobody skips the moment by accident.

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

## Atmosphere (atmos.js)

- **Wind:** one travelling gust field (`G.gust`). Grass tufts, lavender and tree crowns all lean with the same wave, so you can watch a breeze cross the hill.
- **Mist:** a tileable noise texture that drifts slowly. It is thickest at dawn, in the woods and in the low hollow by the pond, and thin at dusk and night.
- **Drift:** seeds and petals float on the wind; leaves fall in the woods.
- **Water:** by day the pond reflects the sky and catches sun glints. At night it holds its own stars and a wobbling moon, drawn after the darkness layer so they shine through it.
- **Light:** golden-hour sun shafts, a soft light leak, a moon-cool wash at night, and bloom tuned for each scene (strongest in the cellar).
- **Canopies:** tree crowns are built from hundreds of individual painted leaves with a rim highlight.

## Living details (polish pass 2)

- **Color grade:** each time of day has its own contrast and saturation curve, applied as a GPU filter on the stage and eased like the light. Bloom is thresholded, so only bright things spill light and shadows stay deep instead of going milky.
- **Fields:** big, slow patches across the hill, greener where the ground stays damp and sun-bleached gold where it doesn't.
- **The pond:** water has its own smooth, rounded shape (blurred tile occupancy plus noise) with a muddy bank. Every effect on the water is masked to that shore, and a pale line laps at the edge. Dragonflies hover and dart over it by day.
- **Woods:** the shade under the canopy is one soft pool rather than stacked ellipses, so there are no seams.
- **Night:** moonlight keeps a soft pool around Wren outdoors, so you are never lost in the dark.
- **Stillness:** stand quietly for a few seconds and the sparrows hop over to look at you. Stand a little longer and the white butterfly comes to rest on your hair. Move, and they scatter.

## Sound, toys and sizing (polish pass 3)

- **The ear follows the eye:** a breeze layer in the garden and woods swells with the same gust you can see crossing the grass. Birds keep the clock: a dawn chorus, a blackbird singing the evening out, owls at night. Water laps at the pond bank from wherever the bank is. Footsteps alternate left and right, and swish through long grass. Dragonfly wings whirr past.
- **Things to play with:** grass is springy and parts as you push through, then wobbles back. Lone trees can be shaken (E / A): they shiver, drop a handful of leaves, and sometimes a sparrow bursts out. Walking through the dry field flushes grasshoppers ahead of you.
- **Sizing:** on a phone held upright the camera comes in to about eleven tiles across, so Wren reads as a person. Text types a little quicker (55 characters a second by default). On small screens the goal card steps aside while narration is up.
- **Trees:** the lone trees are fuller, with a flared trunk and bark.

## The opening (prologue.js)

A new game opens with the drive up the hill, rendered live in the engine, about 43 seconds long and skippable (Skip, Esc, Enter or Space):

- Letterbox bars slide in over morning mist on the woods. Dad's old teal wagon, with flattened moving boxes strapped to the roof, comes out of the trees and winds up the road through the long grass, kicking up dust.
- In the top bar, the phone's signal drops one bar at a time as the road climbs, and reads *No Service* at the crest.
- The camera rises over the gate, past the lavender. Car doors thunk. Dad walks up the path carrying a box, and Wren follows and stops by the porch swing. Gran's straw hat is still on it, there's a quilt over one end, the wind chime rings, and the jars wait in a crate by the door.
- A rip of packing tape comes from inside, then fade to black and *Chapter One · No Signal*.
- The captions are the novel's own first sentences: the forgotten hill, then Gran not dying, then the herbs. Chapter One then continues with the signal. Any line the opening already showed is not repeated, but it is still added to the Story tab. If you skip early, the missed lines play as normal narration, so the canon order holds.
- Gran's porch (deck and steps, swing, rocker, jar crate, wind chime, herb pots, watering can, bird feeder) stays in the world for the rest of the game.
- The engine gained a camera zoom (`G.zoom`) for this, and the prologue drives it.

## Things that want doing (polish pass 5)

Nothing in the game tells you to do these. They are just there, the way they are on Gran's hill:

- **Gran's herbs:** her watering can sits by the tap, empty. Fill it at the tap, then water the limp basil and thyme on the porch. They stand up green and flower, and there's a slip of paper under the second pot in her hand.
- **The feeder:** a coffee can marked BIRDS sits in the shed. Fill her empty feeder and a flock of sparrows moves in and stays.
- **The swing:** you can sit on it. Stay still and the world comes to you.
- **The crate of jars:** this summer's peaches, a keepsake with the science of canning (heat, then the vacuum seal that makes the *pop*).
- **The power, cut for the sale:** the light switch clicks and nothing happens. An outlet shows four percent and nowhere to plug in. The fridge stands silent. In the cellar the bulb's string clicks too, and the phone dies right then: that's why it is dark. An eye in the HUD opens as your eyes adapt, and opens faster while you stand still.
- **Music for moments:** key items get a fanfare (a rising shimmer, a climbing figure on strings over soft brass, and a ringing chord). Small secrets get their own bright jingle.
- **Help that doesn't nag:** if a while passes with nothing new, gold rings pulse out from the next goal with a soft chime. The shed parts (bungee on its peg, wire coil, tape on the bench) are drawn and glint, and the objective says where they are.
- **Fixes:** the lens closes with a tap anywhere or with a Look up button on touch screens, so phones can't get stuck. The 3D inspect models no longer render inside-out: every triangle's normal now faces outward from its shape, and big faces are tessellated so they sort correctly. The book and the scooter were rebuilt with much more character.

## The inspect renderer, v2

- **Smooth shading:** curved parts (lathes, tubes, spheres, blobs) get per-vertex normals and are filled with a gradient between their vertex shades. Flat parts stay crisp. Shared vertices are lit once per frame.
- **The room in reflections:** shiny materials reflect a warm lamp-lit room above, a dark floor below and a bright window, so brass, chrome, glass and gilt read as metal and glass.
- **Procedural surfaces:** leather (pores and hand wear), gilt page edges, brushed and knurled metal, chalky aged plastic, grip-tape grit, wood grain, bark, end-grain rings, granite, moss, gingham, handwritten labels, marbled resin, fresnel lens rings and kraft paper.
- **Detail and ornament:**
  - Gran's book: a double gold-tooled border with curling corners, raised spine bands with gold rules, a spine title panel, riveted brass corners and a silk ribbon.
  - Jars: pressed-glass shoulders, threaded necks, knurled bands, gingham cloth caps tied with twine, and handwritten labels.
  - The lantern: a chrome bezel, guard cage, fresnel lens, wooden crank knob, solar panel and Gran's label.
  - The phone: rounded aluminum with a camera bump and the water drop over a lens.
  - The fountain pen: marbled resin with gold bands, clip and nib.
  - The log: bark furrows, year rings, bracket fungus and seedlings.
  - The rock: a noise-displaced stone with cushions of moss.
- **Decal bias:** thin layers such as screens, labels and tooling always draw over the surface they sit on.
- **Speed:** while the inspect view is open, the world behind it stops rendering.

## Light that behaves like light (renderer pass)

- **Cast shadows that follow the sun:** everything that stands up (buildings, lone trees, props and every character) is laid down again as a silhouette, sheared along the sun's direction. The sun moves through the day: long shadows to the west at dawn, short at noon, long and east at golden hour, and faint under the moon. A per-object height factor keeps rooftops, which read as depth from above, from throwing absurdly long shadows. All shadows render into one quarter-resolution layer, so their edges are soft and overlapping shadows don't double-darken. That layer is tinted cool blue by day, violet at golden hour and deep navy at night. It switches itself off if the frame rate is struggling.
- **Rim light:** characters catch the sun on the edge that faces it: warm gold at golden hour, pink at dawn, cool blue under the moon.
- **Reflections:** anyone standing by the pond shows in it upside down, trembling with the water.
- **Morning dew:** at dawn and in the morning, drops in the grass catch the sun and flash as you walk past.
- **Sharper art:** people and small things are painted at 8 pixels per world unit, crisp on retina screens. Lone trees keep only a small contact shadow, since the sun now casts the long one.

## Life (life.js)

The small motions that make a person a person:

- **Faces:** eyes look at things (whoever's talking, whatever just caught their attention, you when you come close). Moods show for a beat: pleased when something becomes yours, wide-eyed when Mo speaks, a worried brow when the reasonable voice starts, a set jaw. Each spoken line carries its own expression, both on the map and in the dialogue portrait, and mouths move while lines are said.
- **Bodies with weight:** a squash on each footfall, a stretch as they set off, a lean into the run, a settle when they stop, a pop when they turn. Wren shivers in the cold dark of the cellar.
- **Left alone:** Wren looks around, glances at nearby things, and then by habit holds the phone up hunting for a bar (the screen lights the face, and a bubble shows no bars). Later comes a yawn. Beck can't keep still: weight shifting from foot to foot, the odd hop, a grin when you come close. Dad sighs over the boxes, and sleeps with z's drifting up.
- **Bubbles:** ! when something comes into reach for the first time, a note when you hum on the swing, … for a yawn, z's for sleep, crossed-out bars for no signal.
- The sprite cache is capped, and faces seen from behind collapse to one variant, so memory stays flat over a long session.

## Moments, progress and saving (progress.js)

- **Moments:** 20 achievements covering the story's turns (the dark giving things back, the lantern, borrowed sunlight, the next hand), the small things seen, the kindnesses (herbs, sparrows, the swing, two summers in glass), and the playful ones (shake five trees, 25 grasshoppers, stand still enough for a butterfly, the moon in the pond, checking for a signal five times, walking the whole hill). Locked ones show only a hint. Each unlocks with a banner that drops in and a gold medallion that spins up, with a jingle quoting the first bars of Gran's theme. They live in the book under Moments, beside a progress ring.
- **Progress:** one honest percentage, blending the story, the keys, the small things seen and the Moments. A "+n%" floats off the book button whenever it rises.
- **Saving:** a little sun turns in the corner on every save. A snapshot of the scene goes on the Continue card, along with the day, chapter, percentage, play time and Moments.
- **Small wins:** when a goal is done it's struck through and ticked, with a pen-tick sound, as the next one arrives.
- **Music that grows:** early on, the generative piano plays alone. Past 30% a warm pad comes in under it. Past 55% a second voice answers a third above. Past 75%, now and then, the phrase is Gran's theme itself.
- Saves from before Moments existed are credited quietly on load, so there's no banner storm.

## One thing at a time (phone layout)

- The top-left is for the goal card. One transient line at a time sits just below it (a place's name, or a new goal), and a new goal waits for the place name to finish. While a place name is up, the goal card steps aside.
- On phones the goal card already shows the current step, so the goal pill appears for a few seconds when it changes, then gets out of the way.
- The transient line goes in whichever half of the screen Wren isn't in.
- Sound captions, notes and goal ticks stack above the prompt, clear of the thumbs. On desktop the caption sits above the prompt's line.
- The camera knows where the HUD and touch controls are. It keeps the player in the open part of the screen and runs past the edge of a room when needed, so Wren never stands hidden under the UI.

## The gold thread, and the wisps (guide.js)

- **The gold thread:** slime molds really do solve mazes. They send threads out everywhere, then thicken the ones that reach food and pull the rest back. When you're lost, a thread of that gold grows from your feet. It sends out exploring tendrils, the true path (real breadth-first pathfinding across the map, through the right door when the goal is in another room) firms up and wanders like something alive, and beads of light run along it to a slow bloom at the goal. It's gold paint in daylight and light in the dark. It comes by itself after about 20 seconds without progress (once per goal), or when asked: press H, or tap the goal card. Nothing ever says where it comes from.
- **The wisps:** small lights hover over everything you can act on. They breathe, brighten as you approach, have three motes circling them, and bloom into a ring when you're in reach. They're gold for the story's things and moonlight blue for the kindnesses nobody asks for. Green motes rise from the ground where a small thing is waiting for the lens. They replace the old four-point twinkle and the stuck rings.

## The cellar (cellar.js)

- **Beams:** three old timbers cross the ceiling, with grain, nails and a cobweb. The foxfire lives on them, and a beam thins when you pass beneath it.
- **Foxfire, rebuilt as mycelium:** long, gently wandering hyphae that keep to the wood and branch at shallow angles, with strands let down into the air below. Beads of light stream along the veins and, every 40 seconds or so, slow, stop and pour back the other way. That is shuttle streaming, which is what a real slime mold's cytoplasm does.
- **Daylight down the steps:** "the daylight from the little doorway reached maybe four of them". A pale slanted shaft with dust turning in it, and a little gray light on the bottom steps.
- **The lantern throws shadows:** each shelf, the log and the apples cast a hard shadow away from the flame (real point-light shadow volumes cut back into the darkness layer), sliding as the light moves. The shelves themselves stay lit on the side that faces it.
- **Jars waking in the light:** near a flame each jar glows through the glass (plum, peach, blackberry dark as a bruise), with a glint on its shoulder on the side facing the flame.
- **Breath:** it's cold enough to see it, wherever there's light to see it by.
- **The pool:** drips land and rings spread, and the foxfire trembles in the water.
- The beams are baked once and the jar list is precomputed, so the cellar runs as fast as before.

## The hill answers back (toys.js)

Nothing here is story; all of it is a reason to wander off the path. One
roaming E spot (`toy: true`, so no wisp and no idle glance) sits on whichever
toy is nearest.

- **Dandelion clocks** in the field: brushing one shakes a few seeds loose, a
  strong gust takes one or two, and E ("Make a wish") blows the whole head in
  the direction you face. The seeds ride `G.gust`. Heads grow back after
  about a minute.
- **Windfalls**: apples under the lone trees, pinecones on the leaf litter
  at the edge of the woods. Walk into one and it is kicked along your
  velocity, hops, rolls, bounces off anything solid, and slows faster in
  long grass than on the lane. One that reaches the pond goes in with a
  plop, a ring and a splash, and quietly reappears under its tree later,
  out of sight.
- **Skipping stones** from any bank tile of the pond: each touch leaves a
  ring and a note a little higher than the last, a count rises off the
  water, and five or more earns a sparkle. Your best is kept.
- **Bees** work the lavender, scatter when you push through, and come back.
- **Fireflies** at dusk and night drift toward you if you stand still. Cup
  one (E) and it glows in your hands, lighting the dark around you (a real
  light in the light layer), until you let it go.
- **The long grass remembers**: a pressed-flat trail follows you through
  the field and fades over half a minute.
- Four new Moments: *Five Wishes*, *Kerplunk*, *Five Skips*, *Light in Your
  Hands*. Reduced motion turns all of it off.

## Direction (stage.js)

Where the camera stands while the story is told.

- **Two people talking:** when a scene starts and someone else speaks (Dad,
  Beck, the foreman), the camera frames the two of you, sitting high enough
  to clear the dialogue box, and eases in a little (1.16×, 1.12× on phones).
  Thin letterbox bars come in and the HUD dims. Wren and the speaker turn to
  face each other once, unless the speaker is scripted to move. When the
  scene ends, the frame glides back to the player and lets go.
- **Mo:** a slower, closer drift and the same bars, with nobody else in the
  frame.
- **Previously:** continue a save more than four minutes old and, before
  play starts, a card reads back the last two story lines in the novel's own
  words (the same short forms as on screen), the chapter, and where you were
  going. E, Enter or a tap dismisses it. Each save is stamped `savedAt`.
- The engine owns nothing new: this module borrows `G.camFocus` and `G.zoom`
  only during walk-mode scenes, and never during the opening or the title.
  Reduced motion skips the reframing, the zoom and the bars.
