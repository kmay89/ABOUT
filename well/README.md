# ⊔ well

**A falling-blocks game that is as absorbing as the classic and kinder than any
version of it.** The rules are the modern ones experts know — seven pieces, a
fair shuffled dealer, wall kicks, a forgiving lock, Keep, previews, and the
scoring that makes a four-line Quad and a Twist worth chasing. Everything you
see and hear is our own: pieces are fused bodies of glass, stone or paper in a
lit shaft, every move is a note in the key of the world you're in, and clears
land on the beat. Ten worlds take you down the well, from Dawn to the Starfield
at the bottom, and back up to the surface.

No accounts, nothing tracked, works offline. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## What's here

```
index.html     markup, the room's tokens and component kit, the icons, every sheet's shell
look.css       the house style, shared with the other new rooms (never edited here)
rules.js       the rules as data: shapes, kicks, the speed curve, the score table
engine.js      the game itself — pure, deterministic, and the auto-repeat timer too
bot.js         a player for the splash and the tests
modes.js       Descent, Steady, Drift, Forty, Three Minutes, the Challenges, well codes
records.js     personal bests, medals, Stones, the run card
worlds.js      the ten worlds' look, as data
skins.js       the six skins and the colour-safe palette, as data
layout.js      where the well goes on any screen
prefs.js       settings, and the only code that touches storage
sky.js         one shader for every world's backdrop, and a 2D painter for each
gfx3d.js       the WebGL2 renderer
gfx2d.js       the Canvas2D renderer, for everywhere WebGL isn't
music.js       generative music and every sound, synthesized
input.js       keys, touch gestures, the button tray, controllers, haptics
learn.js       the explainer — and its tables, measured from the game as it opens
coach.js       the lessons and the silt wells, with Hint and Show me for every one
steady.js      Steady's quiet flow: the entry card, the timer, Breathe, the close
sheets.js      Settings: one sheet, a short first page and a few pages under it
guide.js       first steps, a move to try, the practice well and the Moves page
app.js         the loop, and everything that joins the rest together
sw.js, manifest.webmanifest, icons/
```

## Ways to play

Every mode, world and skin is open from the first launch; nothing unlocks
anything.

- **Descent** — ten depths of twenty-five lines, one world each, from Dawn to
  the Starfield, and then the Surface. Three paces, each with its own best:
  *Gentle* (the first run) never falls faster than about two rows a second
  and drains a full well instead of ending; *Standard* runs from a row a
  second to about fifteen; *Swift* starts where Standard's sixth depth does.
  After a top-out at Standard or Swift you can begin again from the depth you
  reached, and the run card says "with 1 rest" as a plain fact.
- **Steady** — a quiet twenty minutes (or ten, fifteen, twenty-five, or no
  timer), slow and even, with no words on screen while you play. More on it
  below.
- **Drift** — endless play in chapters of 40, 100 or 150 lines, at a tide you
  set and that never moves on its own, in any world. A chapter's end stills
  the well and asks: Rest, or Continue on the same board.
- **Forty** — forty lines (or twenty, or a hundred) against the clock at a
  fixed, gentle speed, with medals from Pebble to Glass for the forty.
- **Three Minutes** — as many points as feel good in three minutes, the speed
  rising with the lines.
- **Challenges** — six lessons in a suggested order (Fewest Moves, Keep and
  Look Ahead, Clean Stacking, the Twist Slot with five wells of our own, Build
  a Slot, Freestyle Twists) and two silt wells to dig out, each with Hint and
  Show me from the first second.

In Descent and Drift every line you clear lights a bead on the well's rim.
With ten lit, **Breath** (the round button beside the score, there from the
start and lighting up once it is ready, or B) spends them, and gravity and the
lock rest for ten seconds — one long breath — while everything else carries
on as usual. The first time it is ready, the next depth's name says so in one
quiet line, never mid-move; the explainer has the details.

Every run has a six-character **well code**. Type one into Modes and you get
the same pieces its player had, in any mode, on any day. The run card has a
quiet link that copies a one-line summary with the code in it; nothing ever
asks you to share.

Pausing never resumes by itself — not after a call, a switched tab or a
closed sheet — and resuming holds gravity for 600 ms so the first thing after
a pause is a decision (the races hide the board while paused and give a calm
Ready instead). Leaving Descent, Drift or Steady saves the run quietly,
and the splash offers Continue; while a Descent is saved, the splash's own
door carries it on rather than starting a fresh one beside it (beginning
again is a choice made in Modes). A sheet chosen from the pause menu goes
back to the menu when it closes, with the focus where it was, so changing
two settings never means finding the pause button twice, and Escape never
resumes play from under a settings sheet. A run ends on "The well rests.",
with Done holding the focus and no countdown to another go. After half an
hour of play (the time is yours to change, or turn off) a small note at the
next natural stopping point suggests resting your eyes, and then stays quiet
for at least another half hour.

