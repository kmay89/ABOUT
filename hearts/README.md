# ♥ The Hearts Table

**Four seats, three secrets, and one queen.** Twenty-six points nobody wants —
take none of them, or take every single one. Four phones join by typing four
letters, and every hand stays secret by construction rather than by discretion.

No accounts, nothing tracked, works offline. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## Hands are secret, and that is a networking problem

A single shared snapshot would put four hands on four phones. Not visible in
the interface — but sitting in the message log of every device, readable by
anybody who opened a console. So the host never broadcasts the game. It sends
**each seat its own view**, built by the same `publicView` the machine players
reason from. The other three hands never leave the host, so there is nothing
on the wire to find.

`tools/rules-check.js` proves it the strong way, the way the domino table
established: it rearranges the three hidden hands among themselves, three
hundred times, and requires the message to come back byte-identical. If it
ever changes, it encodes the split; if it cannot change, it cannot leak. An
eyeball over the message format proves nothing at all.

## What's here

```
index.html    markup, and this room's colour
look.css      the house style, shared with the other new rooms
cards.js      a deck and a four-seat table — byte-identical with the euchre
              room's copy, because the two games differ entirely in their
              rules and not at all in what a card looks like
rules.js      the rules, complete and pure: the two of clubs, the first
              trick, hearts unbroken, the pass, and the moon
ai.js         a policy, a void table built from the play log alone, and
              determinized rollouts for the strongest tier
coach.js      the engine's own reasons, in English
gfx.js        the seats, the trick, and the points on the table
room.js, net.js, table.js    the four-letter front door
sw.js, manifest.webmanifest, icons/
```

## Three things worth explaining

**The beginner is a different function, not a worse one.** Making a weak
opponent by adding noise to a strong one is the standard shortcut and it
produces somebody nobody recognises: it still ducks, still counts the queen,
still makes voids, and merely mistimes them. A real beginner does none of those
things. So the Learning tier plays high cards because they are high, takes
tricks because tricks look good, and has not worked out what the queen is for.
Steady beats it in every match of twenty-four.

**Voids are public information; counts are not.** Every time a seat fails to
follow suit, the whole table saw it — so the machine may remember it, and the
coach may say it out loud. "Beto couldn't follow diamonds" is something that
happened in front of you. "Beto is probably out of diamonds" is something you
worked out from counting, and it is a different claim. The coach may make the
first kind and never the second.

**The rollouts respect the voids.** The strongest tier deals the unseen cards
out at random and plays the hand through forty times — but only into worlds
consistent with what everybody watched happen. Sampling uniformly would deal a
heart to a player everybody saw discard on hearts, and a search built on
impossible worlds is worse than no search: it is confidently wrong.

## What the table shows you, and what it doesn't

The eye in the tray shows each seat's points so far, because everybody watched
those tricks get taken. It does **not** show which hearts are still out,
because working that out is the game. Same line the domino room draws:
*anything the table said out loud is on the screen; anything you would have had
to work out is not.*

## Why it's honest

- `tools/rules-check.js` plays two thousand hands and checks on every card:
  that you must follow suit while you can, that no points may be played on the
  first trick unless the hand is nothing but points, that hearts are never led
  before they are broken *unless* that is all you hold, that every hand runs
  the full fifty-two cards, and that the points always add to twenty-six.
- The moon is checked for being reachable *and* for scoring correctly — 26 to
  each of the other three, which is 78 on the board.
- The permutation test, above.
- `tools/ai-check.js` runs one of the stronger player against three of the
  weaker, which is the only shape that measures anything in a four-handed
  game, and requires the stronger one to end with fewer points.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/hearts/
```

```
node tools/rules-check.js
node tools/ai-check.js
node tools/room-parity.js
node tools/open-check.js     # opens it in a real browser and plays it
```
