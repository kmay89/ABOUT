# 💬 The Hot Potato

**A describing game with a timer nobody can see.** Two teams, one phone.

A word appears. Describe it to your own team without saying the word, any part
of it, or anything that rhymes with it. The second somebody gets it, tap and
**hand the phone to the other team**. When the buzzer goes, whoever is holding
it has lost the point.

No accounts, nothing tracked, works offline, and there is nothing to join —
everybody is in the same room. Part of [The Games Room](../games/). No
libraries, no build step, MIT.

## The hidden clock is the entire design

A visible countdown turns this into a race you can pace. A hidden one turns it
into a hot potato — and the last ten seconds, when the room knows it is close
and nobody knows how close, is the reason anybody plays.

So the round is a random length between forty-five and seventy-five seconds,
the range is wide enough that counting does not help, and **nothing on the
screen is a function of the time left** — no bar, no number, no colour. What
the phone does instead is *tick*, and the ticks close up as the end approaches,
from about one a second down to four. The room can hear the shape of it and
cannot measure it.

Two smaller decisions fall out of the same idea:

- **The point goes to the other team**, rather than coming off the holder's.
  It sounds like the same thing and is not — nobody ever goes backwards, so
  being behind is never a spiral, and the game always ends.
- **A skip does not pass the phone on.** If it did, skipping would be the best
  move in the game and nobody would ever describe anything.

## The clock survives the phone going in a pocket

A countdown built on `setInterval` quietly stops when the tab is backgrounded,
and a phone being thrown round a room gets backgrounded constantly. So the
deadline is a **wall-clock timestamp**, checked every frame and again on
`visibilitychange` — the buzzer goes off at the right moment even if the phone
was asleep for ten seconds of it.

## No canvas

The only room on this site without one. The whole interface is a single word as
large as the phone will draw it, and a real element beats a canvas at that in
every way that matters: it wraps, it honours the reader's font size, it can be
selected, and a screen reader can say it out loud.

## The list

`words.js` is shared byte-identical with the acting game next door and holds
two separate lists, because the two games want genuinely different words — *a
silver lining* is lovely to describe and impossible to mime. Rules the list
follows: nothing that needs a particular country or decade, no brand names, and
nothing built out of another entry's word.

`tools/room-parity.js` checks the two copies have not drifted.

## What's here

```
words.js    the two lists (shared, byte-identical with guesstures/)
rules.js    scoring, the hand-over, and the buzzer — pure, and clockless
app.js      the conductor, and the only thing here that knows what time it is
```
