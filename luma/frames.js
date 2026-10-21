/**
 * Gallery frames, a showcase frame, and a four-sided lantern.
 *
 * The frames hold a picture the way a good picture frame does: in grooves.
 * The picture, the LED board and any spare pictures slide down into grooves
 * on the left, right and bottom, through slots in the top; a lid with tight
 * tongues plugs into the slots and closes it. Nothing has to flex or snap, so
 * nothing wears out, and a picture can be changed in seconds — which is the
 * whole point of the showcase, with its storage slots behind the light.
 *
 * The frame's border is the same width on every side, measured from the
 * edge of the photo, whatever the picture and board sizes; the window has a
 * 45° bevel like a cut mat. All clearances come from one fit setting, so a
 * printer that runs tight or loose is fixed in one place.
 *
 * Geometry is built the same way as accessories.js: cross-sections swept
 * along paths, here a U (left side, bottom, right side) whose cross-section
 * may sit at a different offset on the sides than on the bottom, plus
 * straight bars for the top. Parts that are several shells overlap, which
 * slicers union. Everything prints without supports.
 *
 * Coordinates: frames are built lying face down (z = 0 is the front, x across
 * the picture, y up the picture); the lantern stands up (z up). `place` maps
 * a part's print coordinates to the preview's picture coordinates.
 */
import { area, triangulate, extrude, orient, merge, finish, printedGrams } from './accessories.js';

export const FITS = Object.freeze({
  snug:     { name:'Snug',     clear:0.12, note:'For a printer that prints true to size.' },
  standard: { name:'Standard', clear:0.2,  note:'Right for most printers.' },
  loose:    { name:'Loose',    clear:0.32, note:'If parts came out too tight before.' },
});

const WALL = 2.4, LIP = 2.0, RIB = 1.6, BACK = 1.8;

/**
 * Sweep a profile [[dx, dy, z], …] along points {x, y, ux, uy}: a point's
 * vertex for profile entry (dx, dy, z) is (x + dx·ux, y + dy·uy, z). A side
 * running up or down therefore takes the profile's dx, one running across
 * takes dy, and a corner takes both. An open path is capped at each end in
 * the plane its offset runs in.
 */
function axisSweep(points, profile, closed) {
  for (const axis of [0, 1]) {
    if (area(profile.map(p => [p[axis], p[2]])) <= 0) throw new RangeError('A profile must run counter-clockwise.');
  }
  const K = points.length, P = profile.length, vertices = new Float32Array(K * P * 3);
  points.forEach((p, k) => profile.forEach(([dx, dy, z], i) => {
    vertices.set([p.x + dx * p.ux, p.y + dy * p.uy, z], (k * P + i) * 3);
  }));
  const tris = [], id = (k, i) => (k % K) * P + (i % P);
  for (let k = 0; k < (closed ? K : K - 1); k++) for (let i = 0; i < P; i++) {
    tris.push([id(k, i), id(k + 1, i), id(k + 1, i + 1)], [id(k, i), id(k + 1, i + 1), id(k, i + 1)]);
  }
  if (!closed) {
    // Each cap faces away from the path: work out which winding does that.
    for (const [k, next] of [[0, 1], [K - 1, K - 2]]) {
      const p = points[k], axis = p.ux !== 0 ? 0 : 1;
      const ears = triangulate(profile.map(q => [q[axis], q[2]]));
      const out = [points[k].x - points[next].x, points[k].y - points[next].y, 0];
      // The whole cap's normal, summed over its triangles: a single one may be a sliver.
      const n = [0, 0, 0], v = vertices;
      for (const ear of ears) {
        const [a, b, c] = ear.map(i => id(k, i) * 3);
        const u = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]], w = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
        n[0] += u[1] * w[2] - u[2] * w[1]; n[1] += u[2] * w[0] - u[0] * w[2]; n[2] += u[0] * w[1] - u[1] * w[0];
      }
      const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0;
      for (const [x, y, z] of ears) tris.push(flip ? [id(k, x), id(k, z), id(k, y)] : [id(k, x), id(k, y), id(k, z)]);
    }
  }
  return orient({ vertices, indices: Uint32Array.from(tris.flat()) });
}

/** A box from corner to corner. */
function block(x0, x1, y0, y1, z0, z1) {
  const m = extrude([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], z1 - z0);
  for (let i = 2; i < m.vertices.length; i += 3) m.vertices[i] += z0;
  return m;
}

/** Remap every vertex with f(x, y, z) → [x, y, z], then make the winding outward again. */
function remap(mesh, f) {
  const v = mesh.vertices;
  for (let i = 0; i < v.length; i += 3) v.set(f(v[i], v[i + 1], v[i + 2]), i);
  return orient(mesh);
}

/* ---------- solids from a grid of cells, and cutting polygons ---------- */

