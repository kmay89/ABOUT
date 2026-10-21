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
import { area, triangulate, extrude, orient, merge, finish } from './accessories.js';

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
      const [a, b, c] = ears[0].map(i => id(k, i) * 3), v = vertices;
      const u = [v[b] - v[a], v[b + 1] - v[a + 1], v[b + 2] - v[a + 2]], w = [v[c] - v[a], v[c + 1] - v[a + 1], v[c + 2] - v[a + 2]];
      const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
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

/* ---------- the gallery frame ---------- */

/**
 * @param {object} o width, height, maxThickness, border (the picture);
 *   light: 'board' (a ready-made LED board) or 'own' (a strip or puck light in a hollow);
 *   board [w, h], boardThickness, gap (mm from picture to LEDs), depth (the hollow, for 'own');
 *   storage (spare-picture slots behind the light), cover (a slide-in back), fit, margin (extra border), style.
 *
 * Printability decides the shape as much as looks do. The frame prints face
 * down, so going up the print the inside edge may step outward freely but
 * inward by no more than STEP before it needs a 45° slope: the LED board is
 * wider than the picture, so its slot sits in a wider hollow and is only a
 * millimetre deep, and anything behind it steps back in on a slope. The top
 * of the frame is open behind the front lip; the lid's fins fill it between
 * the slots, printed standing up, so there is no bridge anywhere.
 */
