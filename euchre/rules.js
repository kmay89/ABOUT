/* rules.js — euchre, complete and pure.

   Twenty-four cards: nine, ten, jack, queen, king, ace of each suit, which is
   ranks 7…12 of the shared encoding in cards.js. Four players in two
   partnerships — seats 0 and 2 against seats 1 and 3. Five tricks a hand,
   first partnership to ten points.

   ## The bowers, which are the whole game

   The jack of the trump suit is the **right bower** and is the highest card
   in the pack. The other jack of the same colour is the **left bower**, and
   it is the second highest — and, crucially, **it stops being its printed
   suit**. With spades as trump, the jack of clubs is a spade. It is led as a
   spade, it must be followed as a spade, and a player holding the jack of
   clubs and no other clubs is *void in clubs*.

   Every euchre bug anybody has ever written is that rule, and it is the
   reason `suitOf` exists and is used everywhere below instead of
   Cards.suit(). Any line in this file that asks a card its printed suit
   while trump is set is a bug waiting to be found.

   ## The bidding

   The top card of the kitty is turned up. Going round from the dealer's left,
   each seat may **order it up** — making that suit trump and forcing the
   dealer to pick the card up and discard something. If all four pass, the
   card is turned down and a second round goes by, in which each seat may name
   any suit *except* the one just turned down. If everybody passes again the
   hand is thrown in — unless the table plays "stick the dealer", where the
   dealer must name something, which is a much better game and is the default
   here.

   Whoever fixes trump is the **maker**, and their partnership has to take
   three of the five tricks. Failing to is being *euchred*, and it hands two
   points to the other side, which is why calling on a thin hand is a real
   decision rather than free.

   ## Going alone

   A maker may play the hand without their partner, who lays their cards face
   down and sits out. All five tricks alone is worth four points — the only
   way to score four, and the reason a hand with both bowers is worth the
   risk.                                                                    */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;

var Rules = {};

var LOW = 7;                 /* nine — the lowest card in the euchre pack */
Rules.LOW = LOW;
Rules.TEAM = [0, 1, 0, 1];   /* seat → partnership */
Rules.partner = function (s) { return (s + 2) % 4; };
Rules.sameColour = function (s) { return s === 0 ? 3 : s === 3 ? 0 : (s === 1 ? 2 : 1); };

Rules.DEFAULTS = { target: 10, stick: true, alone: true };

/* ---------- the bowers ----------
   The left bower is trump. Everything else in this file depends on it. */
Rules.suitOf = function (card, trump) {
  var s = Cards.suit(card);
  if (trump >= 0 && Cards.rank(card) === 9 && s === Rules.sameColour(trump)) return trump;
  return s;
};
/* strength within whatever suit was led, once trump is known */
Rules.power = function (card, trump, led) {
  var s = Rules.suitOf(card, trump), r = Cards.rank(card);
  if (trump >= 0 && s === trump) {
    if (r === 9 && Cards.suit(card) === trump) return 100;          /* right bower */
    if (r === 9) return 99;                                          /* left bower  */
    return 80 + r;
  }
  if (s === led) return r;
  return -1;                                                         /* cannot win  */
};
Rules.isBower = function (card, trump) {
  return trump >= 0 && Cards.rank(card) === 9 &&
    (Cards.suit(card) === trump || Cards.suit(card) === Rules.sameColour(trump));
};

/* ---------- the deal ---------- */
Rules.deal = function (dealer, rnd, opts) {
  var d = Cards.shuffle(Cards.deck(LOW), rnd);
  var hands = [[], [], [], []], i;
  for (i = 0; i < 20; i++) hands[i % 4].push(d[i]);
  var kitty = d.slice(20);
  var st = {
    dealer: dealer, turn: (dealer + 1) % 4,
    phase: "bid1",
    hands: hands, kitty: kitty,
    up: kitty[0], turned: false,
    trump: -1, maker: -1, alone: false, sitting: -1,
    trick: [], lead: -1, won: [0, 0], tricks: 0,
    scores: [0, 0], passes: 0,
    opts: opts || Rules.DEFAULTS,
    log: [], bids: []
  };
  for (i = 0; i < 4; i++) st.hands[i] = Rules.sort(st.hands[i], -1);
  return st;
};
Rules.clone = function (st) {
  return {
    dealer: st.dealer, turn: st.turn, phase: st.phase,
    hands: [st.hands[0].slice(), st.hands[1].slice(), st.hands[2].slice(), st.hands[3].slice()],
    kitty: st.kitty.slice(), up: st.up, turned: st.turned,
    trump: st.trump, maker: st.maker, alone: st.alone, sitting: st.sitting,
    trick: st.trick.slice(), lead: st.lead, won: st.won.slice(), tricks: st.tricks,
    scores: st.scores.slice(), passes: st.passes, opts: st.opts,
    log: st.log.slice(), bids: st.bids.slice(), won2: st.won2
  };
};

