/* rules.js — hearts, complete and pure.

   No DOM, no timers, no randomness beyond a deal you hand it. A state goes
   in, a state comes out, and tools/rules-check.js replays tens of thousands
   of hands in node checking the invariants on every trick.

   ## The state

     hands[4]   what each seat holds
     trick[]    {seat, card} in the order they were played
     lead       the seat that led this trick
     turn       whose turn it is
     taken[4]   the cards each seat has won, all hands' worth this deal
     broken     have hearts been broken
     round      which deal this is, which decides the passing direction
     scores[4]  the running match score
     passing    null, or the cards each seat has chosen to pass

   ## The five rules that decide every hand

   **The two of clubs leads.** Not the dealer, not the winner of anything —
   whoever holds it. It is the only fixed point in the game and it means the
   first trick is the same shape every time.

   **Follow suit if you can.** Everything else in hearts is a consequence of
   this, because the whole game is about *not* being able to.

   **No blood on the first trick.** Neither a heart nor the queen of spades
   may be played on trick one, even by somebody void in clubs — unless their
   entire hand is points, which happens and has to be allowed for.

   **Hearts must be broken before one can be led.** Broken means somebody
   discarded a heart when they could not follow. A player holding nothing but
   hearts may lead one regardless, which is the exception everybody forgets
   and the reason the check below is two clauses rather than one.

   **Shooting the moon.** All twenty-six points to one player scores
   twenty-six to everybody else instead of to them. It is the reason you
   cannot simply duck every trick, and the reason the last four tricks of a
   hand are worth paying attention to even when you are not in them.        */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;

var Rules = {};

var QS = 3 * 13 + 10;      /* the queen of spades      */
var C2 = 0 * 13 + 0;       /* the two of clubs         */
Rules.QS = QS;
Rules.C2 = C2;

/* how the passing goes, by deal number: left, right, across, then hold */
Rules.PASS_DIR = [1, 3, 2, 0];
Rules.PASS_NAME = ["to your left", "to your right", "across the table", "nowhere — hold them"];

Rules.DEFAULTS = {
  target: 100,          /* the match ends when somebody reaches this        */
  moonMode: "add",      /* add: 26 to everybody else · sub: −26 to the shooter */
  jackOfDiamonds: false /* the house rule where J♦ is worth −10             */
};

Rules.deal = function (round, rnd, opts) {
  var d = Cards.shuffle(Cards.deck(), rnd);
  var hands = [[], [], [], []], i;
  for (i = 0; i < 52; i++) hands[i % 4].push(d[i]);
  for (i = 0; i < 4; i++) hands[i] = Cards.tidy(hands[i]);
  var st = {
    hands: hands, trick: [], lead: -1, turn: -1,
    taken: [[], [], [], []], broken: false,
    round: round || 0, scores: [0, 0, 0, 0],
    passing: Rules.PASS_DIR[(round || 0) % 4] ? [null, null, null, null] : null,
    phase: Rules.PASS_DIR[(round || 0) % 4] ? "pass" : "play",
    opts: opts || Rules.DEFAULTS,
    log: [], tricks: 0
  };
  if (st.phase === "play") st.turn = st.lead = holderOf(st, C2);
  return st;
};
Rules.clone = function (st) {
  return {
    hands: [st.hands[0].slice(), st.hands[1].slice(), st.hands[2].slice(), st.hands[3].slice()],
    trick: st.trick.slice(),
    lead: st.lead, turn: st.turn,
    taken: [st.taken[0].slice(), st.taken[1].slice(), st.taken[2].slice(), st.taken[3].slice()],
    broken: st.broken, round: st.round, scores: st.scores.slice(),
    passing: st.passing ? st.passing.slice() : null,
    phase: st.phase, opts: st.opts, log: st.log.slice(), tricks: st.tricks
  };
};
function holderOf(st, card) {
  for (var s = 0; s < 4; s++) if (st.hands[s].indexOf(card) >= 0) return s;
  return 0;
}
Rules.holderOf = holderOf;

/* ---------- passing ---------- */
Rules.passDir = function (round) { return Rules.PASS_DIR[round % 4]; };
Rules.passTo = function (seat, round) { return (seat + Rules.PASS_DIR[round % 4]) % 4; };