/**
 * A solid from a grid of filled cells, z0 to z1 thick: xs and ys are the cell
 * edges, filled(x, y) says whether the cell round a point is solid. Cells
 * share their corners, so the result is one closed solid whatever the holes
 * — as long as no two cells touch only at a corner.
 */
function gridSolid(xs, ys, filled, z0, z1) {
  const nx = xs.length - 1, ny = ys.length - 1, on = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) on[j * nx + i] = filled((xs[i] + xs[i + 1]) / 2, (ys[j] + ys[j + 1]) / 2);
  const cell = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && on[j * nx + i];
  const index = new Map(), vertices = [], tris = [];
  const v = (i, j, top) => {
    const k = (top * (ny + 1) + j) * (nx + 1) + i;
    if (!index.has(k)) { index.set(k, vertices.length / 3); vertices.push(xs[i], ys[j], top ? z1 : z0); }
    return index.get(k);
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!cell(i, j)) continue;
    tris.push([v(i, j, 1), v(i + 1, j, 1), v(i + 1, j + 1, 1)], [v(i, j, 1), v(i + 1, j + 1, 1), v(i, j + 1, 1)]);
    tris.push([v(i, j, 0), v(i + 1, j + 1, 0), v(i + 1, j, 0)], [v(i, j, 0), v(i, j + 1, 0), v(i + 1, j + 1, 0)]);
    if (!cell(i, j - 1)) tris.push([v(i, j, 0), v(i + 1, j, 0), v(i + 1, j, 1)], [v(i, j, 0), v(i + 1, j, 1), v(i, j, 1)]);
    if (!cell(i, j + 1)) tris.push([v(i, j + 1, 0), v(i + 1, j + 1, 1), v(i + 1, j + 1, 0)], [v(i, j + 1, 0), v(i, j + 1, 1), v(i + 1, j + 1, 1)]);
    if (!cell(i - 1, j)) tris.push([v(i, j, 0), v(i, j + 1, 1), v(i, j + 1, 0)], [v(i, j, 0), v(i, j, 1), v(i, j + 1, 1)]);
    if (!cell(i + 1, j)) tris.push([v(i + 1, j, 0), v(i + 1, j + 1, 0), v(i + 1, j + 1, 1)], [v(i + 1, j, 0), v(i + 1, j + 1, 1), v(i + 1, j, 1)]);
  }
  return orient({ vertices: Float32Array.from(vertices), indices: Uint32Array.from(tris.flat()) });
}

/** A plate x0–x1 by y0–y1, t thick from z0, with rectangular holes [x0, x1, y0, y1] (which may run off its edge). */
function plate(x0, x1, y0, y1, t, holes = [], z0 = 0) {
  const cuts = (lo, hi, values) => [...new Set([lo, hi, ...values.filter(q => q > lo && q < hi)])].sort((p, q) => p - q);
  const xs = cuts(x0, x1, holes.flatMap(h => [h[0], h[1]])), ys = cuts(y0, y1, holes.flatMap(h => [h[2], h[3]]));
  return gridSolid(xs, ys, (x, y) => !holes.some(h => x > h[0] && x < h[1] && y > h[2] && y < h[3]), z0, z0 + t);
}

/** Cut a polygon [[u, v], …] down to where keep(p) ≥ 0 (Sutherland–Hodgman: right for the single straight cuts made here). */
function clip(poly, keep) {
  const out = [];
  poly.forEach((p, i) => {
    const q = poly[(i + 1) % poly.length], kp = keep(p), kq = keep(q);
    if (kp >= 0) out.push(p);
    if ((kp >= 0) !== (kq >= 0)) { const t = kp / (kp - kq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  });
  return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) > 1e-7; });
}

/** A closed polygon without repeated points or points on a straight line between their neighbours (they make sliver triangles). */
function simplify(poly) {
  let out = poly;
  for (let changed = true; changed && out.length > 3;) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[(i + out.length - 1) % out.length], p = out[i], b = out[(i + 1) % out.length];
      const u = p.map((v, k) => v - a[k]), w = b.map((v, k) => v - p[k]);
      const cross = u.length === 2 ? u[0] * w[1] - u[1] * w[0]
        : Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]);
      if (Math.abs(cross) < 1e-9) { out = out.filter((_, j) => j !== i); changed = true; break; }
    }
  }
  return out;
}

/** A cross-section [[offset, z], …] as an axisSweep profile, counter-clockwise. */
const asProfile = poly => (area(poly) > 0 ? poly : [...poly].reverse()).map(([o, z]) => [o, o, z]);

/* ---------- the gallery frame ---------- */

const AIR = 6, AIR_BOARD = 8, FLOOR = 3, EASE = 1, STEP = 2.5, TIP = 15;
/** Room under the board's edge for the plug: a right-angle plug, or a straight one and its cable's bend. */
export const PLUGS = Object.freeze({
  angled:   { name:'Right-angle (90°) plug', room:14 },
  straight: { name:'Straight plug',          room:30 },
});
/** The 156 × 120 mm USB-C boards (Bambu Lab's CMYK board and the boards that copy it): 144 × 108 mm of LEDs, 5 W. */
export const BOARD = Object.freeze({ size:[120, 156], lit:[108, 144], watts:5, grams:30 });

