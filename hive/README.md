# ⬡ Hive Mind

**You are not a bee. You are all of them.**

A game about being a whole beehive at once. Tap a flower and the bees go.
Tap the hive and the queen lays. Tap a hornet and they ball her. Get enough
bees and enough honey in before winter. That is the whole of it.

No accounts, nothing tracked, works offline. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## Why this exists

The first Hive Mind ([hive-mind-game.com](https://hive-mind-game.com),
[kmay89/hivemind](https://github.com/kmay89/hivemind)) is a real beekeeping
year: comb you zone as nursery or pantry, a forage dial, heat that diffuses
through the wax, a deck of keeper's dilemmas, a party mode for eight. It is
deep and it is honest, and its own design notes say what is wrong with it:
a new player sees six tabs, five numbers, a slider, five brushes and a tray,
and the thing they do (paint a zone) pays off three weeks of hive-time later
on a different screen. Five rounds of work made that kinder. None of them
changed what the player *is*.

So this is not a sixth round. It starts again from one question: **what is
the smallest thing a person can do that still feels like being a hive?**

| | The first Hive Mind | This one |
|---|---|---|
| Who you are | The keeper, above the hive | The hive itself: its attention |
| What you do | Paint zones, set a dial, answer cards | Tap the thing you want noticed |
| Where it happens | Comb on one tab, meadow on another | One picture: the comb in its meadow |
| Controls on screen | About twenty | None. Three read-outs and a pause button |
| Cause to effect | Days to weeks | Seconds: you watch the drop come home |
| What winter asks | A forecast you learn to read | Two numbers, on screen from minute one |
| How it teaches | A coach, quests, lessons and an advisor | A hand pointing at one flower |
| A year | Six or seven minutes, much of it watching | Six days of about a minute, all of it doing |

What it keeps is the part that was never the problem: the bees are real.
Every rule below is something bees do, and every night's card and every
field note is a fact an entomologist would sign.

## How it plays

**One verb.** The player is the hive's attention, and a tap is what the
hive notices.

- **A flower.** One bee goes: the scout. When she lands, the others follow,
  and the bees share themselves out between every flower you have tapped.
  Tap it again and they leave it. More flowers than bees means everything
  is worked thinly, so choosing is the game: a near small flower now, or a
  far rich one that takes a scout's flight before it pays anything.
- **The hive.** The queen lays an egg. It costs honey and it hatches into a
  bee, and more bees is more honey, until there are more bees than the
  meadow has room for and they sit at home. That idleness is the signal to
  stop, and it is on screen.
- **A hornet.** The nearest bees leave what they are doing and ball her
  until she overheats, which is what Japanese honeybees really do. Ignore
  her and she takes bees.
- **In winter**, the wind. A ring closes on the cluster; tap as it lands
  and the bees pull tight and save honey.

**One picture.** The comb sits in a hollow in the middle of the meadow and
the flowers bloom around it. Nectar is carried along a dotted line you can
see, lands in a cell you can see, and the cell fills. There is no second
screen for the consequence to hide on. The view starts close on a small
comb and pulls back as the hive grows, at dawn, never under a finger.

**Two numbers.** Winter needs enough bees to hold the cluster's heat and
enough honey to feed it. Both are in the strip at the top from the first
minute, and the rim of the hollow is a ring that fills as the honey comes
in. A cluster that is short of bees burns more, so the honey number is
honest about that: it falls every time a bee hatches.

**Six days.** Two of spring, two of summer, two of autumn, about a minute
each, and the season is the difficulty: spring is sparse, summer pours,
autumn runs down and its days are short. The day does not start until its
first flower is tapped, so nobody is ever behind before they have begun.

**Each night, one thing to learn**, from three: stronger wings, longer
tongues, guard bees, propolis. Each is a small change you can see the next
morning and each has a true thing under it. In spring the bees who learned
it all are gone and the hive remembers two of them, which you choose. That
is the one rule that is there for the game's sake rather than the bees': it
keeps every year a fresh draft and stops the fourth year being won by the
first.

**Then winter**, in half a minute: the camera comes in, the cluster forms
on the comb, the honey drains a cell at a time, and the wind comes four
times. Honey left in spring is jarred and goes to the cellar, which is the
score, and it is labelled by the flower most of it came from.

## What is deliberately not here

No timers you wait out, no streaks, nothing daily, no currency, no shop.
No text you must read: the first minute is a hand pointing at a flower, and
words arrive four at a time, once each. Field notes pass by as a title and
are read at night or by whoever taps one. The **gentle game** (one mild
hornet, an easier winter, a hive that is never lost) is a switch on the
front door, for small children and for anybody who would rather not lose.

## What's here

```
index.html   the page: a canvas, three chips, and the sheets that slide up
hive.css     everything that is not the meadow
data.js      flowers, the things a hive can learn, the years, the field notes
sim.js       the hive, with no screen anywhere in it
gfx.js       the meadow, the comb and every bee, painted from above
sound.js     every sound, made as it plays; no audio files
app.js       taps in, pictures and sound out
sw.js, manifest.webmanifest, icons/
```

## Five things worth explaining

**The rules have no screen in them.** `sim.js` is a function from a state
and a slice of time to a state and a list of things that happened. It runs
the same in node, which is how `tools/hive-check.js` can sit six kinds of
player down at it (one who does nothing, one who never raises a bee, one
who raises nothing else, a toddler, a newcomer, a careful keeper) and play
each through a few dozen hives before anybody sees a pixel. The contract
is about the spread: neglect and both lazy extremes lose, the first winter
forgives and the second does not, and care brings home more honey. The
first Hive Mind shipped with a strategy of "set one dial and walk away"
that outlived playing it attentively, and nobody could see that by playing.
This one is measured so it cannot happen quietly.

**Everything juicy is a consequence, never a cause.** `gfx.js` and
`sound.js` only ever react to the list of things the sim says happened.
Delete every spark and note and the game plays exactly the same. That is
what lets the polish be generous (a drop that flies to its cell, a comb
that pops when it is capped, a tune that climbs while the nectar keeps
coming) without the polish ever becoming the rules.

**The score is audible.** Every load of nectar is a plucked note on a
five-note scale, and the notes climb while deliveries keep arriving and
start again from the bottom when they stop. A hive that is working well
plays itself a tune. A hive that is not goes quiet, and you hear it before
you see it.

**Bees are placed where the sim says they are.** A bee on screen is a bee
in the state: there are a few dozen of them, not forty thousand, and every one
can be followed from the comb to a flower and back. The first Hive Mind
showed "4,500 bees" for fifteen simulated cohorts. This one would rather
show twelve and mean it.

**The front door is timed.** `tools/hive-door-check.js` is a brand-new
player on a phone who presses Play and then taps only where the pointing
hand is. It fails if there is nothing to tap within three seconds, if the
first honey takes more than twelve, if the hand alone does not reach a new
bee inside forty-five, or if more than sixteen words are ever on screen
while it happens. As measured: honey at seven seconds, an egg at about
twelve, a bee at about twenty, nine words.

## For everybody

Every target is a tap, never a drag, a hold or a double-tap, and nothing
needs a quick hand except the hornet, who waits at the edge for three
seconds before she comes in. Tab and the arrow keys walk the hive, the
flowers and any hornet; Enter or Space taps; in winter Space is the
huddle. Events are announced to a screen reader. Calm motion (on by
default where the system asks for it) removes the shake and most of the
sparks. Colour is never the only signal: a worked flower has a ring and a
line, a hornet has a mark and a sound.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/hive/
# http://localhost:8000/hive/?speed=4 runs the world fast, for looking at winter
```

```
node tools/hive-check.js              # the contract
node tools/hive-check.js --table      # every player, every year
node tools/hive-check.js --trace=newcomer
node tools/hive-door-check.js         # the first minute, following only the hand
node tools/room-parity.js
node tools/open-check.js hive         # opens it in a real browser and plays it
```