Rules.choosePass = function (st, seat, cards) {
  if (st.phase !== "pass" || !st.passing) return false;
  if (!cards || cards.length !== 3) return false;
  for (var i = 0; i < 3; i++) {
    if (st.hands[seat].indexOf(cards[i]) < 0) return false;
    if (cards.indexOf(cards[i]) !== i) return false;      /* no card twice */
  }
  st.passing[seat] = cards.slice();
  return true;
};
Rules.passReady = function (st) {
  if (!st.passing) return false;
  for (var s = 0; s < 4; s++) if (!st.passing[s]) return false;
  return true;
};
/* Everybody's three move at once, which matters: a sequential pass would
   let a seat see what arrived before choosing what to send. */
Rules.doPass = function (st) {
  var n = Rules.clone(st), s, i;
  var out = n.passing;
  for (s = 0; s < 4; s++) {
    for (i = 0; i < 3; i++) {
      var k = n.hands[s].indexOf(out[s][i]);
      if (k >= 0) n.hands[s].splice(k, 1);
    }
  }
  for (s = 0; s < 4; s++) {
    var to = Rules.passTo(s, n.round);
    for (i = 0; i < 3; i++) n.hands[to].push(out[s][i]);
  }
  for (s = 0; s < 4; s++) n.hands[s] = Cards.tidy(n.hands[s]);
  n.passing = null;
  n.phase = "play";
  n.turn = n.lead = holderOf(n, C2);
  n.got = out;               /* what each seat was handed, for the interface */
  return n;
};

/* ---------- playing ---------- */
function isPoint(c) { return Cards.suit(c) === 2 || c === QS; }
Rules.isPoint = isPoint;

Rules.legal = function (st, seat) {
  var hand = st.hands[seat], out = [], i;
  if (st.phase !== "play" || st.turn !== seat) return out;
  var leading = st.trick.length === 0;
  var first = st.tricks === 0;

  if (leading) {
    if (first) return hand.indexOf(C2) >= 0 ? [C2] : [];
    /* hearts cannot be led until broken — unless that is all there is */
    var nonHeart = [];
    for (i = 0; i < hand.length; i++) if (Cards.suit(hand[i]) !== 2) nonHeart.push(hand[i]);
    if (!st.broken && nonHeart.length) return nonHeart;
    return hand.slice();
  }

  var led = Cards.suit(st.trick[0].card);
  var follow = [];
  for (i = 0; i < hand.length; i++) if (Cards.suit(hand[i]) === led) follow.push(hand[i]);
  if (follow.length) {
    /* on the very first trick you may not throw the queen either, even
       following suit — you can only be holding it in spades, and spades is
       not clubs, so this branch only bites when led suit is spades… which
       cannot happen on trick one. Kept for the general case anyway. */
    if (first) {
      var clean = [];
      for (i = 0; i < follow.length; i++) if (!isPoint(follow[i])) clean.push(follow[i]);
      if (clean.length) return clean;
    }
    return follow;
  }
  /* void: anything goes, except that the first trick takes no blood */
  if (first) {
    var safe = [];
    for (i = 0; i < hand.length; i++) if (!isPoint(hand[i])) safe.push(hand[i]);
    if (safe.length) return safe;      /* a hand of nothing but points may */
  }
  return hand.slice();
};

Rules.canPlay = function (st, seat, card) {
  return Rules.legal(st, seat).indexOf(card) >= 0;
};

Rules.play = function (st, seat, card) {
  if (!Rules.canPlay(st, seat, card)) return null;
  var n = Rules.clone(st);
  n.hands[seat].splice(n.hands[seat].indexOf(card), 1);
  n.trick.push({ seat: seat, card: card });
  if (Cards.suit(card) === 2) n.broken = true;
  n.log.push({ seat: seat, card: card });
  if (n.trick.length < 4) {
    n.turn = (seat + 1) % 4;
    return n;
  }
  /* the trick is complete */
  var led = Cards.suit(n.trick[0].card), best = -1, who = n.trick[0].seat;
  for (var i = 0; i < 4; i++) {
    var t = n.trick[i];
    if (Cards.suit(t.card) !== led) continue;
    if (Cards.rank(t.card) > best) { best = Cards.rank(t.card); who = t.seat; }
  }
  for (i = 0; i < 4; i++) n.taken[who].push(n.trick[i].card);
  n.won = { seat: who, cards: n.trick.slice() };
  n.trick = [];
  n.tricks++;
  n.turn = n.lead = who;
  if (!n.hands[0].length && !n.hands[1].length && !n.hands[2].length && !n.hands[3].length) {
    n.phase = "done";
    n.turn = -1;
  }
  return n;
};

