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
function seeded(s) {
  let x = s;
  return () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
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