export function galleryFrame(o) {
  const W = o.width, H = o.height, T = o.maxThickness, b = Math.max(1, o.border);
  const f = (FITS[o.fit] || FITS.standard).clear, light = o.light || 'board';
  const storage = Math.max(0, Math.min(8, Math.round(o.storage || 0)));
  const cover = o.cover ?? light === 'own';
  const board = o.board || [120, 156];
  const [bw, bh] = (W > H) === (board[0] > board[1]) ? board : [board[1], board[0]];
  const gap = Math.max(4, o.gap ?? 12), depth = Math.max(10, o.depth ?? 30), bt = o.boardThickness ?? 1;
  const STEP = 2.5;

  const win = -b, rib = -Math.max(0.5, Math.min(1.5, b - 0.5)), bevel = o.style === 'flat' ? 0 : 1.2;
  const gP = 0.5 + f;
  const xy = v => [v, v];
  // Segments front to back: {z0, z1, inner: [x, y]} (or from/to for a slope), and slots with what they hold.
  const segs = [], slots = [];
  let z = 0;
  const band = (t, inner) => { segs.push({ z0: z, z1: z + t, inner }); z += t; };
  const slope = (from, to) => {
    const t = Math.max(0, from[0] - to[0] - STEP, from[1] - to[1] - STEP);
    if (t > 0) { segs.push({ z0: z, z1: z + t, from, to }); z += t; }
  };
  const slot = (kind, t, g, edge) => { const s = { kind, z0: z, z1: z + t, g, edge }; segs.push({ ...s, inner: g }); slots.push(s); z += t; };

  band(LIP, xy(win));
  slot('picture', T + 2 * f + 0.1, xy(gP), [0, 0]);
  band(RIB, xy(rib));
  let last = xy(rib);
  if (light === 'board') {
    const gB = [(bw - W) / 2 + 0.4 + f, (bh - H) / 2 + 0.4 + f];
    if (gB[0] < rib + 1 || gB[1] < rib + 1) {
      throw new RangeError(`This picture is larger than a ${bw} × ${bh} mm board. Choose “my own light”, or a smaller picture.`);
    }
    const hollow = [Math.max(rib, gB[0] - 1), Math.max(rib, gB[1] - 1)];
    band(Math.max(2, gap - RIB), hollow);
    slot('board', bt + 2 * f + 0.5, gB, [(bw - W) / 2, (bh - H) / 2]);
    last = [Math.max(rib, gB[0] - 2.4), Math.max(rib, gB[1] - 2.4)];
    band(BACK, last);
  } else {
    last = xy(0.5);
    band(depth - RIB, last);
  }
  if (storage || cover) { slope(last, xy(rib)); last = xy(rib); }
  for (let i = 0; i < storage; i++) {
    slot('spare', T + 2 * f + 0.1, xy(gP), [0, 0]);
    band(RIB, xy(rib));
  }
  if (cover) {
    const gC = xy(gP + 0.3);                          // shallow enough that the rib behind it steps in under 2.5 mm
    slot('cover', 2 + 2 * f, gC, xy(gP + 0.3 - f - 0.1));
    band(BACK, xy(rib));
  }
  const Z = z;
  const deepest = [0, 1].map(a => Math.max(...segs.map(s => Math.max(...(s.inner ? [s.inner[a]] : [s.from[a], s.to[a]])))));
  const out = Math.max(...deepest) + WALL + Math.max(0, o.margin || 0);   // one border width all round

  // The inside edge, front to back, then the cross-section counter-clockwise.
  const inner = [];
  for (const s of segs) {
    const a = s.inner || s.from, c = s.inner || s.to;
    inner.push([a[0], a[1], s === segs[0] ? bevel : s.z0], [c[0], c[1], s.z1]);
  }
  const P = [[win + bevel, win + bevel, 0], [out, out, 0], [out, out, Z]];
  for (let i = inner.length - 1; i >= 0; i--) {
    const p = inner[i], q = P[P.length - 1];
    if (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1]) + Math.abs(p[2] - q[2]) > 1e-9) P.push(p);
  }
  if (bevel === 0) { P[0] = [win, win, 0]; if (P[P.length - 1][2] === 0) P.pop(); }

  const hw = W / 2, hh = H / 2, yTop = hh + out, xOut = hw + out;
  const sides = axisSweep([
    { x: -hw, y: yTop, ux: -1, uy: 0 }, { x: -hw, y: -hh, ux: -1, uy: -1 },
    { x: hw, y: -hh, ux: 1, uy: -1 }, { x: hw, y: yTop, ux: 1, uy: 0 },
  ], P, false);
  // Across the top, the frame keeps only its front lip; behind it, the top is the lid's.
  const lipBar = remap(extrude(bevel > 0
    ? [[hh + win + bevel, 0], [yTop, 0], [yTop, LIP], [hh + win, LIP], [hh + win, bevel]]
    : [[hh + win, 0], [yTop, 0], [yTop, LIP], [hh + win, LIP]], 2 * xOut), (u, v, w) => [w - xOut, u, v]);
  const preview = ([x, y, zz]) => [x, zz - LIP - f - 0.05 - T, y + hh];
  const frame = finish(merge(sides, lipBar), { place: preview, shells: 2 });

  // The lid: a plate over the top; a fin in each band between the slots, standing where the frame's top
  // would be; a tongue in each end of every slot; and a notch through all of it for a cable.
  const lidT = 2.4, tongue = 0.08, board3d = slots.find(s => s.kind === 'board');
  const cable = board3d ? [board3d.z0 - 4, Z] : [Math.max(LIP + 2, Z - 10), Z];
  const notch = 9;
  const lidParts = [remap(extrude([[-xOut, 0], [xOut, 0], [xOut, Z], [notch, Z], [notch, cable[0]], [-notch, cable[0]], [-notch, Z], [-xOut, Z]], lidT),
    (u, v, w) => [u, yTop + w, v])];
  for (let i = 1; i < segs.length; i++) {
    const s = segs[i];
    if (s.kind) continue;                                         // a slot, not a band
    const ix = s.inner ? s.inner[0] : Math.min(s.from[0], s.to[0]);
    const iy = s.inner ? s.inner[1] : Math.max(s.from[1], s.to[1]);
    const x = hw + ix - f, y0 = hh + iy;
    if (x <= 1 || yTop - y0 < 1) continue;
    // A slope's fin lies inside its neighbours' fins: overlap them a little so the shells share no edge.
    const into = n => !s.inner && n && !n.kind ? 0.2 : 0;
    const z0 = s.z0 - into(segs[i - 1]), z1 = s.z1 + into(segs[i + 1]);
    const cut = z1 > cable[0] + 1e-9 && x > notch + 1;
    for (const [x0, x1] of cut ? [[-x, -notch], [notch, x]] : [[-x, x]]) lidParts.push(block(x0, x1, y0, yTop + 0.5, z0, z1));
  }
  for (const s of slots) {
    const len = Math.min(6, out - s.edge[1] - 0.6);
    if (len < 2) continue;
    for (const side of [-1, 1]) {
      const a = hw + Math.max(rib, s.g[0] - 8), c = hw + s.g[0] - f;
      lidParts.push(block(side < 0 ? -c : a, side < 0 ? -a : c, yTop - len, yTop + 0.5, s.z0 + tongue, s.z1 - tongue));
    }
  }
  // Print the lid plate-down: frame (x, y, z) → print (x, z, top − y).
  const lidTop = yTop + lidT;
  const lid = finish(remap(merge(...lidParts), (x, y, zz) => [x, zz, lidTop - y]), {
    place: ([x, y, zz]) => preview([x, lidTop - zz, y]), shells: lidParts.length,
  });

  const parts = [{ id: 'frame', name: storage ? 'Showcase frame' : 'Gallery frame', mesh: frame },
    { id: 'lid', name: 'Frame lid', mesh: lid }];
  const coverSlot = slots.find(s => s.kind === 'cover');
  if (coverSlot) {
    const cw = hw + coverSlot.g[0] - f - 0.1, ch = hh + coverSlot.g[1] - f - 0.1;
    const outline = [[-cw, -ch], [cw, -ch], [cw, ch], [8, ch], [8, ch - 8], [-8, ch - 8], [-8, ch], [-cw, ch]];
    const plate = extrude(outline, coverSlot.z1 - coverSlot.z0 - 2 * f);
    parts.push({ id: 'cover', name: 'Back cover', mesh: finish(plate, { place: ([x, y, zz]) => preview([x, y, zz + coverSlot.z0 + f]) }) });
  }
  const visible = out - win;
  return {
    parts, out, depth: Z, visibleBorder: visible, slots, profile: P,
    ghosts: board3d ? [{ kind: 'board', mesh: finish(block(-bw / 2, bw / 2, -bh / 2, bh / 2, board3d.z0 + f + 0.25, board3d.z0 + f + 0.25 + bt), { place: preview }) }] : [],
    notes: [
      `A ${(2 * xOut).toFixed(0)} × ${(2 * yTop).toFixed(0)} × ${Z.toFixed(0)} mm frame with an even ${visible.toFixed(1)} mm border round the photo.`,
      light === 'board' ? `Slide the picture into the front slot (bumpy side out), then the ${bw} × ${bh} mm LED board into the slot behind it, LEDs facing the picture, ${gap} mm back so they blend into an even glow. Its USB-C cable leaves through the notch in the lid — if the port is on the bottom edge, turn the board over.`
        : `Slide the picture into the front slot (bumpy side out). An LED strip or puck light goes in the ${depth} mm hollow behind it${coverSlot ? ', and the back cover slides in behind that' : ''}; the cable leaves through the notch in the lid.`,
      storage ? `${storage} more pictures wait in the slots behind the light — lift the lid to swap the one on show.` : '',
      'Press the lid on: its fins and tongues are a close fit, so it stays put but lifts off by hand.',
      'Print the frame face down and the lid flat, both without supports.',
    ].filter(Boolean).join(' '),
  };
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
    notes: `A ${span.toFixed(0)} mm square lantern, ${(topZ + 0).toFixed(0)} mm tall, for four ${W.toFixed(1)} × ${H.toFixed(1)} mm pictures. Slide each picture down between two posts (bumpy side out) into the groove in the base, then press the top ring on. A puck light, LED tea light or small LED bulb goes inside; the opening in the floor takes a cable or reaches a tea light's switch. Fill the other three sides with more photos or a pattern (step 01, “Or start from a pattern”), each downloaded at this same size. Print the base with its posts standing (slowly, for the tall posts) and the top ring as it arrives — no supports.`,
  };
}