/** How far behind the picture the LEDs should sit: further when the picture runs past the LEDs, so its edges still glow. */
export function recommendedGap({ width, height, border = 3 }) {
  const [lw, lh] = width > height ? [BOARD.lit[1], BOARD.lit[0]] : BOARD.lit;
  const over = Math.max(width - 2 * border - lw, height - 2 * border - lh) / 2;
  return over > 2 ? Math.min(30, Math.round(12 + over * 0.6)) : 12;
}

/**
 * @param {object} o width, height, maxThickness, border (the picture);
 *   light: 'board' (a 156 × 120 USB-C LED board) or 'own' (a strip or puck light in a hollow);
 *   gap (picture to LEDs), depth (the hollow, for 'own'), port { edge: 'bottom' | 'left' | 'right', at },
 *   plug ('angled' | 'straight'), storage (spare-picture slots), foot, fit, margin (extra border), style.
 *
 * Printability decides the shape as much as looks do. The frame prints face
 * down, so going up the print the inside edge may step outward freely but
 * inward by no more than STEP before it needs a 45° slope. The top of the
 * frame is open behind the front lip; the lid's fins fill it between the
 * slots, printed standing up.
 *
 * Light, heat and the cable are kept apart. The LEDs light a sealed chamber:
 * the picture in front, the board behind, the frame's walls and the lid's fins
 * round it. Behind the board an air space breathes through slots in the back
 * cover and the lid, where no LED can be seen. Under the board's port edge a
 * cable bay holds the plug, walled off from the chamber by the ledge the
 * board rests on, and the cable leaves through the floor.
 */
