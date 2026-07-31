/* rules.js — the acting game, complete and pure.

   One phone, two teams, thirty seconds a turn, and four cards to get through.

   Your team draws four cards worth one, two and three points. You mime them
   in order and your own team shouts. Every card they get is yours; every card
   still in your hand when the time runs out is **gone** — not scored for
   anybody, not put back in the deck, gone. Then the other team goes.

   ## The idea the game is built on

   **You cannot bank what you did not finish.** The cards are worth more the
   harder they are, so the four in front of you are always a decision: rush
   the three-pointer while everybody is fresh, or clear the easy ones first
   and hope there is time. Both are wrong sometimes, which is what makes it a
   choice rather than a routine.

   And a card you give up on is a card nobody ever sees. That is the rule that
   makes the clock hurt, and it is the one most versions of this quietly drop
   because losing things feels bad — it feels bad, and it is the game.

   ## What the timer does here, and why it is the opposite of the other room

   In the describing room next door the clock is hidden, because there the
   tension is *not knowing*. Here it is shown, big, counting down, because the
   tension is **watching it go** while somebody in your team keeps saying
   "kettle? kettle?" and it is not a kettle. Same component, opposite
   decision, and the reason is the same in both: whichever one makes the room
   louder.

   No DOM, no clock, no randomness it was not handed.                       */
(function (root) {
"use strict";

var Words = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./words.js") : root.Words;

var Rules = {};

Rules.TARGET = 20;
Rules.SECONDS = 30;
Rules.HAND = 4;

Rules.start = function (opts) {
  opts = opts || {};
  return {
    target: opts.target || Rules.TARGET,
    seconds: opts.seconds || Rules.SECONDS,
    levels: opts.levels || ["easy", "medium", "hard"],
    scores: [0, 0],
    team: 0,
    deck: [],
    hand: [], done: [], lost: [],
    turn: 0, phase: "ready",       /* ready → acting → tally → over */
    last: null
  };
};
Rules.clone = function (st) {
  var n = {};
  for (var k in st) n[k] = st[k];
  n.scores = st.scores.slice();
  n.hand = st.hand.slice();
  n.done = st.done.slice();
  n.lost = st.lost.slice();
  n.deck = st.deck;
  return n;
};

/* Four cards, and not four at random: one from each level plus a spare, so a
   hand is always a decision about what to spend the time on rather than four
   easy ones or four impossible ones. */
Rules.begin = function (st, rnd) {
  var n = Rules.clone(st);
  /* the deck is dealt from rather than sampled, so nobody mimes "juggling"
     twice in one evening — and it is reshuffled whole when it runs low */
  if (n.deck.length < Rules.HAND * 2) n.deck = Words.deck("act", n.levels, rnd);
  n.hand = [];
  var want = pattern(n.levels);
  for (var i = 0; i < want.length; i++) {
    var card = pull(n, want[i]);
    if (card) n.hand.push(card);
  }
  n.done = [];
  n.lost = [];
  n.phase = "acting";
  n.turn++;
  n.last = null;
  return n;
};
function pattern(levels) {
  /* the spare is the easiest level in play, because a hand you cannot
     possibly finish is not a decision, it is a punishment */
  var out = levels.slice(0, Rules.HAND);
  while (out.length < Rules.HAND) out.push(levels[0]);
  return out;
}
/* the first card of a given level, taken out of the deck — or, if that level
   has run out, whatever is on top. The deck is already shuffled, so scanning
   forward for a level is still a random card of that level. */
function pull(n, level) {
  for (var i = 0; i < n.deck.length; i++) {
    if (n.deck[i].level === level) return n.deck.splice(i, 1)[0];
  }
  return n.deck.length ? n.deck.splice(0, 1)[0] : null;
}

/* they got it */
Rules.got = function (st) {
  if (st.phase !== "acting" || !st.hand.length) return null;
  var n = Rules.clone(st);
  var card = n.hand.shift();
  n.done.push(card);
  n.scores[n.team] += card.worth;
  n.last = { k: "got", card: card };
  if (!n.hand.length) return finish(n);
  return n;
};

/* give up on this one. It is gone — not to the bottom of the pile, not to the
   other team. Gone. */
Rules.pass = function (st) {
  if (st.phase !== "acting" || !st.hand.length) return null;
  var n = Rules.clone(st);
  var card = n.hand.shift();
  n.lost.push(card);
  n.last = { k: "lost", card: card };
  if (!n.hand.length) return finish(n);
  return n;
};

/* the clock ran out: everything still in hand is lost */
Rules.timeUp = function (st) {
  if (st.phase !== "acting") return null;
  var n = Rules.clone(st);
  while (n.hand.length) n.lost.push(n.hand.shift());
  n.last = { k: "time" };
  return finish(n);
};

function finish(n) {
  n.phase = n.scores[n.team] >= n.target ? "over" : "tally";
  return n;
}

/* hand over to the other team */
Rules.next = function (st) {
  if (st.phase !== "tally") return null;
  var n = Rules.clone(st);
  n.team = 1 - n.team;
  n.phase = "ready";
  return n;
};

Rules.gained = function (st) {
  var t = 0;
  for (var i = 0; i < st.done.length; i++) t += st.done[i].worth;
  return t;
};
Rules.dropped = function (st) {
  var t = 0;
  for (var i = 0; i < st.lost.length; i++) t += st.lost[i].worth;
  return t;
};

Rules.over = function (st) { return st.phase === "over"; };
Rules.winner = function (st) {
  if (st.scores[0] === st.scores[1]) return -1;
  return st.scores[0] > st.scores[1] ? 0 : 1;
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
