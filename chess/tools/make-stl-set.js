/* make-stl-set.js — dev-only, never shipped.

   Turns six STL files into a piece set the 3D board can draw.

   STL is what a printable chess set arrives as, and it is the worst
   possible shape for a browser: no shared vertices (every triangle
   carries its own three), no units, no idea which way is up, and tens of
   thousands of triangles per piece because it was meant for a nozzle
   rather than a GPU. The six models this was written for came to 142,000
   triangles — around 4.5 million a frame with a full board, which is a
   slideshow on a phone and 7MB of download nobody asked for.

   So the work happens here, once, and the browser gets the result:

     read → orient (STL is Z-up, the board is Y-up) → weld coincident
     vertices → decimate by quadric error → stand it on the board and
     size it against the rest of the family → quantise to 16 bits →
     write a packed set file.

   Quadric error decimation (Garland & Heckbert) rather than vertex
   clustering, because clustering rounds off exactly the things that make
   a piece recognisable — the crenellations of a rook, the ears of a
   knight — and this set is the one players see first. Collapses that
   would flip a triangle are refused, so the mesh stays sane rather than
   growing spikes as it thins.

   Run:  node chess/tools/make-stl-set.js --config chess/tools/stl-set.json
   or:   node chess/tools/make-stl-set.js --help
*/
"use strict";

const fs = require("fs");
const path = require("path");

/* ---------- STL ---------- */
function readSTL(file) {
  const buf = fs.readFileSync(file);
  const looksAscii = buf.length > 84 && buf.slice(0, 5).toString("ascii") === "solid" &&
                     buf.slice(0, 512).toString("ascii").indexOf("facet") >= 0;
  if (!looksAscii) {
    const n = buf.readUInt32LE(80);
    if (84 + n * 50 !== buf.length) {
      throw new Error(`${path.basename(file)}: binary STL claims ${n} triangles but the file is ${buf.length} bytes`);
    }
    const pos = new Float64Array(n * 9);
    for (let i = 0; i < n; i++) {
      const o = 84 + i * 50 + 12;                 /* skip the stored normal */
      for (let v = 0; v < 9; v++) pos[i * 9 + v] = buf.readFloatLE(o + v * 4);
    }
    return pos;
  }
  const nums = buf.toString("ascii").split(/vertex\s+/).slice(1).map((s) => {
    const m = s.trim().split(/\s+/);
    return [parseFloat(m[0]), parseFloat(m[1]), parseFloat(m[2])];
  });
  if (!nums.length || nums.length % 3) throw new Error(`${path.basename(file)}: ASCII STL has ${nums.length} vertices`);
  const pos = new Float64Array(nums.length * 3);
  nums.forEach((v, i) => { pos[i * 3] = v[0]; pos[i * 3 + 1] = v[1]; pos[i * 3 + 2] = v[2]; });
  return pos;
}

/* ---------- weld ---------- */
function weld(tri, tol) {
  const q = 1 / tol, map = new Map(), verts = [], idx = new Int32Array(tri.length / 3);
  for (let i = 0, v = 0; i < tri.length; i += 3, v++) {
    const key = Math.round(tri[i] * q) + "," + Math.round(tri[i + 1] * q) + "," + Math.round(tri[i + 2] * q);
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      verts.push(tri[i], tri[i + 1], tri[i + 2]);
      map.set(key, id);
    }
    idx[v] = id;
  }
  /* drop triangles that welding made degenerate */
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (idx[t] !== idx[t + 1] && idx[t + 1] !== idx[t + 2] && idx[t + 2] !== idx[t]) {
      keep.push(idx[t], idx[t + 1], idx[t + 2]);
    }
  }
  return { pos: Float64Array.from(verts), idx: Int32Array.from(keep) };
}

/* ---------- quadric error decimation ---------- */
/* A quadric is the symmetric 4x4 that measures squared distance to a set
   of planes; ten numbers is all it takes. Summed over the faces round a
   vertex, it says how much moving that vertex would cost. */
