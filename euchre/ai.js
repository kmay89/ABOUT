/* ai.js — the other three at the table.

   Euchre is two games and they need two different machines.

   ## Bidding

   Deciding whether to call is the harder half and it is not a search
   problem — five cards and an upcard is not enough information to search. It
   is an *appraisal*, and the appraisal that works is the one every good
   euchre player carries around:

     · the right bower is worth about a trick and a half on its own
     · the left bower is worth about a trick
     · trump length is worth more than trump height — three small trumps beat
       two big ones, because the third one is still a trump when everybody
       else has run out
     · an off-suit ace is worth about half a trick
     · a **void** in a side suit is worth nearly as much as an ace, because
       it means you can trump the second round of that suit
     · position matters: if you order it up, the dealer gets the card. Handing
       the right bower to your opponent to gain a queen is how hands are lost
       before they are played

   The number that comes out is an estimate of tricks. Three is the bar,
   because three is what you need. Calling on less than three is a bet that
   your partner has one, which is sometimes right and is exactly the decision
   the tiers differ on: the beginner calls whenever it holds trump, the
   strongest one calls when the arithmetic says three and its partner is not
   about to be sitting out.

   ## Playing

   Five tricks, at most three unknown hands, and a partner — which makes the
   central judgement one that hearts never has to make: **is my partner
   winning this trick?** If they are, do not overtake them. Beginners overtake
   their own partner constantly, and it costs a trick every time.

   The rest is ordinary: lead trump when you are the maker (drawing the
   opponents' trumps protects your side-suit aces), lead an off-suit ace when
   you are defending, play under when you cannot win, and trump in only when
   the trick is worth it.                                                   */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;
var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var AI = {};

/* The rungs differ in *what they can do*, not in how carefully they do it.

   Learning plays the way people play in their first fortnight: any jack is a
   call, and the highest card wins, including over its own partner.

   Steady adds the two judgements that make somebody a euchre player — it
   appraises the hand before calling, and it does not overtake its partner.

   Sharp adds the one that makes somebody good: it **counts**. Twenty-four
   cards and five tricks means the pack runs out fast, and a player tracking
   what has gone knows by the third trick that their queen of trump is now
   the highest card left in the game. Knowing a card is boss changes what you
   lead, and — the bigger one — knowing your *partner's* card is boss changes
   whether you get out of the way or spend a card protecting the trick. Those
   two positions want opposite cards, so a player who cannot tell them apart
   plays them badly however carefully it plays everything else.

   The edge is real and it is not enormous: 56% of matches to ten over six
   hundred, at an average margin of 0.8 points. Euchre is a high-variance
   game and anybody claiming a bigger number for one skill is measuring
   something else. tools/ai-check.js runs that ladder and requires each rung
   to beat the one below. */
AI.TIERS = [
  { key: "novice", name: "Learning", bar: 1.7, naive: true,  counts: false, aloneBar: 99,
    blurb: "Calls whenever it holds a jack. Overtakes its own partner." },
  { key: "steady", name: "Steady",   bar: 2.6, naive: false, counts: false, aloneBar: 4.3,
    blurb: "Counts its tricks before calling, and knows when its partner is already winning." },
  { key: "sharp",  name: "Sharp",    bar: 2.6, naive: false, counts: true,  aloneBar: 4.3,
    blurb: "Tracks every card that has gone, so it knows when its queen has become the highest card left." }
];
AI.tier = function (k) {
  for (var i = 0; i < AI.TIERS.length; i++) if (AI.TIERS[i].key === k) return AI.TIERS[i];
  return AI.TIERS[1];
};

/* ---------- the appraisal ----------
   How many tricks is this hand worth with `trump` as trump? Returned as a
   number rather than a verdict, so the tiers can set their own bar. */
