# ⊔ The Well

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
index.html     markup, the room's colours, and every sheet's shell
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
coach.js       the lessons: Fewest Moves, Keep and Look Ahead, Clean Stacking, the Twist Slot, Silt
steady.js      Steady's quiet flow: the entry card, the timer, Breathe, the close
sheets.js      the Look, Handling, Sound and Comfort sheets
app.js         the loop, and everything that joins the rest together
sw.js, manifest.webmanifest, icons/
```

## The pieces are fused, and the look is ours

A piece here is one object, not four squares glued together: rounded where it
meets open space, seamless where its own cells meet, with no outline or bevel
inside it. The engine remembers which locked piece every cell came from, so the
renderer can keep each one whole, and when a line clear cuts a piece in half
the two halves become two smaller bodies rather than a row of tiles.

That one decision does most of the work of making the game look like itself.
The rest is a list of things deliberately not done: no flat bright squares on
black, no boxed "next" column, no grey rows at the end, no colour change when a
piece locks. The previews drift above the mouth of the well, Keep is a niche
cut into its wall, and the colours are six skins of our own, each checked so
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

When a piece lands it has half a second before it locks, and every move or turn
gives it that half second back — fifteen times, after which it locks the moment
it rests. Dropping to a new lowest row refills all fifteen. That rule is the
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
and at the end an offer of a minute's breathing and an easy way to stop. Some
studies of intrusive memories used a game in this family as one part of a
guided, supported procedure, playing for about twenty minutes with the landing
guide hidden and the sound off; Steady offers those settings as ways to play,
and nothing more.

What it doesn't do matters more. It makes no health claim, anywhere. It never
asks anyone to recall anything, keeps no diary, asks no questions about how you
feel, and records nothing about why you play. The Well has never been tested in
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

`tools/rules-check.js` holds the engine to the published rules: the kick tables
re-derived from their offset form, the spawn and both Twist golden boards, the
scoring vectors, the dealer's determinism and its twelve-piece bound, the
auto-repeat timing frame by frame, the fewest-presses table, the lock's reset
cap, the drain keeping your top surface, and every lesson board's intended
placement being reachable and scoring what it says.

`tools/well-check.js` checks the promises that break silently: no borrowed
names or labels anywhere in what ships, the ® where the explainer has to name
the original, no health claims, every skin through the palette lint, every
world's sky too dark to flash, the help lines checked within the year, and an
offline shell that lists everything the page loads.

`tools/open-check.js` opens the room in a real browser twice — WebGL2 and the
2D fallback — plays it, opens every sheet, fails on any console error or a
board that isn't actually drawn, and samples the screen's brightness while the
demo clears Quads to make sure nothing on it flashes.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/well/
```

```
node tools/rules-check.js
node tools/well-check.js
node tools/room-parity.js
node tools/open-check.js well     # opens it in a real browser and plays it
```

*The Well is an independent falling-blocks game. Not affiliated with or
endorsed by The Tetris Company. Tetris® is a registered trademark of Tetris
Holding, LLC.*
