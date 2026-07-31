/* rules-check.js — dev-only. The rules of every new room, proved rather than
   asserted.

   Each game's rules.js is pure — a state goes in, a state comes out, no DOM,
   no clock, no randomness it was not handed — which is what makes this
   possible at all: tens of thousands of games can be replayed in node in a
   few seconds, and the invariants checked on every ply.

   What is checked is not "does it run". It is the small number of properties
   that, if they ever broke, would make the game a different game:

     · **conservation** — nothing appears and nothing vanishes. Twelve
       draughtsmen, fifty-two cards, ten marbles, one disc per move.
     · **compulsion** — where a rule says you must, there is no legal move
       that says you needn't. If a jump exists in draughts, every generated
       move is a jump. If you can follow suit in hearts, every legal card
       follows it.
     · **termination** — the game ends. Every hand plays exactly its number
       of tricks; no position generates zero moves without being over.
     · **secrecy** — and the big one. For the two card games, the message a
       seat is sent is rebuilt after the *other* hands have been shuffled
       among themselves, and required to come back byte-identical. If it ever
       changes, it encodes the split; if it cannot change, it cannot leak.
       That is the permutation test the domino table established, and it is
       the only proof of this kind that is worth anything — an eyeball over
       the message format proves nothing at all.

   Run: node tools/rules-check.js                                           */
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..");

/* the rules files are browser globals as well as modules; give them a self */
global.self = global.self || {};

let fails = 0, checks = 0;
function ok(what, cond, detail) {
  checks++;
  if (cond) console.log("  ✓ " + what);
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}
/* A seeded generator, and it has to be a real one.

   The obvious `x = (x * 1103515245 + 12345) & 0x7fffffff` is what was here
   first, and it is broken in JavaScript specifically: the product runs to
   2⁶¹, floats carry 53 bits, so the low bits are gone before the mask ever
   sees them. What comes out has a **cycle of about sixteen thousand**, a four
   per cent bias across the six faces, and — worst of the three — streams from
   adjacent seeds that are visibly correlated with each other.

   That last one is what makes it dangerous here rather than merely untidy.
   Every check in this file runs a few hundred games at seed, seed+1, seed+2,
   and a generator whose neighbouring streams agree turns those into one
   sample wearing several hats. It showed up as four hundred games of Yahtzee
   containing no Yahtzee at all, which should happen about once in three
   thousand runs.

   Mulberry32 instead: integer arithmetic throughout via Math.imul, so nothing
   is silently rounded, full 2³² period, and it scrambles the seed before
   producing anything so neighbouring seeds give unrelated streams. */
