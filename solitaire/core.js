/* core.js — Klondike, and a solver that knows whether a deal can be won.

   A card is 0…51. `rank = c % 13` with 0 = ace and 12 = king; `suit = c / 13`
   in the order ♣ ♦ ♥ ♠, so red is suit 1 or 2. Everything below is integers
   and small arrays — no objects per card — because the solver visits a great
   many positions and object churn is most of what would make it slow.

   ## The state

     found[4]   how high each foundation has been built, 0 = empty
     pile[7]    the tableau, bottom first; `down[7]` says how many of each
                pile are still face down
     stock[]    face down, dealt from the front
     waste[]    face up, last one playable
     pass       how many times the stock has been turned over

   ## The solver, and what it is for

   Roughly one Klondike deal in five is unwinnable no matter how well it is
   played, and there is no way to tell by looking. Losing to that is not the
   same as losing, and being unable to tell the two apart is what makes people
   quit the game rather than get better at it.

   So this can *deal against a solver*: a depth-first search with a
   transposition set and a node cap, run at deal time until a board turns up
   that it can finish. It is bounded rather than exhaustive, so "solved" is
   an honest guarantee and "not solved" is not a proof of anything — which is
   exactly how the game reports it. Two rules make the search tractable:

   **Safe automatic foundation play.** A card can always be sent to the
   foundation with nothing lost if no card still in play could need it — an
   ace or two always, and otherwise when both foundations of the opposite
   colour are already at least as high as this card's rank minus one. Playing
   those immediately, without treating it as a decision, removes a huge amount
   of pointless branching without ever removing a win.

   **Never undo the last move.** A move that puts a card straight back where
   it came from is not a move; the search would otherwise spend its whole
   budget shuffling one card between two columns.                           */
