/* rules.js — Yahtzee, complete and pure.

   Five dice, three rolls, thirteen boxes, and one decision repeated
   thirty-nine times: what to keep, and where to write it down.

   No DOM, no timers, and no randomness it was not handed — every roll takes a
   generator, so tools/rules-check.js can replay tens of thousands of games
   with a seed and check the arithmetic on every box.

   ## The boxes

   Six upper boxes count one number each, and **thirty-five points wait behind
   sixty-three** — which is three of each number, and is the number the whole
   upper half is really about. Seven lower boxes:

     three of a kind    the sum of all five dice
     four of a kind     the sum of all five dice
     full house         25
     small straight     30    four in a row
     large straight     40    five in a row
     Yahtzee            50    all five the same
     chance             the sum of all five dice

   ## The three rules people get wrong

   **Three of a kind scores everything, not the three.** So does four of a
   kind. A great many implementations score the triple and nothing else, and
   it changes the whole game — 6-6-6-5-5 in three of a kind is twenty-eight,
   not eighteen.

   **A box, once written in, is written in.** Including a zero. Having to
   choose which box to throw away is most of the skill, and an interface that
   quietly stops you doing it has removed the game.

   **The second Yahtzee is worth a hundred, and it is a joker.** If you have
   already scored fifty in the Yahtzee box, every further Yahtzee is a hundred
   points *and* may be written into any box still open — its own number
   upstairs, or a full house, or a straight, at full value. If you scored a
   zero in the Yahtzee box, there is no bonus and no joker. That is the real
   rule and it is worth having.                                             */
