import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMold, pourAxis, castEstimate, MATERIALS, QUALITY } from '../mold.js';
import { SAMPLES, extrude, lathe } from '../samples.js';
import { watertight, bounds, transform, signedVolume, faceNormals } from '../mesh.js';
import { gridFor, signedDistanceField } from '../sdf.js';

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} ± ${tol}, got ${a}`);
const quick = { quality: 'draft' };

/** Does the mold part have material at a point? (checked on the part's own distance field) */
function solidAt(part, points) {
  const b = bounds(part.mesh);
  const grid = gridFor(b.min, b.max, 0.6, 2);
  const { sdf } = signedDistanceField(part.mesh, grid, 1.5);
  return points.map(p => grid.sample(sdf, p[0], p[1], p[2]) < 0);
}

test('a two-part mold of the pebble: two closed halves that meet at the parting plane', () => {
  const r = buildMold(SAMPLES.pebble.make(), quick);
  assert.equal(r.parts.length, 2);
  for (const p of r.parts) { assert.ok(p.closed, p.name); assert.ok(p.volumeMm3 > 0); assert.ok(p.triangles > 100); }
  const [a, b] = r.parts;
  const z = r.analysis.partingZ;
  near(b.bounds.min[2], z, r.h, 'the upper half starts at the parting plane');
  near(a.bounds.max[2], z + r.features.keys.pegs[0].height, r.h, 'the lower half rises by the pegs');
  near(a.bounds.min[2], r.block.min[2], r.h); near(b.bounds.max[2], r.block.max[2], r.h);
  // the halves are about the block's footprint
  near(a.bounds.size[0], r.block.max[0] - r.block.min[0], r.h);
  // a convex pebble parted at its widest has nothing trapped
  assert.equal(r.analysis.trappedFraction, 0);
  assert.equal(r.analysis.mode, 'release');
  assert.equal(r.analysis.vertexClass.length, SAMPLES.pebble.make().positions.length / 3);
  // the automatic plane sits in the pebble's widest band
  const least = Math.min(...r.analysis.partingCurve.map(c => c.trapped));
  const atAuto = r.analysis.partingCurve.reduce((best, c) => Math.abs(c.z - r.analysis.autoPartingZ) < Math.abs(best.z - r.analysis.autoPartingZ) ? c : best);
  near(atAuto.trapped, least, 1e-9, 'the automatic plane traps the least');
  assert.ok(r.analysis.autoPartingZ > 8 && r.analysis.autoPartingZ < 20, 'and sits in the pebble\'s widest band');
  assert.ok(r.features.spout && r.features.spout.volumeMm3 > 0);
  assert.equal(r.features.keys.pegs.length, 3);
  assert.equal(r.features.bands.length, 2);
  assert.equal(r.features.prySlots.length, 2);
  assert.ok(r.cast.volumeMm3 > r.model.volumeMm3);
  // both halves fit together: the cavity plus the mold halves roughly fill the block
  const blockVol = (r.block.max[0] - r.block.min[0]) * (r.block.max[1] - r.block.min[1]) * (r.block.max[2] - r.block.min[2]);
  const partsVol = a.volumeMm3 + b.volumeMm3;
  assert.ok(partsVol < blockVol - r.model.volumeMm3 * 0.9 && partsVol > blockVol * 0.6, `parts ${partsVol} of block ${blockVol}`);
});

test('pegs on A line up with sockets in B, and a socket is wider than its peg', () => {
  const r = buildMold(SAMPLES.pebble.make(), { ...quick, keys: { style: 'cones', diameter: 7, height: 4, clearance: 0.3 } });
  const [a, b] = r.parts;
  const z = r.analysis.partingZ;
  const peg = r.features.keys.pegs[0];
  const [pegSolid, besidePeg] = solidAt(a, [[peg.x, peg.y, z + 1.5], [peg.x + peg.radius + 1.5, peg.y, z + 1.5]]);
  assert.ok(pegSolid, 'the peg rises above the plane on A');
  assert.ok(!besidePeg, 'only the peg rises above the plane');
  const [socketHollow, besideSocket] = solidAt(b, [[peg.x, peg.y, z + 1.5], [peg.x + peg.radius + 1.5, peg.y, z + 1.5]]);
  assert.ok(!socketHollow, 'the socket is hollow in B');
  assert.ok(besideSocket, 'B is solid beside the socket');
  // the empty corner: no peg there, so the halves cannot go on turned round
  const corner = [r.block.max[0] - r.settings.wall / 2, r.block.max[1] - r.settings.wall / 2, z + 1.5];
  assert.ok(!solidAt(a, [corner])[0], 'the fourth corner has no peg');
});

test('the spout leaves the block on the chosen side, and a rail replaces the pegs', () => {
  const r = buildMold(SAMPLES.knob.make(), { ...quick, pourFrom: '-x', keys: { style: 'rail' }, fasteners: 'bolts', wall: 12 });
  const d = pourAxis('-x');
  assert.deepEqual(d, { axis: 0, sign: -1 });
  near(r.features.spout.to[0], r.block.min[0] - 2, 1e-6, 'the spout mouth is on the −X face');
  assert.ok(r.features.spout.from[0] > r.features.spout.to[0]);
  assert.equal(r.features.keys.style, 'rail');
  assert.equal(r.features.keys.pegs.length, 1);
  assert.equal(r.features.bolts.length, 4);
  assert.ok(!r.features.bands);
  for (const p of r.parts) assert.ok(p.closed, p.name);
  const [a] = r.parts;
  const z = r.analysis.partingZ;
  // the spout trough is open in the parting face of A along the −X margin
  const spoutLine = [r.block.min[0] + r.settings.wall / 2, r.features.spout.from[1], z - 0.5];
  assert.ok(!solidAt(a, [spoutLine])[0], 'the spout is cut below the parting face');
  // a bolt hole goes right through
  const bolt = r.features.bolts[0];
  assert.ok(!solidAt(a, [[bolt.x, bolt.y, z - 5]])[0], 'bolt hole through A');
});

test('air vents appear where a pour would trap air', () => {
  // an M-shaped outline: two peaks along +Y with a valley between them, extruded in Z
  const outline = [[-30, 0], [30, 0], [30, 30], [20, 40], [10, 30], [0, 14], [-10, 30], [-20, 40], [-30, 30]];
  const m = extrude(outline, 0, 16);
  const r = buildMold(m, { ...quick, pourFrom: '+y' });
  assert.ok(r.features.airTraps >= 1, `air traps: ${r.features.airTraps}`);
  assert.equal(r.features.vents.length, 1, 'one peak gets the spout, the other a vent');
  const v = r.features.vents[0];
  near(v.to[1], r.block.max[1] + 2, 1e-6, 'the vent reaches the +Y face');
  assert.ok(Math.abs(v.from[0]) > 5 && Math.abs(v.from[0]) < 30, 'the vent starts over one of the peaks');
  for (const p of r.parts) assert.ok(p.closed, p.name);
  // pouring from −Y instead: the flat edge has no second peak, so no vents
  const r2 = buildMold(m, { ...quick, pourFrom: '-y' });
  assert.equal(r2.features.vents.length, 0);
});

test('a manual parting plane is honoured and a bad one shows trapped surface', () => {
  const knob = SAMPLES.knob.make();
  const r = buildMold(knob, { ...quick, partingZ: 8 });
  near(r.analysis.partingZ, 8, 1e-9);
  assert.ok(r.analysis.trappedFraction > 0.2, `a plane through the stem traps the head: ${r.analysis.trappedFraction}`);
  assert.ok(r.warnings.some(w => /trapped/.test(w)));
  const auto = buildMold(knob, quick);
  assert.ok(auto.analysis.trappedFraction < 0.01, `automatic plane: ${auto.analysis.trappedFraction}`);
});

test('an open mold of a tile: one closed part, nothing trapped, with a rim', () => {
  const r = buildMold(SAMPLES.star.make(), { ...quick, type: 'open', lip: 3, floor: 6 });
  assert.equal(r.parts.length, 1);
  assert.ok(r.parts[0].closed);
  assert.equal(r.parts[0].role, 'body');
  assert.equal(r.analysis.trappedFraction, 0);
  assert.ok(r.analysis.steepFraction > 0.2, 'vertical walls are steep');
  const mb = r.model.bounds;
  near(r.block.max[2], mb.max[2] + 3, 1e-9, 'rim'); near(r.block.min[2], mb.min[2] - 6, 1e-9, 'floor');
  // the opening is open: nothing solid above the tile's middle, solid under it
  const [above, below] = solidAt(r.parts[0], [[0, 0, mb.max[2] + 1.5], [0, 0, mb.min[2] - 3]]);
  assert.ok(!above && below);
  assert.ok(r.analysis.openingMm2 > 2000);
});

test('a vessel comes out as a body and a core with a collar', () => {
  const r = buildMold(SAMPLES.planter.make(), { ...quick, type: 'open', lip: 0 });
  assert.equal(r.parts.length, 2);
  assert.deepEqual(r.parts.map(p => p.role), ['body', 'core']);
  for (const p of r.parts) assert.ok(p.closed, p.name);
  assert.equal(r.features.cores, 1);
  assert.equal(r.analysis.trappedFraction, 0, 'the core lifts up, the body stays: nothing trapped');
  const core = r.parts[1];
  near(core.bounds.max[2], r.block.max[2] + 1.5, r.h, 'the collar stands 1.5 mm proud of the rim');
  assert.ok(core.bounds.size[0] > 60 && core.bounds.size[0] < r.block.max[0] - r.block.min[0], 'the collar is wider than the core but inside the block');
  assert.ok(core.print.matrix[8] === -1, 'the core prints collar down');
});

test('a silicone master stands the model in a tray and says how much silicone', () => {
  const r = buildMold(SAMPLES.knob.make(), { ...quick, type: 'box', siliconeGap: 8, boxWall: 2, boxFloor: 3 });
  assert.equal(r.parts.length, 1);
  assert.ok(r.parts[0].closed);
  assert.equal(r.parts[0].role, 'master');
  assert.equal(r.analysis.mode, 'print');
  const sil = r.features.silicone;
  assert.ok(sil.volumeMm3 > 0);
  near(sil.innerSize[2], 40 + 8, 1e-3, 'silicone depth is the model height plus the gap');
  near(r.block.min[2], 0, 1e-9);
  // the model fused to the floor, the tray hollow beside it
  const [onModel, inGap, inWall] = solidAt(r.parts[0], [[0, 0, 10], [18 + 4, 0, 10], [18 + 8 + 1, 0, 10]]);
  assert.ok(onModel && !inGap && inWall);
  assert.deepEqual(r.features.modelOffset.slice(0, 2), [0, 0]);
});

test('print placement lays every part flat with its bottom on the plate', () => {
  const r = buildMold(SAMPLES.pebble.make(), quick);
  for (const p of r.parts) {
    const printed = transform(p.mesh, p.print.matrix, p.print.translate);
    const b = bounds(printed);
    for (let c = 0; c < 3; c++) near(b.min[c], 0, 1e-4, `${p.name} min ${c}`);
    for (let c = 0; c < 3; c++) near(b.size[c], p.print.size[c], 1e-4);
    near(signedVolume(printed), p.volumeMm3, 1e-3 * p.volumeMm3, 'a flip keeps the volume positive');
    assert.ok(watertight(printed).closed);
  }
  // half B is turned over so its parting face is up: its top in print is its bottom in the mold
  const b = r.parts[1];
  near(b.print.size[2], b.bounds.size[2], 1e-6);
});

test('settings are checked and quality controls the budget', () => {
  const m = SAMPLES.star.make();
  assert.throws(() => buildMold(m, { type: 'bowl' }), /type/);
  assert.throws(() => buildMold(m, { wall: 1 }), /wall/i);
  assert.throws(() => buildMold(m, { pourFrom: 'up' }), /pourFrom/);
  assert.throws(() => buildMold(m, { clearance: 5 }), /clearance/);
  assert.throws(() => buildMold({ positions: new Float32Array(9), indices: new Uint32Array([0, 1, 2]) }), /triangles/);
  assert.ok(QUALITY.draft.nodes < QUALITY.standard.nodes && QUALITY.standard.nodes < QUALITY.fine.nodes);
  const r = buildMold(m, { type: 'open', quality: 'draft' });
  assert.ok(r.grid.nodes <= QUALITY.draft.nodes * 1.05);
});

test('cast estimates follow the material', () => {
  const c = castEstimate(100_000, 'concrete');
  near(c.mL, 100, 1e-9); near(c.grams, 220, 1e-9); assert.equal(c.unit, 'g');
  assert.equal(castEstimate(1000, 'resin').unit, 'mL');
  assert.equal(castEstimate(1000, 'nothing').material, MATERIALS.concrete);
});

test('a loosened cavity grows the hollow by the clearance', () => {
  const tight = buildMold(SAMPLES.pebble.make(), quick);
  const loose = buildMold(SAMPLES.pebble.make(), { ...quick, clearance: 0.5 });
  const vol = (r) => r.parts.reduce((a, p) => a + p.volumeMm3, 0);
  const grown = vol(tight) - vol(loose);
  // the cavity grows by about surface area × clearance
  near(grown, tight.model.areaMm2 * 0.5, tight.model.areaMm2 * 0.5 * 0.35, 'cavity growth');
});

/* ---------- audit: does the cavity match the model, and do features stay clear of each other? ---------- */

test('the cavity is the model: inside the model is empty in both halves, just outside it is solid in one', () => {
  const model = SAMPLES.pebble.make();
  const r = buildMold(model, { ...quick, clearance: 0 });
  const [a, b] = r.parts;
  const ba = bounds(a.mesh), bb = bounds(b.mesh);
  const ga = gridFor(ba.min, ba.max, 0.5, 2), gb = gridFor(bb.min, bb.max, 0.5, 2);
  const fa = signedDistanceField(a.mesh, ga, 1.5).sdf, fb = signedDistanceField(b.mesh, gb, 1.5).sdf;
  const solidA = (p) => ga.sample(fa, p[0], p[1], p[2]) < 0, solidB = (p) => gb.sample(fb, p[0], p[1], p[2]) < 0;
  // sample the model's own surface: step inward along the normal → empty; outward → solid in one half
  const n = faceNormals(model), { positions: P, indices: I } = model;
  let checked = 0, insideWrong = 0, outsideWrong = 0;
  for (let t = 0; t < I.length; t += 3 * 7) {
    const cx = (P[I[t] * 3] + P[I[t + 1] * 3] + P[I[t + 2] * 3]) / 3, cy = (P[I[t] * 3 + 1] + P[I[t + 1] * 3 + 1] + P[I[t + 2] * 3 + 1]) / 3, cz = (P[I[t] * 3 + 2] + P[I[t + 1] * 3 + 2] + P[I[t + 2] * 3 + 2]) / 3;
    if (Math.abs(cz - r.analysis.partingZ) < 2) continue; // skip the seam itself
    const inP = [cx - n[t] * 1.5, cy - n[t + 1] * 1.5, cz - n[t + 2] * 1.5];
    const outP = [cx + n[t] * 1.5, cy + n[t + 1] * 1.5, cz + n[t + 2] * 1.5];
    checked++;
    if (solidA(inP) || solidB(inP)) insideWrong++;
    const outSolid = cz > r.analysis.partingZ ? solidB(outP) : solidA(outP);
    if (!outSolid) outsideWrong++;
  }
  assert.ok(checked > 200);
  assert.ok(insideWrong / checked < 0.01, `${insideWrong} of ${checked} points inside the model were solid mold`);
  assert.ok(outsideWrong / checked < 0.03, `${outsideWrong} of ${checked} points just outside the model were not mold`);
});

test('every part reports how much of it needs supports, and the pebble halves need none', () => {
  const r = buildMold(SAMPLES.pebble.make(), quick);
  for (const p of r.parts) {
    assert.ok(Number.isFinite(p.supportFraction));
    assert.ok(p.supportFraction < 0.01, `${p.name} overhangs ${p.supportFraction}`);
  }
  const bad = buildMold(SAMPLES.knob.make(), { ...quick, partingZ: 8 });
  assert.ok(bad.parts.some(p => p.supportFraction > 0.02), 'a trapped cavity shows up as overhang in the print (the verdict flags 2 %)');
});

test('band grooves keep clear of the pegs on a small block, and the spout mouth of a peg', () => {
  const small = lathe([[0, 0], [8, 0], [9, 6], [8, 12], [0, 12]], 48); // a 18 mm wide puck
  const r = buildMold(small, { ...quick, wall: 8, spout: { enabled: true, diameter: 8, mouth: 30 } });
  const inset = r.settings.wall / 2 + 0.25, keyR = r.features.keys.pegs[0].radius;
  for (const g of r.features.bands) {
    const edgeLo = g.at - g.width / 2 - r.block.min[1], edgeHi = r.block.max[1] - (g.at + g.width / 2);
    assert.ok(Math.min(edgeLo, edgeHi) >= inset + keyR + 2.5, `groove at ${g.at} too close to a peg`);
  }
  assert.ok(r.features.spout.radiusOut < 15, 'the mouth was narrowed to miss the peg');
  assert.ok(r.warnings.some(w => /spout mouth was narrowed/.test(w)));
  for (const p of r.parts) assert.ok(p.closed, p.name);
});

test('a vessel core drops into a recess and has overflow holes; a push-out hole goes through the floor', () => {
  const r = buildMold(SAMPLES.planter.make(), { ...quick, type: 'open', lip: 0, pushHole: 8 });
  const [body, core] = r.parts;
  const top = r.block.max[2];
  // recess: 1 mm below the top the outer 2.5 mm rim is solid, 6 mm in it is not
  const edge = [r.block.min[0] + 1.2, r.block.center ? 0 : (r.block.min[1] + r.block.max[1]) / 2, top - 1];
  const inner = [r.block.min[0] + 6, (r.block.min[1] + r.block.max[1]) / 2, top - 1];
  const [rimSolid, recessEmpty] = solidAt(body, [edge, inner]);
  assert.ok(rimSolid && !recessEmpty, 'a 2.5 mm rim stands round a 2 mm recess');
  // the collar sits in that recess
  assert.ok(solidAt(core, [inner])[0], 'the collar fills the recess');
  near(core.bounds.max[2], top + 1.5, r.h, 'the collar stands 1.5 mm proud');
  assert.ok(r.features.coreHoles.length >= 2, `overflow holes: ${r.features.coreHoles.length}`);
  const hole = r.features.coreHoles[0];
  assert.ok(!solidAt(core, [[hole.x, hole.y, top]])[0], 'an overflow hole goes through the collar');
  // the push-out hole
  assert.deepEqual(r.features.pushHole.diameter, 8);
  assert.ok(!solidAt(body, [[0, 0, r.block.min[2] + 1]])[0], 'the floor is open at the centre');
  assert.ok(solidAt(body, [[12, 0, r.block.min[2] + 1]])[0], 'and solid beside the hole');
  for (const p of r.parts) assert.ok(p.closed, p.name);
});