/* a hand held the way a person holds it, with trump gathered together and
   the bowers where they actually belong rather than where they are printed */
Rules.sort = function (hand, trump) {
  var order = [3, 1, 0, 2];
  return hand.slice().sort(function (a, b) {
    var sa = Rules.suitOf(a, trump), sb = Rules.suitOf(b, trump);
    if (sa !== sb) {
      if (trump >= 0 && sa === trump) return -1;
      if (trump >= 0 && sb === trump) return 1;
      return order.indexOf(sa) - order.indexOf(sb);
    }
    return Rules.power(b, trump, sa) - Rules.power(a, trump, sa);
  });
};

/* ---------- bidding ---------- */
Rules.bidOptions = function (st, seat) {
  if (st.turn !== seat) return [];
  if (st.phase === "bid1") {
    var o = [{ k: "pass" }, { k: "order" }];
    if (st.opts.alone) o.push({ k: "order", alone: true });
    return o;
  }
  if (st.phase === "bid2") {
    var out = [], s;
    var mustCall = st.opts.stick && seat === st.dealer;
    if (!mustCall) out.push({ k: "pass" });
    for (s = 0; s < 4; s++) {
      if (s === Cards.suit(st.up)) continue;         /* the turned-down suit is barred */
      out.push({ k: "call", suit: s });
      if (st.opts.alone) out.push({ k: "call", suit: s, alone: true });
    }
    return out;
  }
  return [];
};

Rules.bid = function (st, seat, b) {
  if (st.turn !== seat || (st.phase !== "bid1" && st.phase !== "bid2")) return null;
  var n = Rules.clone(st);
  n.bids.push({ seat: seat, bid: b });

  if (b.k === "pass") {
    if (n.opts.stick && n.phase === "bid2" && seat === n.dealer) return null;   /* not allowed */
    n.passes++;
    if (seat === n.dealer) {
      if (n.phase === "bid1") { n.phase = "bid2"; n.turned = true; n.passes = 0; n.turn = (n.dealer + 1) % 4; return n; }
      n.phase = "throw";                             /* nobody wanted it */
      n.turn = -1;
      return n;
    }
    n.turn = (seat + 1) % 4;
    return n;
  }

  if (b.k === "order") {
    if (n.phase !== "bid1") return null;
    n.trump = Cards.suit(n.up);
    n.maker = seat;
    n.alone = !!(b.alone && n.opts.alone);
    n.phase = "discard";
    n.turn = n.dealer;
    n.hands[n.dealer].push(n.up);
    return n;
  }

  if (b.k === "call") {
    if (n.phase !== "bid2") return null;
    if (b.suit === Cards.suit(n.up) || !(b.suit >= 0 && b.suit < 4)) return null;
    n.trump = b.suit;
    n.maker = seat;
    n.alone = !!(b.alone && n.opts.alone);
    startPlay(n);
    return n;
  }
  return null;
};

Rules.discard = function (st, seat, card) {
  if (st.phase !== "discard" || seat !== st.dealer) return null;
  if (st.hands[seat].indexOf(card) < 0) return null;
  var n = Rules.clone(st);
  n.hands[seat].splice(n.hands[seat].indexOf(card), 1);
  n.kitty[0] = card;                                 /* it goes back under */
  startPlay(n);
  return n;
};

function startPlay(n) {
  n.phase = "play";
  if (n.alone) n.sitting = Rules.partner(n.maker);
  /* the dealer's left always leads — unless that seat is the one sitting out,
     in which case the lead moves on to the next player who is actually in */
  var lead = (n.dealer + 1) % 4;
  while (lead === n.sitting) lead = (lead + 1) % 4;
  n.lead = n.turn = lead;
  for (var s = 0; s < 4; s++) n.hands[s] = Rules.sort(n.hands[s], n.trump);
}

/* ---------- playing ---------- */
Rules.legal = function (st, seat) {
  if (st.phase !== "play" || st.turn !== seat || seat === st.sitting) return [];
  var hand = st.hands[seat];
  if (!st.trick.length) return hand.slice();
  var led = Rules.suitOf(st.trick[0].card, st.trump), out = [], i;
  for (i = 0; i < hand.length; i++) if (Rules.suitOf(hand[i], st.trump) === led) out.push(hand[i]);
  return out.length ? out : hand.slice();
};
Rules.canPlay = function (st, seat, card) { return Rules.legal(st, seat).indexOf(card) >= 0; };

