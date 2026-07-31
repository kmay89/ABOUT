/* coach.js — turns the engine's own tags into English.

   Same rule as the rest of this site: the hint may only say what the machine
   actually used. `ai.js` records why it liked a move while it is choosing.

   The interesting thing about this game is that the honest explanation is
   nearly always the counter-intuitive one. The move that *looks* best is the
   six-hop chain by the piece already in front; the move that *is* best is
   usually a short shuffle by the piece nobody has touched in ten turns. So
   "slowest-piece" sits near the top of the order, and the coach says the
   quiet part out loud.                                                     */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var SAY = {
  "slowest-piece": "This is your furthest-back marble, and you finish when the last one arrives — not the first. Moving the leader again feels better and wins less.",
  "long-chain":    "A long ladder. Every hop is free; the only cost is that the rungs stay where they are for whoever is behind you.",
  "chain":         "A jump rather than a step — twice the ground for the same turn.",
  "step":          "One step. Nothing to jump yet, so this is building the ladder rather than climbing it.",
  "big-gain":      "It covers real ground.",
  "arrives":       "That one is home. It never has to move again.",
  "leaves-home":   "Out of your own point at last — and everything still in there is a marble you will be chasing later.",
  "leaves-a-rung": "It lands beside one of your own that is further back, which gives that one something to jump.",
  "sideways":      "It doesn't gain much ground, which is fine: this is about shape, not speed.",
  "forced":        "It's the only move you have.",
  "close-call":    "Barely the best of several — the position doesn't care much."
};
var ORDER = ["forced", "slowest-piece", "arrives", "long-chain", "leaves-home",
             "leaves-a-rung", "chain", "big-gain", "step", "sideways", "close-call"];

var Coach = {};

Coach.hint = function (pick, st, seat) {
  if (!pick || !pick.mv) return { say: "Nothing to move.", why: "" };
  var tags = pick.why || [], lines = [], i;
  for (i = 0; i < ORDER.length; i++) {
    if (tags.indexOf(ORDER[i]) >= 0 && SAY[ORDER[i]]) lines.push(SAY[ORDER[i]]);
    if (lines.length >= 2) break;
  }
  if (!lines.length) lines.push(SAY.step);
  var hops = pick.mv.path.length;
  return {
    move: Rules.name(pick.mv),
    say: hops > 1 ? "Jump that one — " + hops + " hops." : "Move that one a step.",
    why: lines.join(" "),
    tags: tags.slice()
  };
};

if (typeof module !== "undefined" && module.exports) module.exports = Coach;
else root.Coach = Coach;
})(typeof self !== "undefined" ? self : this);
