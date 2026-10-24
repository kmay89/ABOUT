import test from 'node:test';
import assert from 'node:assert/strict';
const P = await import('../plan.js');
const G = await import('../geometry.js');
const M = await import('../../knurl/mesh.js');
const D = await import('../dieline.js');
const I = await import('../inlay.js');

const closedWithVolume = (plan) => {
  const mesh = G.sheetMesh(plan.regions), w = M.watertight(mesh);
  assert.ok(w.closed, `closed (${w.boundaryEdges} open, ${w.nonManifoldEdges} non-manifold, ${w.inconsistentEdges} flipped)`);
  const vol = M.signedVolume(mesh);
  assert.ok(Math.abs(vol - plan.volume) < 1e-6 * Math.max(1, plan.volume), `volume ${vol} = ${plan.volume}`);
  return mesh;
};

test('the default box is one closed sheet whose volume is the sum of its regions, and it fits a 256 mm plate', () => {
  const plan = P.planBox({});
  const mesh = closedWithVolume(plan);
  assert.ok(plan.size[0] < 256 && plan.size[1] < 256, `sheet ${plan.size}`);
  assert.equal(plan.panels.length, 15);
  assert.ok(plan.regions.filter(r => r.groove).length === 14, 'fourteen hinges: four walls, four flaps, four tongues, lid, tuck');
  assert.ok(plan.regions.filter(r => r.below).length === 4, 'the four tongue hinges are cut from below');
  const b = M.bounds(mesh);
  assert.ok(Math.abs(b.min[2]) < 1e-6 && Math.abs(b.max[2] - 1.2) < 1e-6, 'the sheet is 1.2 mm thick on the plate');
  assert.deepEqual(plan.warnings, []);
});

test('every lid, window, hinge and size variant stays closed', () => {
  for (const opts of [{ lid: false }, { window: 'circle' }, { window: 'heart' }, { window: 'star', hinge: 'pla' }, { window: 'rounded', hinge: 'tpu' }, { notch: false }, { corner: 0 },
    { width: 150, depth: 120, height: 60, thickness: 1.6 }, { width: 30, depth: 30, height: 15 }, { width: 40, depth: 100, height: 25, thickness: 0.8 }]) {
    const plan = P.planBox(opts);
    closedWithVolume(plan);
    for (const r of plan.regions) for (const ring of [r.ring, ...r.holes]) for (let i = 0; i < ring.length; i++) { const a = ring[i], c = ring[(i + 1) % ring.length]; assert.ok(Math.hypot(a.x - c.x, a.y - c.y) > 1e-9, `${r.id} has no repeated point`); }
  }
});

test('the tongues meet their slots: a slot sits where the folded tongue plane crosses the side wall, as wide as the sheet plus the fit', () => {
  const plan = P.planBox({ width: 80, depth: 60, height: 40, thickness: 1.2, fit: 0.2 });
  const { t, g, flap, tw, fit, H, D } = plan.p;
  const ys = flap + g + t / 2;
  for (const slot of plan.slots) {
    const xs = slot.ring.map(q => q.x), ys_ = slot.ring.map(q => q.y);
    const w = Math.max(...ys_) - Math.min(...ys_), h = Math.max(...xs) - Math.min(...xs);
    assert.ok(Math.abs(w - (t + 2 * fit)) < 1e-6, `slot width ${w} = sheet + fit`);
    assert.ok(Math.abs(h - (tw + 2 * fit)) < 1e-6, `slot height ${h} = tongue + fit`);
    const cy = (Math.max(...ys_) + Math.min(...ys_)) / 2;
    assert.ok(Math.abs(cy - ys) < 1e-6 || Math.abs(cy - (D - ys)) < 1e-6, `slot at ${cy} from the wall's hinge edge`);
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
    assert.ok(Math.abs(Math.abs(cx - (slot.side === 'left' ? -g : plan.p.W + g)) - H / 2) < 1e-6, 'slot at mid height of the wall');
  }
  // the tongue is as wide as the slot less the fit, and longer than the sheet is thick
  const tongue = plan.panels.find(p => p.id === 'front-left-tongue');
  assert.ok(Math.abs((tongue.y1 - tongue.y0) - tw) < 1e-6);
  assert.ok(tongue.x1 - tongue.x0 > t);
  assert.equal(tongue.dir, -1, 'the tongue folds the other way');
  assert.equal(plan.panels.find(p => p.id === 'front-left').dir, 1);
});

