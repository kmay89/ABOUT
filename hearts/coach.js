/* coach.js — turns the engine's own tags into English.

   The rule, carried over from the domino table's Don Chuy: a hint may only
   say what the machine actually used to decide. `ai.js` records why it liked
   a card *while* it is choosing; nothing here re-reads the hand afterwards to
   invent a better-sounding reason.

   In hearts that rule has real teeth, because the fluent explanation is
   usually the wrong one. "They're out of diamonds" is something the table
   watched happen — somebody failed to follow, in front of everybody. "They're
   probably out of diamonds" is something you worked out from counting, and it
   is a different claim. The coach may make the first kind and never the
   second, so every sentence below is checkable against the play log.       */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;
var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var SAY = {
  "dump-queen":  "You're void, so the queen goes now. This is the moment the whole hand was for.",
  "queen":       "The queen is in play here — be certain before you commit her.",
  "lead-queen":  "Leading her is a choice, not an accident. Somebody higher takes her back.",
  "void":        "You can't follow, so this is a free discard. Spend it on your most expensive card.",
  "ducks":       "Under the card that's winning — you follow suit and take nothing.",
  "takes":       "This takes the trick, and there are three cards left to come.",
  "must-take":   "You're last to play and this takes it. Worth knowing exactly what it costs.",
  "under-points":"There are points on the table. Getting under them is the whole point of following low.",
  "last-of-suit":"Your last one in that suit — after this you're void in it, which is where the queen goes.",
  "lead-low":    "Low, so whatever comes back comes back to somebody else.",
  "smoke-queen": "Low spades draw the queen out of somebody's hand. You're under her, so it isn't yours.",
  "lead-heart":  "Hearts are broken, so this is allowed — and it makes somebody else decide.",
  "stop-moon":   "Somebody has taken every point so far. Breaking that up is worth a point or two of your own.",
  "forced":      "It's the only card you can legally play.",
  "close-call":  "Barely the best of several — the hand doesn't care much.",
  "safe":        "Nothing sharp here. This keeps the shape and passes the problem on."
};
var ORDER = ["forced", "dump-queen", "stop-moon", "must-take", "under-points", "ducks",
             "void", "smoke-queen", "last-of-suit", "lead-low", "lead-heart", "takes",
             "lead-queen", "queen", "close-call", "safe"];

var Coach = {};

Coach.hint = function (pick, st, seat) {
  if (!pick || pick.card === undefined) return { say: "Nothing to play.", why: "" };
  var tags = pick.why || [], lines = [], i;
  for (i = 0; i < ORDER.length; i++) {
    if (tags.indexOf(ORDER[i]) >= 0 && SAY[ORDER[i]]) lines.push(SAY[ORDER[i]]);
    if (lines.length >= 2) break;
  }
  if (!lines.length) lines.push(SAY.safe);
  /* the voids are the one thing the coach may state as fact about somebody
     else's hand, because everybody at the table watched it happen */
  var seen = told(st, seat);
  if (seen && lines.length < 3) lines.push(seen);
  return {
    card: pick.card,
    say: "Play the " + Cards.longName(pick.card) + ".",
    why: lines.join(" "),
    tags: tags.slice()
  };
};

/* Only ever "could not follow", never "is probably out of". The difference
   is that the first one happened in front of you. */
function told(st, seat) {
  if (!st || typeof AI === "undefined" || !AI.voids) return "";
  var v = AI.voids(st), bits = [], s, k;
  for (s = 0; s < 4; s++) {
    if (s === seat) continue;
    for (k = 0; k < 4; k++) {
      if (v[s][k]) bits.push(nameOfSeat(s) + " couldn't follow " + Cards.SUIT[k]);
    }
  }
  if (!bits.length) return "";
  return "Worth remembering: " + bits.slice(0, 3).join(", ") + ".";
}
var AI = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./ai.js") : root.AI;
function nameOfSeat(s) {
  if (typeof root.Table !== "undefined" && root.Table.nameOf) return root.Table.nameOf(s);
  return "Seat " + (s + 1);
}

Coach.pass = function (cards) {
  var q = cards.indexOf(Rules.QS) >= 0;
  return q
    ? "The queen goes — you haven't the small spades to hide her behind."
    : "High cards out of your short suits: what you are buying is a void to throw her into later.";
};

if (typeof module !== "undefined" && module.exports) module.exports = Coach;
else root.Coach = Coach;
})(typeof self !== "undefined" ? self : this);