AI.worth = function (hand, trump, opts) {
  opts = opts || {};
  var t = 0, i, n = 0;
  var have = { 0: 0, 1: 0, 2: 0, 3: 0 };
  var right = trump * 13 + 9;
  var left = Rules.sameColour(trump) * 13 + 9;
  var hasRight = false, hasLeft = false;

  for (i = 0; i < hand.length; i++) {
    var c = hand[i], s = Rules.suitOf(c, trump), r = Cards.rank(c);
    have[s]++;
    if (s === trump) {
      n++;
      if (c === right) { t += 1.45; hasRight = true; }
      else if (c === left) { t += 1.0; hasLeft = true; }
      else if (r === 12) t += 0.8;
      else if (r === 11) t += 0.6;
      else t += 0.32;                        /* small trump: still a trump */
    } else {
      if (r === 12) t += 0.55;               /* an off-suit ace */
      else if (r === 11) t += 0.15;
    }
  }
  /* Length is worth more than height, and the fourth trump is worth more than
     the third — by then everybody else has run out. */
  if (n >= 3) t += 0.3;
  if (n >= 4) t += 0.55;
  /* A void in a side suit is nearly an ace: it means you trump the second
     round of that suit. Only counts if you have a trump left to do it with. */
  if (n >= 2) {
    for (i = 0; i < 4; i++) {
      if (i === trump) continue;
      if (!have[i]) t += 0.45;
      else if (have[i] === 1 && Cards.rank(singleton(hand, i, trump)) < 12) t += 0.16;
    }
  }
  /* the card the dealer is about to pick up is not yours */
  if (opts.givesUp) t -= opts.givesUp;
  if (opts.gets) t += opts.gets;
  return { tricks: t, trumps: n, right: hasRight, left: hasLeft };
};
function singleton(hand, suit, trump) {
  for (var i = 0; i < hand.length; i++) if (Rules.suitOf(hand[i], trump) === suit) return hand[i];
  return 0;
}

/* ---------- bidding ---------- */
AI.bid = function (st, seat, tierKey) {
  var tier = AI.tier(tierKey);
  var hand = st.hands[seat];
  var opt = st.bidOptions || Rules.bidOptions(st, seat);
  if (!opt.length) return null;
  var i;

  if (st.phase === "bid1") {
    var suit = Cards.suit(st.up);
    var extra = { };
    if (seat === st.dealer) {
      /* you get the card, and you throw your worst — worth roughly the
         difference between them */
      extra.gets = gain(hand, st.up, suit);
    } else if (Rules.partner(seat) === st.dealer) {
      extra.gets = 0.25;                    /* your partner gets it */
    } else {
      /* an opponent gets it, and if it is a bower that is a disaster */
      extra.givesUp = Cards.rank(st.up) === 9 ? 0.95 : 0.35;
    }
    var w = AI.worth(hand, suit, extra);
    if (tier.naive) {
      /* the beginner: any jack and a pulse */
      var jacks = 0;
      for (i = 0; i < hand.length; i++) if (Rules.suitOf(hand[i], suit) === suit && Cards.rank(hand[i]) === 9) jacks++;
      return (jacks > 0 || w.trumps >= 3) ? { k: "order" } : { k: "pass" };
    }
    if (w.tricks >= tier.aloneBar && w.right && canAlone(st)) return { k: "order", alone: true };
    if (w.tricks >= tier.bar) return { k: "order" };
    /* the dealer with nothing better: taking it is still better than a
       throw-in when the table sticks the dealer, and that is what bid2 is for */
    return { k: "pass" };
  }

  if (st.phase === "bid2") {
    var best = null, bestW = -1;
    for (var s = 0; s < 4; s++) {
      if (s === Cards.suit(st.up)) continue;
      var ww = AI.worth(hand, s, {});
      if (ww.tricks > bestW) { bestW = ww.tricks; best = { suit: s, w: ww }; }
    }
    var mustCall = st.opts.stick && seat === st.dealer;
    if (!best) return { k: "pass" };
    if (tier.naive && !mustCall) {
      return best.w.trumps >= 3 ? { k: "call", suit: best.suit } : { k: "pass" };
    }
    if (mustCall) return { k: "call", suit: best.suit };
    if (bestW >= tier.aloneBar && best.w.right && canAlone(st)) return { k: "call", suit: best.suit, alone: true };
    /* the bar is lower in the second round: everybody has already said they
       did not want the turned suit, which is information */
    if (bestW >= tier.bar - 0.3) return { k: "call", suit: best.suit };
    return { k: "pass" };
  }
  return { k: "pass" };
};
function canAlone(st) { return !!(st.opts && st.opts.alone); }
/* what picking the upcard up is worth: the new card minus the worst card it
   replaces, both measured as trump-hand cards */
function gain(hand, up, trump) {
  var best = worthOf(up, trump), worst = 1e9, i;
  for (i = 0; i < hand.length; i++) worst = Math.min(worst, worthOf(hand[i], trump));
  return Math.max(0, best - worst) * 0.8;
}
function worthOf(c, trump) {
  var s = Rules.suitOf(c, trump), r = Cards.rank(c);
  if (s === trump) return r === 9 ? (Cards.suit(c) === trump ? 1.45 : 1.0) : (r === 12 ? 0.8 : r === 11 ? 0.6 : 0.32);
  return r === 12 ? 0.55 : r === 11 ? 0.15 : 0.03;
}

