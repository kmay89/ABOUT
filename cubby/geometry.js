/**
 * Cubby geometry: the bins and the clips that join them. Millimetres, Z up,
 * every part on the plate at Z = 0 in the orientation it prints in.
 *
 * A bin is an open box: a rounded rectangle with a floor, one or more
 * compartments inside, and on every outside wall a vertical dovetail channel
 * at the centre of each grid cell it covers. Two bins side by side have their
 * channels facing each other, and a printed bowtie clip dropped in from the
 * top ties them together — no screws, no glue, no magnets. The channel stops
 * at the floor, so the clip never falls through. Behind each channel the wall
 * thickens inward just enough to keep a solid back behind it, so a thin wall
 * stays printable and strong where it matters.
 *
 * Every solid here is built from rings: closed outlines in the plane, walked
 * counter-clockwise, lifted to a height and joined by walls. Caps and the
 * ring between the outer wall and the compartments are triangulated by
 * earcut, which drops collinear points (the samples along a straight wall
 * that carry the scoop's depth); those are stitched back so every edge is
 * shared by exactly two faces. The tests prove each part is one closed,
 * outward-wound solid with the volume and the size it should have.
 *
 * No DOM, no WebGL: this runs in a page, a worker or Node.
 */
import earcut from './vendor/earcut.js';

/** The dovetail joint. depth is how far the channel cuts into the wall; neck
 * is its opening at the surface and base its width at the bottom, so it
 * holds; backing is the solid wall left behind the channel. */
export const JOINT = Object.freeze({ depth: 1.4, neck: 3.0, base: 4.6, backing: 1.6 });

export const CLIP_FITS = Object.freeze({
  snug: 0.10,     // per flank, for a well-tuned printer
  normal: 0.18,   // slides in by hand, holds by friction
  loose: 0.28,    // drops in freely
});

export const BIN_DEFAULTS = Object.freeze({
  width: 60, depth: 60, height: 50,
  wall: 1.6, floor: 1.2, radius: 3, divider: 1.2,
  compartmentsX: 1, compartmentsY: 1,
  channels: { front: [], back: [], left: [], right: [] },
  scoop: null,          // { depth, width } — a finger dip in the front wall's top edge
  joint: JOINT,
});

const ARC_SEGMENTS = 6;      // per 90° outside corner
const INNER_ARC_SEGMENTS = 4;
const SAMPLE = 1.5;          // mm between scoop samples