export function galleryFrame(o) {
  const W = o.width, H = o.height, T = o.maxThickness, b = Math.max(1, o.border);
  const f = (FITS[o.fit] || FITS.standard).clear, light = o.light || 'board';
  const storage = Math.max(0, Math.min(8, Math.round(o.storage || 0)));
  const sized = o.board || BOARD.size;
  const [bw, bh] = (W > H) === (sized[0] > sized[1]) ? sized : [sized[1], sized[0]];
  const gap = Math.max(4, o.gap ?? recommendedGap(o)), depth = Math.max(10, o.depth ?? 30), bt = o.boardThickness ?? 1;
  const plug = PLUGS[o.plug] ? o.plug : 'angled';
  const edge = ['left', 'right'].includes(o.port?.edge) ? o.port.edge : 'bottom';

  const win = -b, rib = -Math.max(0.5, Math.min(1.5, b - 0.5)), bevel = o.style === 'flat' ? 0 : 1.2;
  const gP = 0.5 + f;
  const xy = v => [v, v];
  // Segments front to back: {z0, z1, inner: [x, y]} (or from/to for a slope), and slots with what they hold.
  const segs = [], slots = [];
  let z = 0;
  const band = (t, inner, extra) => {
    const p = segs[segs.length - 1];                      // one band, not two the same: their fins would share a face
    if (p && !p.kind && p.inner && p.inner[0] === inner[0] && p.inner[1] === inner[1] && !p.vent === !extra?.vent) p.z1 += t;
    else segs.push({ z0: z, z1: z + t, inner, ...extra });
    z += t;
  };
  const slope = (from, to) => {
    const t = Math.max(0, from[0] - to[0] - STEP, from[1] - to[1] - STEP);
    if (t > 0) { segs.push({ z0: z, z1: z + t, from, to }); z += t; }
  };
  const slot = (kind, t, g, edge) => { const s = { kind, z0: z, z1: z + t, g, edge }; segs.push({ ...s, inner: g }); slots.push(s); z += t; return s; };

  band(LIP, xy(win));
  slot('picture', T + 2 * f + 0.1, xy(gP), [0, 0]);
  band(RIB, xy(rib));
  let last, e = null, board = null;
  if (light === 'board') {
    if ((W - 2 * b) * (H - 2 * b) > 1.6 * (bw - 12) * (bh - 12)) {
      throw new RangeError(`This picture is larger than a ${bw} × ${bh} mm board can light evenly. Choose “my own light”, or a smaller picture.`);
    }
    e = [(bw - W) / 2, (bh - H) / 2];                     // the board's edge: outside the picture's (+) or inside (−)
    const gB = e.map(v => v + 0.4 + f);                    // its groove, just past that edge
    const front = gB.map(v => v - 2.2);                    // the ledge its face rests on (in its unlit margin), sealing the light in
    const room = front.map(v => Math.max(rib, v));         // the light chamber: the picture's size, or the board's
    const fall = Math.max(0, room[0] - front[0] - STEP, room[1] - front[1] - STEP);
    if (room[0] === front[0] && room[1] === front[1]) band(gap - RIB, front);
    else {
      // A board smaller than the picture: the chamber narrows to it in a 45° funnel, which also throws light into the corners.
      // Its ledge runs 4 mm deep, so the cable bay (which starts 3.2 mm in front of the board) only ever meets the ledge.
      band(Math.max(1, gap - RIB - fall - 4), room);
      slope(room, front);
      band(4, front);
    }
    board = slot('board', bt + 2 * f + 0.5, gB, e);
    last = gB.map(v => v - 2.4);
    band(BACK, last);
    band(AIR_BOARD, last, { vent: true });                 // the air space behind the board
  } else {
    last = xy(0.5);
    band(depth - RIB, last);
  }
  if (storage) { slope(last, xy(rib)); last = xy(rib); }
  for (let i = 0; i < storage; i++) {
    slot('spare', T + 2 * f + 0.1, xy(gP), [0, 0]);
    band(RIB, xy(rib));
  }
  if (storage) band(AIR, last, { vent: light === 'board' });
  const gC = last.map(v => v + 1.8);
  const cover = slot('cover', 2 + 2 * f, gC, gC.map(v => v - f - 0.1));
  band(BACK, last);
  const Z = z;
  const deep = [0, 1].map(a => Math.max(...segs.map(s => Math.max(...(s.inner ? [s.inner[a]] : [s.from[a], s.to[a]])))));
  let out = Math.max(...deep) + WALL + Math.max(0, o.margin || 0);   // one border width all round

  // The bay: a pocket in the frame below the board's port edge. Kept: everything in front of zc (which seals
  // the light chamber), behind zb, inside ceil (the ledge and the rim either side of the board), and beyond floor.
  const hw = W / 2, hh = H / 2;
  let bay;
  if (board) {
    const a = edge === 'bottom' ? 1 : 0, room = PLUGS[plug].room;
    const floor = Math.max(e[a] + room, deep[a] + 0.6);
    out = Math.max(out, floor + FLOOR);
    let a0, a1, mid = 0;
    if (a === 1) { a1 = Math.min(bw / 2 - 9, hw - 1); a0 = -a1; }
    else {
      mid = -bh / 2 + (o.port?.at ?? bh / 2);
      const lo = Math.max(-bh / 2, -hh) + 1, hi = Math.min(bh / 2, hh) - 1;
      mid = Math.max(lo + 12, Math.min(hi - 12, mid));
      a0 = mid - 12; a1 = mid + 12;
    }
    const zb = board.z1 + BACK + AIR_BOARD - 0.8;
    bay = { edge, axis: a, a0, a1, zc: board.z0 + f + 0.25 - 3.2, zb, ceil: e[a], floor,
      notch: { a0: mid - 5, a1: mid + 5, z0: board.z1 }, room };
  } else {
    // Own light: the cable leaves under the cover, through a gap in the back band.
    bay = { edge: 'bottom', axis: 1, a0: -5, a1: 5, zc: cover.z1, zb: Infinity, floor: Math.max(cover.edge[1] + 0.6, deep[1] + 0.6) };
    out = Math.max(out, bay.floor + FLOOR);
  }

  // The inside edge, front to back, then the cross-section counter-clockwise with its front outer edge eased.
  const inside = [];
  for (const s of segs) {
    const p = s.inner || s.from, q = s.inner || s.to;
    inside.push([p[0], p[1], s === segs[0] ? bevel : s.z0], [q[0], q[1], s.z1]);
  }
  const P = [[win + bevel, win + bevel, 0], [out - EASE, out - EASE, 0], [out, out, EASE], [out, out, Z]];
  for (let i = inside.length - 1; i >= 0; i--) {
    const p = inside[i], q = P[P.length - 1];
    if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 1e-9) P.push(p);
  }
  if (bevel === 0) { P[0] = [win, win, 0]; if (P[P.length - 1][2] === 0) P.pop(); }
  const profile = simplify(P);

  const yTop = hh + out, xOut = hw + out;
  const shells = uFrame(profile, segs, hw, hh, yTop, bay);
  // Across the top, the frame keeps only its front lip; behind it, the top is the lid's.
  const lipBar = remap(extrude(bevel > 0
    ? [[hh + win + bevel, 0], [yTop - EASE, 0], [yTop, EASE], [yTop, LIP], [hh + win, LIP], [hh + win, bevel]]
    : [[hh + win, 0], [yTop - EASE, 0], [yTop, EASE], [yTop, LIP], [hh + win, LIP]], 2 * xOut), (u, v, w) => [w - xOut, u, v]);
  const preview = ([x, y, zz]) => [x, zz - LIP - f - 0.05 - T, y + hh];
  const frame = finish(merge(...shells, lipBar), { place: preview, shells: shells.length + 1 });

  // The lid: a plate over the top with slots where it breathes; a fin in each other band between the slots,
  // standing where the frame's top would be; and a tongue in each end of every slot.
  const lidT = 2.4, tongue = 0.08, lidParts = [], vents = [];
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i];
    if (s.kind) continue;                                         // a slot, not a band
    const ix = s.inner ? s.inner[0] : Math.min(s.from[0], s.to[0]);
    const iy = s.inner ? s.inner[1] : Math.max(s.from[1], s.to[1]);
    const x = hw + ix - f, y0 = hh + iy;
    if (s.vent) {
      // Over an air space no LED can see into: a row of slots, and no fin to stop the warm air.
      const reach = hw + ix - 3, n = Math.floor((2 * reach + 4) / 14);
      for (let k = 0; k < n; k++) { const c = (k - (n - 1) / 2) * 14; vents.push([c - 5, c + 5, s.z0 + 1, s.z1 - 1]); }
      continue;
    }
    if (x <= 1 || yTop - y0 < 1) continue;
    // A slope's fin lies inside its neighbours' fins: overlap them a little so the shells share no edge.
    const into = n => !s.inner && n && !n.kind && !n.vent ? 0.2 : 0;
    lidParts.push(block(-x, x, y0, yTop + 0.5, s.z0 - into(segs[i - 1]), s.z1 + into(segs[i + 1])));
  }
  for (const s of slots) {
    const len = Math.min(6, out - s.edge[1] - 0.6);
    if (len < 2) continue;
    const reach = s.kind === 'picture' || s.kind === 'spare' ? rib : -Infinity;   // never over the picture
    const a = hw + Math.max(reach, s.g[0] - 8), c = hw + s.g[0] - f;
    if (c - a < 1) continue;
    for (const side of [-1, 1]) lidParts.push(block(side < 0 ? -c : a, side < 0 ? -a : c, yTop - len, yTop + 0.5, s.z0 + tongue, s.z1 - tongue));
  }
  lidParts.unshift(remap(plate(-xOut, xOut, 0, Z, lidT, vents), (u, v, w) => [u, yTop + w, v]));
  // Print the lid plate-down: frame (x, y, z) → print (x, z, top − y).
  const lidTop = yTop + lidT;
  const lid = finish(remap(merge(...lidParts), (x, y, zz) => [x, zz, lidTop - y]), {
    place: ([x, y, zz]) => preview([x, lidTop - zz, y]), shells: lidParts.length,
  });

  // The back cover: board-sized behind a board, picture-sized behind a hollow.
  const cw = hw + cover.g[0] - f - 0.1, ch = hh + cover.g[1] - f - 0.1, ct = cover.z1 - cover.z0 - 2 * f;
  const holes = [[-8, 8, ch - 8, ch + 1]], hoods = [];     // a finger notch to lift it out by
  const rows = board ? [[-ch + 8, -ch + 11], [ch - 14, ch - 11]] : [[-ch + 12, -ch + 15], [ch - 18, ch - 15]];
  const span = cw - (board ? 10 : 16), n = Math.max(1, Math.floor((2 * span + 5) / 17));
  for (const [y0, y1] of rows) {
    for (let k = 0; k < n; k++) { const c = (k - (n - 1) / 2) * 17; holes.push([c - 6, c + 6, y0, y1]); }
    if (!board) hoods.push([-(cw - 8), cw - 8, y0, y1]);
  }
  let keyholes = 0;
  if (board) {
    // Keyholes to hang it: the screw head goes in the wide part and the frame drops onto the narrow part.
    keyholes = Math.min(cw - 16, 40);
    for (const x of [-keyholes, keyholes]) holes.push([x - 4.25, x + 4.25, ch - 36.5, ch - 28], [x - 2.1, x + 2.1, ch - 28, ch - 19]);
  } else holes.push([-4, 4, -ch - 1, -ch + 5]);           // where the light's cable comes out
  const coverParts = [plate(-cw, cw, -ch, ch, ct, holes)];
  for (const [x0, x1, y0, y1] of hoods) {
    // A tunnel over each row of vents, open only at its ends: air turns a corner to get out, light hardly can.
    const a = y0 - 1.6, c = y1 + 1.6;
    const section = [[a, -0.2], [a + 1.2, -0.2], [a + 1.2, 3], [c - 1.2, 3], [c - 1.2, -0.2], [c, -0.2], [c, 4.2], [a, 4.2]];
    coverParts.push(remap(extrude(area(section) > 0 ? section : [...section].reverse(), x1 - x0), (u, v, w) => [x0 + w, u, -v]));
  }
  // Print it face down, hoods up: cover (x, y, w) → print (x, −y, ct − w).
  const coverMesh = finish(remap(merge(...coverParts), (x, y, w) => [x, -y, ct - w]), {
    place: ([x, y, w]) => preview([x, -y, cover.z0 + f + ct - w]), shells: coverParts.length,
  });

  const parts = [{ id: 'frame', name: storage ? 'Showcase frame' : 'Gallery frame', mesh: frame },
    { id: 'lid', name: 'Frame lid', mesh: lid }, { id: 'cover', name: 'Back cover', mesh: coverMesh }];

  // Standing up: how far it leans before it tips, with the foot and without.
  const standH = 2 * yTop + lidT, deg = r => r * 180 / Math.PI;
  const photo = W * H * (0.8 + T) / 2 * 1.24 / 1000;
  const load = parts.reduce((g, p) => g + printedGrams(p.mesh), photo * (1 + storage) + (board ? BOARD.grams : 20));
  const tip = { bare: deg(Math.atan(Z / standH)) };
  if (o.foot) {
    const c = f + 0.15, rim = 5, low = 1.6, mid = 6, top = 12, pw = xOut + c, wide = pw + rim;
    const drop = board ? board.z1 : cover.z1;            // where the cable comes down out of the frame
    const build = D => {
      const front = D / 2 - Z / 2, p0 = front - c, p1 = front + Z + c, t0 = front + drop - 1, t1 = Math.max(p1 + 3, t0 + 6);
      // The cable runs in a trench to the back, past two teeth that grip it.
      const trench = [[-2.2, 2.2, t0, t1], [-1.5, 1.5, t1, t1 + 4], [-2.2, 2.2, t1 + 4, t1 + 9], [-1.5, 1.5, t1 + 9, t1 + 13], [-2.2, 2.2, t1 + 13, D + 1]];
      if (t1 + 13 >= D - 1) trench.splice(1);
      if (trench.length === 1) trench[0][3] = D + 1;
      return { front, mesh: merge(plate(-wide, wide, 0, D, low), plate(-wide, wide, 0, D, mid - low + 0.2, trench, low - 0.2),
        plate(-wide, wide, 0, D, top - mid + 0.2, [[-pw, pw, p0, p1], [-2.2, 2.2, p1 - 0.5, D + 1]], mid - 0.2)) };
    };
    const hFrame = mid + standH / 2;
    let D = Math.ceil(Z + 2 * c + 2 * rim), made;
    for (let pass = 0; pass < 4; pass++) {
      made = build(D);
      const g = printedGrams(finish(made.mesh)), h = (load * hFrame + g * top / 2) / (load + g);
      tip.foot = deg(Math.atan(D / 2 / h));
      const need = Math.ceil(2 * h * Math.tan(TIP * Math.PI / 180));
      if (D >= need) break;
      D = need;
    }
    const front = made.front;
    parts.push({ id: 'foot', name: 'Desk foot', mesh: finish(made.mesh, {
      place: ([u, v, w]) => preview([u, -hh - out + w - mid, v - front]), shells: 3 }) });
  }

  // Heat: what the frame's outside can shed by convection and radiation, about 8 W per m² per °C.
  const outside = 2 * ((2 * xOut) * standH + (2 * xOut) * Z + standH * Z) / 1e6;
  const warm = BOARD.watts / (8 * outside);
  const visible = out - win, room = bay.room;
  const smallBoard = board && (e[0] < -2 || e[1] < -2);
  const where = edge === 'bottom' ? 'bottom edge' : `${edge} edge, ${Math.round((o.port?.at ?? bh / 2))} mm up from the board’s bottom corner`;
  return {
    parts, out, depth: Z, visibleBorder: visible, slots, segs, profile, inside, bay, vents, tip, warm,
    ghosts: board ? [{ kind: 'board', mesh: finish(block(-bw / 2, bw / 2, -bh / 2, bh / 2, board.z0 + f + 0.25, board.z0 + f + 0.25 + bt), { place: preview }) }] : [],
    notes: [
      `A ${(2 * xOut).toFixed(0)} × ${standH.toFixed(0)} × ${Z.toFixed(0)} mm frame with an even ${visible.toFixed(1)} mm border round the photo.`,
      board ? `Turn the LED board so its USB-C port is on the ${where}, plug in a ${plug === 'angled' ? 'right-angle (90°) USB-C cable' : 'USB-C cable'}, and slide the board down the slot behind the picture, LEDs facing forward. The plug sits in a ${room} mm bay ${edge === 'bottom' ? 'under' : 'beside'} the board, walled off from the light, and the cable leaves through the ${edge === 'bottom' ? 'bottom' : 'side'} of the frame. Then the picture into the front slot (bumpy side out), the back cover into the back, and press the lid on.`
        : `Slide the picture into the front slot (bumpy side out). An LED strip or puck light goes in the ${depth} mm hollow behind it, its cable out through the notch at the bottom of the back cover. Slide the cover in and press the lid on.`,
      smallBoard ? `The picture is bigger than the board’s ${BOARD.lit[1]} × ${BOARD.lit[0]} mm of LEDs, so they sit ${gap} mm back and the frame narrows to the board in a 45° funnel. Print the frame in white, or line the funnel with white paper, so it throws light into the corners.` : '',
      storage ? `${storage} more pictures wait in the slots behind the light — lift the lid to swap the one on show.` : '',
      board ? `Heat: the board draws at most ${BOARD.watts} W. Behind it an ${AIR_BOARD} mm air space breathes in through the back cover’s low slots and out through the lid — all behind the board, where no LED can be seen. At full brightness the frame settles about ${Math.round(warm)} °C above the room; PLA softens near 55 °C, so keep it out of direct sun and off radiators, or print it in PETG.`
        : 'Use an LED light only, under about 3 W. The back cover’s vents are tucked under tunnels, so the air turns a corner and the light hardly gets out.',
      board ? 'It runs on 5 V USB — there is no mains voltage anywhere in the frame. Use a plain 5 V, 1–2 A USB charger (the board makers advise against fast chargers), and don’t cover the vents.' : '',
      board ? `To hang it: two keyholes in the back cover, ${(2 * keyholes).toFixed(0)} mm apart. Use screws with heads under 8 mm, left 3 mm out from the wall, and run the cable straight down.` : '',
      o.foot ? `The desk foot holds it upright: it would have to lean ${Math.floor(tip.foot)}° before tipping (household products are tested at 10°), and the cable presses into the clip channel underneath, so a tug pulls the foot, not the frame. Without the foot it would tip at ${Math.floor(tip.bare)}°.` : `Standing on its own it tips at ${Math.floor(tip.bare)}° — add the desk foot to stand it up, or hang it.`,
      'Press the lid on: its fins and tongues are a close fit, so it stays put but lifts off by hand.',
      `Print the frame face down, the lid and back cover as they arrive${o.foot ? ', and the foot flat' : ''}, all without supports${board ? ` (the cable bay’s roof bridges ${room} mm)` : ''}.`,
    ].filter(Boolean).join('\n\n'),
  };
}

