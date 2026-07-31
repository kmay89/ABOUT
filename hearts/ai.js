/* ai.js — the other three at the table.

   Hearts cannot be searched the way draughts can, because you cannot see the
   other three hands. Alpha-beta over a position you do not know is not a
   weaker version of the right idea, it is the wrong idea. There are two
   honest approaches and this uses both, in layers.

   ## The policy

   A set of judgements about a single card, which is what a decent club player
   actually uses:

     · **Ducking.** Following suit with the highest card you can play *under*
       the current winner is the single most valuable habit in the game.
     · **Voids are worth making.** A suit you cannot follow is a suit you can
       throw the queen into. So high cards in short suits get passed, and
       short suits get emptied early.
     · **The queen is a clock.** If you hold her, you want spades led by
       somebody else and you want to be void in the suit that is led. If you
       do not hold her, every spade you play above the jack is a bet.
     · **The last four tricks decide the moon.** A player who has taken every
        point so far must be stopped, and stopping them is worth taking
        points yourself.

   ## The voids

   Every time a seat fails to follow suit, that is *public information*: the
   whole table saw it and it is remembered. This is the same discipline the
   domino room's coach is built on — the machine may use what it was told,
   and may not use what it can see in the state it happens to be holding. The
   void table is built from the play log alone, so a bot reasoning from it is
   reasoning from something a person at the table also knows.

   ## The rollouts

   For the strongest tier, determinization: deal the unseen cards at random
   *consistently with the voids*, play the hand out with the policy above,
   and average the points. Forty deals is enough to separate two candidate
   cards that the policy scores equally, which is exactly the case where the
   policy is guessing.

   Being consistent with the voids is the part that matters. Sampling
   uniformly from the unseen cards would deal a heart to a player everybody
   watched discard on hearts, and a search built on impossible worlds is
   worse than no search — it is confidently wrong.                          */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;
var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var AI = {};
var QS = Rules.QS;

/* The three differ in *kind*, not only in care. Making the beginner a
   slightly noisier expert is the standard mistake and it produces an
   opponent nobody recognises: it still ducks, still counts the queen, still
   makes voids, and merely mistimes them. A real beginner does none of those
   things, so `naive` is a different function rather than a smaller number.
   The check is tools/ai-check.js, which requires each rung to actually beat
   the one below over a run of matches. */
AI.TIERS = [
  { key: "novice", name: "Learning", naive: true, duck: 0, rolls: 0, fuzz: 0.35,
    blurb: "Plays high cards because they are high. Hasn't worked out what the queen is for." },
  { key: "steady", name: "Steady",   naive: false, duck: 1, rolls: 0, fuzz: 0.05,
    blurb: "Ducks properly, counts the queen, and won't lead into you." },
  { key: "sharp",  name: "Sharp",    naive: false, duck: 1, rolls: 40, fuzz: 0,
    blurb: "Remembers every suit you couldn't follow, and plays the hand out forty times before choosing." }
];
AI.tier = function (k) {
  for (var i = 0; i < AI.TIERS.length; i++) if (AI.TIERS[i].key === k) return AI.TIERS[i];
  return AI.TIERS[1];
};

/* ---------- what the table has been told ----------
   Built from the play log only: who led what, and who could not follow. */
AI.voids = function (st) {
  var v = [[false, false, false, false], [false, false, false, false],
           [false, false, false, false], [false, false, false, false]];
  var led = -1, inTrick = 0;
  for (var i = 0; i < st.log.length; i++) {
    var e = st.log[i];
    if (inTrick === 0) { led = Cards.suit(e.card); }
    else if (Cards.suit(e.card) !== led) v[e.seat][led] = true;
    inTrick = (inTrick + 1) % 4;
  }
  /* the trick in progress counts too — it happened in front of everybody */
  if (st.trick.length) {
    var l2 = Cards.suit(st.trick[0].card);
    for (i = 1; i < st.trick.length; i++) {
      if (Cards.suit(st.trick[i].card) !== l2) v[st.trick[i].seat][l2] = true;
    }
  }
  return v;
};

/* which cards nobody at this seat has seen */
function unseen(st, seat) {
  var out = [], have = {}, i, s;
  for (i = 0; i < st.hands[seat].length; i++) have[st.hands[seat][i]] = 1;
  for (s = 0; s < 4; s++) for (i = 0; i < st.taken[s].length; i++) have[st.taken[s][i]] = 1;
  for (i = 0; i < st.trick.length; i++) have[st.trick[i].card] = 1;
  for (i = 0; i < 52; i++) if (!have[i]) out.push(i);
  return out;
}

