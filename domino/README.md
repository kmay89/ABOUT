# 🁫 The Domino Table

**Dominó, the way it is actually played.** Four seats, your partner
across from you, seven bones each and nothing in the boneyard. A real 3D
table (with a flat one that is not a consolation prize), an opponent who
counts what is left and remembers every *paso*, a coach who explains
what he can see and admits when he cannot, a rank to climb, and two or
four phones joined with four letters — or by pointing a camera at a QR
code.

No accounts, no server, no ads, nothing tracked. Installable, works on a
bus. Part of [The Solving Room](../). No libraries, no build step, MIT.

## The game

The partnership block game: a double-six set, four players, two
**parejas** sitting opposite their partner. 4 × 7 is exactly 28, so the
pile is empty by design — and that emptiness is the whole game. Nothing
is drawn and nothing is held back, so every bone you cannot see is in
somebody's hand, and you are allowed to work out whose.

The vocabulary is the table's, not a translator's: *la mula de seis*
opens the first hand, *paso* when you cannot play, *tranca* when the
game shuts, *capicúa* when you go out on a bone that would have fitted
either end, *zapatero* when the other side never scored at all.

Every house rule that tables actually argue about is a setting —
what a capicúa pays, whether the winner counts their partner's bones,
who takes a tied tranca, what you play to. The defaults are the common
Mexican cantina set.

**The table has a rhythm**, and that is a setting too. Three machines
deciding as fast as a machine can decide is not a game you can follow:
bones appear and you are left working out backwards who put them there.
So a turn is three beats rather than one pause — the seat whose turn it
is says it is thinking, the bone is carried to the table from that
seat's side and lands with a clack, and there is a moment to look at it
(it glows for a couple of seconds) before the next player starts.
*Relaxed* — about three seconds a turn — is the default; *Unhurried* is
slower still, *Brisk* is a table in a hurry, *Quick* is for when you
just want the hand over. A pass is two raps on the wood and a red
*¡Paso!* under that player's name, because at a real table that is how
you hear it.

**You are playing for two.** Your partner sits across from you, on the
plate at the top; the opponents sit to either side, where the play
actually goes round. Table talk is not allowed, so a pareja talks with
bones: the salida says what you are long in, every bone after picks the
number left showing, and a good partner feeds those numbers back and
takes away the other side's. The players at the table do exactly that —
they read what each seat has *shown*, not just what it has passed on —
and Don Chuy tells you when your partner has just asked for something.
When anybody is down to a bone or two, the table changes gear: an
opponent about to go out gets shut out at almost any cost, a partner
about to go out gets left a door. Your partner will thank you when you
feed them, and sigh when you hang them by mistake.

**Getting better is the point.** After each play with a real choice in
it, the room asks the strongest player at the table what it would have
done and grades yours: *Sharp*, *Good*, *Okay* or *Costly* — and for a
costly one, Don Chuy says what he would have played and why. Forced
plays are never graded. Every solo match is rated, the way the chess
room rates its games — see *The score*, below — and the record keeps a
handful of *logros* worth having done once. At the end of every hand
everybody's leftover bones are laid face up and counted, the way they
are at a real table.

**Two phones is the commonest table there is.** One phone taps *Host*
and shows four big letters and a QR code; the other points its camera at
the code (or taps *Join* and types the letters) and is sitting down — as
your partner, across the table, because two friends want to be a pareja
against the house. Empty chairs are played by the house, a third and
fourth friend can sit down mid-hand, and a phone that locks comes back
to the same chair and the same bones.

**The table is lit like a table**, which took three lights rather than
one. A single bulb overhead makes every top face the same white and
every side the same dead grey, and a bone with a grey side stops looking
like the same ivory as its top — so it reads as a card lying on a
photograph. There is a warm key from over the far shoulder, a cool fill
from behind you, and the felt's own brown bouncing back up: a side then
darkens *towards the colour of the cloth* instead of towards grey, which
is what it does on a real table. The bulb hangs off to one side so the
shadows fall towards you where you can see them, the pips are drilled
holes shaded across their bores rather than printed dots, and the bevel
is mitred at the corners so the silhouette closes.

No spinner and no branching. The line has two ends and only ever two
ends; doubles lie crosswise because that is how they lie, not because
they open a third road. Branching belongs to the five-up family — a
different game with a different heart.

## The score

The same engine the chess room uses to tell you whether you are getting
better, carried across to a table of four. `rating.js` is pure arithmetic
and `tools/calibrate.js` is where its numbers come from.

**A ladder you can measure.** Eight parejas sit at the cantina, each a
fixed recipe for the players in `ai.js`:

