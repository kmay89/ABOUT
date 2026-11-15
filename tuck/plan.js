/**
 * Tuck — the plan of a fold-up box. Inside width W × depth D × height H;
 * a sheet of thickness t printed flat with the hinge grooves on top, so
 * every panel folds up toward the top side and the first layer becomes
 * the outside. The base sits in the middle; the front, back, left and
 * right walls hinge on its four edges; the front and back walls carry a
 * corner flap at each end that folds inward against the side wall, and
 * each flap ends in a tongue (hinged by a groove cut from below, so it
 * folds the other way) that passes out through a slot in the side wall
 * and locks the corner. The lid hinges on the back wall, covers the walls
 * with its extra width, and ends in a tuck flap that drops inside the
 * front wall; a thumb notch in the front wall's top edge lifts it.
 * Everything here is numbers and outlines: no DOM.
 */
import { rect, circle, heart, star, notch, cw, signedArea } from './geometry.js';

export const HINGES = Object.freeze([
  { id: 'pla', name: 'PLA', blurb: 'Folds a handful of times; fold slowly, warm hands help.', groove: 2.0, residual: 0.6 },
  { id: 'petg', name: 'PETG', blurb: 'Hundreds of folds; the best all-round choice.', groove: 1.6, residual: 0.5 },
  { id: 'tpu', name: 'TPU / flex', blurb: 'A box you can fold flat and back forever; softer walls.', groove: 1.2, residual: 0.8 },
]);
export const WINDOWS = Object.freeze([
  { id: 'none', name: 'None' }, { id: 'circle', name: 'Circle' }, { id: 'heart', name: 'Heart' }, { id: 'star', name: 'Star' }, { id: 'rounded', name: 'Rounded square' },
]);

export const DEFAULTS = Object.freeze({
  width: 80, depth: 60, height: 40, thickness: 1.2, hinge: 'petg', groove: null, residual: null,
  lid: true, tuckDepth: null, notch: true, notchRadius: 8, corner: 3, clearance: 0.3,
  flap: 10, tongueWidth: null, tongueLength: null, fit: 0.2, window: 'none', windowSize: 24,
});

/** Resolve the options into the numbers the plan uses. */
export function resolve(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const hinge = HINGES.find(h => h.id === o.hinge) || HINGES[1];
  const g = o.groove ?? hinge.groove, hr = Math.min(o.residual ?? hinge.residual, o.thickness - 0.2);
  const t = o.thickness, c = o.clearance;
  const W = Math.max(20, o.width), D = Math.max(20, o.depth), H = Math.max(10, o.height);
  const flap = Math.min(o.flap, D / 2 - g - 1);
  const tw = Math.min(o.tongueWidth ?? Math.min(14, H * 0.45), H - 2 * (o.corner + c) - 2);
  const tl = o.tongueLength ?? t + 2;
  const F = Math.min(o.tuckDepth ?? Math.max(8, H * 0.6), H - 2);
  const r = Math.max(0, Math.min(o.corner, 6));
  return { ...o, W, D, H, t, g, hr, c, flap, tw, tl, F, r, hingeName: hinge.name };
}

/**
 * The plan: { regions, panels, slots, notch, window, lid, bounds, size,
 * area, volume, warnings, p (the resolved numbers) }. Regions tile the
 * sheet; panels carry the fold hierarchy for the 3D view.
 */
