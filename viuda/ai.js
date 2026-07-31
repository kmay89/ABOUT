/* ai.js — the rest of the table.

   The thing to understand before any of this makes sense: **in Viuda you do
   not win the deal, you avoid losing it.** Only the worst hand pays. A pair
   of sevens is a disaster heads-up and perfectly comfortable with five other
   people at the table, because with five other people somebody is holding
   king-high. Every player here that is any good is answering "how likely am I
   to be the worst hand at *this* table", and the weak one is answering "is my
   hand good", which is a different question with the same shape.

   Three tiers, and they are three different functions.

     · **Hopeful** compares categories. Two pair beats a pair, so it takes the
       widow when the widow shows two pair, swaps its lowest card for the
       widow's highest, and knocks once it holds two pair. It has never
       noticed that the hand it throws into the middle is a present.

     · **Careful** stops comparing categories and starts comparing hands. It
       evaluates all twenty-five swaps exactly rather than the one obvious
       one — which is where kickers, flush draws and the difference between
       jacks-and-fours and jacks-and-queens live — and it prices the giveaway:
       taking the widow puts your five cards face up in front of everybody
       still to act, so a good hand costs more to abandon than a bad one. It
       also knows that the knock threshold moves with the number of players.

     · **The Widow** stops evaluating its hand at all and estimates the only
       number that pays: **the chance of being the worst hand when the cards
       come down.** It deals the unseen pack to the other chairs a couple of
       hundred times, lets each of them take the widow if the widow beats what
       they were dealt — because that is what they will do — and counts. It
       will keep a busted hand that is merely unlikely to be last, and it will
       break a made pair to avoid being the one that pays.

   The gap between the second and the third is the gap between playing poker
   and playing this game. tools/ai-check.js seats each tier against the one
   below and requires it to survive more often than its share.              */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;
var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var AI = {};

AI.TIERS = [
  { key: "hopeful", name: "Hopeful", naive: true, samples: 0, giveaway: 0,
    blurb: "Compares categories, swaps its worst card for the widow's best, and hands you its pair of kings without noticing." },
  { key: "careful", name: "Careful", naive: false, samples: 0, giveaway: 1,
    blurb: "Weighs all twenty-five swaps exactly, and knows that the hand it drops in the middle is a present to everybody behind it." },
  { key: "widow",   name: "The Widow", naive: false, samples: 200, giveaway: 1,
    blurb: "Deals the unseen pack out a couple of hundred times and plays the only number that pays — the chance of being the worst hand at this table." }
];
AI.tier = function (k) {
  for (var i = 0; i < AI.TIERS.length; i++) if (AI.TIERS[i].key === k) return AI.TIERS[i];
  return AI.TIERS[1];
};

/* ================================================================
   the shared machinery
   ================================================================ */

/* everything this seat has not been shown */
function unseen(view) {
  var seen = {}, i;
  for (i = 0; i < view.hand.length; i++) seen[view.hand[i]] = 1;
  for (i = 0; i < view.widow.length; i++) seen[view.widow[i]] = 1;
  var pool = [];
  for (var c = 0; c < 52; c++) if (!seen[c]) pool.push(c);
  return pool;
}

/* how many people are still in the deal */
function liveCount(view) {
  var n = 0;
  for (var i = 0; i < view.seats; i++) if (view.lives[i] > 0) n++;
  return n;
}

/* every hand one swap away, plus standing pat. Twenty-six candidates and the
   exact score of each — the difference between this and "swap the worst for
   the best" is a kicker, and kickers decide this game constantly. */
function swaps(hand, widow) {
  var out = [], i, j;
  for (i = 0; i < hand.length; i++) {
    for (j = 0; j < widow.length; j++) {
      var h = hand.slice();
      h[i] = widow[j];
      out.push({ mine: hand[i], theirs: widow[j], hand: h, score: Rules.score(h) });
    }
  }
  out.sort(function (a, b) { return b.score - a.score; });
  return out;
}

/* ================================================================
   Hopeful — categories, and nothing else
   ================================================================ */
function hopeful(view) {
  var hand = view.hand, mine = Rules.category(hand);
  if (view.shown && view.widow.length === 5) {
    var theirs = Rules.category(view.widow);
    if (theirs > mine) return { k: "take", why: ["theirs-is-better"] };
    /* the one obvious swap: my worst card for their best */
    var low = hand[0], high = view.widow[0], i;
    for (i = 0; i < hand.length; i++) if (Cards.rank(hand[i]) < Cards.rank(low)) low = hand[i];
    for (i = 0; i < view.widow.length; i++) if (Cards.rank(view.widow[i]) > Cards.rank(high)) high = view.widow[i];
    if (Cards.rank(high) > Cards.rank(low)) {
      return { k: "swap", mine: low, theirs: high, why: ["bigger-card"] };
    }
  }
  if (mine >= 2) return { k: "knock", why: ["two-pair"] };
  if (!view.shown) return { k: "take", why: ["blind"] };
  return { k: "knock", why: ["nothing-doing"] };
}