(function (root) {
"use strict";

var Rules = {};

Rules.CATS = [
  { key: "ones",    name: "Ones",            upper: 1 },
  { key: "twos",    name: "Twos",            upper: 2 },
  { key: "threes",  name: "Threes",          upper: 3 },
  { key: "fours",   name: "Fours",           upper: 4 },
  { key: "fives",   name: "Fives",           upper: 5 },
  { key: "sixes",   name: "Sixes",           upper: 6 },
  { key: "three",   name: "Three of a kind" },
  { key: "four",    name: "Four of a kind" },
  { key: "house",   name: "Full house" },
  { key: "small",   name: "Small straight" },
  { key: "large",   name: "Large straight" },
  { key: "yahtzee", name: "Yahtzee" },
  { key: "chance",  name: "Chance" }
];
Rules.BONUS_AT = 63;
Rules.BONUS = 35;
Rules.JOKER = 100;

function counts(dice) {
  var c = [0, 0, 0, 0, 0, 0, 0];
  for (var i = 0; i < dice.length; i++) c[dice[i]]++;
  return c;
}
function sum(dice) {
  var s = 0;
  for (var i = 0; i < dice.length; i++) s += dice[i];
  return s;
}
Rules.sum = sum;
Rules.counts = counts;

function runLength(c) {
  var best = 0, run = 0;
  for (var f = 1; f <= 6; f++) {
    if (c[f]) { run++; if (run > best) best = run; }
    else run = 0;
  }
  return best;
}

/* What a category is worth for these dice, on this card. The card matters for
   exactly one reason — the Yahtzee joker — and passing it in rather than
   handling that at the call site is what stops the rule being forgotten. */
Rules.score = function (key, dice, card) {
  var c = counts(dice);
  var joker = !!(card && card.yahtzee === 50 && atLeast(c, 5));
  var cat = null, i;
  for (i = 0; i < Rules.CATS.length; i++) if (Rules.CATS[i].key === key) cat = Rules.CATS[i];
  if (!cat) return 0;

  if (cat.upper) return c[cat.upper] * cat.upper;
  switch (key) {
    /* the sum of ALL FIVE dice, not the sum of the three. A great many
       versions get this wrong and it changes the whole game: 6-6-6-5-5 in
       three of a kind is twenty-eight, not eighteen. */
    case "three":   return atLeast(c, 3) ? sum(dice) : 0;
    case "four":    return atLeast(c, 4) ? sum(dice) : 0;
    case "house":
      if (joker) return 25;
      return (has(c, 3) && has(c, 2)) || has(c, 5) ? 25 : 0;
    case "small":   return joker ? 30 : (runLength(c) >= 4 ? 30 : 0);
    case "large":   return joker ? 40 : (runLength(c) >= 5 ? 40 : 0);
    case "yahtzee": return atLeast(c, 5) ? 50 : 0;
    case "chance":  return sum(dice);
  }
  return 0;
};
/* "is there a face with at least n of them" — a plain function rather than
   something hung on Array.prototype, which would leak into every array on the
   page and turn up in somebody else's for-in loop a year from now */
function atLeast(c, n) {
  for (var f = 1; f <= 6; f++) if (c[f] >= n) return true;
  return false;
}
function has(c, n) {
  for (var f = 1; f <= 6; f++) if (c[f] === n) return true;
  return false;
}

/* is this roll a Yahtzee that earns the hundred-point bonus? */
Rules.jokerBonus = function (dice, card) {
  var c = counts(dice);
  return (atLeast(c, 5) && card.yahtzee === 50) ? Rules.JOKER : 0;
};
/* which boxes a joker may go in: its own number first if that is open,
   otherwise anything still open. That is the rule as written. */
Rules.jokerBoxes = function (dice, card) {
  var c = counts(dice), face = 0, i;
  for (i = 1; i <= 6; i++) if (c[i] === 5) face = i;
  if (!face) return null;
  var own = Rules.CATS[face - 1].key;
  if (card[own] === null || card[own] === undefined) return [own];
  var out = [];
  for (i = 0; i < Rules.CATS.length; i++) {
    var k = Rules.CATS[i].key;
    if (card[k] === null || card[k] === undefined) out.push(k);
  }
  return out;
};

/* ---------- a card ---------- */
Rules.blank = function () {
  var card = {};
  for (var i = 0; i < Rules.CATS.length; i++) card[Rules.CATS[i].key] = null;
  card.bonusYahtzees = 0;
  return card;
};
Rules.upperTotal = function (card) {
  var t = 0;
  for (var i = 0; i < 6; i++) {
    var v = card[Rules.CATS[i].key];
    if (v !== null && v !== undefined) t += v;
  }
  return t;
};
Rules.total = function (card) {
  var up = Rules.upperTotal(card), lo = 0, i;
  for (i = 6; i < Rules.CATS.length; i++) {
    var v = card[Rules.CATS[i].key];
    if (v !== null && v !== undefined) lo += v;
  }
  return up + (up >= Rules.BONUS_AT ? Rules.BONUS : 0) + lo + (card.bonusYahtzees || 0) * Rules.JOKER;
};
Rules.open = function (card) {
  var out = [];
  for (var i = 0; i < Rules.CATS.length; i++) {
    var k = Rules.CATS[i].key;
    if (card[k] === null || card[k] === undefined) out.push(k);
  }
  return out;
};
Rules.done = function (card) { return Rules.open(card).length === 0; };

/* ---------- a game ---------- */
Rules.start = function (players) {
  var n = Math.max(1, Math.min(6, players || 1));
  var cards = [], i;
  for (i = 0; i < n; i++) cards.push(Rules.blank());
  return {
    seats: n, turn: 0, round: 0,
    dice: [0, 0, 0, 0, 0], keep: [false, false, false, false, false],
    rolls: 0, phase: "roll",
    cards: cards, log: []
  };
};
Rules.clone = function (st) {
  return {
    seats: st.seats, turn: st.turn, round: st.round,
    dice: st.dice.slice(), keep: st.keep.slice(),
    rolls: st.rolls, phase: st.phase,
    cards: st.cards.map(function (c) {
      var o = {};
      for (var k in c) o[k] = c[k];
      return o;
    }),
    log: st.log.slice()
  };
};

Rules.roll = function (st, rnd) {
  if (st.phase !== "roll" || st.rolls >= 3) return null;
  var n = Rules.clone(st);
  for (var i = 0; i < 5; i++) {
    if (n.rolls > 0 && n.keep[i]) continue;
    n.dice[i] = 1 + ((rnd() * 6) | 0);
  }
  n.rolls++;
  if (n.rolls >= 3) n.phase = "score";
  return n;
};
Rules.hold = function (st, i) {
  if (st.rolls === 0) return st;
  var n = Rules.clone(st);
  n.keep[i] = !n.keep[i];
  return n;
};

Rules.take = function (st, seat, key) {
  if (st.turn !== seat || st.rolls === 0) return null;
  var card = st.cards[seat];
  if (card[key] !== null && card[key] !== undefined) return null;
  /* a joker may only go where the rule allows it */
  var jb = Rules.jokerBoxes(st.dice, card);
  if (jb && jb.indexOf(key) < 0) return null;

  var n = Rules.clone(st);
  var got = Rules.score(key, n.dice, card);
  n.cards[seat][key] = got;
  var bonus = Rules.jokerBonus(n.dice, card);
  if (bonus) n.cards[seat].bonusYahtzees = (n.cards[seat].bonusYahtzees || 0) + 1;
  n.log.push({ seat: seat, key: key, got: got, bonus: bonus, dice: n.dice.slice() });

  n.turn = (seat + 1) % n.seats;
  if (n.turn === 0) n.round++;
  n.rolls = 0;
  n.keep = [false, false, false, false, false];
  n.dice = [0, 0, 0, 0, 0];
  n.phase = Rules.over(n) ? "done" : "roll";
  return n;
};

Rules.over = function (st) {
  for (var i = 0; i < st.seats; i++) if (!Rules.done(st.cards[i])) return false;
  return true;
};
Rules.winner = function (st) {
  var best = -1, who = 0, tied = [];
  for (var i = 0; i < st.seats; i++) {
    var t = Rules.total(st.cards[i]);
    if (t > best) { best = t; who = i; tied = [i]; }
    else if (t === best) tied.push(i);
  }
  return { seat: who, total: best, tied: tied };
};

/* nothing is hidden in Yahtzee — everybody watches everybody's dice — so the
   view is the state. It exists because Table.deal asks for one. */
Rules.publicView = function (st, seat) {
  var v = Rules.clone(st);
  v.seat = seat;
  return v;
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