export function planBox(options = {}) {
  const p = resolve(options);
  const { W, D, H, t, g, hr, c, flap: f, tw, tl, F, r } = p;
  const regions = [], panels = [], slots = [];
  const panel = (id, ring, { holes = [], parent = null, axis = null, at = 0, dir = 1, rectBox } = {}) => {
    regions.push({ id, z0: 0, z1: t, ring, holes });
    panels.push({ id, parent, axis, at, dir, ...rectBox });
  };
  const topGroove = (id, x0, y0, x1, y1) => regions.push({ id, z0: 0, z1: hr, ring: rect(x0, y0, x1, y1), holes: [], groove: true, axis: (x1 - x0) > (y1 - y0) ? 'x' : 'y' });
  const bottomGroove = (id, x0, y0, x1, y1) => regions.push({ id, z0: t - hr, z1: t, ring: rect(x0, y0, x1, y1), holes: [], groove: true, below: true, axis: (x1 - x0) > (y1 - y0) ? 'x' : 'y' });
  const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

  // the base
  panel('base', rect(0, 0, W, D), { rectBox: box(0, 0, W, D) });

  // the front wall, with its thumb notch at the top (free) edge, hinged on the base's front edge
  let front = rect(0, -g - H, W, -g, [r, r, 0, 0]);
  if (p.lid && p.notch) front = notch(front, W / 2, -g - H, Math.min(p.notchRadius, W / 4, H / 2), true);
  topGroove('hinge-front', 0, -g, W, 0);
  panel('front', front, { parent: 'base', axis: 'x', at: 0, dir: 1, rectBox: box(0, -g - H, W, -g) });

  // the back wall, hinged on the base's back edge
  topGroove('hinge-back', 0, D, W, D + g);
  panel('back', rect(0, D + g, W, D + g + H, p.lid ? [0, 0, 0, 0] : [0, 0, r, r]), { parent: 'base', axis: 'x', at: D, dir: 1, rectBox: box(0, D + g, W, D + g + H) });

  // the side walls, with a slot for each corner tongue
  const ys = f + g + t / 2;                                        // where a tongue's plane meets the side wall, from its hinge edge
  const slotRings = (x0, x1) => {
    const sx0 = -g - H / 2 - tw / 2 - p.fit, sx1 = -g - H / 2 + tw / 2 + p.fit, half = t / 2 + p.fit;
    const sl = [rect(sx0, ys - half, sx1, ys + half, [half, half, half, half], 4), rect(sx0, D - ys - half, sx1, D - ys + half, [half, half, half, half], 4)];
    const shift = x0 === -g - H ? 0 : (x1 - (-g));                // the right wall mirrors the left: shift x by its span
    return sl.map(ring => cw(ring.map(q => ({ x: x0 === -g - H ? q.x : (W + g) + (-g - q.x), y: q.y }))));
  };
  const leftSlots = slotRings(-g - H, -g), rightSlots = slotRings(W + g, W + g + H);
  for (const [side, rings] of [['left', leftSlots], ['right', rightSlots]]) for (const ring of rings) slots.push({ side, ring });
  topGroove('hinge-left', -g, 0, 0, D);
  panel('left', rect(-g - H, 0, -g, D, [r, 0, 0, r]), { holes: leftSlots, parent: 'base', axis: 'y', at: 0, dir: 1, rectBox: box(-g - H, 0, -g, D) });
  topGroove('hinge-right', W, 0, W + g, D);
  panel('right', rect(W + g, 0, W + g + H, D, [0, r, r, 0]), { holes: rightSlots, parent: 'base', axis: 'y', at: W, dir: 1, rectBox: box(W + g, 0, W + g + H, D) });

  // corner flaps on the front and back walls, each with a tongue folding the other way
  const e = r + c;
  const corner = (wall, sideSign, y0, y1) => {
    const ym = (y0 + y1) / 2, mirror = x => (sideSign < 0 ? x : W - x);   // sideSign -1: left of the wall, +1: right
    const X = (x0, x1) => (sideSign < 0 ? [x0, x1] : [mirror(x1), mirror(x0)]);
    const id = `${wall}-${sideSign < 0 ? 'left' : 'right'}`;
    let [a, b] = X(-g, 0); topGroove(`hinge-${id}`, a, y0, b, y1);
    [a, b] = X(-g - f, -g);
    const flapRadii = sideSign < 0 ? [Math.min(r, (y1 - y0 - tw) / 2 - 0.5), 0, 0, Math.min(r, (y1 - y0 - tw) / 2 - 0.5)] : [0, Math.min(r, (y1 - y0 - tw) / 2 - 0.5), Math.min(r, (y1 - y0 - tw) / 2 - 0.5), 0];
    panel(id, rect(a, y0, b, y1, flapRadii), { parent: wall, axis: 'y', at: sideSign < 0 ? 0 : W, dir: 1, rectBox: box(a, y0, b, y1) });
    [a, b] = X(-g - f - g, -g - f); bottomGroove(`hinge-${id}-tongue`, a, ym - tw / 2, b, ym + tw / 2);
    [a, b] = X(-g - f - g - tl, -g - f - g);
    const tr = Math.min(r, tw / 2 - 0.5, tl - 0.5);
    panel(`${id}-tongue`, rect(a, ym - tw / 2, b, ym + tw / 2, sideSign < 0 ? [tr, 0, 0, tr] : [0, tr, tr, 0]), { parent: id, axis: 'y', at: sideSign < 0 ? -g - f - g / 2 : W + g + f + g / 2, dir: -1, rectBox: box(a, ym - tw / 2, b, ym + tw / 2) });
  };
  corner('front', -1, -g - H + e, -g - c); corner('front', 1, -g - H + e, -g - c);
  corner('back', -1, D + g + c, D + g + H - e); corner('back', 1, D + g + c, D + g + H - e);

  // the lid and its tuck flap
  let lid = null, window = null;
  if (p.lid) {
    const L = D + t + c, y0 = D + 2 * g + H, y1 = y0 + L;
    topGroove('hinge-lid', 0, D + g + H, W, y0);
    const holes = [];
    if (p.window !== 'none') {
      const s = Math.min(p.windowSize, W - 2 * (t + 6), L - 12), cx = W / 2, cy = y0 + L / 2;
      const ring = p.window === 'circle' ? circle(cx, cy, s / 2) : p.window === 'heart' ? heart(cx, cy, s) : p.window === 'star' ? star(cx, cy, s / 2) : rect(cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2, [s / 6, s / 6, s / 6, s / 6]);
      holes.push(cw(ring)); window = { shape: p.window, size: s, ring: holes[0] };
    }
    panel('lid', rect(-t, y0, W + t, y1, [0, 0, r, r]), { holes, parent: 'back', axis: 'x', at: D + g + H + g / 2, dir: 1, rectBox: box(-t, y0, W + t, y1) });
    topGroove('hinge-tuck', t + c, y1, W - t - c, y1 + g);
    panel('tuck', rect(t + c, y1 + g, W - t - c, y1 + g + F, [0, 0, r, r]), { parent: 'lid', axis: 'x', at: y1 + g / 2, dir: 1, rectBox: box(t + c, y1 + g, W - t - c, y1 + g + F) });
    lid = { x0: -t, y0, x1: W + t, y1, length: L, tuck: { x0: t + c, y0: y1 + g, x1: W - t - c, y1: y1 + g + F } };
  }

  // the sheet's extent, area and volume
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, volume = 0, area = 0;
  for (const rg of regions) {
    for (const q of rg.ring) { if (q.x < minX) minX = q.x; if (q.x > maxX) maxX = q.x; if (q.y < minY) minY = q.y; if (q.y > maxY) maxY = q.y; }
    const a = signedArea(rg.ring) + rg.holes.reduce((s, h) => s + signedArea(h), 0);
    area += a; volume += a * (rg.z1 - rg.z0);
  }
  const warnings = [];
  if (tw < 6) warnings.push('The box is so low that the locking tongues are under 6 mm wide; they will hold, but gently.');
  if (hr > t * 0.6) warnings.push('The hinge leaves more than half the sheet: it will be stiff. A thinner residual folds easier.');
  if (p.window !== 'none' && lid && window.size < 8) warnings.push('The window is tiny on a lid this small.');
  return {
    regions, panels, slots, lid, window, front: { x0: 0, y0: -g - H, x1: W, y1: -g }, p,
    bounds: { min: [minX, minY], max: [maxX, maxY] }, size: [maxX - minX, maxY - minY], area, volume, warnings,
    notch: p.lid && p.notch ? { cx: W / 2, y: -g - H, r: Math.min(p.notchRadius, W / 4, H / 2) } : null,
  };
}