(function (root) {
"use strict";

var Core = {};

var SUITS = ["♣", "♦", "♥", "♠"];
var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
Core.SUITS = SUITS;
Core.RANKS = RANKS;
Core.rank = function (c) { return c % 13; };
Core.suit = function (c) { return (c / 13) | 0; };
Core.red = function (c) { var s = (c / 13) | 0; return s === 1 || s === 2; };
Core.name = function (c) { return RANKS[c % 13] + SUITS[(c / 13) | 0]; };

/* ---------- a deal ---------- */
Core.shuffle = function (rnd) {
  var d = [], i;
  for (i = 0; i < 52; i++) d.push(i);
  for (i = 51; i > 0; i--) {
    var j = (rnd() * (i + 1)) | 0;
    var t = d[i]; d[i] = d[j]; d[j] = t;
  }
  return d;
};

Core.deal = function (deck, drawN, passes) {
  var g = {
    found: [0, 0, 0, 0], pile: [], down: [], stock: [], waste: [],
    draw: drawN || 1, passes: passes === undefined ? 0 : passes, pass: 0, moves: 0
  };
  var k = 0, i, j;
  for (i = 0; i < 7; i++) {
    var p = [];
    for (j = 0; j <= i; j++) p.push(deck[k++]);
    g.pile.push(p);
    g.down.push(i);          /* all but the last are face down */
  }
  while (k < 52) g.stock.push(deck[k++]);
  return g;
};

Core.clone = function (g) {
  return {
    found: g.found.slice(),
    pile: [g.pile[0].slice(), g.pile[1].slice(), g.pile[2].slice(), g.pile[3].slice(),
           g.pile[4].slice(), g.pile[5].slice(), g.pile[6].slice()],
    down: g.down.slice(),
    stock: g.stock.slice(), waste: g.waste.slice(),
    draw: g.draw, passes: g.passes, pass: g.pass, moves: g.moves
  };
};

Core.won = function (g) {
  return g.found[0] === 13 && g.found[1] === 13 && g.found[2] === 13 && g.found[3] === 13;
};
Core.score = function (g) { return g.found[0] + g.found[1] + g.found[2] + g.found[3]; };

/* ---------- what may be moved where ----------
   A tableau run is descending in rank and alternating in colour, and the
   whole run moves together — which is the rule that turns Klondike from a
   card-at-a-time chore into a game. */
function runFrom(g, p, i) {
  var pile = g.pile[p];
  if (i < g.down[p]) return -1;
  for (var k = i; k < pile.length - 1; k++) {
    var a = pile[k], b = pile[k + 1];
    if (Core.rank(a) !== Core.rank(b) + 1 || Core.red(a) === Core.red(b)) return -1;
  }
  return pile.length - i;
}
Core.runFrom = runFrom;

function fits(card, onto) {
  if (onto === undefined) return Core.rank(card) === 12;      /* only a king to a space */
  return Core.rank(onto) === Core.rank(card) + 1 && Core.red(onto) !== Core.red(card);
}
Core.fits = fits;
function foundReady(g, card) { return g.found[Core.suit(card)] === Core.rank(card); }
Core.foundReady = foundReady;

/* A card is safe to send up automatically when nothing left in play could
   still need it as a landing place: an ace or a two always, and otherwise
   once both opposite-colour foundations have reached its rank minus one. */
Core.safeUp = function (g, card) {
  if (!foundReady(g, card)) return false;
  var r = Core.rank(card);
  if (r <= 1) return true;
  var a = Core.red(card) ? 0 : 1, b = Core.red(card) ? 3 : 2;
  return g.found[a] >= r - 1 && g.found[b] >= r - 1;
};

/* every legal move, as small plain objects:
     {k:"up",   from:"w"|p}          to a foundation
     {k:"move", from:p, i, to:p}     a run between piles
     {k:"put",  to:p}                waste onto a pile
     {k:"down", to:p, suit}          a foundation back down onto a pile
     {k:"draw"}                      turn the stock
     {k:"redeal"}                    the waste back under the stock          */
Core.moves = function (g, forSolver) {
  var out = [], p, q, i;
  var top = g.waste.length ? g.waste[g.waste.length - 1] : -1;

  if (top >= 0 && foundReady(g, top)) out.push({ k: "up", from: "w" });
  for (p = 0; p < 7; p++) {
    var pile = g.pile[p];
    if (!pile.length) continue;
    var c = pile[pile.length - 1];
    if (foundReady(g, c)) out.push({ k: "up", from: p });
  }
  if (top >= 0) {
    for (p = 0; p < 7; p++) {
      var onto = g.pile[p].length ? g.pile[p][g.pile[p].length - 1] : undefined;
      if (fits(top, onto)) out.push({ k: "put", to: p });
    }
  }
  for (p = 0; p < 7; p++) {
    var src = g.pile[p];
    if (!src.length) continue;
    for (i = g.down[p]; i < src.length; i++) {
      var n = runFrom(g, p, i);
      if (n < 0) continue;
      /* moving a whole pile of only-face-up cards into an empty column
         achieves nothing, and the search would do it forever */
      var pointless = (i === 0 && g.down[p] === 0);
      for (q = 0; q < 7; q++) {
        if (q === p) continue;
        var dst = g.pile[q].length ? g.pile[q][g.pile[q].length - 1] : undefined;
        if (dst === undefined && pointless) continue;
        if (fits(src[i], dst)) out.push({ k: "move", from: p, i: i, to: q });
      }
    }
  }
  if (!forSolver) {
    /* a human is allowed to pull a card back down off a foundation; the
       solver never needs to and it doubles the branching factor */
    for (var s = 0; s < 4; s++) {
      if (!g.found[s]) continue;
      var card = s * 13 + (g.found[s] - 1);
      for (p = 0; p < 7; p++) {
        var d = g.pile[p].length ? g.pile[p][g.pile[p].length - 1] : undefined;
        if (fits(card, d)) out.push({ k: "down", to: p, suit: s });
      }
    }
  }
  if (g.stock.length) out.push({ k: "draw" });
  else if (g.waste.length && (g.passes === 0 || g.pass < g.passes)) out.push({ k: "redeal" });
  return out;
};

Core.apply = function (g, m) {
  var n = Core.clone(g), i;
  n.moves++;
  if (m.k === "draw") {
    var take = Math.min(n.draw, n.stock.length);
    for (i = 0; i < take; i++) n.waste.push(n.stock.shift());
  } else if (m.k === "redeal") {
    n.pass++;
    while (n.waste.length) n.stock.push(n.waste.pop());
  } else if (m.k === "up") {
    var c = m.from === "w" ? n.waste.pop() : n.pile[m.from].pop();
    n.found[Core.suit(c)] = Core.rank(c) + 1;
    if (m.from !== "w") flip(n, m.from);
  } else if (m.k === "put") {
    n.pile[m.to].push(n.waste.pop());
  } else if (m.k === "down") {
    var card = m.suit * 13 + (n.found[m.suit] - 1);
    n.found[m.suit]--;
    n.pile[m.to].push(card);
  } else if (m.k === "move") {
    var run = n.pile[m.from].splice(m.i);
    for (i = 0; i < run.length; i++) n.pile[m.to].push(run[i]);
    flip(n, m.from);
  }
  return n;
};
function flip(n, p) {
  if (n.down[p] > 0 && n.down[p] >= n.pile[p].length) n.down[p] = Math.max(0, n.pile[p].length - 1);
  if (n.pile[p].length === n.down[p] && n.down[p] > 0) n.down[p]--;
}

/* ---------- can it be finished from here? ----------
   All the cards face up and the stock empty means yes, trivially — that is
   the auto-finish, and it is worth naming because it is also the search's
   cheapest success test. */
Core.allUp = function (g) {
  for (var p = 0; p < 7; p++) if (g.down[p] > 0) return false;
  return g.stock.length === 0 && g.waste.length <= 1;
};

/* ---------- the solver ---------- */
function key(g) {
  var s = g.found.join(",") + "|";
  for (var p = 0; p < 7; p++) s += g.down[p] + ":" + g.pile[p].join(".") + "/";
  return s + "|" + g.stock.join(".") + "|" + g.waste.join(".");
}

Core.solve = function (g0, opts) {
  opts = opts || {};
  var cap = opts.nodes || 60000;
  var seen = Object.create(null);
  var nodes = 0, best = 0, line = null;

  function auto(g) {
    /* send up everything that is safe, as one indivisible step */
    var moved = true, cur = g;
    while (moved) {
      moved = false;
      var top = cur.waste.length ? cur.waste[cur.waste.length - 1] : -1;
      if (top >= 0 && Core.safeUp(cur, top)) { cur = Core.apply(cur, { k: "up", from: "w" }); moved = true; continue; }
      for (var p = 0; p < 7; p++) {
        var pile = cur.pile[p];
        if (!pile.length) continue;
        var c = pile[pile.length - 1];
        if (Core.safeUp(cur, c)) { cur = Core.apply(cur, { k: "up", from: p }); moved = true; break; }
      }
    }
    return cur;
  }

  /* the order matters more than the depth: try the moves that reveal
     something before the ones that merely rearrange */
  function rank(g, m) {
    if (m.k === "up") return 0;
    if (m.k === "move" && g.down[m.from] > 0 && m.i === g.down[m.from]) return 1;   /* uncovers */
    if (m.k === "move" && g.pile[m.to].length === 0) return 3;                      /* into a space */
    if (m.k === "put") return 2;
    if (m.k === "move") return 4;
    if (m.k === "draw") return 5;
    return 6;
  }

  function go(g, depth) {
    if (nodes > cap) return null;
    g = auto(g);
    var sc = Core.score(g);
    if (sc > best) best = sc;
    if (Core.won(g) || Core.allUp(g)) return [];
    if (depth <= 0) return null;
    var k = key(g);
    if (seen[k]) return null;
    seen[k] = 1;
    nodes++;
    var ms = Core.moves(g, true);
    ms.sort(function (a, b) { return rank(g, a) - rank(g, b); });
    for (var i = 0; i < ms.length; i++) {
      var r = go(Core.apply(g, ms[i]), depth - 1);
      if (r) return [ms[i]].concat(r);
      if (nodes > cap) return null;
    }
    return null;
  }

  line = go(Core.clone(g0), opts.depth || 200);
  return { won: !!line, line: line, nodes: nodes, best: best, gaveUp: nodes > cap };
};

/* Deal until the solver can finish one. The cap is real and reported: at
   draw-three a winnable deal is not always findable inside a budget a phone
   can spend, and saying so is better than quietly handing over a board and
   implying a promise. */
Core.kindDeal = function (drawN, passes, opts) {
  opts = opts || {};
  var rnd = opts.rnd || Math.random;
  var tries = opts.tries || 8;
  var until = Date.now() + (opts.ms || 3000);
  var g = null, first = null, ok = false, used = 0, line = null;
  for (var t = 0; t < tries; t++) {
    used = t + 1;
    g = Core.deal(Core.shuffle(rnd), drawN, passes);
    if (!first) first = g;
    var r = Core.solve(g, { nodes: opts.nodes || 150000 });
    if (r.won) { ok = true; line = r.line; break; }
    /* the wall clock matters more than the try count: a phone that spends
       fifteen seconds looking for a nice deal has stopped being a card game */
    if (Date.now() > until) { g = first; break; }
  }
  return { g: ok ? g : first, kind: ok, tries: used, line: line };
};

/* ---------- the hint ----------
   Ranked the way a person would: uncover something, then get a card home,
   then fill a space with a king that has somewhere to go. A hint that says
   "move the 6 onto the 7" when that achieves nothing is worse than none. */
Core.hint = function (g) {
  var ms = Core.moves(g), best = null, bestV = -1;
  for (var i = 0; i < ms.length; i++) {
    var m = ms[i], v = 0;
    if (m.k === "move" && g.down[m.from] > 0 && m.i === g.down[m.from]) v = 100 - g.down[m.from];
    else if (m.k === "up" && Core.safeUp(g, top(g, m))) v = 90;
    else if (m.k === "move" && g.pile[m.to].length === 0 && g.down[m.from] > 0) v = 80;
    else if (m.k === "up") v = 60;
    else if (m.k === "put" && Core.rank(peekWaste(g)) === 12) v = 40;
    else if (m.k === "put") v = 45;
    else if (m.k === "move" && g.pile[m.to].length === 0) v = 12;
    else if (m.k === "move") v = 20;
    else if (m.k === "draw") v = 5;
    else if (m.k === "redeal") v = 2;
    else v = 1;
    if (v > bestV) { bestV = v; best = m; }
  }
  return best;
};
function top(g, m) { return m.from === "w" ? g.waste[g.waste.length - 1] : g.pile[m.from][g.pile[m.from].length - 1]; }
function peekWaste(g) { return g.waste.length ? g.waste[g.waste.length - 1] : 0; }

if (typeof module !== "undefined" && module.exports) module.exports = Core;
else root.Core = Core;
})(typeof self !== "undefined" ? self : this);
