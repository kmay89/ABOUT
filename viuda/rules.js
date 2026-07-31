/* rules.js — Viuda, complete and pure.

   Also called Whiskey Poker, and in English-language card books usually
   Commerce. *La viuda* is "the widow": a spare hand of five cards dealt face
   down in the middle of the table that anybody may take, and everything
   interesting about this game comes out of it.

   Five cards each, one widow, and on your turn exactly one of three things:

     · **take the widow** — swap your whole hand for it, and your old hand
       becomes the new widow, face up, for everybody behind you
     · **swap one card** with the widow, once it is face up
     · **knock** — say you are content. Everybody else gets one more turn and
       then the hands come down.

   Worst hand loses a life. Three lives each; last player still holding one
   wins.

   ## The one rule that makes it a game

   **Taking the widow gives your hand to the table.** It is not a free draw —
   the five cards you throw away land face up in front of the next player, who
   may take them, and every player after that gets to fish through them one
   card at a time. So the question is never "is the widow better than my
   hand". It is "is the widow better than my hand *by more than my hand is
   worth to the three people behind me*", and a player who has not noticed
   that will hand a pair of kings to the person on their left all evening.

   ## And the one that makes it short

   **Knocking is a clock, not a pass.** Once anybody knocks, everybody else
   gets exactly one more turn and the deal ends — so knocking with a mediocre
   hand early is a real weapon against a table that is all still fishing, and
   it is also how you stop a deal going round for ever.

   No DOM, no timers, and no randomness it was not handed. tools/rules-check.js
   deals a hundred thousand hands and checks the ranking against a second,
   slower implementation that works by brute force.                        */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;

var Rules = {};

Rules.LIVES = 3;
Rules.HAND = 5;

/* ================================================================
   the ranking

   A hand is scored as one integer, so comparing two hands is `>`. The top
   four bits are the category and the rest are the tiebreak ranks in the order
   that matters — which for a full house is the triple then the pair, and for
   two pair is the high pair, the low pair, then the kicker. Getting that
   order wrong is the classic way to build a poker evaluator that is right
   about ninety-nine hands in a hundred.
   ================================================================ */
Rules.CATS = ["high card", "a pair", "two pair", "three of a kind", "a straight",
              "a flush", "a full house", "four of a kind", "a straight flush"];

/* the wheel: A-2-3-4-5 is a straight, and it is the *lowest* one. An ace
   counted only as high is the other classic bug in this file's job. */
function straightTop(ranks) {
  /* ranks: sorted descending, distinct, 0..12 where 12 is the ace */
  if (ranks.length !== 5) return -1;
  var i;
  for (i = 1; i < 5; i++) if (ranks[i] !== ranks[0] - i) break;
  if (i === 5) return ranks[0];
  /* A-5-4-3-2, which as ranks is 12,3,2,1,0 */
  if (ranks[0] === 12 && ranks[1] === 3 && ranks[2] === 2 && ranks[3] === 1 && ranks[4] === 0) return 3;
  return -1;
}