/* the dealer's discard: the least useful card, with a preference for going
   void in a side suit, because a void is a trump waiting to happen */
AI.discard = function (st, seat, tierKey) {
  var hand = st.hands[seat], trump = st.trump, i;
  var count = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (i = 0; i < hand.length; i++) count[Rules.suitOf(hand[i], trump)]++;
  var worst = null, wv = 1e9;
  for (i = 0; i < hand.length; i++) {
    var c = hand[i], s = Rules.suitOf(c, trump);
    var v = worthOf(c, trump) * 10;
    if (s === trump) v += 40;                                  /* never throw trump */
    if (!AI.tier(tierKey).naive && count[s] === 1 && s !== trump) v -= 3.2;   /* go void */
    if (v < wv) { wv = v; worst = c; }
  }
  return worst;
};

/* ---------- counting ----------
   Which cards can nobody still be holding? Everything played this hand, plus
   your own hand, plus the upcard once it has been turned down — which the
   whole table watched happen. Nothing here uses anything a seat was not
   shown, which is the same discipline the domino room's coach works under.

   With twenty-four cards and five tricks the pack runs out fast, and a card
   that is the highest one left is a card that wins. That is what `boss`
   answers, and it is the entire difference the strongest tier makes. */
function goneSet(st, seat) {
  var gone = {}, i;
  for (i = 0; i < st.log.length; i++) gone[st.log[i].card] = 1;
  for (i = 0; i < st.trick.length; i++) gone[st.trick[i].card] = 1;
  for (i = 0; i < st.hands[seat].length; i++) gone[st.hands[seat][i]] = 1;
  /* a turned-down upcard is out of the game and everybody saw it */
  if (st.turned && st.maker >= 0 && st.trump !== Cards.suit(st.up)) gone[st.up] = 1;
  return gone;
}
/* is this the highest card left in its suit that anybody could still hold? */
function boss(st, seat, card, gone) {
  var trump = st.trump;
  var s = Rules.suitOf(card, trump), p = Rules.power(card, trump, s);
  for (var c = 0; c < 52; c++) {
    if (Cards.rank(c) < Rules.LOW) continue;
    if (gone[c]) continue;
    if (Rules.suitOf(c, trump) !== s) continue;
    if (Rules.power(c, trump, s) > p) return false;
  }
  return true;
}
AI.boss = boss;
AI.goneSet = goneSet;

/* ---------- playing ---------- */
function winnerOf(trick, trump) {
  var led = Rules.suitOf(trick[0].card, trump), best = -2, who = trick[0].seat;
  for (var i = 0; i < trick.length; i++) {
    var p = Rules.power(trick[i].card, trump, led);
    if (p > best) { best = p; who = trick[i].seat; }
  }
  return { seat: who, power: best, led: led };
}
AI.winnerOf = winnerOf;

AI.choose = function (st, seat, tierKey) {
  var tier = AI.tier(tierKey);
  var legal = Rules.legal(st, seat);
  if (!legal.length) return null;
  if (legal.length === 1) return { card: legal[0], why: ["forced"] };

  var i;
  var gone = tier.counts ? goneSet(st, seat) : null;
  var scored = [];
  for (i = 0; i < legal.length; i++) scored.push({ c: legal[i], v: value(st, seat, legal[i], tier, gone) });
  scored.sort(function (a, b) { return b.v - a.v; });
  return { card: scored[0].c, why: reasons(st, seat, scored[0].c, scored, gone) };
};

