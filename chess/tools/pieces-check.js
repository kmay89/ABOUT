/* pieces-check.js — the carving shop, inspected.

   Geometry fails quietly: a piece with its faces inside out still draws,
   it just looks like a hole; a mesh that overruns a Uint16 index buffer
   only breaks on the machines you don't own. So every set is built here
   at both the phone and the laptop quality, and then asked awkward
   questions — is it closed and facing outwards, is every number finite,
   is it small enough to index, does it stand on the board rather than
   through it, does a knight actually point somewhere.

   The last block treats the injection doors as hostile: junk JSON, junk
   OBJ, silly numbers, markup in the name. Anything that arrives from
   outside must come back safe or come back null, never crash.

   Run: node chess/tools/pieces-check.js */
"use strict";

const P = require("../pieces3d.js");

let failed = 0;
const ok = (label, cond, extra) => {
  if (!cond) { failed++; console.log("FAIL  " + label + (extra ? "  → " + extra : "")); }
  else console.log("ok    " + label);
};

const NAMES = { 1: "pawn", 2: "knight", 3: "bishop", 4: "rook", 5: "queen", 6: "king" };
const QUALITIES = [
  { label: "phone ", opts: { segs: 22, sub: 2 } },
  { label: "laptop", opts: { segs: 40, sub: 3 } }
];

function volume(pos, idx) {
  let v = 0;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    v += pos[a] * (pos[b + 1] * pos[c + 2] - pos[b + 2] * pos[c + 1])
       - pos[a + 1] * (pos[b] * pos[c + 2] - pos[b + 2] * pos[c])
       + pos[a + 2] * (pos[b] * pos[c + 1] - pos[b + 1] * pos[c]);
  }
  return v / 6;
}
/* Signed volume only says the mesh is *mostly* the right way round: a
   single inverted cap is a rounding error against a whole piece, and it
   looks like a hole you can see the inside of the head through. This is
   the strict version — weld by position (creased rings and flat-shaded
   parts split vertices that are really the same point), then insist that
   every directed edge is used exactly once, which is true of any set of
   closed, consistently-wound solids and false the moment one face is
   backwards. Returns the number of edges that break the rule. */
function orientationFaults(pos, idx) {
  const key = new Map(), id = new Int32Array(pos.length / 3);
  for (let v = 0; v < pos.length / 3; v++) {
    const k = Math.round(pos[v * 3] * 1e5) + "," + Math.round(pos[v * 3 + 1] * 1e5) +
              "," + Math.round(pos[v * 3 + 2] * 1e5);
    if (!key.has(k)) key.set(k, key.size);
    id[v] = key.get(k);
  }
  const dir = new Map();
  for (let i = 0; i < idx.length; i += 3) {
    const t = [id[idx[i]], id[idx[i + 1]], id[idx[i + 2]]];
    if (t[0] === t[1] || t[1] === t[2] || t[2] === t[0]) continue;   /* degenerate */
    for (let e = 0; e < 3; e++) {
      const k = t[e] + ">" + t[(e + 1) % 3];
      dir.set(k, (dir.get(k) || 0) + 1);
    }
  }
  let faults = 0;
  for (const [k, n] of dir) {
    const [a, b] = k.split(">");
    if (n !== 1 || (dir.get(b + ">" + a) || 0) !== 1) faults++;
  }
  return faults;
}
function bounds(pos) {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (let i = 0; i < pos.length; i += 3) {
    b.x0 = Math.min(b.x0, pos[i]); b.x1 = Math.max(b.x1, pos[i]);
    b.y0 = Math.min(b.y0, pos[i + 1]); b.y1 = Math.max(b.y1, pos[i + 1]);
    b.z0 = Math.min(b.z0, pos[i + 2]); b.z1 = Math.max(b.z1, pos[i + 2]);
  }
  return b;
}

/* ---- every shipped set, at every quality ---- */
const shelf = P.list();
ok("the shelf has more than one set", shelf.length >= 3, shelf.map((s) => s.id).join(", "));
ok("every set says who made it and under what licence",
   shelf.every((s) => s.name && s.maker && s.note && s.license));
ok("the default set is on the shelf", shelf.some((s) => s.id === P.DEFAULT_ID));