/* ---------- the policy ---------- */
function trickWinner(trick) {
  var led = Cards.suit(trick[0].card), best = -1, who = trick[0].seat;
  for (var i = 0; i < trick.length; i++) {
    if (Cards.suit(trick[i].card) !== led) continue;
    if (Cards.rank(trick[i].card) > best) { best = Cards.rank(trick[i].card); who = trick[i].seat; }
  }
  return { seat: who, rank: best, suit: led };
}
function trickPoints(trick) {
  var p = 0;
  for (var i = 0; i < trick.length; i++) p += Rules.isPoint(trick[i].card) ? (trick[i].card === QS ? 13 : 1) : 0;
  return p;
}

/* is anybody about to shoot? A seat that has taken every point so far and
   there are points still out is a seat that must be broken up. */
function moonRisk(st, me) {
  var hearts = [0, 0, 0, 0], q = -1, s, i;
  for (s = 0; s < 4; s++) for (i = 0; i < st.taken[s].length; i++) {
    if (Cards.suit(st.taken[s][i]) === 2) hearts[s]++;
    if (st.taken[s][i] === QS) q = s;
  }
  var total = hearts[0] + hearts[1] + hearts[2] + hearts[3];
  if (total < 4) return -1;
  for (s = 0; s < 4; s++) {
    if (s === me) continue;
    if (hearts[s] === total && (q < 0 || q === s)) return s;
  }
  return -1;
}

/* Score a card, lower is better. This is the whole player. */
AI.value = function (st, seat, card, tier, vd) {
  var hand = st.hands[seat];
  var v = 0, i;
  var leading = st.trick.length === 0;
  var last = st.trick.length === 3;
  var risk = moonRisk(st, seat);

  /* The beginner. Not a worse expert — a different reader of the position.
     It knows the rules and nothing else: a high card is a good card, a trick
     is worth taking, and the queen of spades is just a queen. Every one of
     those is a habit real beginners have and every one of them loses hearts. */
  if (tier.naive) {
    if (leading) return -Cards.rank(card) * 2;         /* lead the biggest thing */
    var led0 = Cards.suit(st.trick[0].card);
    if (Cards.suit(card) === led0) {
      var w0 = trickWinner(st.trick);
      /* try to win, and if you can't, throw the smallest */
      return Cards.rank(card) > w0.rank ? -30 - Cards.rank(card) : Cards.rank(card);
    }
    return -Cards.rank(card);                          /* discard the biggest */
  }

  if (leading) {
    var suit = Cards.suit(card), rank = Cards.rank(card);
    var mine = [], hi = 0;
    for (i = 0; i < hand.length; i++) if (Cards.suit(hand[i]) === suit) { mine.push(hand[i]); if (Cards.rank(hand[i]) > hi) hi = Cards.rank(hand[i]); }
    /* leading low is safe; leading an ace is asking for whatever comes back */
    v += rank * 2.6;
    /* a short suit is worth emptying — a void is where the queen goes */
    v -= (5 - Math.min(5, mine.length)) * 3.2;
    if (suit === 2) v += 22;                       /* leading hearts gives points away */
    if (card === QS) v += 60;
    if (suit === 3) {
      var haveQ = hand.indexOf(QS) >= 0;
      var qGone = gone(st, QS);
      if (!haveQ && !qGone) {
        /* smoking the queen out is good, but only from below her */
        if (rank < 10) v -= 14; else v += 30;
      } else if (haveQ) {
        v += 26;                                   /* do not lead your own suit */
      }
    }
    if (risk >= 0) v -= 8;                          /* somebody is shooting: take the lead back */
    return v;
  }

  var led = Cards.suit(st.trick[0].card);
  var w = trickWinner(st.trick);
  var pts = trickPoints(st.trick);

  if (Cards.suit(card) === led) {
    var wins = Cards.rank(card) > w.rank;
    if (last) {
      /* the last to play knows exactly what the trick costs */
      if (wins) {
        if (risk >= 0 && pts > 0) v -= 30;          /* break the moon up */
        else v += 12 + pts * 6;
      } else {
        v -= 6;
        v -= Cards.rank(card) * 0.6;                /* throw the highest safe card */
      }
    } else {
      if (wins) v += 9 + pts * 5 + (13 - st.tricks) * 0.4;
      else v -= 4;
      /* ducking: the highest card that still loses is the best of them */
      if (!wins) v -= Cards.rank(card) * (tier.duck * 0.8);
      else v += Cards.rank(card) * 0.7;
    }
    if (card === QS) v += (wins ? 70 : -18);        /* dumping her under is a gift */
    if (Cards.suit(card) === 2 && wins) v += 6;
    return v;
  }

  /* void in the led suit: this is a discard, and the whole game is here */
  if (card === QS) return -120;                      /* the best moment there is */
  if (Cards.suit(card) === 2) v -= 8 + Cards.rank(card) * 1.8;
  else v -= Cards.rank(card) * 2.2;
  /* keep low spades if the queen is still out and you are not holding her */
  if (Cards.suit(card) === 3 && !gone(st, QS) && hand.indexOf(QS) < 0) {
    if (Cards.rank(card) > 10) v -= 26;              /* the ace and king are liabilities */
    else v += 12;                                    /* small spades are your protection */
  }
  if (risk >= 0 && Rules.isPoint(card)) v += 40;     /* do not feed a shooter */
  return v;
};
function gone(st, card) {
  for (var s = 0; s < 4; s++) if (st.taken[s].indexOf(card) >= 0) return true;
  for (var i = 0; i < st.trick.length; i++) if (st.trick[i].card === card) return true;
  return false;
}