/* the next seat that is actually holding cards */
function nextIn(st, seat) {
  var s = (seat + 1) % 4;
  while (s === st.sitting) s = (s + 1) % 4;
  return s;
}
Rules.nextIn = nextIn;
Rules.playersIn = function (st) { return st.sitting >= 0 ? 3 : 4; };

Rules.play = function (st, seat, card) {
  if (!Rules.canPlay(st, seat, card)) return null;
  var n = Rules.clone(st);
  n.hands[seat].splice(n.hands[seat].indexOf(card), 1);
  n.trick.push({ seat: seat, card: card });
  n.log.push({ seat: seat, card: card });
  if (n.trick.length < Rules.playersIn(n)) { n.turn = nextIn(n, seat); return n; }

  var led = Rules.suitOf(n.trick[0].card, n.trump);
  var best = -2, who = n.trick[0].seat;
  for (var i = 0; i < n.trick.length; i++) {
    var p = Rules.power(n.trick[i].card, n.trump, led);
    if (p > best) { best = p; who = n.trick[i].seat; }
  }
  n.won[Rules.TEAM[who]]++;
  n.won2 = { seat: who, cards: n.trick.slice() };
  n.trick = [];
  n.tricks++;
  n.turn = n.lead = who;
  if (n.tricks === 5) { n.phase = "done"; n.turn = -1; }
  return n;
};

/* ---------- the count ----------
   Three or four tricks is a point. All five is two. Alone and all five is
   four, which is the only way to score four and the reason a hand with both
   bowers is worth the risk. Fewer than three is being euchred, and it is
   worth two to the *other* side, which is what makes calling a decision. */
Rules.tally = function (st) {
  var mk = Rules.TEAM[st.maker], took = st.won[mk];
  var out = { team: mk, took: took, points: 0, why: "", euchred: false, alone: st.alone };
  if (took < 3) {
    out.team = 1 - mk; out.points = 2; out.euchred = true;
    out.why = "euchred — they only took " + took;
  } else if (took === 5) {
    out.points = st.alone ? 4 : 2;
    out.why = st.alone ? "alone, and all five" : "all five — a march";
  } else {
    out.points = 1;
    out.why = st.alone ? "alone, and made it" : "made it";
  }
  return out;
};

Rules.matchOver = function (scores, opts) {
  var target = (opts || Rules.DEFAULTS).target;
  if (scores[0] >= target) return { winner: 0 };
  if (scores[1] >= target) return { winner: 1 };
  return null;
};

Rules.suitName = function (s) { return ["clubs", "diamonds", "hearts", "spades"][s]; };
Rules.bidName = function (b, up) {
  if (!b) return "";
  if (b.k === "pass") return "pass";
  if (b.k === "order") return (b.alone ? "alone in " : "") + Rules.suitName(Cards.suit(up));
  return (b.alone ? "alone in " : "") + Rules.suitName(b.suit);
};

/* ================================================================
   what a seat may see
   ================================================================
   The same discipline as the hearts table: a seat is sent its own hand, the
   counts of the others, and everything that happened in public. A partner's
   hand is *not* shared — euchre partners are not allowed to see each other's
   cards, and a view that leaked them would be leaking to the person most
   able to use it.

   tools/net-check.js proves it by rearranging the three hidden hands and
   requiring this function's output to come back byte-identical.           */
Rules.publicView = function (st, seat) {
  var v = {
    seat: seat, team: Rules.TEAM[seat], partner: Rules.partner(seat),
    hand: st.hands[seat].slice(),
    counts: [st.hands[0].length, st.hands[1].length, st.hands[2].length, st.hands[3].length],
    dealer: st.dealer, turn: st.turn, phase: st.phase,
    up: st.up, turned: st.turned, kittyLeft: st.kitty.length,
    trump: st.trump, maker: st.maker, alone: st.alone, sitting: st.sitting,
    trick: st.trick.slice(), lead: st.lead,
    won: st.won.slice(), tricks: st.tricks,
    scores: st.scores.slice(),
    bids: st.bids.slice(),
    opts: st.opts,
    legal: Rules.legal(st, seat),
    bidOptions: Rules.bidOptions(st, seat),
    canDiscard: st.phase === "discard" && seat === st.dealer,
    won2: st.won2 ? { seat: st.won2.seat, cards: st.won2.cards.slice() } : null
  };
  return v;
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
