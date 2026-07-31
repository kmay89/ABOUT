/* coach.js — turns the engine's own tags into English.

   The rule, carried over from the domino table's Don Chuy and the checkers
   board: a hint may only say what the machine actually used to decide.
   `ai.js` records why it liked a move *while* it is choosing; nothing here
   re-reads the board to invent a justification that sounds good.

   That matters more in Othello than anywhere else on this site, because the
   plausible-sounding explanation is nearly always the wrong one. "It turns
   six discs" is true, checkable, and almost never the reason a good move is
   good — and a coach that says it teaches the one habit that loses games. So
   flip counts are reported as a *fact about the move* and never as a reason
   for it, which is why "big" and "small" sit at the bottom of the order and
   never appear alone.                                                      */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var SAY = {
  "corner":       "A corner. It can never be turned over, and everything else on the board is measured against it.",
  "no-reply":     "They'd have no legal move at all, so you play again. That is how Othello is actually won.",
  "squeeze":      "It leaves them almost nothing to play — and a player with two moves is being steered.",
  "mobility":     "It keeps your options open and closes theirs.",
  "solved":       "Few enough squares left to work out exactly. This is not a guess.",
  "opens-corner": "Careful: after this they can take a corner. It's still the best of what's on offer.",
  "x-square":     "This is the square that hands over the corner next to it. Sometimes forced, never free.",
  "c-square":     "Next to an unclaimed corner, which is usually where trouble starts.",
  "clear-best":   "Clearly the best of what's on offer, and by a distance.",
  "close-call":   "Barely the best of several — the position doesn't care much.",
  "big":          "It turns a lot over, which is neither here nor there.",
  "small":        "It turns almost nothing over, which is usually a good sign.",
  "only-move":    "It's the only legal move.",
  "quiet":        "Nothing sharp here — this keeps the shape and waits."
};
/* what the move *is*, then what it costs, then how sure the machine was, and
   the disc count last of all because it is the thing beginners over-read */
var ORDER = ["corner", "no-reply", "solved", "squeeze", "mobility", "opens-corner",
             "x-square", "c-square", "only-move", "clear-best", "close-call",
             "small", "big", "quiet"];

var Coach = {};

Coach.hint = function (pick) {
  if (!pick || !pick.mv) return { move: "", say: "You have no legal move — your turn passes by itself.", why: "" };
  var tags = pick.why || [], lines = [], i;
  for (i = 0; i < ORDER.length; i++) {
    if (tags.indexOf(ORDER[i]) >= 0 && SAY[ORDER[i]]) lines.push(SAY[ORDER[i]]);
    if (lines.length >= 2) break;
  }
  if (!lines.length) lines.push(SAY.quiet);
  return {
    move: Rules.name(pick.mv),
    say: "Play " + Rules.name(pick.mv) + ".",
    why: lines.join(" "),
    tags: tags.slice()
  };
};

Coach.narrate = function (who, mv) {
  var n = Rules.name(mv), c = mv.flips.length;
  if (Rules.CORNERS.indexOf(mv.sq) >= 0) return who + " takes the corner — " + n;
  return who + " plays " + n + ", turning " + c + (c === 1 ? " disc" : " discs");
};

/* the sentence for a turn nobody could take. Worth saying out loud, because
   a board that changes twice in a row with no explanation looks broken. */
Coach.passed = function (who) {
  return who + " has no legal move, so the turn comes straight back.";
};

if (typeof module !== "undefined" && module.exports) module.exports = Coach;
else root.Coach = Coach;
})(typeof self !== "undefined" ? self : this);