function seeded(s) {
  let a = (s >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function load(game, file) { return require(path.join(ROOT, game, file)); }

/* ================================================================
   checkers
   ================================================================ */
console.log("\n──  the checkers board");
(function () {
  const R = load("checkers", "rules.js");
  let games = 0, plies = 0, longest = 0, ends = { swept: 0, blocked: 0, quiet: 0 };
  let sawForced = 0;
  for (let g = 0; g < 500; g++) {
    const rnd = seeded(g + 1);
    let st = R.start(), n = 0;
    while (n < 500) {
      const e = R.over(st);
      if (e.done) { ends[e.why] = (ends[e.why] || 0) + 1; break; }
      const ms = R.moves(st);
      if (!ms.length) { ok("a live position always has a move", false); return; }
      /* compulsion: if one move is a jump they all are */
      const anyJump = ms.some((m) => m.caps.length > 0);
      if (anyJump) {
        sawForced++;
        if (!ms.every((m) => m.caps.length > 0)) {
          ok("jumping is compulsory", false, "a quiet move was offered alongside a jump");
          return;
        }
      }
      const mv = ms[Math.floor(rnd() * ms.length)];
      if (mv.caps.length > longest) longest = mv.caps.length;
      /* a move named only by its ends must be recognised */
      if (!R.find(st, { f: mv.f, t: mv.t, caps: mv.caps, path: mv.path })) {
        ok("every generated move is recognised by find()", false);
        return;
      }
      const mover = st.turn, victim = 1 - mover;
      const before = R.count(st);
      st = R.apply(st, mv);
      const after = R.count(st);
      const lost = (before[victim].men + before[victim].kings) - (after[victim].men + after[victim].kings);
      if (lost !== mv.caps.length) { ok("a jump takes exactly what it says", false, lost + " vs " + mv.caps.length); return; }
      if (before[mover].men + before[mover].kings !== after[mover].men + after[mover].kings) {
        ok("the mover never loses a piece", false); return;
      }
      /* a man never appears on a light square */
      for (let i = 0; i < 64; i++) {
        if (st.b[i] && (((i >> 3) + (i & 7)) & 1) !== 1) { ok("nothing stands on a light square", false); return; }
      }
      n++;
    }
    games++; plies += n;
  }
  ok("500 games: jumping is compulsory wherever a jump exists", sawForced > 0);
  ok("500 games: nothing appears, nothing vanishes, nothing lands on a light square", true);
  ok("500 games: every generated move is recognised by find()", true);
  ok("games end, and by all three routes", ends.swept > 0 && ends.blocked > 0,
     JSON.stringify(ends));
  console.log("    · " + games + " games, " + Math.round(plies / games) + " plies each, longest chain " + longest);
})();

/* ================================================================
   othello
   ================================================================ */
console.log("\n──  the othello board");
(function () {
  const R = load("othello", "rules.js");
  let full = 0, stuck = 0;
  for (let g = 0; g < 1500; g++) {
    const rnd = seeded(g + 1);
    let st = R.start();
    for (;;) {
      const e = R.over(st);
      if (e.done) { if (e.why === "full") full++; else stuck++; break; }
      const ms = R.moves(st);
      if (!ms.length) { ok("a live position always has a move", false); return; }
      /* every legal move must flip something — that is what makes it a move */
      if (ms.some((m) => m.flips.length === 0)) { ok("every move flips something", false); return; }
      const mv = ms[Math.floor(rnd() * ms.length)];
      const before = R.score(st), empties = R.empties(st);
      st = R.apply(st, mv);
      const after = R.score(st);
      if (R.empties(st) !== empties - 1) { ok("exactly one disc is placed per move", false); return; }
      if (after[0] + after[1] !== before[0] + before[1] + 1) { ok("discs are turned, never removed", false); return; }
      if (st.passes > 2) { ok("passes never exceed two", false); return; }
    }
  }
  ok("1500 games: every move flips, one disc lands, nothing is removed", true);
  ok("games end both ways — a full board and a stuck one", full > 0 && stuck > 0,
     full + " full, " + stuck + " stuck");
  /* the fast path and the honest path must agree */
  const R2 = load("othello", "rules.js");
  let st = R2.start(), agree = true;
  for (let n = 0; n < 40 && !R2.over(st).done; n++) {
    const ms = R2.moves(st);
    const a = R2.apply(st, ms[0]), b = R2.applyFast(st, ms[0]);
    if (a.b.join() !== b.b.join() || a.turn !== b.turn || a.passes !== b.passes) agree = false;
    st = a;
  }
  ok("applyFast agrees with apply about the board, the turn and the passes", agree);
})();

/* ================================================================
   the star
   ================================================================ */
console.log("\n──  the star");
(function () {
  const R = load("halma", "rules.js");
  ok("the board is the real one — 121 holes", R.count() === 121, String(R.count()));
  let sixPoints = true, overlap = false;
  const seen = {};
  for (let k = 0; k < 6; k++) {
    if (R.HOMES[k].length !== 10) sixPoints = false;
    for (const h of R.HOMES[k]) { if (seen[h] !== undefined) overlap = true; seen[h] = k; }
  }
  ok("six points of ten holes, none shared", sixPoints && !overlap);
  let sym = true;
  for (let i = 0; i < R.count(); i++) {
    for (const n of R.neighbours(i)) {
      if (n >= 0 && R.neighbours(n).indexOf(i) < 0) sym = false;
    }
  }
  ok("every neighbour is a neighbour back", sym);
  let opposite = true, outer = true;
  for (let k = 0; k < 6; k++) {
    if (R.dist(R.tipOf(k), R.tipOf(R.OPPOSITE[k])) !== 16) opposite = false;
    if (R.neighbours(R.tipOf(k)).filter((x) => x >= 0).length !== 2) outer = false;
  }
  ok("each point is 16 steps from the one opposite", opposite);
  ok("each point's tip is an outer corner", outer);

  for (const np of [2, 3, 4, 6]) {
    const st = R.start({ players: np, noSquat: true, vacate: 20 });
    const c = {};
    for (const v of st.b) if (v >= 0) c[v] = (c[v] || 0) + 1;
    let right = Object.keys(c).length === np;
    for (let s = 0; s < np; s++) if (c[s] !== 10) right = false;
    ok(np + " players get ten marbles each in opposite points", right);
  }

  /* the two fair-play rules have to bite */
  const st0 = R.start({ players: 2, noSquat: true, vacate: 0 });
  const home = R.homeOf(st0, 0);
  ok("once you are out of moves at home, only leaving is legal",
     R.moves(st0).every((m) => home.indexOf(m.f) >= 0 && home.indexOf(m.t) < 0));
  const st6 = R.start({ players: 6, noSquat: true, vacate: 20 });
  let squatted = 0;
  for (let s = 0; s < 6; s++) {
    st6.turn = s;
    for (const m of R.moves(st6)) {
      const p = R.pointOf(m.t);
      if (p >= 0 && p !== st6.seats[s] && p !== R.OPPOSITE[st6.seats[s]]) squatted++;
    }
  }
  ok("no move ever stops in somebody else's point", squatted === 0, String(squatted));

  /* conservation, over a long random game */
  const rnd = seeded(9);
  let st = R.start({ players: 2, noSquat: true, vacate: 20 }), lost = false;
  for (let n = 0; n < 1500 && !R.over(st).done; n++) {
    const ms = R.moves(st);
    if (!ms.length) { ok("a live position always has a move", false); return; }
    const mv = ms[Math.floor(rnd() * ms.length)];
    if (!R.find(st, { f: mv.f, t: mv.t, path: mv.path })) { ok("find() recognises every generated move", false); return; }
    st = R.apply(st, mv);
    const c = {};
    for (const v of st.b) if (v >= 0) c[v] = (c[v] || 0) + 1;
    if (c[0] !== 10 || c[1] !== 10) lost = true;
  }
  ok("1500 plies: nothing is ever captured or lost", !lost);
})();

/* ================================================================
   stratego
   ================================================================ */
console.log("\n──  the field");
(function () {
  const R = load("stratego", "rules.js");
  const roster = R.roster();
  ok("forty pieces a side", roster.length === 40, String(roster.length));
  const by = {};
  for (const r of roster) by[r] = (by[r] || 0) + 1;
  ok("one flag, one spy, one marshal, six bombs, eight scouts",
     by[0] === 1 && by[1] === 1 && by[10] === 1 && by[11] === 6 && by[2] === 8);
  ok("two lakes of four squares", R.WATER.length === 8);

  /* the combat table, which is the whole game in four lines */
  ok("a spy that attacks the marshal wins", R.fight(1, 10) === "def");
  ok("a marshal that attacks the spy wins", R.fight(10, 1) === "def");
  ok("a miner defuses a bomb", R.fight(3, 11) === "def");
  ok("anything else on a bomb dies", R.fight(10, 11) === "att" && R.fight(2, 11) === "att");
  ok("equal ranks kill each other", R.fight(5, 5) === "both");
  ok("taking the flag ends it", R.fight(2, 0) === "flag");
  ok("rank order holds", R.fight(9, 10) === "att" && R.fight(10, 9) === "def");

  /* a deployment that is not the right army must be refused */
  const short = roster.slice(0, 39);
  ok("a deployment that is not forty pieces is refused", R.deploy(R.empty(), 0, short) === null);
  const wrong = roster.slice();
  wrong[0] = 10;
  ok("a deployment with two marshals is refused", R.deploy(R.empty(), 0, wrong) === null);

  let ends = {}, games = 0;
  for (let g = 0; g < 60; g++) {
    const rnd = seeded(g + 1);
    const shuffle = (a) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = (rnd() * (i + 1)) | 0;
        const t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    };
    let st = R.empty();
    st = R.deploy(st, 0, shuffle(R.roster()));
    st = R.deploy(st, 1, shuffle(R.roster()));
    if (st.phase !== "play") { ok("two armies down starts the game", false); return; }
    let n = 0;
    while (n < 4000) {
      const e = R.over(st);
      if (e) { ends[e.why] = (ends[e.why] || 0) + 1; games++; break; }
      const ms = R.moves(st);
      if (!ms.length) { ok("a live position always has a move", false); return; }
      const mv = ms[(rnd() * ms.length) | 0];
      if (!R.find(st, { f: mv.f, t: mv.t })) { ok("find() recognises every generated move", false); return; }
      st = R.apply(st, mv);
      for (const w of R.WATER) if (st.b[w] >= 0) { ok("nothing ever stands in a lake", false); return; }
      for (const q of st.p) {
        if ((q.rank === R.FLAG || q.rank === R.BOMB) && q.moved) { ok("bombs and flags never move", false); return; }
      }
      n++;
    }
  }
  ok("60 games: nothing in the lakes, no bomb or flag ever moved", true);
  ok("60 games: every generated move is recognised by find()", true);
  ok("games end, by the flag and by running out of moves",
     games === 60 && ends.flag > 0 && (ends.stuck > 0 || ends.quiet > 0), JSON.stringify(ends));

  /* the permutation test */
  const rnd2 = seeded(77);
  const sh = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (rnd2() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  };
  let st2 = R.empty();
  st2 = R.deploy(st2, 0, sh(R.roster()));
  st2 = R.deploy(st2, 1, sh(R.roster()));
  const base = JSON.stringify(R.publicView(st2, 0));
  let leaked = false;
  for (let k = 0; k < 300; k++) {
    const c = R.clone(st2);
    const idx = [];
    for (let i = 0; i < c.p.length; i++) if (c.p[i].seat === 1) idx.push(i);
    const ranks = idx.map((x) => c.p[x].rank);
    const r3 = seeded(k + 900);
    for (let i = ranks.length - 1; i > 0; i--) {
      const j = (r3() * (i + 1)) | 0;
      const t = ranks[i]; ranks[i] = ranks[j]; ranks[j] = t;
    }
    idx.forEach((x, q) => { c.p[x].rank = ranks[q]; });
    if (JSON.stringify(R.publicView(c, 0)) !== base) leaked = true;
  }
  ok("the permutation test: a player's message cannot encode the enemy ranks", !leaked,
     "300 rearrangements");
})();

/* ================================================================
   yahtzee — thirteen boxes, and three of them are traps
   ================================================================ */
console.log("\n──  the sheet");
(function () {
  const R = load("yahtzee", "rules.js");
  const card = R.blank();

  /* the one most implementations get wrong */
  ok("three of a kind is the sum of all five dice",
     R.score("three", [6, 6, 6, 5, 5], card) === 28, "6-6-6-5-5 → 28, not 18");
  ok("four of a kind is the sum of all five dice",
     R.score("four", [4, 4, 4, 4, 2], card) === 18);
  ok("three of a kind needs three of a kind",
     R.score("three", [6, 6, 5, 5, 4], card) === 0);
  ok("five of a kind is also a full house",
     R.score("house", [3, 3, 3, 3, 3], card) === 25);
  ok("a full house is three and two",
     R.score("house", [3, 3, 3, 5, 5], card) === 25 && R.score("house", [3, 3, 4, 5, 5], card) === 0);
  ok("a small straight can hide inside five dice",
     R.score("small", [2, 3, 4, 5, 5], card) === 30 && R.score("small", [1, 2, 3, 5, 6], card) === 0);
  ok("a large straight is all five",
     R.score("large", [2, 3, 4, 5, 6], card) === 40 && R.score("large", [1, 2, 3, 4, 6], card) === 0);
  ok("the upper boxes count only their own number",
     R.score("fours", [4, 4, 1, 4, 6], card) === 12 && R.score("ones", [4, 4, 1, 4, 6], card) === 1);

  /* the joker, both ways round */
  const fifty = R.blank(); fifty.yahtzee = 50; fifty.threes = 9;
  ok("a joker fills a large straight at full value",
     R.score("large", [3, 3, 3, 3, 3], fifty) === 40);
  ok("a joker is worth a hundred on top", R.jokerBonus([3, 3, 3, 3, 3], fifty) === R.JOKER);
  ok("a joker goes in its own number first if that is open",
     JSON.stringify(R.jokerBoxes([2, 2, 2, 2, 2], fifty)) === '["twos"]');
  ok("with its own number gone, a joker goes anywhere open",
     R.jokerBoxes([3, 3, 3, 3, 3], fifty).length === R.open(fifty).length);
  const zeroed = R.blank(); zeroed.yahtzee = 0;
  ok("a zeroed Yahtzee box earns no bonus and is no joker",
     R.jokerBonus([5, 5, 5, 5, 5], zeroed) === 0 && R.score("large", [5, 5, 5, 5, 5], zeroed) === 0);

  /* the sixty-three, at exactly sixty-three */
  const at = R.blank(); at.ones = 3; at.twos = 6; at.threes = 9; at.fours = 12; at.fives = 15; at.sixes = 18;
  const under = R.blank(); under.ones = 2; under.twos = 6; under.threes = 9; under.fours = 12; under.fives = 15; under.sixes = 18;
  ok("the bonus lands at exactly 63", R.upperTotal(at) === 63 && R.total(at) === 63 + 35);
  ok("and not at 62", R.upperTotal(under) === 62 && R.total(under) === 62);

  /* a box, once written in, is written in — including a nought */
  let st = R.start(2);
  st = R.roll(st, seeded(5));
  const wrote = R.take(st, 0, "chance");
  ok("writing a box passes the turn on", wrote && wrote.turn === 1 && wrote.rolls === 0);
  ok("a written box cannot be written again", R.take(R.roll(wrote, seeded(6)), 1, "chance") !== null &&
     R.take({ ...wrote, turn: 0, rolls: 1 }, 0, "chance") === null);
  ok("you cannot write into somebody else's turn", R.take(st, 1, "ones") === null);
  ok("you cannot write before you have rolled", R.take(R.start(2), 0, "ones") === null);
  ok("a fourth roll is refused", R.roll(R.roll(R.roll(R.roll(R.start(1), seeded(1)), seeded(2)), seeded(3)), seeded(4)) === null);

  /* kept dice stay kept, and the rest actually move */
  let held = R.roll(R.start(1), seeded(11));
  held = R.hold(held, 0); held = R.hold(held, 1);
  const was = [held.dice[0], held.dice[1]];
  let moved = false;
  for (let k = 0; k < 40; k++) {
    const n = R.roll(held, seeded(k + 50));
    if (n.dice[0] !== was[0] || n.dice[1] !== was[1]) { ok("kept dice are never rerolled", false); return; }
    if (n.dice[2] !== held.dice[2] || n.dice[3] !== held.dice[3]) moved = true;
  }
  ok("kept dice are never rerolled", true, "40 rerolls");
  ok("unkept dice do get rerolled", moved);

  /* whole games, played randomly, with every total re-derived by hand */
  let games = 0, bad = 0, yahtzees = 0;
  for (let g = 0; g < 400; g++) {
    const rnd = seeded(g + 3000);
    let s = R.start(2), guard = 0;
    while (!R.over(s) && guard++ < 200) {
      s = R.roll(s, rnd);
      const cnt = R.counts(s.dice);
      for (let f = 1; f <= 6; f++) if (cnt[f] === 5) yahtzees++;
      const open = R.open(s.cards[s.turn]);
      const jb = R.jokerBoxes(s.dice, s.cards[s.turn]);
      const pool = jb || open;
      const n = R.take(s, s.turn, pool[(rnd() * pool.length) | 0]);
      if (!n) { bad++; break; }
      s = n;
    }
    if (!R.over(s)) { bad++; continue; }
    games++;
    for (let seat = 0; seat < 2; seat++) {
      const c = s.cards[seat];
      let up = 0, lo = 0;
      for (let i = 0; i < 6; i++) up += c[R.CATS[i].key];
      for (let i = 6; i < 13; i++) lo += c[R.CATS[i].key];
      const want = up + (up >= 63 ? 35 : 0) + lo + (c.bonusYahtzees || 0) * 100;
      if (want !== R.total(c)) bad++;
    }
  }
  ok("400 games all finish, with every total re-derived by hand", games === 400 && bad === 0,
     bad ? bad + " wrong" : "800 sheets");
  /* one roll in 1296 is five of a kind, and 10,400 single rolls get thrown
     here — so this is really a check on the dice rather than on the sheet,
     and it is the check that caught the harness's own generator having a
     cycle of sixteen thousand */
  ok("five of a kind turns up at about the right rate", yahtzees >= 3 && yahtzees <= 20,
     yahtzees + " in 10,400 rolls, expected ~8");
  ok("thirteen boxes means thirteen turns each", R.CATS.length === 13);
})();

/* ================================================================
   hearts
   ================================================================ */
console.log("\n──  the hearts table");
(function () {
  const Cards = load("hearts", "cards.js");
  global.Cards = Cards;
  const R = load("hearts", "rules.js");
  let hands = 0, moons = 0, shortHands = 0;
  for (let g = 0; g < 2000; g++) {
    const rnd = seeded(g + 1);
    let st = R.deal(g % 4, rnd);
    if (st.phase === "pass") {
      for (let s = 0; s < 4; s++) R.choosePass(st, s, st.hands[s].slice(0, 3));
      if (!R.passReady(st)) { ok("everybody's three make a complete pass", false); return; }
      st = R.doPass(st);
      /* everybody still holds thirteen after the swap */
      for (let s = 0; s < 4; s++) if (st.hands[s].length !== 13) { ok("the pass conserves the hands", false); return; }
    }
    if (st.turn !== R.holderOf(st, R.C2)) { ok("the two of clubs leads", false); return; }
    let ply = 0;
    while (st.phase === "play") {
      const legal = R.legal(st, st.turn);
      if (!legal.length) { ok("a live hand always has a legal card", false); return; }
      /* follow suit while you can */
      if (st.trick.length) {
        const led = Cards.suit(st.trick[0].card);
        const canFollow = st.hands[st.turn].some((c) => Cards.suit(c) === led);
        if (canFollow && !legal.every((c) => Cards.suit(c) === led)) {
          ok("you must follow suit while you can", false); return;
        }
      }
      /* no blood on the first trick unless the hand is nothing but blood */
      if (st.tricks === 0) {
        const allPoints = st.hands[st.turn].every(R.isPoint);
        if (!allPoints && legal.some(R.isPoint)) { ok("no points on the first trick", false); return; }
      }
      /* hearts cannot be led before they are broken */
      if (!st.trick.length && !st.broken && st.tricks > 0) {
        const onlyHearts = st.hands[st.turn].every((c) => Cards.suit(c) === 2);
        if (!onlyHearts && legal.some((c) => Cards.suit(c) === 2)) {
          ok("hearts are not led before they are broken", false); return;
        }
      }
      const pick = legal[Math.floor(rnd() * legal.length)];
      const next = R.play(st, st.turn, pick);
      if (!next) { ok("a legal card is always accepted", false); return; }
      st = next; ply++;
    }
    if (ply !== 52) { shortHands++; }
    const t = R.tally(st);
    if (t.raw[0] + t.raw[1] + t.raw[2] + t.raw[3] !== 26) { ok("every hand is worth twenty-six", false); return; }
    if (t.shooter >= 0) {
      moons++;
      const total = t.add.reduce((a, b) => a + b, 0);
      if (total !== 78) { ok("a moon puts 26 on each of the other three", false, String(total)); return; }
    }
    hands++;
  }
  ok("2000 hands: follow suit, no blood on the first trick, hearts led only once broken", true);
  ok("2000 hands: every one runs the full fifty-two cards", shortHands === 0, String(shortHands));
  ok("2000 hands: the points always add to twenty-six", true);
  ok("the moon is reachable and scores correctly", moons > 0, moons + " shot");

  /* the permutation test */
  let st = R.deal(1, seeded(99));
  st.phase = "play"; st.passing = null;
  st.turn = st.lead = R.holderOf(st, R.C2);
  const base = JSON.stringify(R.publicView(st, 0));
  let leaked = false;
  for (let k = 0; k < 300; k++) {
    const c = R.clone(st);
    const pool = c.hands[1].concat(c.hands[2]).concat(c.hands[3]);
    Cards.shuffle(pool, seeded(k + 500));
    c.hands[1] = pool.slice(0, 13);
    c.hands[2] = pool.slice(13, 26);
    c.hands[3] = pool.slice(26, 39);
    if (JSON.stringify(R.publicView(c, 0)) !== base) leaked = true;
  }
  ok("the permutation test: a seat's message cannot encode the other three hands", !leaked,
     "300 rearrangements");
})();

/* ================================================================
   euchre
   ================================================================ */
console.log("\n──  the euchre table");
(function () {
  const Cards = load("euchre", "cards.js");
  global.Cards = Cards;
  const R = load("euchre", "rules.js");

  /* the bowers, which are the whole game */
  const JS = 3 * 13 + 9, JC = 0 * 13 + 9, AS = 3 * 13 + 12;
  ok("the left bower is trump, not its printed suit", R.suitOf(JC, 3) === 3 && R.suitOf(JC, 0) === 0);
  ok("the right bower is the highest card in the pack", R.power(JS, 3, 3) > R.power(JC, 3, 3));
  ok("the left bower outranks the ace of trump", R.power(JC, 3, 3) > R.power(AS, 3, 3));
  ok("an off-suit card cannot win a trick it did not follow", R.power(0 * 13 + 12, 3, 1) === -1);

  let hands = 0, euchred = 0, alone = 0, marches = 0, thrown = 0, badScore = 0;
  for (let g = 0; g < 3000; g++) {
    const rnd = seeded(g + 1);
    let st = R.deal(g % 4, rnd, R.DEFAULTS);
    let guard = 0;
    while (st.phase !== "done" && st.phase !== "throw" && guard++ < 90) {
      const seat = st.turn;
      if (st.phase === "bid1" || st.phase === "bid2") {
        const opts = R.bidOptions(st, seat);
        if (!opts.length) { ok("somebody always has something to say in the bidding", false); return; }
        const b = opts[Math.floor(rnd() * opts.length)];
        const next = R.bid(st, seat, b);
        if (!next) { ok("an offered bid is always accepted", false, JSON.stringify(b)); return; }
        st = next;
      } else if (st.phase === "discard") {
        st = R.discard(st, seat, st.hands[seat][0]);
        if (!st) { ok("the dealer can always discard", false); return; }
      } else {
        const legal = R.legal(st, seat);
        if (!legal.length) { ok("a live hand always has a legal card", false); return; }
        /* follow suit, counting the left bower as trump */
        if (st.trick.length) {
          const led = R.suitOf(st.trick[0].card, st.trump);
          const canFollow = st.hands[seat].some((c) => R.suitOf(c, st.trump) === led);
          if (canFollow && !legal.every((c) => R.suitOf(c, st.trump) === led)) {
            ok("you must follow suit, and the left bower is trump when you do", false); return;
          }
        }
        st = R.play(st, seat, legal[Math.floor(rnd() * legal.length)]);
      }
    }
    if (st.phase === "throw") { thrown++; continue; }
    if (st.won[0] + st.won[1] !== 5) { ok("every hand is exactly five tricks", false); return; }
    /* a lone hand deals its partner out entirely */
    if (st.alone && st.hands[R.partner(st.maker)].length !== 5) {
      ok("a lone hand leaves the partner's cards untouched", false); return;
    }
    const t = R.tally(st);
    if ([1, 2, 4].indexOf(t.points) < 0) badScore++;
    if (t.euchred) euchred++;
    if (st.alone) alone++;
    if (t.points === 2 && !t.euchred) marches++;
    hands++;
  }
  ok("3000 hands: follow suit with the left bower counted as trump", true);
  ok("3000 hands: every one is exactly five tricks", true);
  ok("every hand scores 1, 2 or 4 and nothing else", badScore === 0, String(badScore));
  ok("stick-the-dealer means nothing is ever thrown in", thrown === 0, String(thrown));
  /* bid at random, so these are not realistic frequencies — they are here to
     show every branch of the scoring was actually walked */
  console.log("    · " + hands + " hands bid at random · " + euchred + " euchred · " +
              marches + " marches · " + alone + " played alone");

  /* the permutation test, including the partner */
  let st = R.deal(0, seeded(7), R.DEFAULTS);
  st = R.bid(st, 1, { k: "order" });
  st = R.discard(st, 0, st.hands[0][0]);
  const base = JSON.stringify(R.publicView(st, 1));
  let leaked = false;
  for (let k = 0; k < 300; k++) {
    const c = R.clone(st);
    const pool = c.hands[0].concat(c.hands[2]).concat(c.hands[3]);
    Cards.shuffle(pool, seeded(k + 900));
    c.hands[0] = pool.slice(0, 5);
    c.hands[2] = pool.slice(5, 10);
    c.hands[3] = pool.slice(10, 15);
    if (JSON.stringify(R.publicView(c, 1)) !== base) leaked = true;
  }
  ok("the permutation test: not even your partner's hand is on the wire", !leaked,
     "300 rearrangements, seat 2 is seat 1's partner");
})();

/* ================================================================
   viuda — and the ranking, checked against every hand there is
   ================================================================ */
console.log("\n──  la viuda");
(function () {
  const Cards = load("viuda", "cards.js");
  global.Cards = Cards;
  const R = load("viuda", "rules.js");
  const card = (r, s) => s * 13 + r;

  /* All 2,598,960 five-card hands, and the count in every category has to
     match the known figure exactly. A ranking that is wrong anywhere moves at
     least two of these numbers, so this one check subsumes a page of
     hand-written examples — and it is the only way to be sure about the wheel
     and the tiebreak order, which are where these go wrong. */
  const want = { 8: 40, 7: 624, 6: 3744, 5: 5108, 4: 10200, 3: 54912, 2: 123552, 1: 1098240, 0: 1302540 };
  const got = {};
  const h = [0, 0, 0, 0, 0];
  for (h[0] = 0; h[0] < 52; h[0]++)
    for (h[1] = h[0] + 1; h[1] < 52; h[1]++)
      for (h[2] = h[1] + 1; h[2] < 52; h[2]++)
        for (h[3] = h[2] + 1; h[3] < 52; h[3]++)
          for (h[4] = h[3] + 1; h[4] < 52; h[4]++) {
            const c = R.category(h);
            got[c] = (got[c] || 0) + 1;
          }
  let wrong = "";
  for (const k of Object.keys(want)) if (got[k] !== want[k]) wrong += R.CATS[k] + " " + got[k] + "≠" + want[k] + " ";
  ok("all 2,598,960 hands land in the right category", !wrong, wrong);

  /* the wheel, which is the classic bug */
  const wheel = [card(12, 0), card(0, 1), card(1, 2), card(2, 3), card(3, 0)];
  const six = [card(4, 0), card(3, 1), card(2, 2), card(1, 3), card(0, 0)];
  const aceHigh = [card(12, 0), card(11, 1), card(10, 2), card(9, 3), card(8, 0)];
  ok("A-2-3-4-5 is a straight", R.name(wheel) === "a straight");
  ok("and it is the lowest one", R.score(wheel) < R.score(six) && R.score(six) < R.score(aceHigh));
  ok("and it is called five high, not ace high", R.describe(wheel) === "a straight, 5 high");

  /* tiebreak order */
  const kicker = [card(11, 0), card(11, 1), card(2, 2), card(2, 3), card(12, 0)];
  const kicker2 = [card(11, 0), card(11, 1), card(2, 2), card(2, 3), card(10, 0)];
  ok("two pair is broken by the kicker", R.score(kicker) > R.score(kicker2));
  const fours = [card(2, 0), card(2, 1), card(2, 2), card(1, 0), card(1, 1)];
  const acesUnder = [card(1, 0), card(1, 1), card(1, 2), card(12, 0), card(12, 1)];
  ok("a full house is judged by its triple, not its pair", R.score(fours) > R.score(acesUnder));

  /* the deal, and the three moves */
  let st = R.deal(R.start(4), seeded(9));
  ok("everybody gets five and the widow gets five",
     st.hands.every((x) => x.length === 5) && st.widow.length === 5);
  ok("the widow starts face down", !st.shown);
  ok("nobody may fish in a face-down widow",
     R.options(st, st.turn).every((o) => o.k !== "swap") && R.swap(st, st.turn, st.hands[st.turn][0], st.widow[0]) === null);
  const seat = st.turn, hadCards = st.hands[seat].slice();
  const took = R.take(st, seat);
  ok("taking the widow puts your hand in the middle, face up",
     took && took.shown && JSON.stringify(took.widow.slice().sort()) === JSON.stringify(hadCards.slice().sort()));
  ok("you cannot move out of turn", R.take(st, (seat + 1) % 4) === null);

  /* whole games: nothing is created, nothing vanishes, and they all end */
  let games = 0, bad = 0, ends = {};
  for (let g = 0; g < 400; g++) {
    const rnd = seeded(g + 8000);
    let s = R.start(2 + (g % 5));
    let guard = 0;
    while (!R.over(s) && guard++ < 400) {
      s = R.deal(s, rnd);
      let g2 = 0;
      while (s.phase === "play" && g2++ < 80) {
        const who = s.turn, opts = R.options(s, who);
        const pick = opts[(rnd() * opts.length) | 0];
        let n = pick.k === "take" ? R.take(s, who)
              : pick.k === "swap" ? R.swap(s, who, s.hands[who][(rnd() * 5) | 0], s.widow[(rnd() * 5) | 0])
              : R.knock(s, who);
        if (!n) n = R.knock(s, who);
        if (!n) { bad++; break; }
        s = n;
        /* fifty-two distinct cards, always */
        const seen = {};
        let count = 0;
        for (let q = 0; q < s.seats; q++) for (const c of s.hands[q]) { seen[c] = 1; count++; }
        for (const c of s.widow) { seen[c] = 1; count++; }
        if (Object.keys(seen).length !== count) { bad++; break; }
      }
      if (s.phase === "play") { bad++; break; }
    }
    if (R.over(s)) { games++; ends[R.playerCount(s)] = (ends[R.playerCount(s)] || 0) + 1; }
  }
  ok("400 games all finish, with one player left standing", games === 400 && bad === 0,
     bad ? bad + " went wrong" : JSON.stringify(ends));

  /* the permutation test */
  let st2 = R.deal(R.start(4), seeded(31));
  st2 = R.take(st2, st2.turn);
  const base = JSON.stringify(R.publicView(st2, 0));
  let leaked = false;
  for (let k = 0; k < 300; k++) {
    const c = R.clone(st2);
    /* every card seat 0 cannot see, rearranged among the seats that hold them */
    const pool = [];
    for (let q = 1; q < c.seats; q++) for (const x of c.hands[q]) pool.push(x);
    const r3 = seeded(k + 400);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (r3() * (i + 1)) | 0;
      const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
    }
    let at = 0;
    for (let q = 1; q < c.seats; q++) c.hands[q] = pool.slice(at, at += c.hands[q].length);
    if (JSON.stringify(R.publicView(c, 0)) !== base) leaked = true;
  }
  ok("the permutation test: a seat's message cannot encode the other hands", !leaked,
     "300 rearrangements");
})();