| | pareja | rating | recipe | accuracy |
|---|---|---|---|---|
| 🐣 | **Los Pollitos** | 400 | doesn't count, lots of slack | 76.9% |
| 🧢 | **Los Primos** | 502 | doesn't count, sheds weight and mulas | 79.1% |
| 🌮 | **Los Taqueros** | 550 | counts and partners — 45% of the time | 81.3% |
| 🎺 | **Los Mariachis** | 585 | the same, 70% of the time | 84.0% |
| 🍺 | **Los Compadres** | 645 | counts, hears every paso, plays for two, some slack | 84.9% |
| 🎩 | **Los Licenciados** | 693 | the same with no slack | 86.9% |
| 🦉 | **Los Viejos** | 739 | plays 90 imagined deals out before every bone | 91.0% |
| 🐍 | **Los Cabrones** | 842 | plays 1,200 out | 94.1% |

Your partner is always the same pareja as the one you face, so the one
seat that differs is yours. Recipes count imagined deals, never
milliseconds, so a rung plays the same on every phone, and every rung
plays the same bone for the same seed.

**Measured, not guessed.** Every pair of neighbours played 600 matches
to 100 — each deal twice, with the parejas swapped, so the cards and the
salida cancel out — and every step up the ladder clears its own
two-standard-error bar. The first ladder did not: a pareja playing for
each other with plenty of slack measured *level* with one that wasn't,
and the step from not counting to counting was a cliff wider than the
rest of the ladder put together. A `focus` knob — how often a player
actually brings their head to the table — fills it.

The chain is short, 400 to 842, and that is the truth about dominoes
rather than a flaw in the measuring: a match is seven or eight deals of
bones nobody chose, and the best pareja at the table still loses a third
of its matches to the next one down. The chess room shrinks its chain
because an engine never has an off day; this one is left as measured,
and the anchor at 400 is the one assumption.

**The number is Glicko, for a pareja.** A team is taken at the average
of its two ratings, so a match moves your number about half as far as a
chess game would — half your side's play wasn't yours — and the update
carries that half through the formulas. A newcomer starts at about 600
with the score marked provisional (*~600?*) until it settles, no match
moves it more than 120, and time away makes it less sure rather than
lower. `rating-check.js` sits simulated players of known strength down
at whatever the room suggests: after forty matches the typical miss is
50–90 points.

**Help, kindly.** Hints stay free. A match you were helped through
counts for a little less — 92% of its weight per hint, never below a
quarter — in both directions. A match to 50 counts for 60% of one to
100. Starting again is free unless the rated match was already lost
(two hands in and more than half the target behind); then the room says
so and asks first.

