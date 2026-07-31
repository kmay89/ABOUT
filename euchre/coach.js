/* coach.js — turns the engine's own tags into English.

   Same rule as everywhere else on this site: a hint may only say what the
   machine actually used to decide. `ai.js` records why it liked a card while
   it is choosing, and nothing here re-reads the hand afterwards to invent a
   better-sounding reason.

   The euchre-specific trap is the left bower. Half the wrong explanations a
   coach could give in this game are variations of forgetting that the jack of
   clubs is a spade when spades are trump — so every sentence below that
   mentions a suit gets it from `Rules.suitOf`, never from the card's printed
   suit.                                                                     */
(function (root) {
"use strict";

var Cards = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./cards.js") : root.Cards;
var Rules = (typeof require !== "undefined" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

var SAY = {
  "forced":        "It's the only card you can legally play.",
  "partner-has-it":"Your partner is winning this trick. Don't take it off them — throw your worst card away instead.",
  "draw-trump":    "You called it, so lead trump. Every trump you pull out of their hands is one that can't beat your aces later.",
  "lead-trump":    "Trump, led — it takes the trick now and takes one of theirs out of the game.",
  "lead-ace":      "An off-suit ace usually walks straight through, and it does it while somebody still has to follow.",
  "lead-small":    "Nothing worth cashing yet — lead something cheap and see what comes back.",
  "bower":         "One of the two jacks that matter. Spending it here buys you the lead.",
  "trump-in":      "You can't follow, so you trump it. That's what the void was for.",
  "takes":         "This takes the trick with the smallest card that will do it.",
  "throw-off":     "You can't win this one. Throw the card you'll miss least, and never a trump.",
  "wasted-trump":  "Careful — that's a trump you can't win with. It's worth more later.",
  "boss":          "Nothing left in the pack beats it. It is a trick in your hand; cash it while that's still true.",
  "played-it-out": "This is not the card that looks best — it is the card that paid best when the rest of the hand was dealt out twenty-four ways and played to the end.",
  "close-it-out":  "Two tricks in already. One more and the hand is made.",
  "euchre-them":   "Two tricks off them. One more and they're euchred — which is two points, not one.",
  "close-call":    "Barely the best of several — the hand doesn't care much."
};
var ORDER = ["forced", "played-it-out", "partner-has-it", "euchre-them", "close-it-out", "boss",
             "trump-in", "takes", "draw-trump", "lead-ace", "bower", "lead-trump",
             "lead-small", "throw-off", "wasted-trump", "close-call"];

var Coach = {};

Coach.hint = function (pick, st, seat) {
  if (!pick || pick.card === undefined) return { say: "Nothing to play.", why: "" };
  var tags = pick.why || [], lines = [], i;
  for (i = 0; i < ORDER.length; i++) {
    if (tags.indexOf(ORDER[i]) >= 0 && SAY[ORDER[i]]) lines.push(SAY[ORDER[i]]);
    if (lines.length >= 2) break;
  }
  if (!lines.length) lines.push(SAY["throw-off"]);
  var c = pick.card, trump = st.trump;
  var note = "";
  /* the one thing worth saying out loud every single time it is true */
  if (Rules.isBower(c, trump) && Cards.suit(c) !== trump) {
    note = " (the left bower — it is a " + Rules.suitName(trump) + " now, not a " +
           Rules.suitName(Cards.suit(c)) + ")";
  }
  return {
    card: c,
    say: "Play the " + Cards.longName(c) + note + ".",
    why: lines.join(" "),
    tags: tags.slice()
  };
};

/* the bidding advice, from the same appraisal the machine bids on */
Coach.bid = function (worth, trump, bar) {
  var t = worth.tricks;
  var parts = [];
  parts.push("That hand is worth about " + t.toFixed(1) + " tricks with " + Rules.suitName(trump) + " as trump.");
  if (worth.right) parts.push("You have the right bower, which is a trick and a half on its own.");
  else if (worth.left) parts.push("The left bower is worth about a trick — and remember it is trump, not its printed suit.");
  if (worth.trumps >= 4) parts.push("Four trumps is length, and length beats height: the fourth one is still a trump when everybody else has run out.");
  parts.push(t >= bar ? "Three is what you need, so this is a call."
                      : "You need three, and this is short. Passing is not cowardice.");
  return parts.join(" ");
};

if (typeof module !== "undefined" && module.exports) module.exports = Coach;
else root.Coach = Coach;
})(typeof self !== "undefined" ? self : this);