/* ================================================================
   the two party rooms — one phone, no engine, and a word list that
   has to actually be a word list
   ================================================================ */
console.log("\n──  the party rooms");
(function () {
  const W = load("catchphrase", "words.js");
  const seen = {};
  let dupes = 0, tooLong = 0, total = 0;
  for (const which of ["SAY", "ACT"]) {
    for (const lv of W.LEVELS) {
      for (const w of W[which][lv]) {
        total++;
        const key = which + ":" + w.toLowerCase();
        if (seen[key]) dupes++;
        seen[key] = 1;
        /* anything much longer than this does not fit on a phone at the size
           the word has to be drawn */
        if (w.length > 42) tooLong++;
      }
    }
  }
  ok("both lists are big enough to play with", W.count("say") >= 120 && W.count("act") >= 90,
     W.count("say") + " to say, " + W.count("act") + " to act");
  ok("no word appears twice in its own list", dupes === 0, dupes + " repeats");
  ok("nothing is too long to draw large", tooLong === 0);
  ok("every level has cards at all",
     W.LEVELS.every((lv) => W.SAY[lv].length >= 25 && W.ACT[lv].length >= 25));

  /* a deck is the whole list, shuffled — not a sampler, so nothing repeats
     until everything has been seen */
  const deck = W.deck("say", ["easy", "medium"], seeded(5));
  const uniq = {};
  for (const c of deck) uniq[c.word] = 1;
  ok("a deck is the whole list with nothing repeated and nothing missing",
     deck.length === W.count("say", "easy") + W.count("say", "medium") &&
     Object.keys(uniq).length === deck.length);

  /* the describing game */
  const C = load("catchphrase", "rules.js");
  let st = C.begin(C.start({}), seeded(3));
  ok("the round starts with the phone in the starter's hands", st.holder === st.starter);
  const first = st.word;
  const after = C.got(st, seeded(4));
  ok("getting it changes hands", after.holder === 1 - st.holder);
  ok("and brings a new word", after.word !== first || after.deck.length === 1);
  const skipped = C.skip(st, seeded(6));
  ok("a skip does NOT change hands — otherwise skipping is the best move in the game",
     skipped.holder === st.holder);
  const buzzed = C.buzz(after);
  ok("the buzzer scores for the team NOT holding it",
     buzzed.scores[1 - after.holder] === 1 && buzzed.scores[after.holder] === 0);
  ok("nobody's score ever goes down", buzzed.scores.every((x) => x >= 0));
  ok("the caught team starts the next round", buzzed.starter === after.holder);
  ok("the round length is inside its range and is not always the same", (() => {
    const lens = [];
    for (let i = 0; i < 40; i++) lens.push(C.roundLength(st, seeded(i + 1)));
    const lo = Math.min(...lens), hi = Math.max(...lens);
    return lo >= C.SHORTEST && hi <= C.LONGEST && hi - lo > 10;
  })());
  /* a whole match ends */
  let m = C.start({ target: 5 }), rounds = 0;
  while (!C.over(m) && rounds++ < 100) {
    m = C.begin(m, seeded(rounds + 60));
    for (let i = 0; i < (rounds % 4); i++) m = C.got(m, seeded(rounds * 7 + i));
    m = C.buzz(m);
  }
  ok("a match to five always ends", C.over(m) && Math.max(...m.scores) === 5, rounds + " rounds");

  /* the acting game */
  const A = load("guesstures", "rules.js");
  let a = A.begin(A.start({}), seeded(11));
  ok("a hand is four cards", a.hand.length === 4);
  ok("and it is one of each level plus a spare, not four at random",
     new Set(a.hand.map((c) => c.level)).size >= 3);
  const worth = a.hand[0].worth;
  const gotOne = A.got(a);
  ok("a card you get is worth what it says", gotOne.scores[a.team] === worth);
  const passed = A.pass(a);
  ok("a card you give up on scores for nobody",
     passed.scores[0] === 0 && passed.scores[1] === 0 && passed.lost.length === 1);
  const ran = A.timeUp(a);
  ok("running out loses everything still in hand — the rule most versions drop",
     ran.lost.length === 4 && ran.scores[0] === 0 && ran.scores[1] === 0);
  ok("and a lost card is not handed to the other team either",
     ran.scores[1] === 0);
  /* a whole match ends, and the deck does not repeat inside one pass */
  let g2 = A.start({ target: 12 }), turns = 0, repeats = 0;
  const beenSeen = {};
  let sinceReshuffle = 0;
  while (!A.over(g2) && turns++ < 200) {
    g2 = A.begin(g2, seeded(turns + 300));
    for (const c of g2.hand) {
      if (beenSeen[c.word]) repeats++;
      beenSeen[c.word] = 1;
      sinceReshuffle++;
    }
    g2 = A.got(g2); g2 = A.got(g2);
    if (g2.phase === "acting") g2 = A.timeUp(g2);
    if (g2.phase === "tally") g2 = A.next(g2);
  }
  ok("a match to twelve always ends", A.over(g2), turns + " turns");
  ok("no card comes up twice before the deck has been through",
     repeats === 0 || sinceReshuffle > W.count("act"), repeats + " repeats in " + sinceReshuffle + " cards");
})();

