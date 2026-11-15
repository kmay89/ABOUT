/**
 * Tuck — the die-line. The sheet's outline and holes as cut lines, the
 * hinges as dashed fold lines, in an SVG in millimetres (y up on the
 * page), fit for a laser cutter or a scalpel and a sheet of card.
 */
import { splitSharedEdges } from './geometry.js';

const key = (q) => `${Math.round(q.x * 1000)},${Math.round(q.y * 1000)}`;

/** The cut polylines (closed loops) and fold segments of a plan. */
export function dielinePaths(plan) {
  const regions = splitSharedEdges(plan.regions);
  const owner = new Map();
  regions.forEach((r, i) => { for (const ring of [r.ring, ...r.holes]) for (let k = 0; k < ring.length; k++) owner.set(key(ring[k]) + '|' + key(ring[(k + 1) % ring.length]), i); });
  // cut edges: those with no reverse; chained into loops
  const next = new Map();
  regions.forEach(r => { for (const ring of [r.ring, ...r.holes]) for (let k = 0; k < ring.length; k++) { const a = ring[k], b = ring[(k + 1) % ring.length]; if (!owner.has(key(b) + '|' + key(a))) next.set(key(a), { a, b }); } });
  const loops = [], used = new Set();
  for (const [k, e] of next) {
    if (used.has(k)) continue;
    const loop = []; let cur = e, kk = k;
    while (cur && !used.has(kk)) { used.add(kk); loop.push(cur.a); kk = key(cur.b); cur = next.get(kk); }
    if (loop.length > 2) loops.push(loop);
  }
  const folds = plan.regions.filter(r => r.groove).map(r => {
    const xs = r.ring.map(q => q.x), ys = r.ring.map(q => q.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    return r.axis === 'x' ? { a: { x: x0, y: (y0 + y1) / 2 }, b: { x: x1, y: (y0 + y1) / 2 }, below: !!r.below } : { a: { x: (x0 + x1) / 2, y: y0 }, b: { x: (x0 + x1) / 2, y: y1 }, below: !!r.below };
  });
  return { loops, folds };
}

export function dielineSVG(plan, { title = 'Tuck box' } = {}) {
  const { loops, folds } = dielinePaths(plan);
  const [w, h] = plan.size, mx = plan.bounds.min[0], my = plan.bounds.min[1], pad = 5;
  const X = x => (x - mx + pad).toFixed(3), Y = y => (h - (y - my) + pad).toFixed(3);
  const cut = loops.map(l => 'M' + l.map(q => `${X(q.x)} ${Y(q.y)}`).join(' L') + ' Z').join(' ');
  const foldUp = folds.filter(f => !f.below).map(f => `M${X(f.a.x)} ${Y(f.a.y)} L${X(f.b.x)} ${Y(f.b.y)}`).join(' ');
  const foldDown = folds.filter(f => f.below).map(f => `M${X(f.a.x)} ${Y(f.a.y)} L${X(f.b.x)} ${Y(f.b.y)}`).join(' ');
  const W = (w + 2 * pad).toFixed(2), H = (h + 2 * pad).toFixed(2);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">
<title>${title.replace(/[<&]/g, '')}</title>
<desc>Cut on the solid lines; valley-fold on the dashed lines (toward you, the print's top side); mountain-fold on the dotted lines. Millimetres.</desc>
<g fill="none" stroke-linejoin="round" stroke-linecap="round">
<path d="${cut}" stroke="#000" stroke-width="0.25"/>
<path d="${foldUp}" stroke="#c00" stroke-width="0.25" stroke-dasharray="2 1.5"/>
<path d="${foldDown}" stroke="#06c" stroke-width="0.25" stroke-dasharray="0.5 1"/>
</g>
</svg>
`;
}