test('the fold hierarchy is a tree rooted at the base with the hinges where the grooves are', () => {
  const plan = P.planBox({});
  const byId = Object.fromEntries(plan.panels.map(p => [p.id, p]));
  for (const p of plan.panels) {
    if (p.id === 'base') { assert.equal(p.parent, null); continue; }
    assert.ok(byId[p.parent], `${p.id} hangs off ${p.parent}`);
    const groove = plan.regions.find(r => r.id === `hinge-${p.id}`);
    assert.ok(groove, `${p.id} has a hinge groove`);
    const xs = groove.ring.map(q => q.x), ys = groove.ring.map(q => q.y);
    if (p.axis === 'x') assert.ok(p.at >= Math.min(...ys) - 1e-6 && p.at <= Math.max(...ys) + 1e-6, `${p.id} hinge line inside its groove`);
    else assert.ok(p.at >= Math.min(...xs) - 1e-6 && p.at <= Math.max(...xs) + 1e-6, `${p.id} hinge line inside its groove`);
  }
  assert.equal(byId.lid.parent, 'back'); assert.equal(byId.tuck.parent, 'lid'); assert.equal(byId['back-right-tongue'].parent, 'back-right');
});

test('the lid covers the walls and the tuck flap fits inside the front wall between the corner flaps', () => {
  const plan = P.planBox({ width: 80, depth: 60, height: 40 });
  const { W, D, t, c, H } = plan.p;
  assert.ok(Math.abs((plan.lid.x1 - plan.lid.x0) - (W + 2 * t)) < 1e-6, 'lid width = inside + two walls');
  assert.ok(plan.lid.length >= D + t, 'lid reaches over the front wall');
  const tk = plan.lid.tuck;
  assert.ok(tk.x0 >= t + c - 1e-6 && tk.x1 <= W - t - c + 1e-6, 'tuck flap clears the corner flaps');
  assert.ok(tk.y1 - tk.y0 < H, 'tuck flap shorter than the wall');
  assert.ok(plan.notch && plan.notch.r > 0, 'a thumb notch');
  const place = P.namePlace(plan, 'lid');
  assert.ok(place.x0 > plan.lid.x0 && place.x1 < plan.lid.x1 && place.y0 > plan.lid.y0 && place.y1 < plan.lid.y1 && place.up === -1);
  const withWindow = P.planBox({ window: 'heart' });
  const pw = P.namePlace(withWindow, 'lid');
  assert.ok(pw.y1 < withWindow.lid.y0 + withWindow.lid.length / 2 - withWindow.window.size / 2, 'with a window the name sits below it');
});

test('the die-line has one outer loop plus a loop per hole, and a fold per hinge', () => {
  const plan = P.planBox({ window: 'circle' });
  const { loops, folds } = D.dielinePaths(plan);
  assert.equal(loops.length, 1 + 4 + 1, 'outline, four slots, one window');
  assert.equal(folds.length, 14);
  assert.equal(folds.filter(f => f.below).length, 4);
  const svg = D.dielineSVG(plan);
  assert.match(svg, /^<\?xml/);
  assert.match(svg, /<svg [^>]*width="[\d.]+mm"/);
  assert.equal((svg.match(/<path /g) || []).length, 3);
  // the outer loop encloses the sheet's extent
  const outer = loops.reduce((a, b) => (Math.abs(G.signedArea(a)) > Math.abs(G.signedArea(b)) ? a : b));
  const xs = outer.map(q => q.x), ys = outer.map(q => q.y);
  assert.ok(Math.abs(Math.max(...xs) - Math.min(...xs) - plan.size[0]) < 1e-6 && Math.abs(Math.max(...ys) - Math.min(...ys) - plan.size[1]) < 1e-6);
});