function planeQuadric(a, b, c, d, w) {
  return [a*a*w, a*b*w, a*c*w, a*d*w, b*b*w, b*c*w, b*d*w, c*c*w, c*d*w, d*d*w];
}
function qAdd(x, y) { for (let i = 0; i < 10; i++) x[i] += y[i]; return x; }
function qError(q, x, y, z) {
  return q[0]*x*x + 2*q[1]*x*y + 2*q[2]*x*z + 2*q[3]*x
       + q[4]*y*y + 2*q[5]*y*z + 2*q[6]*y
       + q[7]*z*z + 2*q[8]*z + q[9];
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(v) { const a = this.a; a.push(v); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].cost <= a[i].cost) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0;
      for (;;) { const l = i*2+1, r = l+1; let s = i;
        if (l < a.length && a[l].cost < a[s].cost) s = l;
        if (r < a.length && a[r].cost < a[s].cost) s = r;
        if (s === i) break; [a[s], a[i]] = [a[i], a[s]]; i = s; } }
    return top; }
}

function decimate(pos, idx, targetTris, opts) {
  opts = opts || {};
  const nV = pos.length / 3;
  const P = Float64Array.from(pos);
  const T = Int32Array.from(idx);
  const triAlive = new Uint8Array(T.length / 3).fill(1);
  const vertAlive = new Uint8Array(nV).fill(1);
  const Q = []; for (let v = 0; v < nV; v++) Q.push(new Float64Array(10));
  const vTris = []; for (let v = 0; v < nV; v++) vTris.push(new Set());

  function triNormal(t) {
    const a = T[t*3]*3, b = T[t*3+1]*3, c = T[t*3+2]*3;
    const ux = P[b]-P[a], uy = P[b+1]-P[a+1], uz = P[b+2]-P[a+2];
    const vx = P[c]-P[a], vy = P[c+1]-P[a+1], vz = P[c+2]-P[a+2];
    const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
    const l = Math.hypot(nx, ny, nz);
    return l > 1e-14 ? [nx/l, ny/l, nz/l, l/2] : null;
  }
  for (let t = 0; t < T.length / 3; t++) {
    for (let e = 0; e < 3; e++) vTris[T[t*3+e]].add(t);
    const n = triNormal(t);
    if (!n) { triAlive[t] = 0; continue; }
    const a = T[t*3]*3;
    const d = -(n[0]*P[a] + n[1]*P[a+1] + n[2]*P[a+2]);
    const kp = planeQuadric(n[0], n[1], n[2], d, n[3]);
    for (let e = 0; e < 3; e++) qAdd(Q[T[t*3+e]], kp);
  }

  /* the best place to put a collapsed pair: solve the quadric where we
     can, and fall back to the two ends and the midpoint where the matrix
     is singular (a flat region, where it does not matter) */
  function best(i, j) {
    const q = qAdd(Float64Array.from(Q[i]), Q[j]);
    const m = [q[0],q[1],q[2], q[1],q[4],q[5], q[2],q[5],q[7]];
    const det = m[0]*(m[4]*m[8]-m[5]*m[7]) - m[1]*(m[3]*m[8]-m[5]*m[6]) + m[2]*(m[3]*m[7]-m[4]*m[6]);
    if (Math.abs(det) > 1e-12) {
      const b = [-q[3], -q[6], -q[8]];
      const x = ( b[0]*(m[4]*m[8]-m[5]*m[7]) - m[1]*(b[1]*m[8]-m[5]*b[2]) + m[2]*(b[1]*m[7]-m[4]*b[2])) / det;
      const y = ( m[0]*(b[1]*m[8]-m[5]*b[2]) - b[0]*(m[3]*m[8]-m[5]*m[6]) + m[2]*(m[3]*b[2]-b[1]*m[6])) / det;
      const z = ( m[0]*(m[4]*b[2]-b[1]*m[7]) - m[1]*(m[3]*b[2]-b[1]*m[6]) + b[0]*(m[3]*m[7]-m[4]*m[6])) / det;
      if (isFinite(x) && isFinite(y) && isFinite(z)) return { p: [x, y, z], cost: Math.max(0, qError(q, x, y, z)) };
    }
    let bp = null, bc = Infinity;
    const cands = [[P[i*3],P[i*3+1],P[i*3+2]], [P[j*3],P[j*3+1],P[j*3+2]],
                   [(P[i*3]+P[j*3])/2, (P[i*3+1]+P[j*3+1])/2, (P[i*3+2]+P[j*3+2])/2]];
    for (const c of cands) {
      const e = Math.max(0, qError(q, c[0], c[1], c[2]));
      if (e < bc) { bc = e; bp = c; }
    }
    return { p: bp, cost: bc };
  }

  const version = new Int32Array(nV);
  const heap = new Heap();
  function pushEdge(i, j) {
    if (i === j) return;
    const b = best(i, j);
    heap.push({ i, j, p: b.p, cost: b.cost, vi: version[i], vj: version[j] });
  }
  const seen = new Set();
  for (let t = 0; t < T.length / 3; t++) {
    if (!triAlive[t]) continue;
    for (let e = 0; e < 3; e++) {
      const a = T[t*3+e], b = T[t*3+(e+1)%3];
      const k = Math.min(a,b) + "," + Math.max(a,b);
      if (seen.has(k)) continue;
      seen.add(k);
      pushEdge(Math.min(a,b), Math.max(a,b));
    }
  }

  /* Refuse a collapse that would turn a triangle inside out. Without
     this a thinning mesh sprouts spikes where the quadric was happy but
     the geometry was not. */
  function flips(i, j, p) {
    for (const t of vTris[i]) {
      if (!triAlive[t]) continue;
      const v = [T[t*3], T[t*3+1], T[t*3+2]];
      if (v.indexOf(j) >= 0) continue;                 /* dies in the collapse */
      const before = triNormal(t);
      if (!before) continue;
      const c = v.map((x) => (x === i ? p : [P[x*3], P[x*3+1], P[x*3+2]]));
      const ux = c[1][0]-c[0][0], uy = c[1][1]-c[0][1], uz = c[1][2]-c[0][2];
      const vx = c[2][0]-c[0][0], vy = c[2][1]-c[0][1], vz = c[2][2]-c[0][2];
      const nx = uy*vz-uz*vy, ny = uz*vx-ux*vz, nz = ux*vy-uy*vx;
      const l = Math.hypot(nx, ny, nz);
      if (l < 1e-15) return true;
      if ((nx*before[0] + ny*before[1] + nz*before[2]) / l < 0.15) return true;
    }
    return false;
  }

  let live = 0; for (let t = 0; t < triAlive.length; t++) live += triAlive[t];
  const minTris = Math.max(4, targetTris | 0);
  let guard = T.length * 20;

  while (live > minTris && heap.size && guard-- > 0) {
    const e = heap.pop();
    if (!vertAlive[e.i] || !vertAlive[e.j]) continue;
    if (e.vi !== version[e.i] || e.vj !== version[e.j]) continue;   /* stale */
    const merged = new Set([...vTris[e.i], ...vTris[e.j]]);
    if (flips(e.i, e.j, e.p) || flips(e.j, e.i, e.p)) { continue; }

    /* i survives at the new position; j goes */
    P[e.i*3] = e.p[0]; P[e.i*3+1] = e.p[1]; P[e.i*3+2] = e.p[2];
    qAdd(Q[e.i], Q[e.j]);
    vertAlive[e.j] = 0;
    for (const t of vTris[e.j]) {
      if (!triAlive[t]) continue;
      for (let k = 0; k < 3; k++) if (T[t*3+k] === e.j) T[t*3+k] = e.i;
      if (T[t*3] === T[t*3+1] || T[t*3+1] === T[t*3+2] || T[t*3+2] === T[t*3]) { triAlive[t] = 0; live--; }
      else vTris[e.i].add(t);
    }
    vTris[e.j].clear();
    version[e.i]++; version[e.j]++;

    /* re-price every edge that touched the collapse */
    const nbr = new Set();
    for (const t of vTris[e.i]) {
      if (!triAlive[t]) continue;
      for (let k = 0; k < 3; k++) if (T[t*3+k] !== e.i) nbr.add(T[t*3+k]);
    }
    for (const n of nbr) if (vertAlive[n]) pushEdge(Math.min(e.i, n), Math.max(e.i, n));
  }

  /* compact */
  const remap = new Int32Array(nV).fill(-1);
  const outPos = [];
  for (let v = 0; v < nV; v++) if (vertAlive[v]) { remap[v] = outPos.length / 3; outPos.push(P[v*3], P[v*3+1], P[v*3+2]); }
  const outIdx = [];
  for (let t = 0; t < triAlive.length; t++) {
    if (!triAlive[t]) continue;
    const a = remap[T[t*3]], b = remap[T[t*3+1]], c = remap[T[t*3+2]];
    if (a < 0 || b < 0 || c < 0 || a === b || b === c || c === a) continue;
    outIdx.push(a, b, c);
  }
  return { pos: Float64Array.from(outPos), idx: Int32Array.from(outIdx) };
}