/**
 * The frame's U (left side, bottom, right side) as swept shells. Where the
 * bay is, the sweep stops, and the bay's stretch is swept as pieces of the
 * cross-section — the material kept round the bay — each overlapping the
 * rest a different distance, so no two shells share an edge.
 */
function uFrame(P, segs, hw, hh, yTop, bay) {
  const L = { x: -hw, y: yTop, ux: -1, uy: 0 }, LC = { x: -hw, y: -hh, ux: -1, uy: -1 };
  const RC = { x: hw, y: -hh, ux: 1, uy: -1 }, R = { x: hw, y: yTop, ux: 1, uy: 0 };
  const at = a => bay.edge === 'bottom' ? { x: a, y: -hh, ux: 0, uy: -1 }
    : { x: bay.edge === 'left' ? -hw : hw, y: a, ux: bay.edge === 'left' ? -1 : 1, uy: 0 };
  const runs = bay.edge === 'bottom' ? [[L, LC, at(bay.a0)], [at(bay.a1), RC, R]]
    : bay.edge === 'left' ? [[L, at(bay.a1)], [at(bay.a0), LC, RC, R]] : [[L, LC, RC, at(bay.a0)], [at(bay.a1), R]];
  const shells = runs.map(points => axisSweep(points, P, false));
  const a = bay.axis, P2 = P.map(p => [p[a], p[2]]), out = Math.max(...P2.map(p => p[0]));
  const piece = (poly, a0, a1, d) => {
    poly = simplify(poly);
    if (poly.length >= 3 && Math.abs(area(poly)) > 1e-6) {
      // Sweep the way the U runs (down the left side, along the bottom, up the right), so the faces wind outward.
      const ends = bay.edge === 'left' ? [at(a1 + d), at(a0 - d)] : [at(a0 - d), at(a1 + d)];
      shells.push(axisSweep(ends, asProfile(poly), false));
    }
  };
  piece(clip(P2, p => bay.zc - p[1]), bay.a0, bay.a1, 0.31);
  if (bay.zb < Infinity) piece(clip(P2, p => p[1] - bay.zb), bay.a0, bay.a1, 0.37);
  // Inside the ceiling: the ledge in front of the board and the rim behind it, wherever they are inside ceil.
  if (bay.ceil !== undefined) {
    const innerAt = (s, zz) => s.inner ? s.inner[a] : s.from[a] + (s.to[a] - s.from[a]) * (zz - s.z0) / (s.z1 - s.z0);
    const lo = bay.zc - 0.1, hi = bay.zb + 0.1;
    let group = [], k = 0;
    const flush = () => {
      if (group.length) {
        const z0 = group[0][1], z1 = group[group.length - 1][1];
        piece([...group, [bay.ceil, z1], [bay.ceil, z0]], bay.a0, bay.a1, 0.41 + 0.03 * k++);
      }
      group = [];
    };
    for (const s of segs) {
      if (s.z1 <= lo || s.z0 >= hi) continue;
      const most = s.inner ? s.inner[a] : Math.max(s.from[a], s.to[a]);
      if (most >= bay.ceil - 0.05) { flush(); continue; }
      const z0 = Math.max(lo, s.z0), z1 = Math.min(hi, s.z1);
      group.push([innerAt(s, z0), z0], [innerAt(s, z1), z1]);
    }
    flush();
  }
  // The floor under the bay, with a gap in it for the cable to leave by.
  const floor = clip(P2, p => p[0] - bay.floor);
  if (bay.notch) {
    const nz = Math.min(bay.zb, Math.max(...P2.map(p => p[1])));
    piece(floor, bay.a0, bay.notch.a0, 0.23);
    piece(floor, bay.notch.a1, bay.a1, 0.23);
    piece(clip(floor, p => bay.notch.z0 - p[1]), bay.notch.a0, bay.notch.a1, 0.17);
    piece(clip(floor, p => p[1] - nz), bay.notch.a0, bay.notch.a1, 0.13);
  } else piece(floor, bay.a0, bay.a1, 0.23);
  return shells;
}

