/* ai.js — the other players, and the only room here where the strong player
   is exact rather than clever.

   Yahtzee is small enough to compute properly. Five dice have only **252
   distinct hands** once you stop caring which die is which — 1-1-2-6-6 and
   6-1-6-2-1 are the same decision — and there are only 462 ways to keep some
   of them. So the whole reroll tree fits in two tables of a few hundred
   entries, and the answer to "what should I keep" is an expectation over
   every outcome rather than a rule of thumb about pairs.

   That is worth doing because the rules of thumb are wrong in interesting
   places. Everybody keeps the pair. Nobody keeps 1-1 over 6, and yet with the
   Ones box open and the sixty-three still live, sometimes you should.

   ## Three tiers, three genuinely different players

     · **Cup** keeps whatever there is most of and writes down whatever scores
       highest. No expectation, no lookahead, no idea the upper bonus exists.
       This is how the game is played at a kitchen table and it is not a
       crippled expert — it is a different function, thirty lines long.

     · **Counter** takes the expectation over the next roll only. It keeps
       what is worth most *one roll from now*, which is genuinely most of the
       skill, and is blind only to the difference between one reroll and two.

     · **Ledger** takes the expectation over both remaining rolls, and prices
       every box against what that box is normally worth, so it will write a
       zero into Yahtzee on purpose rather than burn a category it still
       needs. That last part is most of the gap between a good score and a
       very good one.

   ## What a box is worth

   The score on the sheet is not the value of the move. Writing 22 in Chance
   spends Chance, and Chance is normally worth about 22 — so it is worth
   roughly nothing. Writing 22 in Four of a kind is worth a great deal,
   because Four of a kind normally comes to about 13. So Ledger judges by

       what it scores  −  what that box usually gives you

   which is the whole of "should I take it or hold it open", falling out of
   one subtraction. Cup does not do this, which is why Cup fills its straights
   with rubbish in the first four turns and then has nowhere to put a 30.

   ## And the sixty-three

   Thirty-five points sit behind an upper total of 63, which is three of every
   number. So an upper box is worth its score *plus* the surplus over three of
   that face, priced at 35/63 of a point each — and priced at nothing once the
   bonus is mathematically out of reach, which the table checks rather than
   assumes.

   Nothing here is random unless it is handed a generator. tools/ai-check.js
   plays whole seasons with a seed and requires each tier to out-score the one
   below it.                                                                */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var AI = {};

AI.TIERS = [
  { key: "cup",     name: "The Cup",  depth: 0, ledger: false,
    blurb: "Keeps whatever there is most of and writes down whatever scores highest. Has never heard of the sixty-three." },
  { key: "counter", name: "Counter",  depth: 1, ledger: false,
    blurb: "Works out what each set of keeps is worth one roll from now, and goes for the upper bonus." },
  { key: "ledger",  name: "Ledger",   depth: 2, ledger: true,
    blurb: "Looks two rolls ahead over every one of the 252 hands, and knows what each box is worth before spending it." }
];
AI.tier = function (k) {
  for (var i = 0; i < AI.TIERS.length; i++) if (AI.TIERS[i].key === k) return AI.TIERS[i];
  return AI.TIERS[2];
};

/* ================================================================
   the two tables

   A hand is counts of each face. As a number: c1 + 6·c2 + 36·c3 + …, which
   is unique because no count exceeds five. Built once, at load, in about a
   millisecond — everything after this is array lookups.
   ================================================================ */
function keyOf(c) {
  return c[1] + 6 * c[2] + 36 * c[3] + 216 * c[4] + 1296 * c[5] + 7776 * c[6];
}

var HANDS = [];          /* every hand of exactly five dice, as counts       */
var KEEPS = [];          /* every hand of zero to five dice                  */
var HAND_AT = {};        /* key → index into HANDS                           */
var KEEP_AT = {};        /* key → index into KEEPS                           */