/* ---------- the count ---------- */
Rules.points = function (cards, opts) {
  var p = 0;
  for (var i = 0; i < cards.length; i++) {
    if (Cards.suit(cards[i]) === 2) p++;
    else if (cards[i] === QS) p += 13;
    else if (opts && opts.jackOfDiamonds && cards[i] === 1 * 13 + 9) p -= 10;
  }
  return p;
};

/* The hand's result, moon and all. Returned rather than applied, so the
   interface can show what happened before the scores move. */
Rules.tally = function (st) {
  var opts = st.opts || Rules.DEFAULTS;
  var raw = [0, 0, 0, 0], s;
  for (s = 0; s < 4; s++) raw[s] = Rules.points(st.taken[s], opts);
  /* the moon is counted on hearts and the queen alone: the jack of diamonds
     house rule must not stop somebody shooting */
  var hearts = [0, 0, 0, 0], q = -1;
  for (s = 0; s < 4; s++) {
    for (var i = 0; i < st.taken[s].length; i++) {
      if (Cards.suit(st.taken[s][i]) === 2) hearts[s]++;
      if (st.taken[s][i] === QS) q = s;
    }
  }
  var shooter = -1;
  for (s = 0; s < 4; s++) if (hearts[s] === 13 && q === s) shooter = s;

  var add = raw.slice();
  if (shooter >= 0) {
    if (opts.moonMode === "sub") {
      for (s = 0; s < 4; s++) add[s] = (s === shooter) ? -26 : 0;
    } else {
      for (s = 0; s < 4; s++) add[s] = (s === shooter) ? 0 : 26;
    }
    /* the diamond, if it is in play, still belongs to whoever took it */
    if (opts.jackOfDiamonds) {
      for (s = 0; s < 4; s++) if (st.taken[s].indexOf(1 * 13 + 9) >= 0) add[s] -= 10;
    }
  }
  return { raw: raw, add: add, shooter: shooter, hearts: hearts, queen: q };
};

Rules.matchOver = function (scores, opts) {
  var target = (opts || Rules.DEFAULTS).target;
  var hi = -1e9, i;
  for (i = 0; i < 4; i++) if (scores[i] > hi) hi = scores[i];
  if (hi < target) return null;
  var lo = 1e9, who = 0;
  for (i = 0; i < 4; i++) if (scores[i] < lo) { lo = scores[i]; who = i; }
  var tied = [];
  for (i = 0; i < 4; i++) if (scores[i] === lo) tied.push(i);
  return { winner: who, low: lo, tied: tied };
};

/* ================================================================
   what a seat may see
   ================================================================
   This is the function the whole four-phone game rests on, and the reason
   it exists at all. A hearts hand is secret; a single shared snapshot would
   put four hands on four phones — not visible in the interface, but sitting
   in the message log of every device and readable by anybody who opened a
   console. So a seat is sent *its own* hand, the counts of everybody
   else's, and nothing more.

   tools/net-check.js proves it the strong way, the way the domino table
   does: it rearranges the three hidden hands among themselves and requires
   this function's output to come back byte-identical. If the output ever
   changes, it encodes the split; if it cannot change, it cannot leak.     */
Rules.publicView = function (st, seat) {
  var v = {
    seat: seat,
    hand: st.hands[seat].slice(),
    counts: [st.hands[0].length, st.hands[1].length, st.hands[2].length, st.hands[3].length],
    trick: st.trick.slice(),
    lead: st.lead, turn: st.turn, phase: st.phase,
    broken: st.broken, round: st.round, tricks: st.tricks,
    scores: st.scores.slice(),
    taken: [Rules.points(st.taken[0], st.opts), Rules.points(st.taken[1], st.opts),
            Rules.points(st.taken[2], st.opts), Rules.points(st.taken[3], st.opts)],
    opts: st.opts,
    legal: Rules.legal(st, seat),
    won: st.won ? { seat: st.won.seat, cards: st.won.cards.slice() } : null
  };
  /* during the pass, a seat may know whether it has chosen — never what
     anybody else chose */
  if (st.phase === "pass" && st.passing) {
    v.chosen = st.passing[seat] ? st.passing[seat].slice() : null;
    v.waiting = [!!st.passing[0], !!st.passing[1], !!st.passing[2], !!st.passing[3]];
    v.passDir = Rules.passDir(st.round);
  }
  if (st.got) v.got = st.got[(seat + 4 - Rules.passDir(st.round)) % 4] ?
    st.got[(seat + 4 - Rules.passDir(st.round)) % 4].slice() : null;
  return v;
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