/* ---------- orient, stand up, size ---------- */
/* STL out of a CAD package is Z-up; the board is Y-up. A -90° turn about
   X does it and keeps the handedness, which a naive axis swap would not
   — and a mirrored mesh draws inside out. */
function zUpToYUp(pos) {
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1], z = pos[i + 2];
    pos[i + 1] = z; pos[i + 2] = -y;
  }
}
function yaw(pos, a) {
  if (!a) return;
  const c = Math.cos(a), s = Math.sin(a);
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = pos[i + 2];
    pos[i] = x * c + z * s; pos[i + 2] = -x * s + z * c;
  }
}
function bounds(pos) {
  const b = { x0: Infinity, y0: Infinity, z0: Infinity, x1: -Infinity, y1: -Infinity, z1: -Infinity };
  for (let i = 0; i < pos.length; i += 3) {
    b.x0 = Math.min(b.x0, pos[i]); b.x1 = Math.max(b.x1, pos[i]);
    b.y0 = Math.min(b.y0, pos[i + 1]); b.y1 = Math.max(b.y1, pos[i + 1]);
    b.z0 = Math.min(b.z0, pos[i + 2]); b.z1 = Math.max(b.z1, pos[i + 2]);
  }
  return b;
}
/* One scale for the whole set, so the family keeps the proportions its
   designer gave it: only the king's height is chosen, and the other five
   follow. Centred on the footprint rather than the bounding box, or a
   knight's muzzle drags the whole piece off its square. */