(function build() {
  var c = [0, 0, 0, 0, 0, 0, 0];
  function walk(face, left) {
    if (face > 6) {
      var snap = c.slice(), k = keyOf(c);
      KEEP_AT[k] = KEEPS.length; KEEPS.push(snap);
      if (5 - left === 5) { HAND_AT[k] = HANDS.length; HANDS.push(snap); }
      return;
    }
    for (var n = 0; n <= left; n++) { c[face] = n; walk(face + 1, left - n); }
    c[face] = 0;
  }
  walk(1, 5);
})();

/* the distribution of rerolling n dice, as sorted outcomes and probabilities.
   Enumerated the obvious way — 6⁵ is 7776, which is nothing — because getting
   multinomial coefficients right by hand is how you ship a subtle bias. */
var ROLL = [];
(function rolls() {
  for (var n = 0; n <= 5; n++) {
    var tally = {}, total = Math.pow(6, n), i, j;
    for (i = 0; i < total; i++) {
      var c = [0, 0, 0, 0, 0, 0, 0], x = i;
      for (j = 0; j < n; j++) { c[1 + (x % 6)]++; x = (x / 6) | 0; }
      var k = keyOf(c);
      tally[k] = (tally[k] || 0) + 1;
    }
    var out = [];
    for (var k2 in tally) out.push({ key: +k2, p: tally[k2] / total });
    ROLL.push(out);
  }
})();

/* for each way of keeping dice: where you land, and how often. 4368 entries
   in all, so every reroll question below is a walk down a short list. */
var AFTER = [];
(function after() {
  for (var i = 0; i < KEEPS.length; i++) {
    var kept = KEEPS[i], have = 0, f;
    for (f = 1; f <= 6; f++) have += kept[f];
    var dist = ROLL[5 - have], out = [];
    for (var j = 0; j < dist.length; j++) {
      out.push({ to: HAND_AT[keyOf(kept) + dist[j].key], p: dist[j].p });
    }
    AFTER.push(out);
  }
})();

/* every way to keep some of this hand — sub-multisets, deduplicated, so
   "keep one of the three sixes" appears once rather than three times */
var SUBS = [];
(function subs() {
  for (var h = 0; h < HANDS.length; h++) {
    var hand = HANDS[h], list = [], c = [0, 0, 0, 0, 0, 0, 0];
    (function walk(face) {
      if (face > 6) { list.push(KEEP_AT[keyOf(c)]); return; }
      for (var n = 0; n <= hand[face]; n++) { c[face] = n; walk(face + 1); }
      c[face] = 0;
    })(1);
    SUBS.push(list);
  }
})();

AI.HANDS = HANDS;

function diceOf(c) {
  var d = [];
  for (var f = 1; f <= 6; f++) for (var i = 0; i < c[f]; i++) d.push(f);
  return d;
}
var DICE = HANDS.map(diceOf);
function handIndex(dice) {
  var c = [0, 0, 0, 0, 0, 0, 0];
  for (var i = 0; i < dice.length; i++) c[dice[i]]++;
  return HAND_AT[keyOf(c)];
}

/* ================================================================
   what a box is worth

   The middle column is what that box gives an ordinary player over a season.
   Ledger subtracts it, so a move is judged by what it beats rather than what
   it scores. The numbers are the standard ones and none of them is load
   bearing to a point or two.
   ================================================================ */
var USUAL = {
  ones: 2, twos: 4.5, threes: 6.5, fours: 9, fives: 11, sixes: 13.5,
  three: 22, four: 13, house: 22, small: 30, large: 20, yahtzee: 12, chance: 22
};
AI.USUAL = USUAL;

var UPPER_FACE = { ones: 1, twos: 2, threes: 3, fours: 4, fives: 5, sixes: 6 };

/* is the sixty-three still reachable at all? Five of every open face is the
   best that can still happen; if that does not get there, the bonus is dead
   and an upper box is worth exactly its pips. */