/** The axis-aligned rectangle where a name can go on a panel's first layer, inset by a margin, and how the letters should face. */
export function namePlace(plan, where = 'lid') {
  const { t } = plan.p, m = 4;
  if (where === 'lid' && plan.lid) {
    const l = plan.lid, w = plan.window;
    // with a window, the name sits in the band between the window and the tuck edge
    const y1 = w ? Math.min(l.y1 - m, l.y0 + l.length / 2 - w.size / 2 - 3) : l.y1 - m;
    return { x0: l.x0 + m + t, y0: l.y0 + m, x1: l.x1 - m - t, y1, up: -1 }; // flipped top to bottom: the lid turns over the back (y → -y), so this reads right from above once closed
  }
  const f = plan.front;
  return { x0: f.x0 + m, y0: f.y0 + m + (plan.notch ? plan.notch.r * 0.6 : 0), x1: f.x1 - m, y1: f.y1 - m, up: 1 };   // on the front wall the letters stand up the wall: tops toward -y... the wall's top edge is at y0, so tops toward -y
}

/* ---------- folding ---------- */

const mul = (A, B) => {   // 3×4 affine matrices as [r0, r1, r2] rows of 4
  const out = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { let v = 0; for (let k = 0; k < 3; k++) v += A[i][k] * B[k][j]; if (j === 3) v += A[i][3]; out[i][j] = v; }
  return out;
};
const translate = (x, y, z) => [[1, 0, 0, x], [0, 1, 0, y], [0, 0, 1, z]];
const rotX = a => [[1, 0, 0, 0], [0, Math.cos(a), -Math.sin(a), 0], [0, Math.sin(a), Math.cos(a), 0]];
const rotY = a => [[Math.cos(a), 0, Math.sin(a), 0], [0, 1, 0, 0], [-Math.sin(a), 0, Math.cos(a), 0]];
export const applyM = (M, [x, y, z]) => [M[0][0] * x + M[0][1] * y + M[0][2] * z + M[0][3], M[1][0] * x + M[1][1] * y + M[1][2] * z + M[1][3], M[2][0] * x + M[2][1] * y + M[2][2] * z + M[2][3]];