## How deep, and how long

Any game with an end owes you two answers: how far is it, and how long might
it take? This one gives both wherever they help, and never during play. Descent is ten depths of twenty-five lines, one world each, from Dawn to
the Starfield and back up to the Surface — 250 lines — and **the way down**,
a thin rail of ten nodes lit in each world's own light, shows where you are
on it: under the splash's Continue, in the HUD as "Depth 5 of 10", on each
depth's banner, on the pause sheet, the run card and in the Logbook, and as a
plain list on the explainer's How page.

How long is an estimate, and it says so. Before you have played, it comes
from a prior: a few seconds a line at each pace and depth, so a first Gentle
descent reads "about 15–30 minutes", a range, because nobody's pace is known
yet. As you play, the time each clear took is added to a small tally for that
pace and depth (`records.pace` — milliseconds and lines, nothing else, halved
whenever a depth passes 150 lines so that recent play counts most), and the
estimate becomes your own: the prior is shrunk toward your pace by how many
of your lines it has seen, and once twenty-five of them are in, it reads as a
single figure with "at your pace" after it. Someone who never hard-drops and
takes forty-five seconds a line is told, honestly, "about 2 hours 10
minutes", rather than a number that was true for somebody else. The wording rules are strict:
always "about", ranges until it knows you, rounded to the nearest five
minutes, "a minute or two" under ninety seconds, hours in words, never a
countdown, never seconds, never a comparison with anyone, and nothing at all
at learner speed. Estimates are worked out when a sheet opens and never tick
while you read them. The deepest depth reached at each pace (`records.deep`)
is kept beside it, for the Logbook and the Modes card.

## Learning the moves, on the well itself

`guide.js` teaches every move for the hands in use — gestures, the button
tray, a keyboard, or a controller — and it teaches on the real well rather
than on cards. On the very first run, **first steps** hold gravity still and
ask for one move at a time: move, turn, drop, then Keep. Each step is done by
doing it, says "That's it.", and moves on; any step can be skipped, and the
pause sheet has "Skip the first steps". The words are the device's own: a
flick on glass, ⤓ on the tray, the bound key on a keyboard, D-pad up on a
pad, with the controller's own glyph letters but never its brand.

After that the guide only notices. It counts, per kind of hands, how many
pieces have gone by since each move was last used, and how many runs used it
— small capped numbers in `prefs.guide`, no timestamps, no record of any
run, on this device only, never sent anywhere. When a move hasn't been used
for a while (thirty pieces without a hard drop, say, on a Gentle descent
that never ends), it may offer **a move to try** — at a boundary only: the
pause sheet you opened, the run card, a Drift chapter's rest, and for Drop
alone one line in a depth's banner. One move per run at most, a move offered
in three runs at most, "Not now" twice retires it, and it is never offered
in Steady or a lesson. Every offer has "Try it", which opens the **practice
well**: a hidden mode with gravity held, no records, no Stones, no save, and
the move done a few times; then back to wherever you were. Settings has a
**Moves** page with every move for the device in hand, why it's worth
knowing, Practise for each, the first steps again, a switch for the offers,
and a button that forgets everything the guide noticed.

## One Settings sheet

Settings is one sheet: a first page that fits a phone screen — Sound on or
off, then Controls, Moves, Look, Sound and Comfort — and a short page under
each, with the deeper words (the repeat timer and its friends) a page further
down where they can be named plainly. Every control says in one line what it
does; every page can put itself back to the defaults, with an Undo for a few
seconds and no "are you sure". The settings that belong to a mode live with
the mode: Drift's world and hidden score on its card and its pause sheet,
and Forty's "warm the rim when I'm ahead of my best" on Forty's card. On a phone it is a bottom sheet you can
swipe away; on a desk, a two-column panel.

## A room lit by its world

The chrome takes its light from the world you are in. Each world has a key
light and a rim light, and the room's tokens follow them (`tint()` in app.js,
set on every world change and never animated): the primary button is a
"pearl" filled with the key light and lettered in the room's darkest ink, the
chosen thing in any control is the rim light softened toward white, and every
sheet is a dark glass faintly washed with the sky's horizon. The checked
contrast holds in all ten worlds. Steady's entry card lights the room in the
world you pick before you begin, so its Begin is already that world's light.

Behind every open sheet sits a **frost plate**: one 32-pixel-wide snapshot of
the live picture, taken in the frame a sheet opens and scaled up, so the
world shows through softly without `backdrop-filter` (a blur over a WebGL
canvas costs a full-screen pass every frame). It is taken once per opening,
never on a timer; the races show the sky alone while paused, so the board
stays hidden; and with reduced transparency the sheets are simply solid.
Names, titles and the large numbers are set in the system's serif (New York
on Apple devices), everything else in the system sans, all in sentence case,
with icons drawn as one inline sprite rather than font glyphs.