Rules.score = function (hand) {
  if (!hand || hand.length !== 5) return -1;
  var i, r, counts = {}, suits = {}, ranks = [];
  for (i = 0; i < 5; i++) {
    r = Cards.rank(hand[i]);
    ranks.push(r);
    counts[r] = (counts[r] || 0) + 1;
    var s = Cards.suit(hand[i]);
    suits[s] = (suits[s] || 0) + 1;
  }
  var flush = false;
  for (var k in suits) if (suits[k] === 5) flush = true;

  /* distinct ranks, most-of-them first and then highest first — which is
     exactly the tiebreak order for every category at once */
  var distinct = [];
  for (var q in counts) distinct.push({ r: +q, n: counts[q] });
  distinct.sort(function (a, b) { return b.n - a.n || b.r - a.r; });

  var sorted = ranks.slice().sort(function (a, b) { return b - a; });
  var top = distinct.length === 5 ? straightTop(sorted) : -1;
  var straight = top >= 0;

  var cat;
  if (straight && flush) cat = 8;
  else if (distinct[0].n === 4) cat = 7;
  else if (distinct[0].n === 3 && distinct[1].n === 2) cat = 6;
  else if (flush) cat = 5;
  else if (straight) cat = 4;
  else if (distinct[0].n === 3) cat = 3;
  else if (distinct[0].n === 2 && distinct[1].n === 2) cat = 2;
  else if (distinct[0].n === 2) cat = 1;
  else cat = 0;

  /* Both branches must land on the same scale — category in the top digit
     and exactly five base-16 tiebreak digits under it — or `category` reads
     the wrong digit and every straight in the pack is scored as high card.
     One number decides a straight, and for the wheel that number is the five,
     not the ace it also contains. */
  var v = cat;
  if (straight) {
    v = v * 16 + (top + 1);
    for (i = 1; i < 5; i++) v = v * 16;
  } else {
    for (i = 0; i < 5; i++) v = v * 16 + (i < distinct.length ? distinct[i].r + 1 : 0);
  }
  return v;
};
Rules.category = function (hand) {
  var v = Rules.score(hand);
  if (v < 0) return -1;
  return Math.floor(v / Math.pow(16, 5));
};
Rules.name = function (hand) {
  var c = Rules.category(hand);
  return c < 0 ? "nothing" : Rules.CATS[c];
};
/* the long form, for the showdown — "kings and threes" rather than "two pair" */
Rules.describe = function (hand) {
  var c = Rules.category(hand);
  if (c < 0) return "nothing";
  var counts = {}, i, r;
  for (i = 0; i < hand.length; i++) {
    r = Cards.rank(hand[i]);
    counts[r] = (counts[r] || 0) + 1;
  }
  var d = [];
  for (var q in counts) d.push({ r: +q, n: counts[q] });
  d.sort(function (a, b) { return b.n - a.n || b.r - a.r; });
  var R = Cards.RANK;
  function plural(x) { return x === "6" ? "sixes" : x + "s"; }
  if (c === 4 || c === 8) {
    /* the wheel is five-high, and calling it ace-high is the same mistake as
       scoring it that way — it just says it out loud */
    var sorted = [];
    for (i = 0; i < hand.length; i++) sorted.push(Cards.rank(hand[i]));
    sorted.sort(function (a, b) { return b - a; });
    var t = straightTop(sorted);
    return (c === 8 ? "a straight flush, " : "a straight, ") + R[t] + " high";
  }
  switch (c) {
    case 8: return "a straight flush, " + R[d[0].r] + " high";
    case 7: return "four " + plural(R[d[0].r]);
    case 6: return plural(R[d[0].r]) + " full of " + plural(R[d[1].r]);
    case 5: return "a flush, " + R[d[0].r] + " high";
    case 4: return "a straight, " + R[d[0].r] + " high";
    case 3: return "three " + plural(R[d[0].r]);
    case 2: return plural(R[d[0].r]) + " and " + plural(R[d[1].r]);
    case 1: return "a pair of " + plural(R[d[0].r]);
    default: return R[d[0].r] + " high";
  }
};

/* ================================================================
   a deal
   ================================================================ */
Rules.start = function (players, opts) {
  var n = Math.max(2, Math.min(6, players || 3));
  var lives = [], i;
  for (i = 0; i < n; i++) lives.push((opts && opts.lives) || Rules.LIVES);
  return {
    seats: n, lives: lives, out: [], dealer: n - 1,
    hands: [], widow: [], shown: false,
    turn: 0, knocker: -1, phase: "deal", log: [], round: 0,
    last: null, opts: opts || {}
  };
};
Rules.clone = function (st) {
  return {
    seats: st.seats, lives: st.lives.slice(), out: st.out.slice(), dealer: st.dealer,
    hands: st.hands.map(function (h) { return h.slice(); }),
    widow: st.widow.slice(), shown: st.shown,
    turn: st.turn, knocker: st.knocker, phase: st.phase,
    log: st.log.slice(), round: st.round,
    last: st.last, opts: st.opts, result: st.result
  };
};

Rules.alive = function (st, seat) { return st.lives[seat] > 0; };
Rules.nextAlive = function (st, seat) {
  for (var i = 1; i <= st.seats; i++) {
    var s = (seat + i) % st.seats;
    if (Rules.alive(st, s)) return s;
  }
  return seat;
};
Rules.playerCount = function (st) {
  var n = 0;
  for (var i = 0; i < st.seats; i++) if (Rules.alive(st, i)) n++;
  return n;
};

Rules.deal = function (st, rnd) {
  var n = Rules.clone(st);
  var d = Cards.shuffle(Cards.deck(0), rnd);
  var at = 0, i;
  n.hands = [];
  for (i = 0; i < n.seats; i++) {
    if (Rules.alive(n, i)) n.hands.push(Cards.tidy(d.slice(at, at + 5))), at += 5;
    else n.hands.push([]);
  }
  n.widow = d.slice(at, at + 5);
  n.shown = false;
  n.dealer = Rules.nextAlive(n, n.dealer);
  n.turn = Rules.nextAlive(n, n.dealer);
  n.knocker = -1;
  n.phase = "play";
  n.round = 0;
  n.last = null;
  n.result = null;
  n.log = [];
  return n;
};

/* what this seat may do right now */
Rules.options = function (st, seat) {
  if (st.phase !== "play" || st.turn !== seat) return [];
  var out = [{ k: "take" }, { k: "knock" }];
  /* swapping needs a widow you can see — before anybody has taken it, the
     five cards in the middle are face down and nobody may fish in them */
  if (st.shown) out.push({ k: "swap" });
  return out;
};