function bonusLive(card) {
  var u = Rules.upperTotal(card);
  if (u >= Rules.BONUS_AT) return false;
  var most = u;
  for (var f = 1; f <= 6; f++) {
    var k = Rules.CATS[f - 1].key;
    if (card[k] === null || card[k] === undefined) most += 5 * f;
  }
  return most >= Rules.BONUS_AT;
}

/* what taking `key` with these dice is worth, all in:
   the score, plus a hundred if it is a second Yahtzee, plus what the surplus
   over three-of-that-face buys towards the bonus, minus what the box usually
   gives you if we are keeping a ledger. */
function worth(key, dice, card, live, ledger) {
  var s = Rules.score(key, dice, card);
  var v = s + Rules.jokerBonus(dice, card);
  var face = UPPER_FACE[key];
  if (face && live) {
    var surplus = s - 3 * face;
    var u = Rules.upperTotal(card);
    v += surplus * (Rules.BONUS / Rules.BONUS_AT);
    /* and the one that actually gets there is worth the whole thirty-five */
    if (u + s >= Rules.BONUS_AT) v += Rules.BONUS * 0.5;
  }
  if (ledger) v -= USUAL[key];
  return v;
}

/* the best box for this hand, and what it is worth. Respects the joker rule:
   a fifth-of-a-kind with the Yahtzee box already scored can only go where the
   rule lets it go, and Rules.jokerBoxes is the authority on that. */
function best(dice, card, live, ledger, openList) {
  var allowed = Rules.jokerBoxes(dice, card) || openList;
  var top = -1e9, pick = null;
  for (var i = 0; i < allowed.length; i++) {
    var k = allowed[i];
    if (card[k] !== null && card[k] !== undefined) continue;
    var v = worth(k, dice, card, live, ledger);
    if (v > top) { top = v; pick = k; }
  }
  if (pick === null) { pick = openList[0]; top = 0; }
  return { key: pick, value: top };
}

/* value of every one of the 252 hands with no rolls left */
function settleTable(card, live, ledger) {
  var open = Rules.open(card), out = new Float64Array(HANDS.length);
  for (var h = 0; h < HANDS.length; h++) out[h] = best(DICE[h], card, live, ledger, open).value;
  return out;
}
/* value of every hand with one roll left: keep the best subset, then average
   over where that lands you */
function step(table) {
  var out = new Float64Array(HANDS.length);
  for (var h = 0; h < HANDS.length; h++) {
    var subs = SUBS[h], top = -1e9;
    for (var i = 0; i < subs.length; i++) {
      var list = AFTER[subs[i]], ev = 0;
      for (var j = 0; j < list.length; j++) ev += list[j].p * table[list[j].to];
      if (ev > top) top = ev;
    }
    out[h] = top;
  }
  return out;
}

/* ================================================================
   the cup — a different player, not a worse one
   ================================================================ */
function cupKeep(dice) {
  var c = Rules.counts(dice), face = 1, f;
  /* whatever there is most of; ties go to the bigger number, which is the
     one bit of sense in it */
  for (f = 2; f <= 6; f++) if (c[f] >= c[face]) face = f;
  var keep = [];
  for (var i = 0; i < 5; i++) keep.push(dice[i] === face);
  return keep;
}
function cupBox(dice, card) {
  var allowed = Rules.jokerBoxes(dice, card) || Rules.open(card);
  var top = -1, pick = allowed[0];
  for (var i = 0; i < allowed.length; i++) {
    var s = Rules.score(allowed[i], dice, card);
    if (s > top) { top = s; pick = allowed[i]; }
  }
  return pick;
}

/* ================================================================
   the interface the room uses

   Both calls take a view — the same object a person in that chair is looking
   at — and never the host's state. There is nothing hidden in Yahtzee, so
   here that is a formality rather than a guarantee; it is written this way so
   every room in this repository has the same shape.
   ================================================================ */