/* ================================================================
   Careful — exact scores, and the price of a giveaway
   ================================================================ */

/* Roughly what the table needs. With two people the worst hand is a coin
   toss and a pair is genuinely fine; with six, somebody will have two pair
   and a pair is nothing. So the bar to stop moving climbs with the room. */
function knockBar(n) {
  return n <= 2 ? 1 : n <= 3 ? 1 : n <= 4 ? 2 : 2;
}
function careful(view, tier) {
  var hand = view.hand, mineScore = Rules.score(hand), mineCat = Rules.category(hand);
  var live = liveCount(view);
  var bar = knockBar(live);

  if (!view.shown) {
    /* Face down. Taking it is a blind swap of five for five, so it is only
       worth it with a hand that is going to lose anyway — and it costs you
       the hand, face up, to everybody behind. */
    if (mineCat === 0 && topRank(hand) < 10) return { k: "take", why: ["nothing-to-lose"] };
    if (mineCat >= bar) return { k: "knock", why: ["good-enough"] };
    return { k: "knock", why: ["wait-for-it"] };
  }

  var takeScore = Rules.score(view.widow);
  var best = swaps(hand, view.widow)[0];
  var gain = best ? best.score - mineScore : 0;

  /* the giveaway: what you drop in the middle is a present. Price it by how
     good it is — handing over two pair to three people still to act is how
     you lose a life you were never going to lose. */
  var behind = playersBehind(view);
  var give = tier.giveaway ? mineCat * behind * 0.5 : 0;
  var takeWorth = catOf(takeScore) - mineCat - give;

  if (takeScore > mineScore && takeWorth > 0) return { k: "take", why: ["worth-the-giveaway"] };
  if (gain > 0 && catOf(best.score) >= mineCat) {
    /* only stop swapping once the hand clears the bar for this table */
    if (mineCat >= bar && catOf(best.score) === mineCat) return { k: "knock", why: ["good-enough"] };
    return { k: "swap", mine: best.mine, theirs: best.theirs, why: ["best-of-twenty-five"] };
  }
  if (mineCat >= bar) return { k: "knock", why: ["good-enough"] };
  return { k: "knock", why: ["nothing-doing"] };
}
function catOf(score) { return score < 0 ? -1 : Math.floor(score / Math.pow(16, 5)); }
function topRank(hand) {
  var t = -1;
  for (var i = 0; i < hand.length; i++) if (Cards.rank(hand[i]) > t) t = Cards.rank(hand[i]);
  return t;
}
/* how many people still get a turn before the deal ends — the audience for
   whatever you drop in the middle */
function playersBehind(view) {
  var n = 0, s = view.seat;
  for (var i = 1; i < view.seats; i++) {
    var q = (s + i) % view.seats;
    if (view.lives[q] <= 0) continue;
    if (view.knocker >= 0 && q === view.knocker) break;
    n++;
  }
  return n;
}

/* ================================================================
   The Widow — the chance of being last

   The estimator. Deal the unseen pack to the other chairs, let each of them
   take the widow if the widow beats what they were dealt (which is what they
   will do, and is why the widow gets better as it goes round), then count how
   often this hand is the worst one on the table. Ties count as a loss,
   because a tied worst hand pays.
   ================================================================ */
function pWorst(hand, view, widowForThem, laps, pool, rnd, n) {
  var mine = Rules.score(hand), live = [], i, s;
  for (s = 0; s < view.seats; s++) if (view.lives[s] > 0 && s !== view.seat) live.push(s);
  if (!live.length) return 0;

  var need = live.length * 5;
  if (pool.length < need) return 0.5;
  var lost = 0;
  var deck = pool.slice();
  for (var t = 0; t < n; t++) {
    /* a partial shuffle — only the cards actually dealt need to move */
    for (i = 0; i < need; i++) {
      var j = i + ((rnd() * (deck.length - i)) | 0);
      var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
    }
    var mid = widowForThem ? widowForThem.slice() : null;
    var worstOther = Infinity;
    for (i = 0; i < live.length; i++) {
      var h = deck.slice(i * 5, i * 5 + 5);
      var sc = Rules.score(h);
      /* they will take the middle if it beats what they hold — and then their
         old hand is what the next one sees, which is the whole rhythm of the
         game and the reason a widow improves as it travels */
      for (var lap = 0; lap < laps && mid; lap++) {
        var ms = Rules.score(mid);
        if (ms > sc) { var old = h; h = mid; mid = old; sc = ms; }
        else break;
      }
      if (sc < worstOther) worstOther = sc;
    }
    if (mine <= worstOther) lost++;
  }
  return lost / n;
}