/* ---------- the three moves ---------- */
Rules.take = function (st, seat) {
  if (st.phase !== "play" || st.turn !== seat) return null;
  var n = Rules.clone(st);
  var mine = n.hands[seat];
  n.hands[seat] = Cards.tidy(n.widow.slice());
  n.widow = mine.slice();
  /* and now everybody can see it, which is the whole cost of taking it */
  n.shown = true;
  n.log.push({ seat: seat, k: "take" });
  n.last = { seat: seat, k: "take" };
  return advance(n, seat);
};
Rules.swap = function (st, seat, mine, theirs) {
  if (st.phase !== "play" || st.turn !== seat || !st.shown) return null;
  var hi = st.hands[seat].indexOf(mine), wi = st.widow.indexOf(theirs);
  if (hi < 0 || wi < 0) return null;
  var n = Rules.clone(st);
  n.hands[seat][hi] = theirs;
  n.widow[wi] = mine;
  n.hands[seat] = Cards.tidy(n.hands[seat]);
  n.log.push({ seat: seat, k: "swap", got: theirs, gave: mine });
  n.last = { seat: seat, k: "swap", got: theirs, gave: mine };
  return advance(n, seat);
};
Rules.knock = function (st, seat) {
  if (st.phase !== "play" || st.turn !== seat) return null;
  var n = Rules.clone(st);
  /* the first knock starts the clock; a later one is just a pass, because
     the deal is already ending */
  if (n.knocker < 0) n.knocker = seat;
  n.log.push({ seat: seat, k: "knock" });
  n.last = { seat: seat, k: "knock" };
  return advance(n, seat);
};

/* Whose turn now — and is the deal over?

   Two ways it ends. Somebody knocked and the turn has come back round to
   them, which is the ordinary way. Or nobody has taken the widow and nobody
   has knocked for a whole lap, in which case the middle is turned face up
   and the table gets one more lap to fish in it — after which, if still
   nothing has happened, it ends rather than going round for ever. */
function advance(n, seat) {
  var next = Rules.nextAlive(n, seat);
  if (next === Rules.nextAlive(n, n.dealer)) n.round++;

  if (n.knocker >= 0 && next === n.knocker) return showdown(n);
  if (n.round >= 1 && !n.shown) {
    /* a whole lap and nobody wanted it: turn it over and let them fish */
    n.shown = true;
    n.log.push({ seat: -1, k: "turn" });
  }
  if (n.round >= 3) return showdown(n);
  n.turn = next;
  return n;
}

function showdown(n) {
  n.phase = "show";
  n.turn = -1;
  var scores = [], i, worst = Infinity, best = -Infinity;
  for (i = 0; i < n.seats; i++) {
    scores.push(Rules.alive(n, i) ? Rules.score(n.hands[i]) : -1);
  }
  for (i = 0; i < n.seats; i++) {
    if (!Rules.alive(n, i)) continue;
    if (scores[i] < worst) worst = scores[i];
    if (scores[i] > best) best = scores[i];
  }
  var losers = [], winners = [];
  for (i = 0; i < n.seats; i++) {
    if (!Rules.alive(n, i)) continue;
    if (scores[i] === worst) losers.push(i);
    if (scores[i] === best) winners.push(i);
  }
  /* everybody holding the worst hand pays. With every hand equal — which can
     happen with two players and does not happen otherwise — nobody does,
     because a deal where everybody loses a life is not a deal. */
  if (losers.length === Rules.playerCount(n)) losers = [];
  for (i = 0; i < losers.length; i++) n.lives[losers[i]]--;
  n.result = { scores: scores, losers: losers, winners: winners, worst: worst, best: best };
  for (i = 0; i < n.seats; i++) {
    if (n.lives[i] === 0 && n.out.indexOf(i) < 0) n.out.push(i);
  }
  if (Rules.playerCount(n) <= 1) n.phase = "over";
  return n;
}
Rules.showdown = showdown;

Rules.over = function (st) { return st.phase === "over"; };
Rules.winner = function (st) {
  for (var i = 0; i < st.seats; i++) if (Rules.alive(st, i)) return i;
  return -1;
};

/* ================================================================
   the view

   The one secret in this game is the four hands that are not yours, and it
   is a real secret — so the host never sends the state. Each phone gets its
   own hand, the widow only if it has been turned face up, and a count for
   everybody else. tools/rules-check.js shuffles the unseen cards a few
   hundred times and requires this message to come back byte-identical.
   ================================================================ */
Rules.publicView = function (st, seat) {
  var v = {
    seats: st.seats, seat: seat, lives: st.lives.slice(), out: st.out.slice(),
    dealer: st.dealer, turn: st.turn, knocker: st.knocker, phase: st.phase,
    shown: st.shown, round: st.round, last: st.last,
    hand: (st.hands[seat] || []).slice(),
    widow: st.shown ? st.widow.slice() : [],
    widowCount: st.widow.length,
    counts: [], log: st.log.slice(), opts: st.opts
  };
  for (var i = 0; i < st.seats; i++) v.counts.push((st.hands[i] || []).length);
  /* at the showdown everything is on the table, and that is the point of it */
  if (st.phase === "show" || st.phase === "over") {
    v.hands = st.hands.map(function (h) { return h.slice(); });
    v.widow = st.widow.slice();
    v.result = st.result;
  }
  return v;
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