/* which dice to keep, as five booleans, plus why */
AI.keep = function (view, tierKey) {
  var t = AI.tier(tierKey), card = view.cards[view.turn];
  var dice = view.dice;
  if (t.depth === 0) return { keep: cupKeep(dice), why: ["most-of"] };

  var live = bonusLive(card);
  var table = settleTable(card, live, t.ledger);
  var rollsLeft = 3 - view.rolls;
  /* Counter always asks "what is this worth one roll from now"; Ledger asks
     the real question, which needs the one-roll table underneath it */
  if (t.depth >= 2 && rollsLeft >= 2) table = step(table);

  var h = handIndex(dice), subs = SUBS[h];
  var top = -1e9, pickKeep = null, hold = -1e9;
  for (var i = 0; i < subs.length; i++) {
    var list = AFTER[subs[i]], ev = 0;
    for (var j = 0; j < list.length; j++) ev += list[j].p * table[list[j].to];
    if (subs[i] === KEEP_AT[keyOf(Rules.counts(dice))]) hold = ev;
    if (ev > top) { top = ev; pickKeep = KEEPS[subs[i]]; }
  }

  /* turn the kept multiset back into five booleans over the actual dice */
  var want = pickKeep.slice(), keep = [];
  for (var d = 0; d < 5; d++) {
    if (want[dice[d]] > 0) { want[dice[d]]--; keep.push(true); }
    else keep.push(false);
  }
  var why = [];
  var n = 0;
  for (d = 0; d < 5; d++) if (keep[d]) n++;
  if (n === 5) why.push("stand");
  else if (n === 0) why.push("throw-it-all");
  if (top - hold < 0.4 && n < 5) why.push("close-call");
  var live2 = live && n > 0;
  if (live2) {
    var c = Rules.counts(diceKept(dice, keep));
    for (var f = 1; f <= 6; f++) {
      var box = Rules.CATS[f - 1].key;
      if (c[f] >= 3 && (card[box] === null || card[box] === undefined)) { why.push("for-the-bonus"); break; }
    }
  }
  return { keep: keep, why: why, value: top };
};

function diceKept(dice, keep) {
  var out = [];
  for (var i = 0; i < 5; i++) if (keep[i]) out.push(dice[i]);
  return out;
}

/* where to write it down, and why */
AI.box = function (view, tierKey) {
  var t = AI.tier(tierKey), card = view.cards[view.turn], dice = view.dice;
  if (t.depth === 0) return { key: cupBox(dice, card), why: ["biggest"] };

  var live = bonusLive(card), open = Rules.open(card);
  var b = best(dice, card, live, t.ledger, open);
  var why = [];
  var raw = Rules.score(b.key, dice, card);
  if (Rules.jokerBonus(dice, card)) why.push("joker");
  if (raw === 0) why.push("sacrifice");
  if (UPPER_FACE[b.key] && live && raw >= 4 * UPPER_FACE[b.key]) why.push("for-the-bonus");
  if (t.ledger && raw - USUAL[b.key] > 8) why.push("beats-the-box");
  if (open.length === 1) why.push("forced");
  return { key: b.key, why: why, value: b.value };
};

/* one whole turn, for the harness and for a bot in a seat: roll, keep, roll,
   keep, roll, write. Returns the new state. */
AI.turn = function (st, tierKey, rnd) {
  var n = st;
  while (n.rolls < 3) {
    n = Rules.roll(n, rnd);
    if (n.rolls >= 3) break;
    var k = AI.keep(Rules.publicView(n, n.turn), tierKey).keep;
    for (var i = 0; i < 5; i++) if (n.keep[i] !== k[i]) n = Rules.hold(n, i);
    /* everything kept means there is nothing left to roll for */
    if (k[0] && k[1] && k[2] && k[3] && k[4]) break;
  }
  var box = AI.box(Rules.publicView(n, n.turn), tierKey).key;
  return Rules.take(n, n.turn, box);
};

if (typeof module !== "undefined" && module.exports) module.exports = AI;
else root.AI = AI;
})(typeof self !== "undefined" ? self : this);