function finite(value, name) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number.`);
  return value;
}
function positive(value, name) {
  if (!(finite(value, name) > 0)) throw new RangeError(`${name} must be greater than zero.`);
  return value;
}

/* ---------- rings ---------- */

/** Points along one straight wall from s = r to s = L - r, in a (s, o) frame
 * where s runs along the wall and o points out of the solid. Features cut or
 * push the wall: a notch (dovetail channel into the wall), a rib (the wall
 * growing into a compartment), or a plain point (a sample carrying height).
 * Notch and rib points carry `inside: true` so a plain copy of the ring can
 * leave them out. */
function runPoints(L, r, feats) {
  const s0 = r, s1 = L - r;
  const spans = [], points = [];
  for (const f of feats) {
    if (f.kind === 'notch') {
      const lo = f.s - f.b, hi = f.s + f.b;
      if (lo < s0 + 0.2 || hi > s1 - 0.2) throw new RangeError('A channel does not fit on this wall; make the cells bigger or the corners smaller.');
      spans.push({ s: f.s, lo, hi, pts: [[f.s - f.a, 0, false], [lo, -f.d, true], [hi, -f.d, true], [f.s + f.a, 0, false]] });
    } else if (f.kind === 'rib') {
      const lo = Math.max(s0 + 0.02, f.s - f.w), hi = Math.min(s1 - 0.02, f.s + f.w);
      if (hi - lo < 0.8) continue;
      spans.push({ s: (lo + hi) / 2, lo, hi, pts: [[lo, 0, false], [lo, -f.d, true], [hi, -f.d, true], [hi, 0, false]] });
    } else if (f.kind === 'pt') {
      points.push(f.s);
    }
  }
  spans.sort((p, q) => p.s - q.s);
  for (let i = 1; i < spans.length; i++) {
    if (spans[i].lo <= spans[i - 1].hi + 0.05) throw new RangeError('Two channels overlap on one wall; make the cells bigger.');
  }
  const items = spans.map(sp => ({ s: sp.s, pts: sp.pts }));
  for (const s of points) {
    if (s <= s0 + 0.05 || s >= s1 - 0.05) continue;
    if (spans.some(sp => s > sp.lo - 0.05 && s < sp.hi + 0.05)) continue;
    items.push({ s, pts: [[s, 0, false]] });
  }
  items.sort((p, q) => p.s - q.s);
  const out = [[s0, 0, false]];
  for (const it of items) {
    if (it.pts.length === 1 && it.s - out[out.length - 1][0] < 0.05) continue;
    out.push(...it.pts);
  }
  out.push([s1, 0, false]);
  return out;
}

/** A rounded rectangle, origin at its front-left corner, walked
 * counter-clockwise: front (y = 0) left to right, right side up, back right
 * to left, left side down; each wall may carry features. Returns
 * [{ x, y, inside }]. */
function ring(origin, W, D, r, feats, arcSegments) {
  const frames = [
    { o: [0, 0], t: [1, 0], n: [0, -1], L: W, f: feats.front },
    { o: [W, 0], t: [0, 1], n: [1, 0], L: D, f: feats.right },
    { o: [W, D], t: [-1, 0], n: [0, 1], L: W, f: feats.back },
    { o: [0, D], t: [0, -1], n: [-1, 0], L: D, f: feats.left },
  ];
  const pts = [];
  for (const fr of frames) {
    const map = (s, o, inside) => ({
      x: origin[0] + fr.o[0] + s * fr.t[0] + o * fr.n[0],
      y: origin[1] + fr.o[1] + s * fr.t[1] + o * fr.n[1],
      inside,
    });
    for (const [s, o, inside] of runPoints(fr.L, r, fr.f || [])) pts.push(map(s, o, inside));
    if (r < 0.05) continue;                      // a sharp corner: the next wall starts where this one ends
    for (let k = 1; k < arcSegments; k++) {
      const th = Math.PI / 2 * (1 - k / arcSegments);
      pts.push(map(fr.L - r + r * Math.cos(th), -r + r * Math.sin(th), false));
    }
  }
  // Sharp corners leave the end of one wall on top of the start of the next.
  return pts.filter((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.hypot(p.x - q.x, p.y - q.y) > 1e-9;
  });
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Triangulate an outer ring with holes. earcut drops points that sit exactly
 * on a straight line between their neighbours, so wherever a triangle edge
 * runs straight over ring points that were dropped, the triangle is fanned
 * so those points are on it — the walls use every ring point, and the
 * surface must meet them. Triangles come back wound so they face `up`.
 */
export function triangulateRings(rings, up = true) {
  const data = [], holes = [], ringOf = [], pos = [], start = [];
  rings.forEach((r, ri) => {
    start.push(data.length / 2);
    if (ri > 0) holes.push(data.length / 2);
    r.forEach((p, i) => { data.push(p.x, p.y); ringOf.push(ri); pos.push(i); });
  });
  const raw = earcut(data, holes.length ? holes : undefined);
  const X = i => data[2 * i], Y = i => data[2 * i + 1];
  const area2 = (a, b, c) => (X(b) - X(a)) * (Y(c) - Y(a)) - (Y(b) - Y(a)) * (X(c) - X(a));
  const between = (u, v) => {
    if (ringOf[u] !== ringOf[v]) return null;
    const n = rings[ringOf[u]].length, s = start[ringOf[u]];
    const df = (pos[v] - pos[u] + n) % n, db = n - df;
    if (df <= 1 || db <= 1) return null;
    const forward = df <= db, count = forward ? df : db;
    const mids = [];
    for (let k = 1; k < count; k++) mids.push(s + (forward ? (pos[u] + k) % n : (pos[u] - k + n) % n));
    const dx = X(v) - X(u), dy = Y(v) - Y(u), len2 = dx * dx + dy * dy;
    for (const m of mids) {
      const mx = X(m) - X(u), my = Y(m) - Y(u);
      const cross = Math.abs(dx * my - dy * mx) / Math.sqrt(len2);
      const t = (mx * dx + my * dy) / len2;
      if (cross > 1e-6 || t <= 0 || t >= 1) return null;
    }
    return mids;
  };
  const tris = [];
  const emit = (a, b, c) => {
    if (Math.abs(area2(a, b, c)) < 1e-9) return;
    for (const [u, v, w] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const mids = between(u, v);
      if (!mids) continue;
      let prev = u;
      for (const m of mids) { emit(w, prev, m); prev = m; }
      emit(w, prev, v);
      return;
    }
    tris.push((area2(a, b, c) > 0) === up ? [a, b, c] : [a, c, b]);
  };
  for (let i = 0; i < raw.length; i += 3) emit(raw[i], raw[i + 1], raw[i + 2]);
  return tris;
}

/* ---------- mesh assembly ---------- */

class Builder {
  constructor() { this.v = []; this.f = []; }
  vertex(x, y, z) { this.v.push(x, y, z); return this.v.length / 3 - 1; }
  tri(a, b, c) { this.f.push(a, b, c); }
  /** (b - a) × (c - a) is the normal of both triangles. */
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  /** Walls between two rings of vertex ids with the same point order; the
   * rings run counter-clockwise, so outward = along the ring with up. */
  walls(lower, upper, outward = true) {
    const n = lower.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      if (outward) this.quad(lower[i], lower[j], upper[j], upper[i]);
      else this.quad(lower[j], lower[i], upper[i], upper[j]);
    }
  }
  cap(rings, ids, up) {
    const flat = ids.flat();
    for (const [a, b, c] of triangulateRings(rings, up)) this.tri(flat[a], flat[b], flat[c]);
  }
  finish(extra = {}) {
    const vertices = Float32Array.from(this.v), indices = Uint32Array.from(this.f);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i += 3) for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], vertices[i + a]); hi[a] = Math.max(hi[a], vertices[i + a]);
    }
    const mesh = { vertices, indices, vertexCount: vertices.length / 3, triangleCount: indices.length / 3,
      bounds: { min: lo, max: hi }, size: hi.map((h, a) => h - lo[a]), ...extra };
    mesh.volume = signedVolume(mesh);
    return mesh;
  }
}

export function signedVolume({ vertices: v, indices: f }) {
  let volume = 0;
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t] * 3, b = f[t + 1] * 3, c = f[t + 2] * 3;
    volume += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1])
      - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c])
      + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6;
  }
  return volume;
}

/* ---------- the bin ---------- */

function normalizeBin(options) {
  const s = { ...BIN_DEFAULTS, ...options, joint: { ...JOINT, ...(options.joint || {}) } };
  s.channels = { front: [], back: [], left: [], right: [], ...(options.channels || {}) };
  for (const k of ['width', 'depth', 'height', 'wall', 'floor']) positive(s[k], k);
  for (const k of ['radius', 'divider']) if (finite(s[k], k) < 0) throw new RangeError(`${k} cannot be negative.`);
  if (!Number.isInteger(s.compartmentsX) || !Number.isInteger(s.compartmentsY) || s.compartmentsX < 1 || s.compartmentsY < 1) {
    throw new RangeError('Compartments must be whole numbers of one or more.');
  }
  if (s.wall < 0.8) throw new RangeError('Walls thinner than 0.8 mm do not print well.');
  if (s.floor < 0.6) throw new RangeError('A floor thinner than 0.6 mm will flex.');
  if (s.height <= s.floor + 4) throw new RangeError('The bin needs to be at least 4 mm taller than its floor.');
  if (2 * s.wall + 4 > s.width || 2 * s.wall + 4 > s.depth) throw new RangeError('The walls leave no room inside this bin.');
  s.radius = Math.min(s.radius, s.width / 2 - 0.5, s.depth / 2 - 0.5);
  if (s.scoop) {
    const depth = Math.min(s.scoop.depth ?? 12, 0.3 * s.height, s.height - s.floor - 4);
    const width = Math.min(s.scoop.width ?? 0.6 * s.width, s.width - 2 * s.radius - 4);
    s.scoop = depth > 0.5 && width > 6 ? { depth, width } : null;
  }
  return s;
}

/**
 * Build one bin as a closed solid with its front-left-bottom corner at the
 * origin: X across (width), Y back (depth), Z up (height). Channel positions
 * are in these coordinates: front and back channels by X, left and right by Y.
 */
export function buildBin(options = {}) {
  const s = normalizeBin(options);
  const { width: W, depth: D, height: H, wall, floor, radius: R, joint } = s;
  const a = joint.neck / 2, b = joint.base / 2, d = joint.depth;
  const ribDepth = Math.max(0, d + joint.backing - wall);
  const ribHalf = b + 1.6;
  const hasRibs = ribDepth >= 0.2;

  // Compartments: equal cells separated by dividers, corners rounded.
  const cx = s.compartmentsX, cy = s.compartmentsY, td = s.divider;
  const innerW = W - 2 * wall, innerD = D - 2 * wall;
  const cw = (innerW - (cx - 1) * td) / cx, ch = (innerD - (cy - 1) * td) / cy;
  if (cw < 5 || ch < 5) throw new RangeError('Those compartments would be narrower than 5 mm; use fewer of them.');
  const rc = Math.max(0.5, Math.min(R - wall, 2, cw / 2 - 1, ch / 2 - 1));

  // Where the finger scoop reaches: the front wall and its ribs. Beyond
  // this band the top is level.
  const bandEnd = wall + Math.max(hasRibs ? ribDepth : 0, rc) + 0.3;
  const topZ = (x, y) => {
    if (!s.scoop || y > bandEnd) return H;
    const u = (x - W / 2) / (s.scoop.width / 2);
    if (Math.abs(u) >= 1) return H;
    const c = Math.cos(Math.PI * u / 2);
    return H - s.scoop.depth * c * c;
  };
  const samples = [];
  if (s.scoop) {
    const x0 = W / 2 - s.scoop.width / 2, n = Math.ceil(s.scoop.width / SAMPLE);
    for (let k = 0; k <= n; k++) samples.push(x0 + s.scoop.width * k / n);
  }

  // The outer ring, with the channels notched into it and the scoop sampled.
  const notch = (pos) => ({ kind: 'notch', s: pos, a, b, d });
  const outerFeats = {
    front: [...s.channels.front.map(notch), ...samples.map(x => ({ kind: 'pt', s: x }))],
    right: s.channels.right.map(notch),
    back: s.channels.back.map(x => notch(W - x)),
    left: s.channels.left.map(y => notch(D - y)),
  };
  const outer = ring([0, 0], W, D, R, outerFeats, ARC_SEGMENTS);
  if (signedArea(outer) <= 0) throw new RangeError('The outline folded over itself.');

  // Compartment rings, with ribs behind the channels and the scoop sampled.
  const near = (p, q) => Math.abs(p - q) < 1e-6;
  const holes = [];
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const x0 = wall + i * (cw + td), y0 = wall + j * (ch + td), x1 = x0 + cw, y1 = y0 + ch;
    const feats = { front: [], right: [], back: [], left: [] };
    const rib = (pos) => ({ kind: 'rib', s: pos, w: ribHalf, d: ribDepth });
    if (hasRibs) {
      if (near(y0, wall)) feats.front.push(...s.channels.front.map(x => rib(x - x0)));
      if (near(x1, W - wall)) feats.right.push(...s.channels.right.map(y => rib(y - y0)));
      if (near(y1, D - wall)) feats.back.push(...s.channels.back.map(x => rib(x1 - x)));
      if (near(x0, wall)) feats.left.push(...s.channels.left.map(y => rib(y1 - y)));
    }
    if (s.scoop && near(y0, wall)) {
      feats.front.push(...samples.map(x => ({ kind: 'pt', s: x - x0 })));
      feats.right.push({ kind: 'pt', s: bandEnd - y0 });
      feats.left.push({ kind: 'pt', s: y1 - bandEnd });
    }
    const h = ring([x0, y0], cw, ch, rc, feats, INNER_ARC_SEGMENTS);
    if (signedArea(h) <= 0) throw new RangeError('A compartment folded over itself.');
    holes.push(h);
  }

  const m = new Builder();
  const plain = outer.filter(p => !p.inside);
  const bottom = plain.map(p => m.vertex(p.x, p.y, 0));
  const plainFloor = plain.map(p => m.vertex(p.x, p.y, floor));
  // The notched ring at floor height shares the plain ring's vertices and
  // adds the channel's inner corners; the ledge between them is the channel's end.
  const notchedFloor = [];
  let k = 0;
  for (const p of outer) notchedFloor.push(p.inside ? m.vertex(p.x, p.y, floor) : plainFloor[k++]);
  const top = outer.map(p => m.vertex(p.x, p.y, topZ(p.x, p.y)));

  m.cap([plain], [bottom], false);
  m.walls(bottom, plainFloor, true);
  for (let i = 0; i < outer.length; i++) {
    if (!outer[i].inside || outer[(i + 1) % outer.length].inside) continue;
    // i is the second inner corner of a notch; the ledge is [i-2, i-1, i, i+1] in ring order
    const ids = [i - 2, i - 1, i, i + 1].map(q => notchedFloor[(q + outer.length) % outer.length]);
    const pts = [i - 2, i - 1, i, i + 1].map(q => outer[(q + outer.length) % outer.length]);
    m.cap([pts], [ids], true);
  }
  m.walls(notchedFloor, top, true);

  const holeFloor = holes.map(h => h.map(p => m.vertex(p.x, p.y, floor)));
  const holeTop = holes.map(h => h.map(p => m.vertex(p.x, p.y, topZ(p.x, p.y))));
  m.cap([outer, ...holes], [top, ...holeTop], true);
  holes.forEach((h, q) => {
    m.walls(holeFloor[q], holeTop[q], false);
    m.cap([h], [holeFloor[q]], true);
  });

  const mesh = m.finish({ settings: s, ribDepth, bandEnd });
  if (!(mesh.volume > 0)) throw new RangeError('The bin came out inside out.');
  return mesh;
}

/* ---------- the clip ---------- */

/**
 * The bowtie clip that joins two bins: two dovetail keys back to back with a
 * neck as long as the gap between the bins. It lies on one key's base, its
 * length along X, so it prints without supports; the other key's flanks
 * overhang at about 30°, well within what any printer manages.
 */
export function buildClip({ length = 30, gap = 0.4, fit = CLIP_FITS.normal, joint = JOINT } = {}) {
  positive(length, 'length');
  if (!(finite(gap, 'gap') >= 0)) throw new RangeError('gap cannot be negative.');
  const a = joint.neck / 2 - fit, b = joint.base / 2 - fit, d = joint.depth - 0.15;
  if (a < 0.6 || d < 0.6) throw new RangeError('The clip would be too thin to print.');
  const neck = Math.max(gap, 0.01);
  const section = [
    [-b, 0], [b, 0], [a, d], [a, d + neck], [b, d + neck], [b, 2 * d + neck],
    [-b, 2 * d + neck], [-a, d + neck], [-a, d],
  ];
  return prism(section, length, { settings: { length, gap, fit, joint } });
}

/** Extrude a counter-clockwise section in the (Y, Z) plane along X. */
function prism(section, length, extra) {
  const m = new Builder();
  const ring0 = section.map(([u, v]) => m.vertex(0, u, v));
  const ring1 = section.map(([u, v]) => m.vertex(length, u, v));
  const pts = section.map(([u, v]) => ({ x: u, y: v }));
  m.cap([pts], [ring0], false);
  m.cap([pts], [ring1], true);
  m.walls(ring0, ring1, true);
  const mesh = m.finish(extra);
  if (!(mesh.volume > 0)) throw new RangeError('The prism came out inside out.');
  return mesh;
}

/* ---------- STL ---------- */

/** Write an ordinary binary STL in millimetres. @returns {ArrayBuffer} */
export function binarySTL(mesh, { header = 'Cubby | units: mm | Z up | print as oriented' } = {}) {
  const { vertices, indices } = mesh;
  if (!vertices || !indices || vertices.length % 3 || indices.length % 3) {
    throw new TypeError('The mesh requires xyz vertices and triangle indices.');
  }
  const count = indices.length / 3;
  const buffer = new ArrayBuffer(84 + count * 50);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < Math.min(80, header.length); i++) {
    const code = header.charCodeAt(i);
    bytes[i] = code >= 32 && code <= 126 ? code : 32;
  }
  const view = new DataView(buffer);
  view.setUint32(80, count, true);
  let offset = 84;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const ux = vertices[b] - vertices[a], uy = vertices[b + 1] - vertices[a + 1], uz = vertices[b + 2] - vertices[a + 2];
    const vx = vertices[c] - vertices[a], vy = vertices[c + 1] - vertices[a + 1], vz = vertices[c + 2] - vertices[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const norm = Math.hypot(nx, ny, nz);
    if (!(norm > 0) || !Number.isFinite(norm)) throw new RangeError('Cannot export a degenerate triangle.');
    view.setFloat32(offset, nx / norm, true);
    view.setFloat32(offset + 4, ny / norm, true);
    view.setFloat32(offset + 8, nz / norm, true);
    offset += 12;
    for (const index of [a, b, c]) {
      view.setFloat32(offset, vertices[index], true);
      view.setFloat32(offset + 4, vertices[index + 1], true);
      view.setFloat32(offset + 8, vertices[index + 2], true);
      offset += 12;
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}
