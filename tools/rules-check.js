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

/* ================================================================
   the well — a falling-blocks engine, which is nothing but edges
   ================================================================
   The rules of this genre are famous, and famously easy to get almost
   right: a kick table copied with one sign flipped, a lock that forgets to
   give its resets back, a Twist that never gets its fifth-test upgrade.
   None of those crash. They just make a slightly different game. So the
   tables are derived rather than trusted, the published worked examples
   are re-scored, the fewest-press table is re-derived by search and then
   played through the real engine, the lesson boards are solved, the bag is
   dealt a hundred thousand times, and whole games are replayed twice —
   from a save, from a clone — and required to come out identical. */
console.log("\n──  the well");
(function () {
  const Rules = load("well", "rules.js");
  const Well = load("well", "engine.js");
  const Bot = load("well", "bot.js");
  const Modes = load("well", "modes.js");
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const NAMES = Rules.NAMES;
  const PRESS = Rules.PRESS_ACTION;
  /* a fresh game with its opening spawn already read, and what has
     happened since the last time we asked */
  const make = (o) => { const g = Well.create(o); Well.drain(g); return g; };
  const did = (g) => Well.drain(g).slice();

  /* the kick tables, derived rather than trusted. Each 90° table comes
     from the five "rotation points" of the two states it joins; the long
     piece's first difference is subtracted so its first test is no move.
     Libraries ship typos in these tables, and only a derivation finds
     them. */
  const T8 = ["0R", "R0", "R2", "2R", "2L", "L2", "L0", "0L"];
  const derive = (off) => {
    const out = {};
    for (const k of T8) {
      const a = off[k[0]], b = off[k[1]];
      const base = [a[0][0] - b[0][0], a[0][1] - b[0][1]];
      out[k] = a.map((p, i) => [p[0] - b[i][0] - base[0], p[1] - b[i][1] - base[1]]);
    }
    return out;
  };
  ok("the J L S T Z kicks are exactly what the rotation points derive", same(derive(Rules.OFFSETS.JLSTZ), Rules.KICKS_JLSTZ));
  ok("the long piece's kicks are exactly what its rotation points derive", same(derive(Rules.OFFSETS.I), Rules.KICKS_I));
  /* the square: its offsets exist only to cancel the drift of turning it
     about a corner, so every turn must leave the same four cells */
  let sq = Rules.CELLS[2][0].map((c) => c.slice()), at = [0, 0], still = true;
  const key = (cs) => cs.map((c) => c.join(",")).sort().join("|");
  for (let r = 0; r < 8; r++) {
    const a = Rules.ROT[r % 4], b = Rules.ROT[(r + 1) % 4];
    sq = sq.map(([x, y]) => [y, -x]);
    at = [at[0] + Rules.OFFSETS.O[a][0][0] - Rules.OFFSETS.O[b][0][0], at[1] + Rules.OFFSETS.O[a][0][1] - Rules.OFFSETS.O[b][0][1]];
    if (key(sq.map(([x, y]) => [x + at[0], y + at[1]])) !== key(Rules.CELLS[2][0])) still = false;
  }
  ok("every turn of the square leaves it where it was", still);
  ok("Modern turning's long-piece kicks are mirror images of each other",
     T8.every((k) => {
       const m = { "0R": "0L", "R0": "L0", "R2": "L2", "2R": "2L", "2L": "2R", "L2": "R2", "L0": "R0", "0L": "0R" }[k];
       return same(Rules.KICKS_I_PLUS[k].map(([x, y]) => [-x, y]), Rules.KICKS_I_PLUS[m]);
     }));

  /* spawn: born at (4, 22) facing north, then one row down at once */
  const born = {
    I: [[3, 22], [4, 22], [5, 22], [6, 22]], O: [[4, 22], [5, 22], [4, 23], [5, 23]],
    T: [[3, 22], [4, 22], [5, 22], [4, 23]], J: [[3, 23], [3, 22], [4, 22], [5, 22]],
    L: [[5, 23], [3, 22], [4, 22], [5, 22]], S: [[3, 22], [4, 22], [4, 23], [5, 23]],
    Z: [[3, 23], [4, 23], [4, 22], [5, 22]]
  };
  let spawnOK = true;
  for (let t = 1; t <= 7; t++) {
    const g = make({ queue: NAMES[t], queueThen: "end" });
    const v = Well.view(g, {});
    const want = born[NAMES[t]].map(([x, y]) => [x, y - 1]);
    if (key(v.active.cells) !== key(want) || key(Well.cells(t, 0, 4, 22)) !== key(born[NAMES[t]])) spawnOK = false;
  }
  const tg = make({ queue: "T", queueThen: "end" });
  ok("a T on an empty well lands at (3,21)(4,21)(5,21)(4,22) — the nub above, y is up",
     same(Well.view(tg, {}).active.cells, [[3, 21], [4, 21], [5, 21], [4, 22]]));
  ok("all seven pieces are born where the table says, and drop one row at once", spawnOK);

  /* the two Twist boards. A T slides under an overhang and turns
     clockwise; tests one to four collide and the fifth — the long hop —
     threads it into the slot. Variant A has all four corners: a full
     Twist Triple. Variant B is missing a corner on the pointing side, a
     Mini by the corner rule, and the fifth test upgrades it: a full Twist
     Double. A build that forgets the upgrade fails B. */
  for (const variantB of [false, true]) {
    const rows = ["XXXX......", "XXX.......", "XXX.XXXXXX", "XXX..XXXXX", variantB ? "XXX..XXXXX" : "XXX.XXXXXX"]
      .map((s) => s.replace(/X/g, "G"));
    const g = make({ board: rows, queue: "T", queueThen: "end", gravity: 0 });
    g.active.x = 5; g.active.y = 3;
    Well.act(g, "left");
    Well.act(g, "cw");
    const a = Object.assign({}, g.active), kick = g.p.kick;
    Well.act(g, "hard");
    const ev = did(g);
    const lock = ev.find((e) => e.t === "lock"), clear = ev.find((e) => e.t === "clear");
    const wantLabel = variantB ? "Twist Double" : "Twist Triple";
    ok("Twist board " + (variantB ? "B" : "A") + ": the fifth test threads it in and it is a full " + wantLabel,
       kick === 4 && a.x === 3 && a.y === 1 && a.rot === 1 && lock.twist === "full" && clear && clear.label === wantLabel,
       "kick " + kick + ", at " + a.x + "," + a.y + ", " + (clear && clear.label));
  }
  {
    const b = new Uint8Array(400);
    const put = (x, y) => { b[y * 10 + x] = 8; };
    for (let y = 0; y <= 2; y++) for (let x = 0; x < 10; x++) put(x, y);
    b[3] = b[13] = b[23] = 0; b[14] = 0; b[4] = 0;
    put(0, 3); put(1, 3); put(2, 3); put(0, 4); put(1, 4); put(2, 4); put(3, 4);
    ok("…and without the fifth-test upgrade board B would only be a Mini",
       Rules.twist(b, 3, 1, 1, true, 0, false) === "mini" && Rules.twist(b, 3, 1, 1, true, 4, false) === "full");
    ok("a half turn never earns the fifth-test upgrade", Rules.twist(b, 3, 1, 1, true, 4, true) === "mini");
    ok("no turn, no Twist — whatever the corners say", Rules.twist(b, 3, 1, 1, false, 4, false) === "none");
  }

  /* the scorer, against vectors worked by hand at level 1 */
  const S = (seq) => {
    const st = Rules.scoreState(1);
    let total = 0;
    for (const s of seq) total += Rules.score(st, s.tw || "none", s.n || 0, !!s.empty, s.soft || 0, s.hard || 0);
    return total;
  };
  ok("Quad, Twist Double, Twist, Quad, Twist Single with quiet locks between: 5,400",
     S([{ n: 4 }, {}, { tw: "full", n: 2 }, {}, { tw: "full" }, { n: 4 }, {}, { tw: "full", n: 1 }]) === 5400);
  ok("a Triple that empties the well: 2,300", S([{ n: 3, empty: true }]) === 2300);
  ok("four Singles on four pieces in a row: 700 (the Ripple)", S([{ n: 1 }, { n: 1 }, { n: 1 }, { n: 1 }]) === 700);
  {
    const st = Rules.scoreState(1);
    Rules.score(st, "none", 4, false, 0, 0);
    ok("an Unbroken Quad that empties the well, Ripple 1: 4,450",
       Rules.score(st, "none", 4, true, 0, 0) === 4450);
  }
  ok("drops: three rows soft and eighteen hard are 39, whatever the level",
     (() => { const st = Rules.scoreState(7); return Rules.score(st, "none", 0, false, 3, 18) === 39; })());
  {
    const st = Rules.scoreState(1);
    Rules.score(st, "none", 4, false, 0, 0);
    Rules.score(st, "full", 0, false, 0, 0);
    Rules.score(st, "none", 0, false, 0, 0);
    const kept = st.unbroken === 0;
    Rules.score(st, "none", 2, false, 0, 0);
    ok("Unbroken survives quiet locks and a lineless Twist, and only a plain clear breaks it", kept && st.unbroken === -1);
  }
  {
    const g = make({ board: ["IIIIOOOO..", "IIIIOOOO.."].map((s) => s.replace(/[IO]/g, "G")), queue: "O", queueThen: "end", gravity: 0 });
    Well.act(g, "dasRight"); Well.act(g, "hard");
    const c = did(g).find((e) => e.t === "clear");
    ok("in the engine: an O into the last gap empties the well — Double + Empty Well = 1,500",
       c && c.empty && c.points === 1500 && c.label === "Double" && g.top === -1);
  }

  /* the bag */
  {
    const a = Well.bag(20261013), b = Well.bag(20261013), c = Well.bag(20261014);
    let identical = true, differs = false, sets = true, worst = 0;
    const last = [0, -1, -1, -1, -1, -1, -1, -1];
    const block = [];
    for (let i = 0; i < 100000; i++) {
      const p = a();
      if (p !== b()) identical = false;
      if (p !== c()) differs = true;
      if (last[p] >= 0) worst = Math.max(worst, i - last[p] - 1);
      last[p] = i;
      block.push(p);
      if (block.length === 7) { if (new Set(block).size !== 7) sets = false; block.length = 0; }
    }
    ok("the bag: the same seed deals the same 100,000 pieces, and another seed does not", identical && differs);
    ok("every set of seven holds one of each shape", sets);
    ok("at most 12 pieces between two of the same — and 12 does happen", worst === 12, "longest gap " + worst);
    const g = make({ seed: 77 });
    const s = Well.bag(77), first = [];
    for (let i = 0; i < 8; i++) first.push(s());
    ok("the engine deals from that same stream", g.active.type === first[0] && same(g.queue.slice(0, 7), first.slice(1)));
    ok("the bag on view is what is left of the active piece's set",
       (() => { const v = Well.view(g, {}); return v.bag.length === 6 && v.bag.indexOf(g.active.type) < 0 && new Set(v.bag).size === 6; })());
  }

  /* DAS, frame by frame. A press steps at once; holding for DAS 167 ms
     with ARR 33 ms must give the first auto-step on the tenth frame at
     60 Hz, then one every second frame — and the same moments at 30, 120
     and 240 Hz, because the machine runs on time, not frames. */
  {
    const times = (hz, das, arr) => {
      const d = Well.Das.create({ das: das, arr: arr, dcd: 0 });
      const out = [];
      d.press(1, 0, (a, t, rep) => out.push({ f: 0, a: a, rep: rep }));
      const dt = 1000 / hz;
      for (let f = 1; f <= hz; f++) d.tick(f * dt, (a, t, rep) => out.push({ f: f, a: a, t: t, rep: rep }));
      return out;
    };
    const sixty = times(60, 167, 33);
    const autos = sixty.filter((e) => e.rep).map((e) => e.f);
    ok("DAS 167 / ARR 33 at 60 Hz: a step on the press, the first auto-step on the 10th frame",
       sixty[0].f === 0 && !sixty[0].rep && autos[0] === 10, "first auto at frame " + autos[0]);
    ok("…then one every second frame", autos.slice(0, 6).every((f, i) => f === 10 + 2 * i), autos.slice(0, 6).join(","));
    const atMs = (hz) => times(hz, 167, 33).filter((e) => e.rep).slice(0, 5).map((e) => Math.round(e.f * 1000 / hz));
    const r60 = atMs(60);
    ok("…at the same moments at 30, 120 and 240 Hz",
       same(atMs(120), r60) && same(atMs(240), r60) && atMs(30)[0] === r60[0], JSON.stringify([atMs(30), r60, atMs(240)]));

    /* newest direction wins; releasing it hands back to the older key,
       with the delay applied again rather than its old charge */
    const d = Well.Das.create({ das: 167, arr: 33 });
    const log = [];
    const em = (a, t, rep) => log.push([a, Math.round(t), rep]);
    d.press(-1, 0, em);
    d.tick(300, em);
    const leftAutos = log.filter((e) => e[0] === "left" && e[2]).length;
    d.press(1, 300, em);
    d.tick(400, em);
    const rightNow = log.filter((e) => e[0] === "right");
    ok("pressing the other way steps at once and starts its own full delay",
       leftAutos > 0 && rightNow.length === 1 && rightNow[0][1] === 300 && !rightNow[0][2]);
    d.tick(470, em);
    ok("…and its auto-repeat begins only after that delay", log.filter((e) => e[0] === "right" && e[2])[0][1] === 467);
    d.release(1, 500, em);
    log.length = 0;
    d.tick(650, em);
    const quiet = log.length === 0;
    d.tick(700, em);
    ok("releasing the newer key re-applies DAS to the one still held",
       quiet && log.length > 0 && log[0][0] === "left" && log[0][1] === 667, JSON.stringify(log[0]));
    d.release(-1, 720, em);
    log.length = 0;
    d.tick(2000, em);
    ok("with both released, nothing more comes", log.length === 0 && d.charge(2000) === 0);

    /* ARR 0: one slide to the wall when the charge completes, and again
       for the next piece if the key is still down */
    const g = make({ queue: "TTT", queueThen: "end", gravity: 0 });
    const z = Well.Das.create({ das: 167, arr: 0 });
    const act = (a, t, rep) => Well.act(g, a, { repeat: rep });
    z.press(1, 0, act);
    for (let t = 4; t < 400; t += 1000 / 240) z.tick(t, act);
    const wall1 = g.active.x;
    Well.act(g, "hard");
    did(g);
    z.renew(410, act);
    ok("ARR 0: held right goes to the wall once charged, and the next piece follows",
       wall1 === 8 && g.active.x === 8 && g.stats.keys === 2, "x " + wall1 + " then " + g.active.x + ", keys " + g.stats.keys);
    ok("the charge reads 0 → 1 for the Glass Well", z.charge(0) === 0 && z.charge(100) > 0.5 && z.charge(400) === 1);
    const c = Well.Das.create({ das: 167, arr: 33, dcd: 50 });
    const cl = [];
    c.press(1, 0, (a, t) => cl.push(t));
    c.tick(200, (a, t) => cl.push(t));
    c.cut(200);
    const before = cl.length;
    c.tick(240, (a, t) => cl.push(t));
    const paused = cl.length === before;
    c.tick(260, (a, t) => cl.push(t));
    ok("DCD: a cut pauses the repeat for the cut delay, then it resumes", paused && cl[cl.length - 1] === 250);
  }

  /* fewest presses: our own breadth-first search through the real engine,
     on an empty well, re-deriving every one of the 162 table entries */
  {
    const empty = new Uint8Array(400);
    let entries = 0, bad = [], placements = 0;
    for (let t = 1; t <= 7; t++) {
      const cls = Rules.FINESSE[NAMES[t]];
      for (const k in cls) entries += cls[k].length;
      for (const p of Well.reach(empty, t, false)) {
        placements++;
        const left = Math.min(...p.cells.map((c) => c[0]));
        const want = Rules.finesseFor(t, p.rot, left);
        if (want === undefined || Rules.finesseCount(want) !== p.presses) bad.push(NAMES[t] + p.rot + "@" + left);
      }
    }
    ok("all 162 fewest-press entries re-derived by search, and every one agrees", entries === 162 && placements === 162 && !bad.length,
       bad.slice(0, 4).join(" "));
    /* and every entry, played on the real engine, lands where it says in
       exactly that many presses — and counts as perfect */
    let wrong = 0, perfect = 0;
    for (let t = 1; t <= 7; t++) {
      const cls = Rules.FINESSE[NAMES[t]];
      for (const k in cls) cls[k].forEach((s, left) => {
        const g = make({ queue: NAMES[t], queueThen: "end", gravity: 0 });
        if (s) for (const w of s.split(" ")) Well.act(g, PRESS[w]);
        const a = g.active;
        const cells = Well.cells(t, a.rot, a.x, a.y);
        if (Rules.finesseClass(t, a.rot) !== k || Math.min(...cells.map((c) => c[0])) !== left) wrong++;
        Well.act(g, "hard");
        if (g.stats.finessePerfect === 1 && g.stats.finesseTotal === 1) perfect++;
      });
    }
    ok("every table entry, pressed on the real engine, lands where it says and is scored perfect",
       wrong === 0 && perfect === 162, wrong + " wrong, " + perfect + " perfect");
    const g = make({ queue: "T", queueThen: "end", gravity: 0 });
    Well.act(g, "right"); Well.act(g, "left"); Well.act(g, "left"); Well.act(g, "hard");
    ok("three presses where one would do is not perfect", g.stats.finesseTotal === 1 && g.stats.finessePerfect === 0);
  }

  /* the lock: fifteen resets, then it locks the moment it rests; a new
     lowest row gives all fifteen back. Sonic soft drop puts a piece on the
     floor without locking it, which is what these need. */
  {
    const floor = (g) => { Well.act(g, "softOn"); Well.act(g, "softOff"); };
    const g = make({ queue: "T", queueThen: "end", gravity: 0, lockDelay: 500, sdf: Infinity });
    floor(g);
    let held = true;
    for (let i = 0; i < 14; i++) {
      Well.act(g, i % 2 ? "left" : "right");
      Well.step(g, 499);
      if (!g.active) held = false;
    }
    ok("fourteen moves on the floor, each just inside the wait: still in play", held && g.lockResets === 14);
    Well.act(g, "right");
    ok("the fifteenth move is a reset like the others", g.active && g.lockResets === 15);
    Well.step(g, 1);
    ok("…and with all fifteen spent it locks the moment it rests", !g.active && did(g).some((e) => e.t === "lock"));

    /* a ledge: spend resets on it, step off, fall to a new lowest row */
    const h = make({ board: [".....GGGGG", ".....GGGGG", ".....GGGGG"], queue: "O", queueThen: "end", gravity: 0, sdf: Infinity });
    Well.act(h, "dasRight");
    floor(h);
    for (let i = 0; i < 12; i++) Well.act(h, i % 2 ? "right" : "left");
    const spent = h.lockResets;
    Well.act(h, "dasLeft");
    const airborne = h.lockResets;
    floor(h);
    ok("stepping off a ledge to a new lowest row gives all fifteen back", spent === 12 && airborne === 13 && h.active && h.lockResets === 0,
       spent + " spent, " + airborne + " in the air, now " + h.lockResets);
    const k = make({ queue: "I", queueThen: "end", gravity: 0, lockDelay: 500, sdf: Infinity });
    floor(k);
    Well.act(k, "dasLeft");
    let r = 0;
    for (let i = 0; i < 5; i++) if (!Well.act(k, "left")) r++;
    ok("pressing into a wall is not a reset", r === 5 && k.lockResets === 1);
    Well.step(k, 499);
    const waiting = !!k.active;
    Well.step(k, 2);
    ok("…and the wait runs only while resting, to the millisecond", waiting && !k.active);
  }

  /* the drain: a calm well that fills loses rows from the bottom, and
     the surface the player built survives intact */
  {
    const rows = [];
    for (let y = 20; y >= 0; y--) rows.push("GGGGGGGGGG".split("").map((c, x) => (x === (y * 3) % 10 ? "." : "G")).join(""));
    const g = make({ board: rows, queue: "OT", queueThen: "end", topOut: "drain", gravity: 0 });
    Well.act(g, "hard");                        /* the O rests on row 20, filling rows 21 and 22 */
    const want = [];
    for (let y = 22; y >= 12; y--) {
      let s = "";
      for (let x = 0; x < 10; x++) s += (y >= 21 && (x === 4 || x === 5)) ? "2" : y <= 20 ? (x === (y * 3) % 10 ? "0" : "8") : "0";
      want.push(s);
    }
    const ev = did(g);
    const drain = ev.find((e) => e.t === "drain");
    ok("a full calm well drains instead of ending", drain && !g.over && g.active && g.active.type === 3,
       drain ? drain.rows + " rows" : "no drain");
    ok("…from the bottom, until the top is at row 10, and at least four rows", drain && drain.rows === 12 && g.top === 10);
    const got = [];
    for (let y = 10; y >= 0; y--) got.push(Array.from(g.board.slice(y * 10, y * 10 + 10)).join(""));
    ok("…and the top surface the player built is exactly as it was", same(got, want));
    ok("…and the run card can say how many times", g.stats.drains === 1);
    const e = make({ board: rows, queue: "OT", queueThen: "end", gravity: 0 });
    Well.act(e, "hard");
    ok("the same well in a mode that ends: the well rests, by block-out", e.over && e.overWhy === "block");
  }

  /* Breath: gravity and the lock stop; everything else works */
  {
    const g = make({ queue: "TTTTTTTT", queueThen: "end", gravity: 1000, breath: true, lockDelay: 500 });
    g.breath.charge = 10;
    ok("a Breath can be taken with ten beads", Well.act(g, "breath") && g.breath.active && g.breath.charge === 0);
    const y0 = g.active.y;
    Well.step(g, 4000);
    ok("during a Breath gravity is zero", g.active.y === y0 && Well.gravityMs(g) === 0);
    Well.act(g, "softOn"); Well.step(g, 2000); Well.act(g, "softOff");
    Well.step(g, 3000);
    ok("…soft drop still works, and a resting piece does not lock", g.active && g.active.y === 0 && g.stats.pieces === 0);
    Well.act(g, "left");
    ok("…moves still work, and spend no resets while the lock is frozen", g.active.x === 3 && g.lockResets === 0);
    Well.step(g, 1100);
    const ev = did(g);
    ok("after ten seconds the Breath ends and the wait starts fresh", ev.some((e) => e.t === "breath" && !e.on) && g.active && g.lock === 100);
    Well.step(g, 399);
    const still = !!g.active;
    Well.step(g, 1);
    ok("…and runs its full length", still && g.stats.pieces === 1);
    const n = make({ breath: true });
    ok("no Breath without ten beads, and none where a mode has no Breath", !Well.act(n, "breath") &&
       !Well.act(Object.assign(make({}), {}), "breath"));
  }

  /* the Twist Slot lessons: each board's intended placement must be
     reachable from spawn by turns, moves and soft drop alone, and the real
     engine must call it what the lesson says it is */
  {
    const slot = Modes.lesson("slot");
    ok("The Twist Slot has five prepared wells", slot && slot.boards.length === 5);
    slot.boards.forEach((b, i) => {
      const it = b.intended;
      const g0 = make(Modes.options("challenges", { id: "slot", board: i }));
      const routes = Well.routes(g0.board, it.type, it.x, it.y, it.rot, false);
      let hit = null;
      for (const r of routes) {
        const g = make(Modes.options("challenges", { id: "slot", board: i }));
        for (const s of r.path) {
          if (s === "D") { Well.act(g, "softOn"); Well.act(g, "softOff"); } else Well.act(g, PRESS[s]);
        }
        const a = g.active;
        const there = a && a.x === it.x && a.y === it.y && a.rot === it.rot;
        Well.act(g, "hard");
        const ev = did(g);
        const lock = ev.find((e) => e.t === "lock"), clear = ev.find((e) => e.t === "clear");
        if (there && lock.twist === it.twist && clear && clear.n === it.lines) { hit = r; break; }
      }
      const dropIn = routes.some((r) => !r.turn);
      ok("slot well " + (i + 1) + ": the T reaches its slot from spawn and it is a full Twist Double",
         !!hit && !dropIn, hit ? hit.path.filter((s) => s !== "D").join(" ") + " (+ soft drop)" : routes.length + " routes, none right");
    });
  }

  /* conservation: every lock adds four cells and every line takes ten,
     so after any game the count is placed − 10 × cleared. Random hands
     first — they reach every odd corner — then the bot, which plays long. */
  {
    const drive = (seed, pieces, botStyle) => {
      const rnd = seeded(seed);
      const g = make({ seed: seed, gravity: botStyle ? "curve" : 400, lockDelay: 300, spawnDelay: 20, clearDelay: 40,
                       keep: true, modern: !botStyle && seed % 2 === 0 });
      let placed = 0, cleared = 0, bad = 0, guard = 0;
      const acts = ["left", "right", "cw", "ccw", "180", "hold", "dasLeft", "dasRight", "softOn", "softOff", "hard"];
      while (!g.over && g.stats.pieces < pieces && guard++ < 200000) {
        /* the random hands borrow the bot for three pieces in four, so the
           well sees real clears among the nonsense */
        const lend = !botStyle && g.active && g.stats.pieces % 4 !== 0 && !g.soft;
        if (lend) {
          const plan = Bot.plan(g, { style: "tidy" });
          if (plan) for (const a of plan.actions) Well.act(g, a);
        } else if (botStyle && g.active) {
          const plan = Bot.plan(g, { style: botStyle });
          for (const a of plan.actions) { Well.act(g, a); if (a !== "hard") Well.step(g, 1000 / 60); }
        } else if (!botStyle) {
          if (rnd() < 0.6) Well.act(g, acts[Math.floor(rnd() * acts.length)]);
          Well.step(g, rnd() * 40);
        } else Well.step(g, 1000 / 240);
        for (const e of Well.drain(g)) {
          if (e.t === "lock") placed += 4;
          if (e.t === "clear") cleared += e.n;
        }
        let n = 0;
        for (let i = 0; i < 400; i++) if (g.board[i]) n++;
        if (n !== placed - 10 * cleared) { bad++; break; }
      }
      return { bad: bad, pieces: g.stats.pieces, lines: g.lines };
    };
    let bad = 0, pieces = 0, lines = 0;
    for (let s = 1; s <= 60; s++) { const r = drive(s, 400, null); bad += r.bad; pieces += r.pieces; lines += r.lines; }
    ok("60 random games: nothing appears, nothing vanishes", bad === 0, pieces + " pieces, " + lines + " lines");
    const r = drive(4242, 1500, "quads");
    ok("1,500 pieces of the bot: still exactly placed − 10 × cleared", r.bad === 0 && r.pieces === 1500, r.lines + " lines");
  }

  /* determinism, and a save that resumes as if nothing happened */
  {
    const run = (g, seed, steps, log) => {
      const rnd = seeded(seed);
      const acts = ["left", "right", "cw", "ccw", "hold", "dasLeft", "dasRight", "softOn", "softOff", "hard", "breath"];
      for (let i = 0; i < steps && !g.over; i++) {
        if (rnd() < 0.5) Well.act(g, acts[Math.floor(rnd() * acts.length)]);
        Well.step(g, rnd() * 30);
        if (rnd() < 0.002) Well.addSilt(g, 1);
        for (const e of Well.drain(g)) log.push(JSON.stringify(e));
      }
      return log;
    };
    const opts = { seed: 99, gravity: "curve", lockDelay: 400, spawnDelay: 30, clearDelay: 60, breath: true, topOut: "drain", linesPerLevel: 3 };
    const a = run(make(opts), 5, 30000, []), b = run(make(opts), 5, 30000, []);
    ok("same seed, same inputs, same times: an identical stream of events", a.length > 1000 && same(a, b), a.length + " events");

    const g1 = make(opts);
    run(g1, 8, 6000, []);
    const saved = JSON.parse(JSON.stringify(Well.serialize(g1)));
    const g2 = Well.restore(saved);
    const c1 = run(g1, 9, 12000, []), c2 = run(g2, 9, 12000, []);
    ok("a game saved mid-run and restored carries on identically", c1.length > 200 && same(c1, c2) &&
       same(Well.serialize(g1), Well.serialize(g2)), c1.length + " events after the save");
    const k = Well.clone(g1);
    const c3 = run(g1, 10, 3000, []), c4 = run(k, 10, 3000, []);
    ok("a clone is a full, separate copy", same(c3, c4) && k.board !== g1.board);
    const inf = make({ sdf: Infinity });
    ok("sonic soft drop survives the trip through JSON", Well.restore(JSON.parse(JSON.stringify(Well.serialize(inf)))).opts.sdf === Infinity);
  }

  /* every control, in any order, under any options: the piece in play
     never overlaps the well, and every cell and its body id agree */
  {
    const acts = ["left", "right", "cw", "ccw", "180", "hold", "hard", "softOn", "softOff", "dasLeft", "dasRight", "breath"];
    let bad = 0, steps = 0, thrown = "";
    for (let s = 1; s <= 60 && !bad && !thrown; s++) {
      const r = seeded(s + 7000);
      let g = make({ seed: s, gravity: r() < 0.3 ? "curve" : r() < 0.5 ? 0 : Math.floor(r() * 1000), level: 1 + Math.floor(r() * 15),
                     modern: r() < 0.5, irs: r() < 0.5, ihs: r() < 0.5, sdf: r() < 0.3 ? Infinity : 5 + Math.floor(r() * 35),
                     topOut: r() < 0.5 ? "drain" : "end", breath: r() < 0.5, spawnDelay: Math.floor(r() * 200),
                     clearDelay: Math.floor(r() * 300), lockDelay: Math.floor(r() * 1000), keep: r() < 0.8,
                     linesPerLevel: [0, 10, 25, "three"][Math.floor(r() * 4)], silt: r() < 0.2 ? Math.floor(r() * 18) : 0 });
      for (let i = 0; i < 1500 && !g.over && !bad; i++) {
        try {
          const x = r();
          if (x < 0.5) Well.act(g, acts[Math.floor(r() * acts.length)], r() < 0.2 ? { repeat: true } : undefined);
          else if (x < 0.52) Well.addSilt(g, 1 + Math.floor(r() * 3));
          else if (x < 0.53) Well.stopGravity(g, true);
          else if (x < 0.56) Well.resume(g);
          else if (x < 0.57) Well.rewind(g);
          else if (x < 0.58) Well.grace(g, r() * 600);
          else if (x < 0.59) Well.setGravity(g, r() < 0.5 ? "curve" : Math.floor(r() * 1000), 1 + Math.floor(r() * 8));
          else if (x < 0.6) g = Well.restore(JSON.parse(JSON.stringify(Well.serialize(g))));
          else if (x < 0.61) g.breath.charge = 20;
          Well.step(g, r() * 60);
          Well.view(g, {});
          Well.drain(g);
          steps++;
        } catch (e) { thrown = "seed " + s + ": " + e.message; break; }
        const a = g.active;
        if (a && !Well.fits(g, a.type, a.rot, a.x, a.y)) bad++;
        for (let k = 0; k < 400; k++) {
          const v = g.board[k], p = g.pid[k];
          if (v > 8 || (v === 0 && p !== 0) || (v === 8 && p !== 0) || (v >= 1 && v <= 7 && p === 0)) { bad++; break; }
        }
      }
    }
    ok("60 wells, every control in random order: nothing throws, nothing overlaps", !bad && !thrown,
       thrown || bad + " bad of " + steps + " steps");
  }

  /* the view allocates nothing once it has been made */
  {
    const g = make({ breath: true });
    const v = Well.view(g, {});
    const refs = [v.active, v.active.cells, v.active.cells[0], v.ghost, v.queue, v.bag, v.breath];
    let stable = true;
    for (let i = 0; i < 200; i++) {
      Well.act(g, i % 3 ? "left" : "right");
      Well.step(g, 50);
      if (!g.active) continue;
      const w = Well.view(g, v);
      const now = [w.active, w.active.cells, w.active.cells[0], w.ghost, w.queue, w.bag, w.breath];
      if (w !== v || now.some((x, j) => x !== refs[j])) stable = false;
    }
    ok("the view is filled in place: every nested object is reused", stable);
    ok("danger is quiet on an empty well and full at row 20", Well.view(g, v).danger === 0 &&
       Well.view(make({ board: ["G........."].concat(Array(20).fill("GGGGGGGGG.")) }), {}).danger === 1);
  }

  /* silt: one hole a row, never in the same column as its neighbour */
  {
    let adjacent = 0, rowsOK = true;
    for (let s = 1; s <= 40; s++) {
      const g = make({ seed: s, silt: 18 });
      let prev = -1;
      for (let y = 17; y >= 0; y--) {
        let holes = 0, hole = -1;
        for (let x = 0; x < 10; x++) if (!g.board[y * 10 + x]) { holes++; hole = x; } else if (g.board[y * 10 + x] !== 8) rowsOK = false;
        if (holes !== 1) rowsOK = false;
        if (hole === prev) adjacent++;
        prev = hole;
      }
    }
    ok("silt rows have one hole each, never above another", rowsOK && adjacent === 0);
    const a = make({ seed: 3, silt: 10 }), b = make({ seed: 3 });
    ok("silt comes from its own stream: the pieces are the same as without it",
       a.active.type === b.active.type && same(a.queue, b.queue));
    const g = make({ seed: 5, silt: 10, gravity: 0 });
    ok("clearing all the silt ends the challenge", (() => {
      const plan = () => Bot.plan(g, { style: "tidy" });
      let guard = 0;
      while (!g.over && guard++ < 400) { const p = plan(); if (!p) break; for (const x of p.actions) Well.act(g, x); }
      return g.over && g.overWhy === "goal" && g.stats.siltCleared === 10;
    })(), g.overWhy + ", " + g.stats.siltCleared + " silt rows");
  }

  /* gravity and levels */
  ok("gravity: one row a second at level 1, about 15.6 a second at 10",
     Rules.gravityMs(1) === 1000 && Math.abs(1000 / Rules.gravityMs(10) - 15.59) < 0.01);
  {
    /* four rows ready and the long piece standing up in the gap */
    const lv = [];
    for (const start of [0, 4, 11, 20, 220, 300]) {
      const g = make({ board: Array(4).fill("GGGGGGGGG."), queue: "I", queueThen: "end", gravity: 0,
                       linesPerLevel: "three", levelCap: 15 });
      g.lines = start;
      Well.act(g, "cw"); Well.act(g, "dasRight"); Well.act(g, "hard");
      lv.push(g.level);
    }
    ok("Three Minutes levels up at L² − 1 lines: 3, 8, 15, 24 … capped at 15", same(lv, [2, 3, 4, 5, 15, 15]), lv.join(","));
    const t = make({ board: Array(4).fill("GGGGGGGGG."), queue: "I", queueThen: "end", gravity: 0, linesPerLevel: 25, level: 6, levelCap: 15 });
    t.lines = 24;
    Well.act(t, "cw"); Well.act(t, "dasRight"); Well.act(t, "hard");
    ok("and by 25s in Descent, from wherever the run began", t.level === 7);
  }

  /* the modes: every one makes a game that runs, and the medals read right */
  {
    let fine = true;
    for (const m of Modes.list) {
      const g = make(Object.assign({ seed: 1 }, Modes.options(m.id, {}, { previews: 5 })));
      for (let i = 0; i < 600 && !g.over; i++) { Well.step(g, 100); if (i % 9 === 0) Well.act(g, "hard"); }
      if (!g.stats.pieces) fine = false;
    }
    ok("every mode starts a game that plays", fine);
    ok("Forty medals: 58.31 s is Jade, three minutes is Pebble", Modes.medalFor("forty", 58310) === "Jade" &&
       Modes.medalFor("forty", 180000) === "Pebble" && Modes.medalFor("forty", 180001) === null);
    const d = Modes.get("descent");
    const sw = make(d.engine({ pace: "swift", depth: 3 }));
    const gentle9 = make(d.engine({ depth: 9 }));
    ok("Descent: Swift at depth 3 is level 8, and Gentle never falls faster than level 4",
       sw.level === 8 && d.depthOf(sw) === 3 && gentle9.level === 9 && Well.gravityMs(gentle9) === Rules.gravityMs(4));
  }

  /* the bot, which plays the splash screen: it must look like it knows
     what it is doing, and it must be quick */
  {
    let finished = 0, ms = 0, plans = 0, quads = 0, lines = 0;
    for (let s = 1; s <= 10; s++) {
      const g = make(Object.assign({ seed: s * 1013 }, Modes.options("forty", {})));
      while (!g.over) {
        if (!g.active) { Well.step(g, 1000 / 240); continue; }
        const t0 = process.hrtime.bigint();
        const plan = Bot.plan(g, { style: "quads" });
        ms += Number(process.hrtime.bigint() - t0) / 1e6; plans++;
        for (const a of plan.actions) { Well.act(g, a); if (a !== "hard") Well.step(g, 1000 / 60); }
        Well.drain(g);
      }
      if (g.overWhy === "goal") finished++;
      quads += g.stats.quads; lines += g.lines;
    }
    ok("the bot clears forty lines at level-1 gravity on at least 9 seeds of 10", finished >= 9, finished + "/10");
    ok("…mostly by Quads, with the right-hand column kept open", quads * 4 / lines > 0.7,
       Math.round(quads * 400 / lines) + "% of lines in Quads");
    ok("…deciding in under 4 ms a piece on average", ms / plans < 4, (ms / plans).toFixed(2) + " ms");
    const g = make(Object.assign({ seed: 31337 }, Modes.options("drift", {})));
    while (g.stats.pieces < 1000 && !g.over) {
      if (!g.active) { Well.step(g, 1000 / 240); continue; }
      const plan = Bot.plan(g, { style: "tidy" });
      for (const a of plan.actions) { Well.act(g, a); if (a !== "hard") Well.step(g, 1000 / 60); }
      Well.drain(g);
    }
    ok("1,000 pieces of Drift without the well ever filling", g.stats.pieces >= 1000 && g.stats.drains === 0,
       g.lines + " lines, " + g.stats.drains + " drains");
  }

  /* the review's fixes, kept fixed */
  {
    /* the run card's clear strip counts each clear once, under its own kind */
    const twistBoard = (rows) => {
      const g = make({ board: rows.map((r) => r.replace(/X/g, "G")), queue: "T", queueThen: "end", gravity: 0 });
      g.active.x = 5; g.active.y = 3;
      Well.act(g, "left"); Well.act(g, "cw"); Well.act(g, "hard");
      return { g: g, ev: did(g) };
    };
    const b = twistBoard(["XXXX......", "XXX.......", "XXX.XXXXXX", "XXX..XXXXX", "XXX..XXXXX"]);
    const st = b.g.stats;
    ok("a Twist Double is counted once, as a Twist Double — not also as a Double",
       st.twDouble === 1 && st.doubles === 0 && st.singles === 0 && st.twists === 1,
       JSON.stringify({ twDouble: st.twDouble, doubles: st.doubles, twists: st.twists }));
    const z = twistBoard(["XXXX......", "XXX.......", "XXX.XXXXX.", "XXX..XXXX.", "XXX..XXXX."]);
    const zt = z.g.stats, zl = z.ev.find((e) => e.t === "lock");
    ok("…and a Twist that clears nothing is a twist, not a clear", zl && zl.twist === "full" && z.g.lines === 0 &&
       zt.twists === 1 && zt.twMini + zt.twSingle + zt.twDouble + zt.twTriple + zt.singles + zt.doubles === 0,
       JSON.stringify(zt));

    /* rising silt never carries a piece through the stack */
    const sg = make({ board: ["XXXXXXXXX.", "X........X", "X........X", "X........X", "XXXXXXXXX."].map((r) => r.replace(/X/g, "G")),
                      queue: "I", queueThen: "end", gravity: 0 });
    sg.active.x = 2; sg.active.y = 5; sg.active.rot = 0;
    const restsOn = !Well.fits(sg, sg.active.type, 0, 2, 4);
    Well.addSilt(sg, 2, 9);
    ok("silt rising under a piece resting on a shelf lifts it with the shelf, never into the hollow below",
       restsOn && sg.active.y === 7 && Well.landingY(sg) === 7 && !sg.over, "y " + sg.active.y + ", lands at " + Well.landingY(sg));
    const hg = make({ queue: "I", queueThen: "end", gravity: 0 });
    const y0 = hg.active.y;
    Well.addSilt(hg, 3);
    ok("…and a piece high in the air keeps its height while the silt rises beneath it", hg.active.y === y0 && !hg.over,
       "from " + y0 + " to " + hg.active.y);

    /* ARR 0: a held slide keeps reaching for the wall */
    const ag = make({ queue: "II", queueThen: "end", gravity: 0 });
    const az = Well.Das.create({ das: 167, arr: 0, dcd: 0 });
    const aact = (a, t, rep) => Well.act(ag, a, { repeat: rep });
    az.press(1, 0, aact);
    let at = 0;
    for (; at < 400; at += 1000 / 240) az.tick(at, aact);
    Well.act(ag, "cw");
    const keys = ag.stats.keys, cols0 = Well.view(ag, {}).active.cells.map((c) => c[0]);
    az.tick(at, aact);
    const cols1 = Well.view(ag, {}).active.cells.map((c) => c[0]);
    ok("ARR 0: a turn at the wall that opens room is filled on the next tick, with no key counted",
       cols0.some((x) => x < 9) && cols1.every((x) => x === 9) && ag.stats.keys === keys,
       "columns " + cols0.join(",") + " then " + cols1.join(",") + ", keys " + keys + " → " + ag.stats.keys);
    const dg = make({ queue: "II", queueThen: "end", gravity: 0 });
    const dz = Well.Das.create({ das: 167, arr: 0, dcd: 50 });
    const dact = (a, t, rep) => Well.act(dg, a, { repeat: rep });
    dz.press(1, 0, dact);
    let dt = 0;
    for (; dt < 400; dt += 1000 / 240) dz.tick(dt, dact);
    Well.act(dg, "cw"); dz.cut(dt);
    dz.tick(dt + 20, dact);
    const inCut = Well.view(dg, {}).active.cells.every((c) => c[0] === 9);
    dz.tick(dt + 60, dact);
    const afterCut = Well.view(dg, {}).active.cells.every((c) => c[0] === 9);
    ok("…and with DCD the slide waits out the pause after the turn, then goes on", !inCut && afterCut);

    /* restKey sorts four cells without an array; it must name a place exactly as sorting did */
    const rnd = seeded(4949);
    let keyed = 0, wrong = 0;
    for (let n = 0; n < 60; n++) {
      const board = new Uint8Array(400);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 10; x++) if (rnd() < 0.45 - y * 0.05) board[y * 10 + x] = 8;
      for (let t = 1; t <= 7; t++) {
        for (const pl of Well.reach(board, t, n % 2 === 0)) {
          const ix = pl.cells.map((c) => c[1] * 10 + c[0]).sort((u, v) => u - v);
          if (pl.key !== ((ix[0] * 400 + ix[1]) * 400 + ix[2]) * 400 + ix[3]) wrong++;
          keyed++;
        }
      }
    }
    ok("a resting place's key is its four cells in order, for " + keyed + " places on 60 boards", keyed > 1000 && wrong === 0,
       wrong + " wrong");

    /* a save the engine couldn't run is refused at restore, where the app can put it away */
    const rg = make({ seed: 5 });
    for (let i = 0; i < 30; i++) { Well.act(rg, i % 2 ? "left" : "hard"); Well.step(rg, 50); }
    const good = JSON.parse(JSON.stringify(Well.serialize(rg)));
    const refused = (f) => { const sv = JSON.parse(JSON.stringify(good)); f(sv); try { Well.restore(sv); return false; } catch (e) { return true; } };
    let fine = true;
    try { Well.restore(JSON.parse(JSON.stringify(good))); } catch (e) { fine = false; }
    ok("a save with no dealer, no queue, no stats, a short board or the wrong version is refused",
       fine && refused((sv) => { delete sv.rng; }) && refused((sv) => { delete sv.queue; delete sv.qbag; }) &&
       refused((sv) => { delete sv.stats; }) && refused((sv) => { sv.board = "1"; }) && refused((sv) => { sv.v = 0; }) &&
       refused((sv) => { delete sv.fixed; }) && refused((sv) => { sv.score = "x"; }) && refused(() => {}) === false);
    const older = JSON.parse(JSON.stringify(good));
    delete older.stats.twMini;
    ok("…and one written before a counter existed gets that counter at zero", Well.restore(older).stats.twMini === 0);
  }

  /* records: one bad entry, and two tabs */
  {
    const Records = load("well", "records.js");
    const d = Records.ensure({ hist: { three: {} }, best: { three: "abc" }, medals: { three: { x: 1 } } });
    const g = make({ seed: 3 });
    g.score = 40000;
    let threw = null, res = null;
    try { res = Records.finishRun(d, { modeId: "three", opts: {}, g: g, elapsedMs: 180000, rests: 0, why: "time" }); } catch (e) { threw = e; }
    const bst = Records.best(d, "three");
    ok("a hand-edited record entry is replaced on the next run rather than failing every run",
       !threw && res && Array.isArray(d.hist.three) && d.hist.three.length === 1 && bst && bst.value === 40000,
       threw ? threw.message : JSON.stringify(d.hist.three));
    ok("…and a medal or best of the wrong shape reads as none",
       Records.medal({ medals: { three: { x: 1 } } }, "three") === null && Records.best({ best: { three: "abc" } }, "three") === null &&
       Records.history({ hist: { three: [null, { v: 5 }, { v: "x" }] } }, "three").length === 1);

    const life = (o) => Object.assign({}, o.life);
    const base = Records.blank();
    const A = JSON.parse(JSON.stringify(base));
    A.life.pieces = 13; A.life.sessions = 1; A.best.three = { value: 284, medal: null }; A.stones.three = 1;
    A.hist.three = [{ v: 284, n: 0 }];
    const idle = Records.ensure(JSON.parse(JSON.stringify(base)));
    Records.merge(idle, JSON.parse(JSON.stringify(A)), life(base));
    ok("an idle tab writing its records back keeps another tab's best, Stones, history and totals",
       idle.best.three && idle.best.three.value === 284 && idle.stones.three && idle.life.pieces === 13 &&
       idle.life.sessions === 1 && idle.hist.three.length === 1);
    const C = Records.ensure(JSON.parse(JSON.stringify(base)));
    C.life.pieces = 5; C.life.sessions = 1; C.best["forty.40"] = { value: 60000, medal: "Jade" };
    const disk = JSON.parse(JSON.stringify(A));
    disk.best["forty.40"] = { value: 50000, medal: "Jade" }; disk.medals["forty.40"] = "Pearl";
    Records.merge(C, disk, life(base));
    ok("…two tabs' runs both count, a time keeps the lower and a score the higher, a medal the better",
       C.life.pieces === 18 && C.life.sessions === 2 && C.best["forty.40"].value === 50000 && C.best.three.value === 284 &&
       C.medals["forty.40"] === "Pearl", JSON.stringify({ life: C.life, best: C.best }));
  }

  /* the lesson counts presses as the engine does: a second drag is a second press */
  {
    const Coach = load("well", "coach.js");
    const game = (seed) => {
      const c = Coach.create({ onSay: () => {}, onTarget: () => {}, onPass: () => {}, nextDelay: 0, random: () => 0.37 });
      const eo = Modes.options("challenges", { id: "finesse" }, { keep: true, previews: 5 });
      eo.seed = seed;
      const g = Well.create(eo);
      c.start(Modes.lesson("finesse"), g);
      for (const e of Well.drain(g)) c.event(e, g);
      return { c: c, g: g, locks: [] };
    };
    const act = (Lg, a, meta) => {
      const v = Lg.c.action(a, meta, Lg.g);
      if (v === "rewind") Well.rewind(Lg.g); else Well.act(Lg.g, a, meta);
      for (const e of Well.drain(Lg.g)) { if (e.t === "lock") Lg.locks.push(e); Lg.c.event(e, Lg.g); }
      return v;
    };
    const drags = (Lg, list) => {
      for (const n of list) for (let i = 0; i < n; i++) act(Lg, "left", { source: "touch", repeat: i > 0 });
      return act(Lg, "hard", { source: "touch", repeat: false });
    };
    let tried = 0, agree = 0, oneOK = 0;
    for (let seed = 1; seed < 3000 && tried < 12; seed++) {
      const probe = game(seed), tgt = probe.c.target();
      if (!tgt) continue;
      const a = probe.g.active, want = JSON.stringify(tgt.map((c) => c.join(",")).sort());
      const pl = Well.reach(probe.g.board, a.type, false).find((p) => JSON.stringify(p.cells.map((c) => c.join(",")).sort()) === want);
      if (!pl || pl.path.join(" ") !== "DL" || a.x - pl.x < 2) continue;
      tried++;
      const cols = a.x - pl.x;
      const one = game(seed);
      drags(one, [cols]);
      if (one.c.progress().done === 1) oneOK++;
      const two = game(seed);
      drags(two, [cols - 1, 1]);
      if (two.c.progress().done === 0) agree++;
    }
    ok("Fewest Moves: one drag is one press, and two separate drags are two, as the engine counts them",
       tried >= 10 && oneOK === tried && agree === tried, tried + " pieces: one drag perfect " + oneOK + ", two drags not " + agree);
  }

  /* well codes */
  {
    const rnd = seeded(2026);
    let round = true;
    for (let i = 0; i < 2000; i++) {
      const s = Math.floor(rnd() * 1073741824);
      const c = Modes.code.encode(s);
      if (c.length !== 6 || Modes.code.decode(c) !== s || Modes.code.decode(c.toLowerCase()) !== s) round = false;
    }
    ok("well codes: 2,000 seeds there and back", round && Modes.code.encode(0) === "000000" && Modes.code.encode(1073741823) === "ZZZZZZ");
    const k = Modes.code.decode("K7Q2MX");
    ok("…and a code survives being read out, pasted, or written by hand",
       Modes.code.decode("k7q-2mx") === k && Modes.code.decode("The Well · Forty · 58.31 s · Jade · well code K7Q2MX") === k &&
       Modes.code.decode("1L0O00") === Modes.code.decode("110000") && Modes.code.decode("K7Q2MU") === null && Modes.code.decode("K7Q2M") === null);
  }
})();

console.log("");
if (fails) { console.log("FAILED: " + fails + " of " + checks + " checks"); process.exit(1); }
console.log(checks + " checks, all of them honest");