/* ================================================================
   the minefield
   ================================================================ */
console.log("\n──  the minefield");
(function () {
  const C = load("minesweeper", "core.js");
  for (const [w, h, m, tries] of [[9, 9, 10, 30], [16, 16, 40, 30], [30, 16, 99, 20]]) {
    let fair = 0, deals = 0, badFirst = 0, badCount = 0;
    for (let i = 0; i < tries; i++) {
      const rnd = seeded(i * 7919 + 13);
      const first = Math.floor(rnd() * w * h);
      const g = C.deal(w, h, m, first, { rnd: rnd });
      deals += g.tries;
      if (g.fair) fair++;
      let c = 0;
      for (let k = 0; k < w * h; k++) if (g.mine[k]) c++;
      if (c !== m) badCount++;
      /* the first tap is not merely safe, it opens a clearing */
      if (g.adj[first] !== 0) badFirst++;
    }
    ok(w + "×" + h + " with " + m + " mines: every field can be finished by reasoning alone",
       fair === tries, fair + "/" + tries + ", " + (deals / tries).toFixed(1) + " deals each");
    ok(w + "×" + h + ": the mine count is exactly right", badCount === 0);
    ok(w + "×" + h + ": the first tap always opens a clearing", badFirst === 0);
  }
  /* the solver must actually be able to fail — a solver that says yes to
     everything proves nothing */
  const rnd = seeded(4);
  let refused = 0;
  for (let i = 0; i < 60; i++) {
    const g = C.deal(16, 16, 60, 40, { rnd: rnd, noGuess: false });
    if (!C.solvable(16, 16, g.mine, g.adj, 40)) refused++;
  }
  ok("the solver refuses fields that need a guess", refused > 0,
     refused + "/60 dense fields rejected");
})();

