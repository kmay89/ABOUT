# ♠ The Euchre Table

**Ten minutes to learn and one rule to get wrong forever.** Twenty-four cards,
five tricks, two jacks worth more than the aces, and a partner across the table
whose tricks are yours. Four phones join by typing four letters.

No accounts, nothing tracked, works offline. Part of
[The Games Room](../games/). No libraries, no build step, MIT.

## The rule everybody gets wrong

The jack of the trump suit is the **right bower**, the highest card in the
pack. The other jack of the same colour is the **left bower**, second highest —
and it **stops being its printed suit**. With spades as trump, the jack of
clubs *is a spade*: led as one, followed as one, and a player holding it and
nothing else in clubs is *void in clubs*.

Every euchre bug anybody has ever written is that rule. Which is why
`Rules.suitOf` exists and is used everywhere, and why any line in `rules.js`
that asks a card its printed suit while trump is set is a bug waiting to be
found. The hand on screen sorts the jack physically into the trump group,
because that is where it is.

## What's here

```
index.html    markup, this room's colour, and the bidding bar
look.css      the house style, shared with the other new rooms
cards.js      a deck and a four-seat table — byte-identical with the hearts
              room's copy
rules.js      the rules, complete and pure: the bowers, the two rounds of
              bidding, stick-the-dealer, going alone, and the scoring
ai.js         an appraisal for the bidding, a partner-aware policy for the
              play, and determinized rollouts for the strongest tier
coach.js      the engine's own reasons, in English — and it names the left
              bower's real suit every single time it comes up
gfx.js        the seats, the trick, the trump badge, and the upcard
room.js, net.js, table.js    the four-letter front door
sw.js, manifest.webmanifest, icons/
```

## Three things worth explaining

**Bidding is an appraisal, not a search.** Five cards and an upcard is not
enough information to search. What works is the arithmetic every good euchre
player carries around: the right bower is worth about a trick and a half, the
left about a trick, an off-suit ace about half — and a **void in a side suit is
worth nearly as much as an ace**, because it means you can trump the second
round of that suit. Three small trumps beat two big ones, because the third one
is still a trump when everybody else has run out. Three is the bar, because
three is what you need.

And position matters: ordering it up hands the card to *whoever is dealing*.
Giving an opponent the right bower to gain yourself a queen loses the hand
before it is played, so that is priced in explicitly.

**Do not overtake your partner.** The single most common mistake at any euchre
table. If they are winning the trick, the trick is already yours — throw your
worst card away instead of spending a good one on it. The only reason to take
it off them is if somebody behind you can still take it off *them*.

**Playing the hand out is what makes the top tier the top tier.** Sharp counts
— twenty-four cards and five tricks means the pack runs out fast, and it knows
by the third trick that its queen of trump is now the highest card left — and
then it stops scoring cards and deals the three hands it cannot see. Not at
random: consistent with every suit somebody has already failed to follow,
because everybody watched that happen and a deal that ignores it is a deal that
could not exist. Each candidate card is then played to the end of the hand,
twenty-four deals deep, and judged by what the hand actually paid: two for a
euchre, four for a lone march.

That rung was rebuilt, and the reason belongs here. Counting *on its own* —
which is all Sharp used to be — measures **50%** against Steady over six
hundred matches. Not weaker; identical. The two tiers bid the same, and
counting changes only two branches of the play that rarely fire differently,
so they were one player wearing two names. Playing it out is a difference in
kind rather than a knob, and it measures **61% of matches to ten over fifteen
hundred, at an average margin of +1.3 points**.

Getting a number worth quoting took two corrections to the *measurement*.
`search` reached for `Math.random`, so the seeded harness was measuring an
unseeded player — 57% one run, 53% the next, off identical seeds. Threading the
harness's generator through fixed that and the figure jumped to **65%**, which
looked too good.

The obvious suspicion was a leak: determinizing out of the same shuffle that
dealt the cards might make the imagined hands resemble the real ones. **That
suspicion was wrong, and it was checked rather than believed.** `AI.determinize`
puts a card in the seat that really holds it 26.8% of the time off the dealer's
stream and 26.5% off an independent one, against a baseline of 27.8% — no leak
either way. `tools/ai-check.js` now runs that comparison on every release.

The real fault was duller and entirely the harness's: a player that draws from
the deal's stream *moves* it, so the same seed stops producing the same deals
when the strong side changes chairs, and the paired comparison the ladder
depends on quietly stops being paired. The engine now gets its own stream, and
61% is the paired number.

The reason all this went unnoticed for a while is worth writing down too: the
test harness's own seeded generator was `x = (x * 1103515245 + 12345) & 0x7fffffff`,
which is broken in JavaScript specifically — the product runs past 2⁵³, the low
bits are rounded away before the mask sees them, and what comes out has a cycle
of about sixteen thousand and visibly correlated streams from adjacent seeds.
Four hundred matches at seed, seed+1, seed+2 were nothing like four hundred
independent matches. It is now Mulberry32, integer arithmetic throughout.

The edge is real and it is not enormous: **56% of matches to ten over six
hundred, at an average margin of 0.8 points**. Euchre is a high-variance game
and anybody claiming a bigger number for one skill is measuring something else.

## The bidding is buttons, not a sheet

A modal that covers your cards while asking whether you want spades is asking
you to remember your own hand. So the bidding sits in a bar above the tray,
with the board still visible behind it.

## Why it's honest

- `tools/rules-check.js` checks the bowers directly — that the left bower is
  trump and not its printed suit, that the right outranks the left, that the
  left outranks the ace of trump — and then plays three thousand hands
  checking that you must follow suit *with the left bower counted as trump*,
  that every hand is exactly five tricks, that a lone hand leaves the
  partner's five cards untouched, and that every score is 1, 2 or 4.
- **The permutation test covers your partner.** Euchre partners are not
  allowed to see each other's cards, and a leak to your partner is a leak to
  the person best placed to use it — so the test rearranges all three unseen
  hands including theirs and requires the message to come back identical.
- `tools/ai-check.js` runs the ladder over hundreds of matches, with a lower
  bar for this game than the others on purpose.

## Run it locally

```
python3 -m http.server 8000
# open http://localhost:8000/euchre/
```

```
node tools/rules-check.js
node tools/ai-check.js
node tools/room-parity.js
node tools/open-check.js     # opens it in a real browser and plays it
```