/* ---------- the lantern ---------- */

/**
 * Four pictures round a square, standing in the slots of four corner posts on
 * a base, with a ring on top. The base has an opening in its floor for a
 * cable or a tea light's switch; any light that fits inside will do.
 */
export function lantern(o) {
  const W = o.width, H = o.height, T = o.maxThickness, f = (FITS[o.fit] || FITS.standard).clear;
  const e = Math.max(2, Math.min(4, o.border));          // how far each edge sits in its slot
  const g = (T + 2 * f + 0.1) / 2;                        // half a slot
  const s = W / 2 + 0.5 + f + RIB + g;                    // the distance from the middle to each picture
  const wall = 2.2, L = W / 2 - e, R = s + g + wall, FL = 2.4;
  const reach = W / 2 + 0.5 + f;
  // One post, front-right: open slots for the front picture (from the left) and the right one (from above).
  const post = [[L, -R], [R, -R], [R, -L], [s + g, -L], [s + g, -reach], [s - g, -reach], [s - g, -L], [L, -L],
    [L, -s + g], [reach, -s + g], [reach, -s - g], [L, -s - g]];
  const turn = (poly, q) => poly.map(([x, y]) => [[x, y], [-y, x], [-x, -y], [y, -x]][q]);
  const square = () => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: sx * s, y: sy * s, ux: sx, uy: sy }));
  const groove = e;
  const ringProfile = inner => [[inner, inner, 0], [R - s, R - s, 0], [R - s, R - s, FL + groove], [g, g, FL + groove], [g, g, FL],
    [-g, -g, FL], [-g, -g, FL + groove], [-g - 2, -g - 2, FL + groove], ...(inner < -g - 2 ? [[-g - 2, -g - 2, FL], [inner, inner, FL]] : [])];
  const hole = Math.min(18, s - 12);
  const base = axisSweep(square(), ringProfile(-(s - hole)), true);
  const postTop = FL + H + 0.3 - groove;               // under the top ring
  // Posts stand on the floor, not the rim, so nothing of them overhangs the groove.
  const posts = [0, 1, 2, 3].map(q => {
    const m = extrude(turn(post, q), postTop - (FL - 0.5));
    for (let i = 2; i < m.vertices.length; i += 3) m.vertices[i] += FL - 0.5;
    return m;
  });
  const place = ([x, y, z]) => [x, y + s - T / 2, z - FL];
  const baseMesh = finish(merge(base, ...posts), { place, shells: 5 });
  // The top ring is the base without a floor, printed groove-up and turned over to sit on the pictures.
  const ring = axisSweep(square(), ringProfile(-g - 2), true);
  const topZ = FL + H + 0.3 + FL;
  const top = finish(ring, { place: ([x, y, z]) => place([x, -y, topZ - z]) });
  const span = 2 * R;
  return {
    parts: [{ id: 'base', name: 'Lantern base and posts', mesh: baseMesh }, { id: 'top', name: 'Lantern top', mesh: top }],
    pane: { s, count: 4 },
    ghosts: [1, 2, 3].map(q => ({ kind: 'pane', mesh: (() => {
      const m = block(-W / 2, W / 2, -s - T / 2, -s + T / 2, FL, FL + H);
      const v = m.vertices;
      for (let i = 0; i < v.length; i += 3) { const [x, y] = turn([[v[i], v[i + 1]]], q)[0]; v[i] = x; v[i + 1] = y; }
      return finish(orient(m), { place });
    })() })),
    notes: `A ${span.toFixed(0)} mm square lantern, ${(topZ + 0).toFixed(0)} mm tall, for four ${W.toFixed(1)} × ${H.toFixed(1)} mm pictures. Slide each picture down between two posts (bumpy side out) into the groove in the base, then press the top ring on. A puck light, LED tea light or small LED bulb goes inside — LEDs only, never a real flame — and its warmth rises out of the open top; the opening in the floor takes a cable or reaches a tea light's switch. Fill the other three sides with more photos or a pattern (step 01, “Or start from a pattern”), each downloaded at this same size. Print the base with its posts standing (slowly, for the tall posts) and the top ring as it arrives — no supports.`,
  };
}