**Accuracy.** Every play with a real choice is read by the reviewer in
`ai.js`: the hand played out from every bone you could have put down,
the same imagined deals for each, from a seed — the same position always
gets the same verdict. A play is scored by how much of your chance it
kept (lichess's curve), the match blends a weighted and a harmonic mean,
and the calibration's own accuracies become the table behind *"you
played like about 660 today"* — held to 300 above the pareja you played,
because a clean match against Los Pollitos is not a master's. Forced
plays are never counted, and fewer than eight real choices gives no
number at all. The per-play verdicts (*Sharp* ≥ 90, *Good* ≥ 72, *Okay*
≥ 45) sit on the same scale, so they can never disagree with the number
at the end.

**Three stars a rung**, as in the chess room: ★ win; ★ win without a
hint; ★ win without a hint at 80% accuracy — the one a lucky deal can't
hand you. Titles are a cantina's: *Mirón*, *Novato*, *Aprendiz*,
*Jugador*, *Buena pareja*, *Tahúr*, *Maestro*, *Leyenda* (beats Los
Cabrones more often than not). Each is said once, nothing is celebrated
while the score is provisional, and beating a pareja twice in three
meetings while 200 above it gets you told to try the next one up.

Matches with friends at the table are not rated: the ladder only
measures the house.

## What's here

```
index.html    markup + all styling (the cantina look)
app.js        the conductor: game flow, the tray, the settings panes,
              the join door, persistence, the frame loop
rules.js      the rules, complete and pure: legal moves, la salida,
              paso, tranca, capicúa, the count, the match, and the
              public view a seat is entitled to
layout.js     where the bones lie: the serpentine that folds when the
              line runs out of table, worked out rather than fudged;
              also the hand along the bottom, shared by both renderers
ai.js         the three at the table: a belief matrix over the unseen
              bones, void-tracking from every pass, partner-aware
              heuristics, and determinized rollouts for the hard tiers
coach.js      Don Chuy — turns the AI's own recorded reasons into
              sentences, and never says "they passed" about something
              nobody heard
skins.js      the look as data: eight tables, seven materials, six
              patterns, share codes, and hostile-input guards
gfx3d.js      raw WebGL 1: chamfered bones, a generated pip atlas, one
              warm bulb, an orbit camera that frames the whole line
gfx2d.js      the canvas twin — the safety net, the small-phone option,
              and the painter of the hand in *both* modes
sound.js      the clack, the knock on the wood for paso, the shuffle —
              all synthesized on the spot, nothing to download
rating.js     the score: the ladder of parejas as measured recipes,
              accuracy, and Glicko for a pareja. Pure arithmetic
career.js     the rest of the record — counts and logros
room.js       the shared front door: four-letter room codes over the
              site's mailbox, the link heartbeat, the healing loop.
              Byte-identical in every game folder here
net.js        four seats over WebRTC: a star with the host at the
              middle, and per-seat views so hands stay secret. Sitting
              down is four letters; a chair that drops comes back to
              the same seat, because a seat is remembered by name
sw.js         offline shell + update notice (bump VERSION on release)
manifest.webmanifest, icons/
tools/        dev-only, never shipped — see below
```

## Three things worth explaining

**The hand is drawn in 2D even in 3D.** The table is WebGL; the seven
bones along the bottom are drawn by `gfx2d.js` onto a transparent canvas
over the top. That is not a shortcut. It keeps the bones you are about
to tap crisp at any pixel ratio, which a perspective camera cannot
promise, and it means the tap target is *identical* in both renderers —
same geometry, same hit test, one code path. It also halves what the 3D
path has to do.

**Hands are secret, and that is a networking problem.** HIVEMIND
broadcasts one shared colony to everybody; the chess room's two players
can both see the whole board. Neither survives contact with dominoes,
where the entire game is that you cannot see the other three hands. A
single shared snapshot would put all four hands on every phone at the
table — not visible in the interface, but sitting in the message log of
every device, readable by anyone who opened a console.

So the host never broadcasts the game. It sends **each seat its own
view**, built by the same `publicView` the AI reasons from. The other
three hands never leave the host, so there is nothing on the wire to
find. `tools/net-check.js` proves it the strong way: it rearranges the
hidden hands among themselves and requires the message to come back
byte-identical. If it changes, it encodes the split; if it never
changes, it cannot.

**The coach only says what it actually knows.** The hint you are shown
is the reason the machine chose the move — `ai.js` records why it liked
a play, as tags, *while* it is deciding, and `coach.js` turns those tags
into sentences. Nothing is written after the fact.

That distinction has teeth. "Beto passed on fives" is something the
table heard; "Beto is probably out of fives" is something we worked out
from counting. The first version said the former whenever it meant the
latter — fluent, believable, and false 186 times in 2,808 hints. The
check now reads the sentences rather than the internals: any hint
containing the word *passed* must be backed by a pass in the record.

## Why it's honest

- **The rules are proved, not asserted.** `rules-check.js` replays
  thousands of hands and rebuilds the line from the move log
  independently of the engine's own bookkeeping — so if the open ends
  ever drifted from the bones actually on the table, it fails. It also
  checks that nobody ever passes holding a playable bone, that the
  twenty-eight are conserved every ply, and that the count is right
  every time.
- **Every bone faces the right way.** For the life of the room, every
  bone played on the right-hand end of the line was drawn back to front
  — its matching half facing out, its new number pressed against the
  bone it joined — in both renderers, and every geometry check passed,
  because a bone drawn the wrong way round occupies exactly the right
  rectangle. `layout-check.js` now reads the table the way a player
  does: for every pair of neighbours it finds the half of each that
  touches the other and requires them to show the same number. Put the
  old drawing back and it fails at once.
- **The round table is not a mirror.** The 3D camera looked at the
  layout from the side that turned it upside down: the line folded the
  opposite way from the flat table, and your partner's bones flew in
  from your own side of the table while yours arrived from across it.
  The 3D world is now the layout with y negated, done in one place, and
  the camera frames the line in the part of the screen between the seat
  plates and your hand instead of behind them.
- **The table cannot draw on top of itself.** The fold is the part that
  goes wrong, and it did: at a row spacing of 2, the first crosswise
  double laid after a corner landed on the corner bone, in about one
  long game in three. The spacing is now derived rather than chosen —
  see `ROW` — and 4,000 games at four different screen shapes produce
  zero overlaps and zero bones that move once they are down.
- **The players are measured against each other.** A strength ladder is
  the only honest test of a game AI: Compadre takes ~86% of matches off
  Novato, Maestro ~69% off Compadre, over 100 matches a rung with the
  seats swapped every other match and a two-standard-error bar. The
  partnership play — feeding, starving, blocking somebody about to go
  out — was measured the same way before it was kept: the same Compadre
  with and without it, 6,000 matches, 53–54% (±1.3). One piece of it
  *lost* matches when pushed harder, and stays a nudge.
- **So is the score.** `rating-check.js` checks the pareja Glicko
  against a second implementation written from the formulas, help
  weighed the same both ways, the caps, the stars and milestones said
  once, hostile saves — and simulated players found within forty
  matches. `calibrate.js` is not a check but the measurement; run it by
  hand when a recipe or the players change, and paste what it prints
  into `rating.js`.
- **And the rollouts are measured too.** The same player against itself
  with the search as the only difference: worth 63%. That check exists
  because the first version of the playout policy was mostly noise, and
  600 rollouts scored no better than 220 — the signature of a search
  with nothing to search with. A policy that goes blind again shows up
  there as a flat 50%, whatever the sample count.
- **A bone is checked for being a solid object.** `bone-check.js` walks
  the mesh in node — no WebGL involved — and checks each quad's corner
  order against its own normal: walking the corners must wind
  anticlockwise seen from the side the normal points. All eight side and
  chamfer quads were wound backwards, so back-face culling threw away
  exactly the faces meant to be seen and kept the ones meant to be
  hidden. From directly above a bone still looked like a bone; from the
  table's angle you saw *through* its edges into the far inner wall, as
  grey wedges hanging off both ends at once. Both ends is the tell —
  impossible for a solid box under any light, so the fault had to be
  winding rather than shading.
- **And for being closed.** The same file adds up (b−a)×(c−a) over every
  triangle: a surface with no holes sums to exactly zero, and a hole
  leaves twice its own vector area behind. The chamfers used to stop
  short of the bone's corners, so adjacent cuts met at a point with an
  open triangle between them — invisible at a hairline bevel, four
  notches with the felt showing through once the bevel was wide enough
  to see. Pairing up edges would be the obvious test and it is the wrong
  one here: the top face is deliberately two quads so each half can
  carry its own pips, and the resulting T-junctions are legitimate.
  Vector area does not care how a face is subdivided.
- **And for looking like one.** All of the above can pass while the
  table still renders as flat white cards, which is what it did: the
  browser check's "is there more than one colour on the canvas" is
  satisfied by a sticker. The honest test projects two points per bone
  through the very matrices the frame was drawn with — the centre of the
  top face, and the midpoint of whichever wall most faces the camera —
  and compares those two pixels. A real bone's near wall reads about
  three-quarters of its own face. A shader flattened so every surface
  takes the top face's light cannot get below 1.2, because then the
  bevel catches *more* light than the face does. Only the bone nearest
  the camera is measured, because that is the one nothing can be
  standing in front of; measuring all of them made the check pass or
  fail with the shuffle.
- **The room is opened and played by a real browser.** `room-check.js`
  drives headless Chromium through the first two minutes — start a
  match, tap a bone, take a hint, change the colours, switch renderers,
  open the join door — and fails on any console error. It found two
  things nothing in node could: a canvas cannot hand out both a WebGL
  and a 2D context, so switching to the flat table silently froze it;
  and a 7 × 128 pip atlas is not a power of two, so WebGL 1 quietly
  refused to build its mipmaps and every bone on the table rendered as a
  black slab. The second one took a *screenshot* to catch, because a
  black bone on brown felt still passes "is there more than one colour".

## Run it locally

Any static file server (the service worker wants http(s)):

```
cd puzzles
python3 -m http.server 8000
# open http://localhost:8000/domino/
```

Before shipping changes, run the lot — about a minute:

```
node domino/tools/check-all.js
```

or one at a time:

```
node domino/tools/rules-check.js     # the rules, and the line rebuilt from the log
node domino/tools/layout-check.js    # no overlaps, nothing moves, the hand stays tappable
node domino/tools/bone-check.js      # the 3D bone is a solid, and wound the right way out
node domino/tools/skin-check.js      # presets, share codes, hostile input
node domino/tools/net-check.js       # the permutation test: hands stay secret
node domino/tools/coach-check.js     # every hint names its move and tells the truth; grades are honest
node domino/tools/rating-check.js    # the score: Glicko for a pareja, accuracy, stars, a simulated season
node domino/tools/career-check.js    # the record: counts and logros survive junk
node domino/tools/calibrate.js       # not a check — re-measures the ladder (minutes; see its header)
node domino/tools/ai-check.js        # the strength ladder (the slow one)
node domino/tools/room-check.js      # opens it in a browser and plays it
node domino/tools/make-icons.js      # redraws the icons from scratch
```

`room-check.js` needs `playwright-core` (`npm i --no-save
playwright-core`); the browser is already on most machines that have
Playwright installed. Without it the check says so and exits 0, so it is
a bonus rather than a barrier. Nothing it installs is ever shipped —
the room itself has no dependencies at all.

…and bump `VERSION` in `sw.js` so installed players hear about it.

## Credit where it is due

The QR encoder is a port of the public-domain
[qrcodegen](https://www.nayuki.io/page/qr-code-generator-library)
algorithm (Project Nayuki), by way of HIVEMIND and the chess room. The
WebRTC handshake — short codes, non-trickle ICE, deflated payloads — is
carried over from the same place, widened here from two chairs to four.
