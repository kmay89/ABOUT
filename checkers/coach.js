/* coach.js — turns the engine's own tags into English.

   The rule, carried over from the domino table's Don Chuy: a hint may only
   say what the machine actually used to decide. `ai.js` records why it liked
   a move *while* it is choosing; nothing here is reconstructed afterwards,
   and nothing here re-reads the board to invent a justification that sounds
   good. If the engine had no reason beyond "it scored highest", the coach
   says that, which is honest and occasionally humbling.

   Every line also names the move it is talking about, in the old numbering,
   so the sentence can be checked against the board by anybody who doubts it —
   and by tools/coach-check.js, which does exactly that on every hint it can
   generate.                                                                */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var SAY = {
  "triple":     "Three in one move. Take it.",
  "double":     "A double — the second jump is the point of the first.",
  "take":       "There's a capture, so there's no choice: jumping is compulsory.",
  "crown":      "This one crowns. A king is worth about two men in an endgame.",
  "wins":       "That's the game.",
  "clean":      "Nothing comes back — you take a man and they cannot take one back.",
  "gives-back": "They get more back than you took. It is still forced, but go in knowing.",
  "trade":      "An even exchange. Worth taking when you're ahead, and not when you're not.",
  "blocks":     "They'd have nothing to move afterwards, and a side with no move has lost.",
  "close-call": "Barely the best of several — the position doesn't care much.",
  "clear-best": "Clearly the best of what's on offer, and by a distance.",
  "forced-jump":"Only one jump is on the board, and jumping isn't optional.",
  "only-move":  "It's the only legal move.",
  "quiet":      "Nothing sharp here — this keeps the shape and waits."
};
/* the order they read best in: what the move *is*, then what it costs, then
   how sure the machine was */
var ORDER = ["wins", "triple", "double", "take", "forced-jump", "only-move", "crown",
             "clean", "trade", "gives-back", "blocks", "clear-best", "close-call", "quiet"];

var Coach = {};

Coach.hint = function (pick) {
  if (!pick || !pick.mv) return { move: "", say: "Nothing to play.", why: "" };
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

/* the sentence the table hears after somebody moves — never a judgement,
   only what happened, because the other side is not always the machine */
Coach.narrate = function (who, mv) {
  var n = Rules.name(mv);
  if (mv.caps.length >= 3) return who + " takes three — " + n;
  if (mv.caps.length === 2) return who + " doubles — " + n;
  if (mv.caps.length === 1) return who + " takes — " + n;
  if (mv.king) return who + " crowns — " + n;
  return who + " plays " + n;
};

if (typeof module !== "undefined" && module.exports) module.exports = Coach;
else root.Coach = Coach;
})(typeof self !== "undefined" ? self : this);