## The pieces are fused, and the look is ours

A piece here is one object, not four squares glued together: rounded where it
meets open space, seamless where its own cells meet, with no outline or bevel
inside it. The engine remembers which locked piece every cell came from, so the
renderer can keep each one whole, and when a line clear cuts a piece in half
the two halves become two smaller bodies rather than a row of tiles.

That one decision does most of the work of making the game look like itself.
The rest is a list of things deliberately not done: no flat bright squares on
black, no boxed "next" column, no grey rows at the end, no colour change when a
piece locks. The previews drift above the mouth of the well (down its right
side on a wide screen), Keep is a niche cut into its rim, and the colours are
six skins of our own, each checked so
no piece sits near the colour the genre traditionally gives it, nothing is a
saturated red, and every pair stays distinguishable under three kinds of colour
blindness.

## Twenty-two rows

Most games in this family use a well 20 rows tall. Ours is 22: two extra rows of
headroom make a calm game a little more forgiving, and a 10 × 22 well is the
shape of a phone held upright. Width is what shapes strategy, and the width
hasn't changed, so line clears, scores and the forty-line race work exactly as
they do everywhere else.

## The dealer never looks at your board

Pieces come in shuffled sets of seven, each holding exactly one of every shape,
so at most twelve other pieces can come between two long straight ones. The
shuffle is seeded, which is what makes a **well code** possible: six characters
that give anybody, on any day, the same pieces you had. There are no mercy
pieces and no cruel ones, because the dealer is never shown the board. A game
that quietly fed you the piece you needed would be a game whose good moments
weren't yours.

## A lock you can see

When a piece lands it has a moment before it locks — half a second in the
races, at Standard and Swift and in the silt; three quarters at Gentle; a full
second in Steady, Drift and the lessons — and every move or turn gives it that
moment back, fifteen times, after which it locks the moment it rests. Dropping
to a new lowest row refills all fifteen. That rule is the
difference between a game that punishes hesitation and one that lets you
finish a thought, so it is drawn rather than hidden: a thin light under the
piece drains as the wait runs out.

Press G (or View on a controller) and the **Glass Well** shows the rest of the
machinery on the live game: what's left in the current set of seven, the
fifteen reset pips, the auto-repeat charging, the fall speed in seconds a row,
and after every clear the sum that scored it.

## You play the music

Every move is a note. Each world has its own key and a five-note scale with no
clashing intervals in it, so anything you do is in tune with everything else.
Touch sounds — a move, a turn, a lock — play the instant you act. Rewards wait
for the beat: a clear plays a soft shimmer at once and its bells on the next
line of the musical grid, never more than 120 ms away, which is how a run of
clears turns into the world's melody. Moving from one depth to the next changes
key at the next bar, on notes the two worlds share, so it blooms rather than
jolts.

## Juice, with governors

Effects grow with the rarity of what you did and then stop growing: a Single
glows and dissolves, a Quad fuses into one band of light, and an Empty Well —
the rarest thing in the game — is answered with stillness, one slow breath of
light and no shake at all. A controlled study found medium and high amounts of
this kind of feedback beat both none and an extreme amount, so the ladder is
capped, and a set of governors sits on top that nobody can switch off:

- **a flash governor** — every clear glow is treated as large, and any change in
  brightness big enough to count as a flash is limited to two a second, each
  rising and falling slowly. There is never a full-screen white frame;
- **no saturated red** in any large effect;
- **readability** — the active piece, its landing light, the previews and Keep
  are drawn above every particle and every bloom, and are never dimmed;
- **no random shake**, anywhere; the well nudge is one direction and a spring,
  and it is off under reduced motion and in the calm modes.

## Steady, and exactly what it doesn't claim

