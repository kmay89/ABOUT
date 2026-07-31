/* coach.js — turns the engine's own tags into English.

   Same rule as everywhere else here: the hint may only say something the
   machine actually used, and `ai.js` records why it liked a move while it is
   choosing.

   In this room there is one idea worth teaching and the coach exists mostly
   to teach it: **you are not trying to have the best hand, you are trying not
   to have the worst one.** Everything else — when to take the widow, when to
   knock, why a pair of nines is fine at a table of six and hopeless heads-up
   — falls out of that sentence, and almost nobody arrives at this game
   already knowing it.                                                      */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var SAY = {
  "least-likely-last": "Not the best poker hand available — the one least likely to be the worst at this table. Those come apart more often than you would think, and only one of them costs you a life.",
  "better-odds":       "The widow is the safer hand. It costs you: what you drop in the middle is face up for everybody still to act, and they will fish in it.",
  "worth-the-giveaway": "Worth it even though your hand goes face up in front of the people behind you.",
  "best-of-twenty-five": "There are twenty-five trades available and this is the best of them — not the biggest card, the best hand afterwards.",
  "stop-the-clock":    "Knock. Everybody gets one more turn and then the hands come down, which is a whole lap they don't get to improve in.",
  "good-enough":       "Good enough for this many players. The bar moves: heads-up the worst hand is a coin toss, and with six of you somebody will have two pair.",
  "safe":              "Almost nothing beats you downwards here. There is no prize for winning, so this is all you wanted.",
  "in-trouble":        "More likely than not to be the one that pays. Worth a risk that would be silly with a comfortable hand.",
  "last-to-act":       "Nobody plays after you this lap, so whatever you drop in the middle costs you nothing.",
  "nothing-to-lose":   "This hand is going to lose anyway, so a blind swap is free.",
  "blind-but-counted": "It is face down, so this is a guess — but a counted one: the five unknown cards were dealt out and played against the table a few hundred times.",
  "theirs-is-better":  "Their hand is a better hand than yours.",
  "bigger-card":       "Trading a small card for a big one.",
  "two-pair":          "Two pair is enough to stop on.",
  "nothing-doing":     "Nothing here is worth a trade.",
  "close-call":        "Barely the best of several — the cards don't much care this time."
};
var ORDER = ["in-trouble", "least-likely-last", "better-odds", "worth-the-giveaway",
             "best-of-twenty-five", "blind-but-counted", "nothing-to-lose",
             "stop-the-clock", "good-enough", "safe", "last-to-act",
             "theirs-is-better", "bigger-card", "two-pair", "nothing-doing", "close-call"];

var Coach = {};

Coach.hint = function (pick, view) {
  if (!pick) return { say: "Nothing to do.", why: "" };
  var say = pick.k === "take" ? "Take the widow."
    : pick.k === "knock" ? "Knock."
    : "Trade your " + Cards.name(pick.mine) + " for their " + Cards.name(pick.theirs) + ".";
  var tags = pick.why || [], lines = [], i;
  for (i = 0; i < ORDER.length && lines.length < 2; i++) {
    if (tags.indexOf(ORDER[i]) >= 0 && SAY[ORDER[i]]) lines.push(SAY[ORDER[i]]);
  }
  if (!lines.length) lines.push(SAY["least-likely-last"]);
  if (pick.risk !== undefined) {
    lines.push("It leaves you about " + Math.round(pick.risk * 100) + "% likely to be the worst hand when they come down.");
  }
  return { move: say, say: say, why: lines.join(" "), tags: tags.slice() };
};

if (typeof module !== "undefined" && module.exports) module.exports = Coach;
else root.Coach = Coach;
})(typeof self !== "undefined" ? self : this);