for (const set of shelf) {
  for (const q of QUALITIES) {
    let built;
    try { built = P.build(set.id, q.opts); }
    catch (e) { ok(`${set.id}/${q.label} builds`, false, e.message); continue; }

    const bad = [];
    let totalTris = 0;
    for (let k = 1; k <= 6; k++) {
      const m = built.pieces[k], nm = NAMES[k];
      if (!m) { bad.push(nm + " missing"); continue; }
      totalTris += m.tris;

      /* every number real */
      for (let i = 0; i < m.pos.length; i++) if (!isFinite(m.pos[i])) { bad.push(nm + ".pos NaN"); break; }
      for (let i = 0; i < m.nrm.length; i++) if (!isFinite(m.nrm[i])) { bad.push(nm + ".nrm NaN"); break; }

      /* indices inside the vertex array, and inside a Uint16 */
      if (m.big) bad.push(nm + " needs 32-bit indices");
      let worst = -1;
      for (let i = 0; i < m.idx.length; i++) if (m.idx[i] > worst) worst = m.idx[i];
      if (worst >= m.verts) bad.push(nm + " index " + worst + " ≥ " + m.verts);
      if (m.idx.length % 3) bad.push(nm + " index count not a multiple of 3");

      /* normals are unit length (a zero normal means a dead triangle fan) */
      let shortest = 2;
      for (let i = 0; i < m.nrm.length; i += 3) {
        const l = Math.hypot(m.nrm[i], m.nrm[i + 1], m.nrm[i + 2]);
        if (l < shortest) shortest = l;
      }
      if (shortest < 0.9) bad.push(nm + " has a normal of length " + shortest.toFixed(3));

      /* baked shading stays in range, and actually does something */
      let minS = 2, maxS = -1;
      for (let i = 0; i < m.shade.length; i++) { minS = Math.min(minS, m.shade[i]); maxS = Math.max(maxS, m.shade[i]); }
      if (!(minS >= 0.03 && maxS <= 1.001)) bad.push(nm + " shade out of range " + minS.toFixed(3) + "…" + maxS.toFixed(3));
      if (maxS - minS < 0.05) bad.push(nm + " baked shading is flat");

      /* facing outwards: a closed solid built the right way round has a
         positive signed volume */
      const vol = volume(m.pos, m.idx);
      if (!(vol > 1e-5)) bad.push(nm + " is inside out or open (volume " + vol.toFixed(5) + ")");
      const faults = orientationFaults(m.pos, m.idx);
      if (faults) bad.push(nm + " has " + faults + " edge(s) with a face wound the wrong way");

      /* it stands on the board, not through it, and fits its square */
      const b = bounds(m.pos);
      if (b.y0 < -1e-4) bad.push(nm + " sinks below the board (" + b.y0.toFixed(4) + ")");
      if (!(m.height > 0.3 && m.height < 1.6)) bad.push(nm + " height " + m.height.toFixed(3));
      const wide = Math.max(b.x1 - b.x0, b.z1 - b.z0);
      if (wide > 0.98) bad.push(nm + " is wider than its square (" + wide.toFixed(3) + ")");
      if (!(m.radius > 0.1 && m.radius < 0.46)) bad.push(nm + " foot radius " + m.radius.toFixed(3));
    }
    ok(`${set.id.padEnd(9)}/${q.label} builds clean (${totalTris} tris)`, bad.length === 0, bad.join("; "));
  }
}