Steady is twenty quiet minutes: slow, even gravity, nothing sudden, no score on
screen and no words during play, a soft timer that never interrupts a piece,
and at the end an offer of a minute's breathing and an easy way to stop. You
can hide the landing light (Mind's eye) or play in silence. The entry card
says when the soft chime will come, on your own clock, and none of the
guide's captions, offers or estimates ever appear in a Steady session.

What it doesn't do matters more. It makes no health claim, anywhere. It never
asks anyone to recall anything, keeps no diary, asks no questions about how you
feel, and records nothing about why you play. *well* has never been tested in
any study, and the explainer's page on the research says so, says what the
studies actually did and didn't show, and lists who to talk to if things feel
heavy. That page is the only place the game and the research meet.

## What it refuses

No streaks, no daily anything, no random prizes, no ads, no accounts, no
purchases, no grinding to unlock (everything is open from the first launch),
no rigged dealer, no "So close!", no auto-restart or countdown to another go,
no notifications, no "game over", no buzzers or alarms, no secret difficulty,
no leaderboards, and nothing tracked. Runs end with "The well rests.", and the
button with the focus is Done. The explainer's last page lists each refusal
with the reason for it.

## Explaining itself

The explainer's "How it works" page doesn't quote its numbers, it measures
them. When it opens it builds small hidden wells with the real engine and plays
them — a Quad, a quiet piece and a Twist Double at level 3; four Singles in a
row; a piece left on the floor until it locks; a piece shuffled sideways until
its resets run out; three turns that need a wall kick — and prints what the
scorer paid and what the clock said, with a tick beside every number the game
just confirmed. The speed table is read from the engine one level at a time,
the dealer deals fresh sets of seven on the page, and every mode's tuning is
read from the modes it actually runs. If anybody retunes the game, the page
retunes with it.

The lessons work the same way. Fewest Moves judges your presses against a
search of the real board rather than a printed table — on an empty well that
search reproduces rules.js's table of fewest presses, all 162 entries — and
Hint and Watch are there from the first second, costing nothing but a small
"with a hint" note.

## Why it's honest

The well's section of `tools/rules-check.js` runs the real engine in node and
holds it to the published rules:

- the kick tables, re-derived from their offset form, and the square that
  never moves when it turns; the spawn of all seven pieces; both Twist golden
  boards, including the fifth-test upgrade a half turn never gets;
- the scorer against four worked sums and the drop points, and an O into the
  last gap paying a Double plus an Empty Well;
- the dealer: the same seed dealing the same 100,000 pieces, one of each
  shape in every set of seven, and the twelve-piece gap that the rule allows
  actually happening;
- the auto-repeat, frame by frame at 30, 60, 120 and 240 Hz, newest direction
  winning, a slide to the wall at zero repeat, and the cut after a turn;
- all 162 fewest-press entries re-derived by search and pressed on the real
  engine; the lock's fifteen resets, the refill on a new lowest row, and the
  wait counted to the millisecond;
- the drain keeping the surface you built, Breath freezing gravity and the
  lock, and silt arriving one hole per row from a stream of its own;
- every Twist Slot well reachable from spawn only by a turn and scoring a
  Twist Double;
- nothing ever appearing or vanishing across 60 random games and 1,500 of the
  bot's pieces; identical event streams from identical inputs, from a save
  restored mid-run and from a clone; sixty wells of every control pressed in
  random order without a throw or an overlap;
- the speed curve and Three Minutes' level rule, every mode starting a game
  that plays, the medals, the bot clearing forty lines on at least nine seeds
  in ten, a thousand pieces of Drift without the well filling, and well codes
  surviving the trip there and back, read aloud or typed by hand.

`tools/well-check.js` checks the promises that break silently: no borrowed
names or labels anywhere in what ships (the scripts are lexed, so only the
explainer's strings may name the original, and only with the ®), the credits
and footer wording, no health claims, every skin through the palette lint
(its colour maths first reproducing the published figures), every world's sky
too dark to flash, the help lines checked within the year, the estimates'
known values, and an offline shell that loads all twenty scripts in order
and caches every one of them. `tools/guide-check.js` holds the guide to its
manners in node: never an offer in Steady, a lesson or practice, one move a
run, "Not now" twice is final, and every line it can say short and plain.

The scripts load in one order, the same in index.html, the service worker
and the checks:

```
rules.js engine.js bot.js modes.js records.js worlds.js skins.js layout.js prefs.js
sky.js gfx2d.js gfx3d.js music.js input.js learn.js coach.js steady.js sheets.js guide.js app.js
```

and the service worker's cache is `well-v5`, so an installed copy picks up the
new files whole rather than half.

`tools/open-check.js` opens the room in a real browser twice — the WebGL2
well (through `?gl=soft`, a test hook that lets the 3D renderer accept the
software GL a GPU-less machine has, which it refuses on purpose everywhere
else) and the 2D one (`?gfx=2d`). Each time it enters the well, taps the
board, opens every sheet the pause menu reaches (and checks that closing
each one brings the menu back), and fails on a console error, on the other
canvas showing, or on a board that isn't actually drawn.
It also watches the splash's demo for ten seconds, sampling the brightness of
the whole canvas, the well and every patch of about 150 px, and fails on more
than two opposing swings in any second — or if the page drew too slowly to
tell.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/well/
```

```
node tools/rules-check.js
node tools/well-check.js
node tools/guide-check.js
node tools/room-parity.js
node tools/open-check.js well     # opens it in a real browser and plays it
```

*well is an independent falling-blocks game. Not affiliated with or
endorsed by The Tetris Company. Tetris® is a registered trademark of Tetris
Holding, LLC.*