/* deterministic wobble, seeded by the position: a beginner who is weak in
   the same way every time is one you can learn to read */
function jitter(st, card, amount) {
  if (!amount) return 0;
  var h = st.log.length * 2654435761 + card * 40503 + st.tricks * 2246822519;
  h = (h ^ (h >>> 15)) >>> 0;
  return ((h % 2001) / 1000 - 1) * amount * 40;
}

/* ---------- rollouts ----------
   Deal the unseen cards consistently with what everybody watched happen, then
   play the hand out with the policy and see what it cost. */
function determinize(st, seat, vd, rnd) {
  var pool = unseen(st, seat).slice();
  var need = [], s;
  for (s = 0; s < 4; s++) need.push(s === seat ? 0 : st.hands[s].length);
  Cards.shuffle(pool, rnd);

  /* the constrained deal: hand out cards nobody is known to be void in.
     Greedy with one restart, because a perfect constrained deal needs a
     matching and a wrong one costs a rollout, not a game. */
  for (var attempt = 0; attempt < 3; attempt++) {
    var give = [[], [], [], []], ok = true;
    var bag = pool.slice();
    /* hardest first: a seat with more voids has fewer cards it can take */
    var order = [0, 1, 2, 3].filter(function (x) { return x !== seat; })
      .sort(function (a, b) { return count(vd[b]) - count(vd[a]); });
    for (var oi = 0; oi < order.length; oi++) {
      s = order[oi];
      for (var k = 0; k < need[s]; k++) {
        var found = -1;
        for (var i = 0; i < bag.length; i++) {
          if (!vd[s][Cards.suit(bag[i])]) { found = i; break; }
        }
        if (found < 0) { ok = false; break; }
        give[s].push(bag.splice(found, 1)[0]);
      }
      if (!ok) break;
    }
    if (ok) {
      var n = Rules.clone(st);
      for (s = 0; s < 4; s++) if (s !== seat) n.hands[s] = give[s];
      return n;
    }
    Cards.shuffle(pool, rnd);
  }
  return null;
}
function count(row) { return (row[0] ? 1 : 0) + (row[1] ? 1 : 0) + (row[2] ? 1 : 0) + (row[3] ? 1 : 0); }

function playOut(st, tier, rnd) {
  var cur = st, guard = 0;
  while (cur.phase === "play" && guard++ < 60) {
    var seat = cur.turn;
    var legal = Rules.legal(cur, seat);
    if (!legal.length) break;
    var vd = AI.voids(cur);
    var best = legal[0], bv = 1e9;
    for (var i = 0; i < legal.length; i++) {
      var v = AI.value(cur, seat, legal[i], tier, vd) + (rnd() - 0.5) * 3;
      if (v < bv) { bv = v; best = legal[i]; }
    }
    var nx = Rules.play(cur, seat, best);
    if (!nx) break;
    cur = nx;
  }
  return cur;
}