/* ---- the men are told apart by their shapes, not their labels ---- */
{
  const built = P.build("staunton", { segs: 40, sub: 3 });
  const h = {};
  for (let k = 1; k <= 6; k++) h[NAMES[k]] = built.pieces[k].height;
  ok("the Staunton family climbs pawn → rook → knight → bishop → queen → king",
     h.pawn < h.rook && h.rook < h.knight && h.knight < h.bishop && h.bishop < h.queen && h.queen < h.king,
     JSON.stringify(h));

  /* a knight has to point somewhere: its mass is off-centre forward */
  const kn = built.pieces[2];
  let sum = 0, n = 0;
  for (let i = 0; i < kn.pos.length; i += 3) if (kn.pos[i + 1] > 0.5) { sum += kn.pos[i]; n++; }
  ok("the knight leans forward above the pedestal", n > 0 && sum / n > 0.05,
     "mean x = " + (sum / n).toFixed(3));

  /* and it is narrower than it is deep, like a carved head */
  const b = bounds(kn.pos);
  ok("the knight's head is flatter than it is long", (b.z1 - b.z0) < (b.x1 - b.x0),
     `width ${(b.z1 - b.z0).toFixed(3)} vs length ${(b.x1 - b.x0).toFixed(3)}`);

  /* the rook really is cut through: at merlon height the mesh is a ring
     of separate blocks, so some angles have no geometry at all */
  const rk = built.pieces[4];
  const top = rk.height, occupied = new Set();
  for (let i = 0; i < rk.pos.length; i += 3) {
    if (rk.pos[i + 1] > top - 0.02) {
      occupied.add(Math.round((Math.atan2(rk.pos[i + 2], rk.pos[i]) + Math.PI) / (Math.PI / 18)));
    }
  }
  ok("the rook's battlements have gaps between them", occupied.size > 4 && occupied.size < 34,
     occupied.size + "/36 sectors at the parapet");

  /* the bishop's mitre is genuinely slit, not painted: at one angle the
     radius dips well inside the ring */
  const bs = built.pieces[3];
  let inMitre = 0, minR = 9, maxR = 0;
  for (let i = 0; i < bs.pos.length; i += 3) {
    const y = bs.pos[i + 1];
    if (y > bs.height * 0.66 && y < bs.height * 0.70) {
      const r = Math.hypot(bs.pos[i], bs.pos[i + 2]);
      minR = Math.min(minR, r); maxR = Math.max(maxR, r); inMitre++;
    }
  }
  ok("the bishop's mitre is cut, not painted", inMitre > 0 && minR < maxR * 0.75,
     `radius ${minR.toFixed(3)}…${maxR.toFixed(3)}`);
}

/* ---- the same set is the same shape at both qualities ---- */
{
  const a = P.build("staunton", { segs: 22, sub: 2 });
  const b = P.build("staunton", { segs: 40, sub: 3 });
  let worst = 0;
  for (let k = 1; k <= 6; k++) worst = Math.max(worst, Math.abs(a.pieces[k].height - b.pieces[k].height));
  ok("a phone and a laptop draw the same proportions", worst < 0.02, "worst height drift " + worst.toFixed(4));
  ok("the phone build is the lighter one", a.tris < b.tris, `${a.tris} vs ${b.tris}`);
  ok("even the laptop build stays affordable (< 9k tris a piece)",
     Math.max(...[1, 2, 3, 4, 5, 6].map((k) => b.pieces[k].tris)) < 9000,
     "heaviest " + Math.max(...[1, 2, 3, 4, 5, 6].map((k) => b.pieces[k].tris)));
}

/* ---- an unknown set falls back rather than throwing ---- */
ok("an unknown set id falls back to the default", P.build("no-such-set").id === P.DEFAULT_ID);
ok("has() is honest about what's on the shelf", P.has("staunton") && !P.has("no-such-set"));

/* ===== the injection doors, treated as hostile ===== */

/* a well-formed JSON set */
{
  const parts = (r, h) => [
    { type: "lathe", profile: [[0, 0], [r, 0, "c"], [r * 0.5, h * 0.6], [r * 0.3, h * 0.85], [0, h]] },
    { type: "sphere", r: r * 0.4, at: [0, h, 0] }
  ];
  const set = P.register({
    id: "Test Set!!", name: "Paper <b>Cutouts</b>", maker: "A stranger", note: "for the check",
    license: "CC0",
    pieces: {
      p: { height: 0.6, parts: parts(0.22, 0.45) }, n: { height: 0.9, parts: parts(0.26, 0.7) },
      b: { height: 1.0, parts: parts(0.26, 0.8) }, r: { height: 0.8, parts: parts(0.26, 0.6) },
      q: { height: 1.1, parts: parts(0.3, 0.9) }, k: { height: 1.25, parts: parts(0.31, 1.0) }
    }
  });
  ok("a plain-JSON set registers", !!set);
  ok("its id is slugged", set && set.id === "test-set", set && set.id);
  ok("markup can't ride in on the name", set && set.name.indexOf("<") < 0, set && set.name);
  const built = P.build("test-set", { segs: 20, sub: 2 });
  ok("a JSON set builds all six men", [1, 2, 3, 4, 5, 6].every((k) => built.pieces[k].tris > 0));
  ok("a JSON set is scaled to the heights it asked for",
     Math.abs(built.pieces[6].height - 1.25) < 0.01, built.pieces[6].height.toFixed(3));
  ok("a JSON set is still built facing outwards",
     [1, 2, 3, 4, 5, 6].every((k) => volume(built.pieces[k].pos, built.pieces[k].idx) > 1e-5));
}