function place(pos, scale) {
  const b = bounds(pos);
  let sx = 0, sz = 0, n = 0;
  const foot = b.y0 + (b.y1 - b.y0) * 0.06;
  for (let i = 0; i < pos.length; i += 3) {
    if (pos[i + 1] <= foot) { sx += pos[i]; sz += pos[i + 2]; n++; }
  }
  const cx = n ? sx / n : (b.x0 + b.x1) / 2, cz = n ? sz / n : (b.z0 + b.z1) / 2;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - cx) * scale;
    pos[i + 1] = (pos[i + 1] - b.y0) * scale;
    pos[i + 2] = (pos[i + 2] - cz) * scale;
  }
}

/* ---------- pack ---------- */
/* Positions quantised to 16 bits across the piece's own box: on a piece
   about one square tall that is a quarter of a thousandth of a square,
   which is far finer than anything a screen will show. */
function pack(pos, idx) {
  const b = bounds(pos);
  const span = [Math.max(1e-6, b.x1 - b.x0), Math.max(1e-6, b.y1 - b.y0), Math.max(1e-6, b.z1 - b.z0)];
  const n = pos.length / 3;
  const vb = Buffer.alloc(n * 6);
  for (let v = 0; v < n; v++) {
    const q = [
      Math.round((pos[v*3] - b.x0) / span[0] * 65535),
      Math.round((pos[v*3+1] - b.y0) / span[1] * 65535),
      Math.round((pos[v*3+2] - b.z0) / span[2] * 65535)
    ];
    for (let a = 0; a < 3; a++) vb.writeUInt16LE(Math.max(0, Math.min(65535, q[a])), v * 6 + a * 2);
  }
  const ib = Buffer.alloc(idx.length * 2);
  for (let i = 0; i < idx.length; i++) ib.writeUInt16LE(idx[i], i * 2);
  return {
    box: [b.x0, b.y0, b.z0, span[0], span[1], span[2]].map((v) => +v.toFixed(6)),
    v: vb.toString("base64"), i: ib.toString("base64"),
    verts: n, tris: idx.length / 3
  };
}