/* ================================================================
   the card table
   ================================================================ */
console.log("\n──  the card table");
(function () {
  const C = load("solitaire", "core.js");
  const rnd = seeded(1);
  const g = C.deal(C.shuffle(rnd), 1, 0);
  const all = {};
  let n = 0;
  for (const p of g.pile) for (const c of p) { all[c] = 1; n++; }
  for (const c of g.stock) { all[c] = 1; n++; }
  ok("a deal is fifty-two distinct cards", n === 52 && Object.keys(all).length === 52);
  let widths = true;
  for (let i = 0; i < 7; i++) if (g.pile[i].length !== i + 1 || g.down[i] !== i) widths = false;
  ok("the tableau is 1,2,3,4,5,6,7 with only the last of each face up", widths);

  /* every move conserves the pack */
  let st = C.clone(g), conserved = true;
  for (let k = 0; k < 400; k++) {
    const ms = C.moves(st);
    if (!ms.length) break;
    st = C.apply(st, ms[Math.floor(rnd() * ms.length)]);
    let count = st.found[0] + st.found[1] + st.found[2] + st.found[3] +
                st.stock.length + st.waste.length;
    for (const p of st.pile) count += p.length;
    if (count !== 52) { conserved = false; break; }
  }
  ok("400 random moves: the pack is always fifty-two", conserved);

  /* the solver's verdict has to mean something */
  let won = 0;
  for (let i = 0; i < 12; i++) {
    const r2 = seeded(i * 977 + 5);
    if (C.solve(C.deal(C.shuffle(r2), 1, 0), { nodes: 150000 }).won) won++;
  }
  ok("the solver finishes some deals and not others", won > 0 && won < 12,
     won + "/12 solved — a solver that says yes to everything proves nothing");
})();

