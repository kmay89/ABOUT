/* coach.js — turns the engine's own tags into English.

   Same rule as everywhere else here: the hint may only say what the machine
   actually used to decide, and `ai.js` records why it liked a move while it
   is choosing.

   In this room that rule has one extra tooth. The coach is reading from a
   **view**, not from the game, so it is not merely disciplined about not
   telling you what the enemy pieces are — it does not know. "Probably a
   Miner" is a sentence it can form; "that is a Miner" is a sentence it has no
   way to write, because the rank is not in the data it was handed.        */
(function (root) {
"use strict";

var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var SAY = {
  "forced":      "It's the only move you have.",
  "known-win":   "You have seen that one in a fight, and yours beats it. No guessing involved.",
  "known-trade": "You have seen that one. This trades rather than wins — worth it or not depending on who can spare it.",
  "likely-win":  "Most of what they can still have there loses to this. Not all of it.",
  "even-odds":   "About even. Which in this game is often the best you are offered.",
  "long-shot":   "The odds are against it. Sometimes the information is worth more than the piece.",
  "probe":       "A Scout is four points and a rank is worth more than four points. Spending one to find out what something is is a trade, not a loss.",
  "reveals-me":  "This tells them what you have been hiding. Once they know where your big piece is, they can plan around it — and there is a Spy out there.",
  "never-moved": "That one has never moved. Which means it could be a Bomb, or the Flag, or somebody being very patient.",
  "scout-run":   "Scouts run the whole line. Use them to see, not to fight.",
  "advance":     "Forward. Their flag is at that end and nothing gets there by waiting.",
  "reposition":  "Sideways — shape rather than ground.",
  "first-move":  "This piece has never moved. The moment it does, they know it is neither a Bomb nor your Flag.",
  "flag-hunt":   "Their army has almost stopped being able to move. What is left that never moved is where the Flag is, and a Miner is how you get through the Bombs around it.",
  "close-call":  "Barely the best of several — the board doesn't care much.",
  "charge":      "Straight at it.",
  "known-flag":  "That is the flag. Take it."
};
var ORDER = ["forced", "known-win", "likely-win", "flag-hunt", "probe", "even-odds",
             "known-trade", "long-shot", "never-moved", "reveals-me", "scout-run",
             "first-move", "advance", "reposition", "charge", "close-call"];

var Coach = {};

Coach.hint = function (pick, view) {
  if (!pick || !pick.mv) return { say: "Nothing to move.", why: "" };
  var tags = pick.why || [], lines = [], i;
  for (i = 0; i < ORDER.length; i++) {
    if (tags.indexOf(ORDER[i]) >= 0 && SAY[ORDER[i]]) lines.push(SAY[ORDER[i]]);
    if (lines.length >= 2) break;
  }
  if (!lines.length) lines.push(SAY.advance);
  var me = view.cells[pick.mv.f];
  var what = me && me.rank >= 0 ? Rules.NAME[me.rank] : "that piece";
  return {
    say: (pick.mv.strike ? "Strike with your " : "Move your ") + what + ".",
    why: lines.join(" "),
    tags: tags.slice()
  };
};

if (typeof module !== "undefined" && module.exports) module.exports = Coach;
else root.Coach = Coach;
})(typeof self !== "undefined" ? self : this);