test('the footprint matches the sheet, a name is placed in the lid the right way up, and the inlay is a closed solid', () => {
  const plan = P.planBox({});
  const fp = I.footprint(plan);
  let n = 0; for (const v of fp.data) n += v;
  assert.ok(Math.abs(n * fp.cell * fp.cell - plan.area) / plan.area < 0.01, 'footprint area within a percent');
  // a raster with only its top-left quarter set
  const raster = { width: 40, height: 20, data: new Uint8Array(800) };
  for (let y = 10; y < 20; y++) for (let x = 0; x < 20; x++) raster.data[y * 40 + x] = 1;
  const place = P.namePlace(plan, 'lid');
  const g = I.placeRaster(fp, raster, place);
  assert.ok(g.count > 100);
  // with up = -1 the raster is flipped top to bottom: its top-left lands bottom-left of the place...
  let sx = 0, sy = 0, c = 0;
  for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) if (g.data[y * g.width + x]) { sx += fp.x0 + (x + 0.5) * fp.cell; sy += fp.y0 + (y + 0.5) * fp.cell; c++; }
  const cx = (place.x0 + place.x1) / 2, cy = (place.y0 + place.y1) / 2;
  assert.ok(sx / c < cx && sy / c < cy, `centroid (${(sx / c).toFixed(1)}, ${(sy / c).toFixed(1)}) is left of and below the place centre (${cx.toFixed(1)}, ${cy.toFixed(1)})`);
  // ...and once the lid is folded closed, that quarter sits top-left as seen from above at the front (+x right, +y away)
  const MF = P.foldTransforms(plan, 1);
  const folded = P.applyM(MF.lid, [sx / c, sy / c, 0]), lidCentre = P.foldedCentre(plan, MF, 'lid');
  assert.ok(folded[0] < lidCentre[0] && folded[1] > lidCentre[1], `folded (${folded.map(v => v.toFixed(1))}) is left of and behind the lid centre (${lidCentre.map(v => v.toFixed(1))})`);
  const solid = I.inlaySolid(g, { layers: 2 });
  assert.ok(M.watertight(solid.mesh).closed);
  assert.ok(Math.abs(M.signedVolume(solid.mesh) - solid.count * fp.cell * fp.cell * (solid.height + 0.02)) < 1e-6 * solid.count);
  const pat = I.patternRaster(fp, (u, v) => (Math.floor(u / 6) + Math.floor(v / 6)) & 1);
  assert.ok(pat.count > n * 0.3 && pat.count < n * 0.7, 'a checkerboard covers about half');
  assert.ok(M.watertight(I.inlaySolid(pat).mesh).closed);
});

test('folded closed, the walls stand, the lid lies on top, the flaps lie against the side walls and the tongues come out through their slots', () => {
  const plan = P.planBox({ width: 80, depth: 60, height: 40 });
  const { W, D, H, t, g, flap, tw } = plan.p;
  const M = P.foldTransforms(plan, 1), at = id => P.foldedCentre(plan, M, id);
  const near = (a, b, tol = g + t) => Math.abs(a - b) <= tol;
  const base = at('base'); assert.ok(near(base[2], t / 2, 1e-9));
  const front = at('front'); assert.ok(near(front[1], 0) && near(front[2], H / 2 + g) && near(front[0], W / 2, 1e-6), `front ${front}`);
  const back = at('back'); assert.ok(near(back[1], D) && near(back[2], H / 2 + g), `back ${back}`);
  const left = at('left'); assert.ok(near(left[0], 0) && near(left[2], H / 2 + g), `left ${left}`);
  const right = at('right'); assert.ok(near(right[0], W) && near(right[2], H / 2 + g), `right ${right}`);
  const lid = at('lid'); assert.ok(near(lid[2], H + 2 * g, 2 * t) && near(lid[1], D / 2, 2 * g + t) && near(lid[0], W / 2, 1e-6), `lid ${lid}`);
  const tuck = at('tuck'); assert.ok(near(tuck[1], 0, 2 * g + 2 * t) && tuck[2] < lid[2] && tuck[2] > 0, `tuck flap hangs inside the front: ${tuck}`);
  // the front-left flap lies against the left wall's inside, a flap width into the box
  const fl = at('front-left'); assert.ok(near(fl[0], 0, g + t) && near(fl[1], flap / 2, g + t) && near(fl[2], H / 2 + g, 2 * g + t), `flap ${fl}`);
  // its tongue stands outward through the left wall: x just outside, y at the slot's position, z at mid height
  const tongue = at('front-left-tongue'), slot = plan.slots.find(s => s.side === 'left' && s.ring.every(q => q.y < D / 2));
  const sy = slot.ring.reduce((s, q) => s + q.y, 0) / slot.ring.length, sz = -g - slot.ring.reduce((s, q) => s + q.x, 0) / slot.ring.length;
  assert.ok(tongue[0] < 0 && tongue[0] > -(t + 3), `tongue outside the left wall (x ${tongue[0].toFixed(2)})`);
  assert.ok(Math.abs(tongue[1] - sy) < g, `tongue at the slot's distance (${tongue[1].toFixed(2)} vs ${sy.toFixed(2)})`);
  assert.ok(Math.abs(tongue[2] - (sz + g)) < 2 * g + t, `tongue at the slot's height (${tongue[2].toFixed(2)} vs ${(sz + g).toFixed(2)})`);
  const br = at('back-right-tongue'); assert.ok(br[0] > W && br[1] > D / 2, `the back-right tongue comes out of the right wall near the back (${br})`);
  // half folded, everything is above the plate and nothing has crossed to the far side
  const Mh = P.foldTransforms(plan, 0.5);
  for (const p of plan.panels) { const c = P.foldedCentre(plan, Mh, p.id); assert.ok(c[2] > -t, `${p.id} above the plate at half fold`); }
  void tw;
});
