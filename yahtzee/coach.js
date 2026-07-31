/* coach.js — turns the engine's own tags into English.

   Same rule as everywhere else on this site: the hint may only say something
   the machine actually used. `ai.js` records why it liked a keep or a box
   while it is choosing, and this file translates. Nothing here re-derives an
   opinion, so the coach can never explain a move with a reason the player
   didn't have.

   Yahtzee's teaching is unusually concentrated: almost all of the difference
   between a 180 and a 240 is two habits — chase the sixty-three, and be
   willing to write a nought somewhere cheap rather than spend a box that is
   worth more than the dice in front of you. So the sayings lean on those, and
   the ordering puts them above the arithmetic.                             */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;
var SAY = {
  "joker":         "That's a second Yahtzee — a hundred points on top of wherever it goes, and it may go almost anywhere. Spend it on the box that is hardest to fill later.",
  "for-the-bonus": "Three of a number is par; the thirty-five behind sixty-three is paid for by the fourths and fifths. It is the cheapest thirty-five points on the sheet and most people never collect it.",
  "sacrifice":     "This writes a nought on purpose. That is a real move, not a failure — the alternative is spending a box worth twenty-five to score seven in it. Throw away the cheapest thing you own.",
  "beats-the-box": "This scores well above what that box usually gives you, which is the only reason to close a box early.",
  "stand":         "Keep all five. Nothing a reroll could do is worth more than what is already sitting there.",
  "throw-it-all":  "Throw all five. There is nothing here worth building on, and five fresh dice beat four bad ones plus a hope.",
  "most-of":       "Keeping whatever there is most of.",
  "biggest":       "Taking whatever scores highest.",
  "close-call":    "Barely the best of several — the dice don't much care this time.",
  "forced":        "It's the only box you have left."
};
var ORDER = ["forced", "joker", "sacrifice", "for-the-bonus", "beats-the-box",
             "stand", "throw-it-all", "close-call", "most-of", "biggest"];

var Coach = {};

function lines(tags) {
  var out = [];
  for (var i = 0; i < ORDER.length && out.length < 2; i++) {
    if (tags.indexOf(ORDER[i]) >= 0 && SAY[ORDER[i]]) out.push(SAY[ORDER[i]]);
  }
  return out;
}

/* the hint for "what should I keep" */
Coach.keep = function (pick, view) {
  if (!pick) return { say: "Roll first.", why: "" };
  var kept = [], i;
  for (i = 0; i < 5; i++) if (pick.keep[i]) kept.push(view.dice[i]);
  kept.sort();
  var say = kept.length === 0 ? "Throw all five."
    : kept.length === 5 ? "Keep the lot."
    : "Keep the " + kept.join(" and the ") + ".";
  var why = lines(pick.why || []);
  if (!why.length) why.push("It is worth the most, averaged over every way the rest could land.");
  return { move: say, say: say, why: why.join(" "), tags: (pick.why || []).slice() };
};

/* the hint for "where do I write it" */
Coach.box = function (pick, view) {
  if (!pick) return { say: "Roll first.", why: "" };
  var card = view.cards[view.turn];
  var got = Rules.score(pick.key, view.dice, card);
  var name = pick.key;
  for (var i = 0; i < Rules.CATS.length; i++) if (Rules.CATS[i].key === pick.key) name = Rules.CATS[i].name;
  var say = got > 0 ? name + ", for " + got + "." : name + ", for nothing.";
  var why = lines(pick.why || []);
  if (!why.length) why.push("It is the most this roll is worth anywhere on the sheet.");
  return { move: say, say: say, why: why.join(" "), tags: (pick.why || []).slice() };
};

Coach.hint = function (pick, view) {
  return (pick && pick.keep) ? Coach.keep(pick, view) : Coach.box(pick, view);
};

if (typeof module !== "undefined" && module.exports) module.exports = Coach;
else root.Coach = Coach;
})(typeof self !== "undefined" ? self : this);