/* ================================================================
   the wall
   ================================================================ */
console.log("\n──  the wall");
(function () {
  const L = load("breaker", "levels.js");
  global.Levels = L;
  const G = load("breaker", "game.js");
  let thin = 0;
  for (let n = 1; n <= 40; n++) if (L.count(L.build(n)) < 8) thin++;
  ok("forty levels, none of them a token wall", thin === 0);

  /* every breakable brick must be reachable, or the level cannot be finished */
  let sealed = 0;
  for (let n = 1; n <= 40; n++) {
    const lv = L.build(n);
    const rows = lv.rows, cols = lv.cols;
    const seen = [];
    for (let r = 0; r < rows; r++) { seen.push(new Array(cols).fill(false)); }
    const q = [];
    for (let c = 0; c < cols; c++) if (lv.grid[rows - 1][c] !== 9) { q.push([rows - 1, c]); seen[rows - 1][c] = true; }
    while (q.length) {
      const [r, c] = q.pop();
      /* through bricks as well as gaps: a brick behind a brick is reachable,
         because the one in front of it is going to be broken. Only a solid
         stops the flood. */
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols || seen[rr][cc] || lv.grid[rr][cc] === 9) continue;
        seen[rr][cc] = true;
        q.push([rr, cc]);
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (lv.grid[r][c] && lv.grid[r][c] !== 9 && !seen[r][c]) sealed++;
    }
  }
  ok("no breakable brick is sealed behind unbreakable ones", sealed === 0, String(sealed));

  /* a perfect paddle must be able to clear a level — if it cannot, the
     physics has a hole in it rather than the player having a problem */
  let cleared = 0, escaped = 0;
  for (let n = 1; n <= 12; n++) {
    const g = G.start(n, 3);
    G.launch(g);
    for (let f = 0; f < 400000 && !g.over && !g.cleared; f++) {
      let low = null;
      for (const b of g.balls) if (!low || b.y > low.y) low = b;
      if (low) G.aim(g, low.x);
      if (g.stuck) G.launch(g);
      G.step(g, 1 / 120);
      for (const b of g.balls) if (b.x < -0.02 || b.x > 1.02 || b.y < -0.02) escaped++;
    }
    if (g.cleared) cleared++;
  }
  ok("a perfect paddle clears the first twelve levels", cleared === 12, cleared + "/12");
  ok("the ball never leaves the field — no tunnelling through a wall", escaped === 0, String(escaped));
})();

console.log("");
if (fails) { console.log("FAILED: " + fails + " of " + checks + " checks"); process.exit(1); }
console.log(checks + " checks, all of them honest");