function widowPlayer(view, tier, rnd) {
  var hand = view.hand;
  var pool = unseen(view);
  var live = liveCount(view);
  var behind = playersBehind(view);
  var n = tier.samples;
  rnd = rnd || Math.random;

  /* Knocking ends the deal after one more lap, so everybody else improves
     once. Not knocking leaves the deal running, so they improve twice. That
     difference is the whole value of a knock and it is modelled rather than
     guessed at. */
  var options = [];
  var visible = view.shown && view.widow.length === 5;

  options.push({
    k: "knock",
    p: pWorst(hand, view, visible ? view.widow : null, 1, pool, rnd, n),
    why: ["stop-the-clock"]
  });

  if (visible) {
    /* taking it hands them my hand, and it is a good widow for them by
       definition of my having wanted it */
    options.push({
      k: "take",
      p: pWorst(view.widow, view, hand, 2, pool, rnd, n),
      why: ["better-odds"]
    });
    var cand = swaps(hand, view.widow);
    /* the top few by raw score, then judged by the number that pays — the
       best poker hand and the least likely to be last are not always the
       same card, and when they differ this is the one that is right */
    for (var i = 0; i < Math.min(6, cand.length); i++) {
      var rest = view.widow.slice();
      rest[rest.indexOf(cand[i].theirs)] = cand[i].mine;
      options.push({
        k: "swap", mine: cand[i].mine, theirs: cand[i].theirs,
        p: pWorst(cand[i].hand, view, rest, 2, pool, rnd, n),
        why: ["least-likely-last"]
      });
    }
  } else {
    /* face down: five unknown cards. Sampling them is the only way to know
       whether the swap is worth it, and it is exactly as cheap as the rest. */
    var blind = 0;
    for (var t = 0; t < 24; t++) {
      var d = pool.slice();
      for (var q = 0; q < 5; q++) {
        var j = q + ((rnd() * (d.length - q)) | 0);
        var tm = d[q]; d[q] = d[j]; d[j] = tm;
      }
      blind += pWorst(d.slice(0, 5), view, hand, 2, pool, rnd, Math.max(8, (n / 8) | 0));
    }
    options.push({ k: "take", p: blind / 24, why: ["blind-but-counted"] });
  }

  options.sort(function (a, b) { return a.p - b.p; });
  var pick = options[0];
  pick.risk = pick.p;
  if (options.length > 1 && options[1].p - pick.p < 0.02) pick.why.push("close-call");
  if (pick.p < 0.08 && live > 2) pick.why.push("safe");
  if (pick.p > 0.5) pick.why.push("in-trouble");
  if (behind === 0) pick.why.push("last-to-act");
  return pick;
}

/* ================================================================
   the one call the room makes
   ================================================================ */
AI.choose = function (view, tierKey, rnd) {
  if (!view || view.phase !== "play") return null;
  var tier = AI.tier(tierKey);
  var pick;
  if (tier.naive) pick = hopeful(view);
  else if (!tier.samples) pick = careful(view, tier);
  else pick = widowPlayer(view, tier, rnd);

  /* a swap needs a face-up widow, and a knock is always legal — so anything
     that cannot be played becomes a knock rather than a thrown error */
  if (pick.k === "swap" && !(view.shown && view.widow.length === 5)) pick = { k: "knock", why: ["nothing-doing"] };
  if (pick.k === "swap" && (view.hand.indexOf(pick.mine) < 0 || view.widow.indexOf(pick.theirs) < 0)) {
    pick = { k: "knock", why: ["nothing-doing"] };
  }
  return pick;
};

/* play one whole action for the harness and for a bot in a chair */
AI.act = function (st, seat, tierKey, rnd) {
  var pick = AI.choose(Rules.publicView(st, seat), tierKey, rnd);
  if (!pick) return null;
  if (pick.k === "take") return Rules.take(st, seat);
  if (pick.k === "swap") return Rules.swap(st, seat, pick.mine, pick.theirs);
  return Rules.knock(st, seat);
};

AI.pWorst = pWorst;
AI.swaps = swaps;

if (typeof module !== "undefined" && module.exports) module.exports = AI;
else root.AI = AI;
})(typeof self !== "undefined" ? self : this);