/* junk in, null out */
{
  const junk = [
    null, undefined, 42, "SETS", [], {},
    { id: "x", pieces: {} },
    { id: "x", pieces: { p: { parts: [] } } },
    { id: "x", pieces: { p: { parts: [{ type: "evil", cmd: "rm -rf" }] } } },
    { id: "x", pieces: { p: { parts: [{ type: "lathe", profile: "nope" }] } } }
  ];
  ok("junk set definitions all come back null",
     junk.every((j) => P.register(j) === null),
     junk.map((j, i) => (P.register(j) === null ? "" : i)).filter(Boolean).join(","));

  /* silly numbers get clamped rather than believed */
  const wild = (h) => ({
    height: h, parts: [{ type: "lathe", segs: 1e9, profile: [[0, 0], [1e6, 0], [0, 1e6]] },
                       { type: "cone", r: -5, h: NaN, at: [1e9, 1e9, 1e9] }]
  });
  const set = P.register({
    id: "wild", name: "Wild", maker: "x", license: "?",
    pieces: { p: wild(1e9), n: wild(-4), b: wild("2"), r: wild(0.8), q: wild(null), k: wild(1.3) }
  });
  ok("a set full of silly numbers still registers", !!set);
  const built = set && P.build("wild", { segs: 16, sub: 2 });
  ok("…and every piece comes out finite and on the board",
     !!built && [1, 2, 3, 4, 5, 6].every((k) => {
       const m = built.pieces[k];
       for (let i = 0; i < m.pos.length; i++) if (!isFinite(m.pos[i])) return false;
       return m.height > 0.15 && m.height < 2.5 && bounds(m.pos).y0 > -1e-4;
     }));
}

/* the OBJ door */
{
  /* a unit cube, written the way an exporter would */
  const CUBE = `# a cube
v -1 -1 -1
v  1 -1 -1
v  1 -1  1
v -1 -1  1
v -1  1 -1
v  1  1 -1
v  1  1  1
v -1  1  1
vn 0 1 0
f 1//1 2//1 3//1 4//1
f 5 8 7 6
f 2 1 5 6
f 4 3 7 8
f 3 2 6 7
f 1 4 8 5
`;
  const m = P.fromOBJ(CUBE, { height: 1.0, radius: 0.34 });
  ok("an OBJ cube parses", !!m && m.tris === 12, m && m.tris);
  ok("…is stood on the board and scaled to the height asked for",
     !!m && Math.abs(m.height - 0.68) < 0.02 && bounds(m.pos).y0 > -1e-4,
     m && m.height.toFixed(3));   /* 0.68 = clamped to twice the foot radius */
  ok("…and is turned right side out", !!m && volume(m.pos, m.idx) > 1e-5);

  const objs = {};
  for (const L of ["p", "n", "b", "r", "q", "k"]) objs[L] = CUBE;
  const set = P.registerOBJ({ id: "cubes", name: "Cubes", maker: "the check", license: "CC0" }, objs);
  ok("an OBJ set registers and builds", !!set && P.build("cubes").pieces[6].tris === 12);

  const nasty = ["", "not an obj", "v a b c\nf 1 2 3", "f 1 2 3", "v 0 0 0\nf 1 2 999",
                 "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 0", null, 12];
  ok("malformed OBJ text comes back null",
     nasty.every((t) => P.fromOBJ(t) === null),
     nasty.map((t, i) => (P.fromOBJ(t) === null ? "" : i)).filter(Boolean).join(","));
  ok("an OBJ set with a missing piece is refused",
     P.registerOBJ({ id: "half", name: "Half", maker: "x", license: "?" }, { p: CUBE }) === null);
}

console.log(failed ? "\n" + failed + " check(s) failed" : "\nall checks passed");
process.exit(failed ? 1 : 0);