/* ---------- choosing ---------- */
AI.choose = function (st, seat, tierKey, rnd) {
  var tier = AI.tier(tierKey);
  rnd = rnd || Math.random;
  var legal = Rules.legal(st, seat);
  if (!legal.length) return null;
  if (legal.length === 1) return { card: legal[0], why: ["forced"], rolls: 0 };

  var vd = AI.voids(st);
  var scored = [], i;
  for (i = 0; i < legal.length; i++) {
    scored.push({ card: legal[i], v: AI.value(st, seat, legal[i], tier, vd) + jitter(st, legal[i], tier.fuzz) });
  }
  scored.sort(function (a, b) { return a.v - b.v; });

  var pick = scored[0], rolls = 0;
  if (tier.rolls) {
    /* only the plausible candidates get rolled out — the policy is right
       about the obviously bad ones and the budget is better spent elsewhere */
    var top = scored.slice(0, Math.min(4, scored.length));
    var sums = [], counts = [];
    for (i = 0; i < top.length; i++) { sums.push(0); counts.push(0); }
    for (var r = 0; r < tier.rolls; r++) {
      var world = determinize(st, seat, vd, rnd);
      if (!world) continue;
      for (i = 0; i < top.length; i++) {
        var after = Rules.play(world, seat, top[i].card);
        if (!after) continue;
        var end = playOut(after, tier, rnd);
        var t = Rules.tally(end);
        var cost = t.add[seat];
        /* a hand still in progress is scored on what has been taken so far,
           which is the honest partial answer rather than a guess at the rest */
        sums[i] += cost;
        counts[i]++;
        rolls++;
      }
    }
    var bestI = 0, bestV = 1e9;
    for (i = 0; i < top.length; i++) {
      if (!counts[i]) continue;
      var avg = sums[i] / counts[i];
      if (avg < bestV) { bestV = avg; bestI = i; }
    }
    if (counts[bestI]) pick = { card: top[bestI].card, v: bestV, avg: bestV };
  }

  return { card: pick.card, why: reasons(st, seat, pick.card, scored, vd), rolls: rolls,
           avg: pick.avg === undefined ? null : pick.avg };
};

/* ---------- the pass ----------
   Three cards, and the aim is not "get rid of the highest". It is: make a
   void, and get rid of the queen if you cannot protect her. */
AI.pass = function (st, seat, tierKey) {
  var hand = st.hands[seat].slice(), i, s;
  var bySuit = [[], [], [], []];
  for (i = 0; i < hand.length; i++) bySuit[Cards.suit(hand[i])].push(hand[i]);

  /* the beginner passes its three highest cards, which is what everybody
     does before somebody explains what a void is for */
  if (AI.tier(tierKey).naive) {
    hand.sort(function (a, b) { return Cards.rank(b) - Cards.rank(a); });
    return hand.slice(0, 3);
  }

  var score = {};
  for (i = 0; i < hand.length; i++) {
    var c = hand[i], suit = Cards.suit(c), rank = Cards.rank(c), n = bySuit[suit].length;
    var v = rank * 2;
    /* the queen goes unless you have three small spades to hide behind */
    if (c === QS) {
      var small = 0;
      for (s = 0; s < bySuit[3].length; s++) if (Cards.rank(bySuit[3][s]) < 10) small++;
      v = small >= 3 ? 4 : 90;
    } else if (suit === 3 && rank > 10) {
      v = 70;                                  /* ace and king of spades: liabilities */
    } else if (suit === 3 && rank < 10) {
      v = -20;                                 /* small spades are protection, keep */
    } else {
      /* a short suit is worth emptying entirely; a long one is worth keeping
         low cards in, because you will need something safe to lead */
      v += (5 - Math.min(5, n)) * 7;
      if (rank <= 3) v -= 22;
      if (suit === 2) v += rank > 8 ? 20 : -8;
    }
    score[c] = v;
  }
  hand.sort(function (a, b) { return score[b] - score[a]; });
  return hand.slice(0, 3);
};

/* ---------- why ---------- */
function reasons(st, seat, card, scored, vd) {
  var why = [], leading = st.trick.length === 0;
  if (card === QS) why.push(leading ? "lead-queen" : (st.trick.length && Cards.suit(card) !== Cards.suit(st.trick[0].card) ? "dump-queen" : "queen"));
  if (leading) {
    var suit = Cards.suit(card), n = 0;
    for (var i = 0; i < st.hands[seat].length; i++) if (Cards.suit(st.hands[seat][i]) === suit) n++;
    if (n === 1) why.push("last-of-suit");
    if (Cards.rank(card) <= 2) why.push("lead-low");
    if (suit === 3 && Cards.rank(card) < 10 && !gone(st, QS) && st.hands[seat].indexOf(QS) < 0) why.push("smoke-queen");
    if (suit === 2) why.push("lead-heart");
  } else {
    var led = Cards.suit(st.trick[0].card);
    if (Cards.suit(card) !== led) why.push("void");
    else {
      var w = trickWinner(st.trick);
      if (Cards.rank(card) > w.rank) why.push(st.trick.length === 3 ? "must-take" : "takes");
      else why.push("ducks");
    }
    if (trickPoints(st.trick) > 0 && Cards.rank(card) <= 4) why.push("under-points");
  }
  if (moonRisk(st, seat) >= 0) why.push("stop-moon");
  if (scored.length > 1 && Math.abs(scored[0].v - scored[1].v) < 4) why.push("close-call");
  if (!why.length) why.push("safe");
  return why;
}

if (typeof module !== "undefined" && module.exports) module.exports = AI;
else root.AI = AI;
})(typeof self !== "undefined" ? self : this);