/**
 * The world transform of every panel at a fold `fraction` (0 flat, 1
 * closed), as a 3×4 matrix that maps sheet coordinates to space. A child
 * turns about its hinge line in its parent's already-folded frame, rising
 * toward the top of the print (dir +1) or folding under it (dir −1).
 */
export function foldTransforms(plan, fraction = 1) {
  const M = {}, byId = Object.fromEntries(plan.panels.map(p => [p.id, p]));
  const angle = (Math.PI / 2) * fraction;
  const of = id => {
    if (M[id]) return M[id];
    const p = byId[id];
    if (!p.parent) return (M[id] = translate(0, 0, 0));
    const parent = of(p.parent);
    const below = p.axis === 'x' ? (p.y0 + p.y1) / 2 < p.at : (p.x0 + p.x1) / 2 < p.at;
    // about x: a panel on the -y side rises with a negative turn; about y: a panel on the -x side rises with a positive turn
    const sign = (p.axis === 'x' ? (below ? -1 : 1) : (below ? 1 : -1)) * p.dir;
    const pivot = p.axis === 'x' ? translate(0, p.at, 0) : translate(p.at, 0, 0), back = p.axis === 'x' ? translate(0, -p.at, 0) : translate(-p.at, 0, 0);
    const R = p.axis === 'x' ? rotX(sign * angle) : rotY(sign * angle);
    return (M[id] = mul(parent, mul(pivot, mul(R, back))));
  };
  for (const p of plan.panels) of(p.id);
  return M;
}

/** Where a panel's centre (at mid-thickness) ends up when folded. */
export function foldedCentre(plan, M, id) {
  const p = plan.panels.find(x => x.id === id);
  return applyM(M[id], [(p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, plan.p.t / 2]);
}