/* ---------- the run ---------- */
function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || !args.length) {
    console.log(`
  node chess/tools/make-stl-set.js --config <file.json>

  The config names the six STL files and how the set should sit:

  {
    "id": "classic", "name": "…", "maker": "…", "license": "CC0",
    "note": "…", "faces": "n",
    "out": "chess/pieces-classic.js",
    "kingHeight": 1.46,          // squares; the rest follow the models
    "tris": { "default": 3200, "r": 4200 },
    "yaw":  { "n": 0 },          // radians, if a piece faces the wrong way
    "files": { "p": "…/Pawn.stl", "n": "…", "b": "…", "r": "…", "q": "…", "k": "…" }
  }
`);
    process.exit(0);
  }
  const cfgPath = args[args.indexOf("--config") + 1];
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const letters = ["p", "n", "b", "r", "q", "k"];
  const NAME = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };

  /* pass one: read, orient, measure — the king sets the scale for all six */
  const raw = {};
  for (const L of letters) {
    const file = cfg.files[L];
    if (!file) throw new Error("config is missing the " + NAME[L]);
    const tri = readSTL(file);
    const w = weld(tri, cfg.weldTolerance || 1e-4);
    zUpToYUp(w.pos);
    yaw(w.pos, (cfg.yaw && cfg.yaw[L]) || 0);
    raw[L] = w;
    const b = bounds(w.pos);
    console.log(`${NAME[L].padEnd(7)} ${String(tri.length / 9).padStart(6)} tris → ${String(w.idx.length / 3).padStart(6)} welded, ` +
                `${(b.y1 - b.y0).toFixed(1)} tall × ${(b.x1 - b.x0).toFixed(1)} wide`);
  }
  const kb = bounds(raw.k.pos);
  const scale = (cfg.kingHeight || 1.45) / (kb.y1 - kb.y0);

  const out = { id: cfg.id, name: cfg.name, maker: cfg.maker, note: cfg.note,
                license: cfg.license, faces: cfg.faces || "", pieces: {} };
  console.log("");
  let totalTris = 0, bytes = 0;
  for (const L of letters) {
    const target = (cfg.tris && (cfg.tris[L] || cfg.tris.default)) || 3200;
    const d = decimate(raw[L].pos, raw[L].idx, target);
    place(d.pos, scale);
    if (d.pos.length / 3 > 65535) throw new Error(NAME[L] + " still needs more than 65,535 vertices");
    const p = pack(d.pos, d.idx);
    out.pieces[L] = p;
    totalTris += p.tris;
    bytes += p.v.length + p.i.length;
    const b = bounds(d.pos);
    console.log(`${NAME[L].padEnd(7)} ${String(p.tris).padStart(5)} tris  ${String(p.verts).padStart(5)} verts  ` +
                `h ${(b.y1 - b.y0).toFixed(3)}  w ${Math.max(b.x1 - b.x0, b.z1 - b.z0).toFixed(3)}  ` +
                `${((p.v.length + p.i.length) / 1024).toFixed(0)}KB`);
  }
  console.log(`\nset total ${totalTris} tris, ${(bytes / 1024).toFixed(0)}KB of base64`);

  const banner = `/* ${cfg.out.split("/").pop()} — generated by tools/make-stl-set.js. Do not edit by hand.

   ${cfg.name} — ${cfg.maker}, ${cfg.license}.
   Six models decimated by quadric error from ${Object.values(raw).reduce((a, w) => a + w.idx.length / 3, 0).toLocaleString()}
   welded triangles to ${totalTris.toLocaleString()}, then quantised to 16 bits per axis.
   Regenerate with:  node chess/tools/make-stl-set.js --config ${cfgPath} */
`;
  const body = `(function (root) {
"use strict";
var SET = ${JSON.stringify(out)};
function install(P) {
  if (!P || !P.registerPacked) return;
  if (!P.registerPacked(SET)) return;${cfg.default ? "\n  if (P.setDefault) P.setDefault(SET.id);" : ""}
}
if (typeof module !== "undefined" && module.exports) module.exports = SET;
else { root.PIECES_${cfg.id.toUpperCase().replace(/[^A-Z0-9]/g, "_")} = SET; install(root.Pieces3D); }
})(typeof self !== "undefined" ? self : this);
`;
  fs.writeFileSync(cfg.out, banner + body);
  console.log("wrote " + cfg.out + " (" + (fs.statSync(cfg.out).size / 1024).toFixed(0) + "KB)");
}

main();