/* higher is better here — a card is judged by what it is likely to win */
function value(st, seat, card, tier, gone) {
  var trump = st.trump, v = 0;
  var mine = Rules.TEAM[seat];
  var maker = st.maker >= 0 ? Rules.TEAM[st.maker] : -1;
  var s = Rules.suitOf(card, trump), p;

  if (!st.trick.length) {
    /* leading */
    if (tier.naive) return Rules.power(card, trump, s);
    var high = Rules.power(card, trump, s);
    if (s === trump) {
      /* the maker leads trump: it draws the opponents' trumps out and
         protects your side-suit winners. A defender usually should not. */
      v += (maker === mine ? 26 : -8) + high * 0.28;
      if (Rules.isBower(card, trump)) v += maker === mine ? 12 : -4;
    } else {
      if (Cards.rank(card) === 12) v += 24;      /* an off-suit ace usually walks */
      else v += 4 - Cards.rank(card) * 0.9;      /* otherwise lead something small */
    }
    /* the counted knowledge: a card that is the highest one left in its suit
       is a trick in hand. Leading it cashes that trick while it is still
       true — a queen that is boss on trick three may be dead on trick four. */
    if (gone && boss(st, seat, card, gone)) v += 30;
    /* getting rid of your last card in a suit is a void you can trump into */
    var n = 0;
    for (var i = 0; i < st.hands[seat].length; i++) if (Rules.suitOf(st.hands[seat][i], trump) === s) n++;
    if (n === 1 && s !== trump) v += 6;
    return v;
  }

  var w = winnerOf(st.trick, trump);
  var led = w.led;
  var partnerWinning = (Rules.TEAM[w.seat] === mine && w.seat !== seat);
  var last = st.trick.length === Rules.playersIn(st) - 1;
  p = Rules.power(card, trump, led);
  var wins = p > w.power;

  if (tier.naive) return wins ? 100 + p : -Cards.rank(card);

  /* The judgement euchre is built on, and the place counting pays.

     If the partner's card is *safe* — nothing left to play, or it is the
     highest card still in the game — the trick is theirs and every card you
     spend on it is wasted. Throw the worst thing you own.

     If it is not safe, somebody after you can still take it off them, and a
     trick your side already half-owns is worth protecting: win it yourself,
     cheaply. The two branches ask for opposite cards, which is why a player
     who cannot tell them apart plays this position badly however carefully
     it plays everything else. */
  if (partnerWinning) {
    if (last || safeLead(st, w, gone, seat)) {
      return 60 - worthOf(card, trump) * 30;
    }
    if (wins) return 62 + p * 0.05;
    return 40 - worthOf(card, trump) * 20;
  }

  if (wins) {
    /* winning is good; winning with the smallest card that wins is better */
    v = 70 - p * 0.25;
    if (last) v += 20;                         /* nothing can come over the top */
    if (s === trump && led !== trump) v += (st.tricks >= 3 ? 12 : 2);   /* trumping in */
    return v;
  }
  /* cannot win: throw the cheapest, and never waste a trump */
  v = 20 - worthOf(card, trump) * 22;
  if (s === trump) v -= 26;
  return v;
}
/* Is the partner's card safe from everybody still to play?

   Without counting, the only honest answers are "they have the right bower"
   and "nobody is left to play". A player who cannot count has to hedge, and
   hedging costs the trick either way — overtake and you waste a card, hold
   back and somebody comes over the top.

   With counting there is a third answer, and it is the useful one: their
   card is the highest one left in the suit, so nothing can beat it. That is
   when you throw your worst card away and keep everything that matters. */
function safeLead(st, w, gone, seat) {
  if (w.power >= 100) return true;
  var after = Rules.playersIn(st) - st.trick.length - 1;
  if (after === 0) return true;
  if (gone) {
    var top = null;
    for (var i = 0; i < st.trick.length; i++) {
      if (st.trick[i].seat === w.seat) top = st.trick[i].card;
    }
    if (top !== null && boss(st, seat, top, gone)) return true;
  }
  return false;
}

/* ---------- why ---------- */
function reasons(st, seat, card, scored, gone) {
  var why = [], trump = st.trump, mine = Rules.TEAM[seat];
  var s = Rules.suitOf(card, trump);
  if (!st.trick.length) {
    if (s === trump && Rules.TEAM[st.maker] === mine) why.push("draw-trump");
    else if (s === trump) why.push("lead-trump");
    else if (Cards.rank(card) === 12) why.push("lead-ace");
    else why.push("lead-small");
    if (Rules.isBower(card, trump)) why.push("bower");
  } else {
    var w = winnerOf(st.trick, trump);
    if (Rules.TEAM[w.seat] === mine && w.seat !== seat) why.push("partner-has-it");
    else if (Rules.power(card, trump, w.led) > w.power) {
      why.push(s === trump && w.led !== trump ? "trump-in" : "takes");
    } else why.push("throw-off");
    if (s === trump && Rules.power(card, trump, w.led) <= w.power) why.push("wasted-trump");
  }
  if (st.tricks >= 2 && st.won[mine] >= 2) why.push("close-it-out");
  if (Rules.TEAM[st.maker] !== mine && st.won[1 - Rules.TEAM[st.maker]] >= 2) why.push("euchre-them");
  if (gone && boss(st, seat, card, gone)) why.push("boss");
  if (scored.length > 1 && scored[0].v - scored[1].v < 3) why.push("close-call");
  return why;
}

if (typeof module !== "undefined" && module.exports) module.exports = AI;
else root.AI = AI;
})(typeof self !== "undefined" ? self : this);
