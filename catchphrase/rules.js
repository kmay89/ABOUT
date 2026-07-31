/* rules.js — the describing game, complete and pure.

   One phone, two teams, and a timer nobody can see.

   A word appears. You describe it to your own team without saying the word,
   any part of the word, or anything it rhymes with. The moment somebody gets
   it you hand the phone to the *other* team, who get the next word. The
   buzzer goes off at a moment nobody knows, and whoever is holding it when it
   does loses the point.

   ## Why the timer is hidden

   It is the whole game. A visible countdown turns this into a race you can
   pace; a hidden one turns it into a hot potato, and the last ten seconds —
   when everybody knows it is close and nobody knows how close — are the
   reason anybody plays. So the round is a random length inside a range, the
   range is wide enough that counting does not help, and the only thing the
   phone tells you is that it is speeding up.

   ## And why the point goes to the other team

   Not "the holder loses a point" — the *other team scores*. It sounds like
   the same thing and it is not: nobody ever goes backwards, so a team that is
   behind is never demoralised by watching their own score fall, and the game
   always ends.

   No DOM, no clock, no randomness it was not handed. The timer lives in
   app.js because it is a clock; everything that decides anything is here. */
(function (root) {
"use strict";

var Words = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./words.js") : root.Words;

var Rules = {};

Rules.TARGET = 7;
/* the round is between these, and the gap is the point of it */
Rules.SHORTEST = 45;
Rules.LONGEST = 75;

Rules.TEAMS = ["Red", "Blue"];

Rules.start = function (opts) {
  opts = opts || {};
  return {
    target: opts.target || Rules.TARGET,
    levels: opts.levels || ["easy", "medium"],
    shortest: opts.shortest || Rules.SHORTEST,
    longest: opts.longest || Rules.LONGEST,
    scores: [0, 0],
    holder: 0,            /* which team is holding the phone right now */
    starter: 0,           /* which team starts the next round          */
    deck: [], at: 0,
    word: null, level: null,
    round: 0, passes: 0, skipped: 0,
    phase: "ready",       /* ready → running → buzzed → over           */
    last: null
  };
};
Rules.clone = function (st) {
  var n = {};
  for (var k in st) n[k] = st[k];
  n.scores = st.scores.slice();
  n.deck = st.deck;       /* shared on purpose — it is a deck, not a state */
  return n;
};

/* how long this round lasts, in seconds. Called once, by whoever holds the
   clock, and never shown to anybody. */
Rules.roundLength = function (st, rnd) {
  return st.shortest + rnd() * (st.longest - st.shortest);
};

Rules.begin = function (st, rnd) {
  var n = Rules.clone(st);
  if (!n.deck.length || n.at >= n.deck.length) {
    n.deck = Words.deck("say", n.levels, rnd);
    n.at = 0;
  }
  n.phase = "running";
  n.holder = n.starter;
  n.passes = 0;
  n.skipped = 0;
  n.round++;
  n.last = null;
  return draw(n, rnd);
};

function draw(n, rnd) {
  if (n.at >= n.deck.length) {
    n.deck = Words.deck("say", n.levels, rnd);
    n.at = 0;
  }
  var card = n.deck[n.at++];
  n.word = card.word;
  n.level = card.level;
  return n;
}

/* somebody got it: the phone changes hands and a new word comes up */
Rules.got = function (st, rnd) {
  if (st.phase !== "running") return null;
  var n = Rules.clone(st);
  n.passes++;
  n.holder = 1 - n.holder;
  n.last = { k: "got", word: n.word };
  return draw(n, rnd);
};

/* a word nobody can do. It does not change hands — a skip is a cost, not an
   escape, and handing it over would make skipping the best move in the game */
Rules.skip = function (st, rnd) {
  if (st.phase !== "running") return null;
  var n = Rules.clone(st);
  n.skipped++;
  n.last = { k: "skip", word: n.word };
  return draw(n, rnd);
};

/* the buzzer. The team NOT holding it scores. */
Rules.buzz = function (st) {
  if (st.phase !== "running") return null;
  var n = Rules.clone(st);
  var winner = 1 - n.holder;
  n.scores[winner]++;
  n.phase = n.scores[winner] >= n.target ? "over" : "buzzed";
  /* the team that was caught starts the next one, which is the only
     consolation available and it is a real one */
  n.starter = n.holder;
  n.last = { k: "buzz", caught: n.holder, scored: winner, word: n.word };
  return n;
};

Rules.over = function (st) { return st.phase === "over"; };
Rules.winner = function (st) {
  if (st.scores[0] === st.scores[1]) return -1;
  return st.scores[0] > st.scores[1] ? 0 : 1;
};

if (typeof module !== "undefined" && module.exports) module.exports = Rules;
else root.Rules = Rules;
})(typeof self !== "undefined" ? self : this);
