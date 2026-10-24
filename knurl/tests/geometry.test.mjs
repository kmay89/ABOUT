import test from 'node:test';
import assert from 'node:assert/strict';
const M = await import('../mesh.js');
const S = await import('../subdivide.js');
const T = await import('../texture.js');
const X = await import('../textures.js');
const { SAMPLES, roundedBox, revolve } = await import('../samples.js');

const box = () => roundedBox(60, 40, 24, 6);
const cup = () => SAMPLES.find(s => s.id === 'cup').make();

function asciiSTL(mesh) {
  const { positions: p, indices: ix } = mesh, out = ['solid t'];
  for (let t = 0; t < ix.length; t += 3) {
    out.push(' facet normal 0 0 0', '  outer loop');
    for (let k = 0; k < 3; k++) { const v = ix[t + k] * 3; out.push(`   vertex ${p[v]} ${p[v + 1]} ${p[v + 2]}`); }
    out.push('  endloop', ' endfacet');
  }
  out.push('endsolid t');
  return out.join('\n');
}
function obj(mesh) {
  const { positions: p, indices: ix } = mesh, out = [];
  for (let i = 0; i < p.length; i += 3) out.push(`v ${p[i]} ${p[i + 1]} ${p[i + 2]}`);
  for (let t = 0; t < ix.length; t += 3) out.push(`f ${ix[t] + 1}/1/1 ${ix[t + 1] + 1}/1/1 ${ix[t + 2] + 1}/1/1`);
  return out.join('\n');
}

test('the samples are closed, right-handed solids of the advertised size', () => {
  for (const s of SAMPLES) {
    const m = s.make(), w = M.watertight(m), b = M.bounds(m);
    assert.ok(w.closed, `${s.id} is closed`);
    assert.equal(w.inconsistentEdges, 0, `${s.id} windings agree`);
    assert.ok(M.signedVolume(m) > 0, `${s.id} is right-handed`);
    assert.ok(Math.abs(b.min[2]) < 1e-6, `${s.id} sits on z = 0`);
  }
  const b = M.bounds(box());
  assert.deepEqual(b.size.map(v => Math.round(v)), [60, 40, 24]);
  const expect = 60 * 40 * 24 - (4 - Math.PI) * 36 * 24;
  assert.ok(Math.abs(M.signedVolume(box()) - expect) / expect < 0.01, 'rounded box volume');
});

test('binary STL, ASCII STL and OBJ all parse back to the same welded solid', () => {
  const m = box();
  const bin = M.parseModel(M.binarySTL(m), 'box.stl');
  assert.equal(bin.indices.length, m.indices.length);
  assert.ok(M.watertight(bin).closed);
  assert.ok(Math.abs(M.signedVolume(bin) - M.signedVolume(m)) < 1e-3);
  const asc = M.parseModel(new TextEncoder().encode(asciiSTL(m)).buffer, 'box.stl');
  assert.equal(asc.indices.length, m.indices.length);
  assert.ok(M.watertight(asc).closed);
  const o = M.parseModel(new TextEncoder().encode(obj(m)).buffer, 'box.obj');
  assert.equal(o.indices.length, m.indices.length);
  assert.ok(M.watertight(o).closed);
  assert.throws(() => M.parseModel(new ArrayBuffer(10), 'x.stl'));
});

test('watertight reports open edges and flipped triangles', () => {
  const m = box();
  const open = { positions: m.positions, indices: m.indices.slice(3) };
  const w = M.watertight(open);
  assert.ok(!w.closed);
  assert.equal(w.boundaryEdges, 3);
  const flipped = { positions: m.positions, indices: new Uint32Array(m.indices) };
  [flipped.indices[0], flipped.indices[1]] = [flipped.indices[1], flipped.indices[0]];
  assert.equal(M.watertight(flipped).inconsistentEdges, 3);
  const moved = M.translate(m, [10, 0, 5]);
  assert.ok(Math.abs(M.bounds(moved).min[2] - 5) < 1e-6);
  assert.ok(Math.abs(M.surfaceArea(m) - M.surfaceArea(moved)) < 1e-5 * M.surfaceArea(m));
});

test('subdivision keeps the solid closed, keeps its volume, hits the target edge and respects the budget', () => {
  const m = box();
  const sub = S.subdivide(m, { target: 1.0 });
  assert.ok(sub.mesh.indices.length > m.indices.length * 20);
  assert.ok(M.watertight(sub.mesh).closed, 'closed after subdivision');
  assert.ok(Math.abs(M.signedVolume(sub.mesh) - M.signedVolume(m)) < 1e-3, 'volume unchanged');
  assert.equal(sub.source.length, sub.mesh.indices.length / 3);
  const { positions: p, indices: ix } = sub.mesh;
  let longest = 0;
  for (let t = 0; t < ix.length; t += 3) for (let k = 0; k < 3; k++) {
    const a = ix[t + k] * 3, b = ix[t + (k + 1) % 3] * 3;
    longest = Math.max(longest, Math.hypot(p[a] - p[b], p[a + 1] - p[b + 1], p[a + 2] - p[b + 2]));
  }
  assert.ok(longest <= 1.0 * 1.5 + 1e-6, `longest edge ${longest}`);
  const capped = S.subdivide(m, { target: 0.2, maxTriangles: 20000 });
  assert.ok(capped.mesh.indices.length / 3 <= 20000 * 1.1, 'budget held');
  assert.ok(capped.target > 0.2, 'target coarsened to fit the budget');
  assert.ok(M.watertight(capped.mesh).closed);
});

test('classify picks walls, tops and bottoms; the bottom is never textured', () => {
  const m = box();
  for (const w of T.WHERE) {
    const c = T.classify(m, w.id);
    const { positions: p, indices: ix } = m;
    for (let t = 0; t < ix.length / 3; t++) {
      const z = [0, 1, 2].map(k => p[ix[t * 3 + k] * 3 + 2]);
      if (Math.max(...z) < 0.05) assert.ok(!c.on[t], `${w.id}: bottom face untextured`);
    }
    assert.ok(c.on.some(Boolean), `${w.id} textures something`);
  }
  const walls = T.classify(m, 'walls'), tops = T.classify(m, 'top');
  const n = walls.normals;
  for (let t = 0; t < walls.on.length; t++) {
    if (walls.on[t]) assert.ok(Math.abs(n[t * 3 + 2]) < 0.6, 'wall faces are steep');
    if (tops.on[t]) assert.ok(n[t * 3 + 2] > 0.6, 'top faces look up');
  }
  assert.ok(T.roundness(cup(), T.classify(cup(), 'walls')) > 0.9, 'the cup is round');
  assert.ok(T.roundness(m, walls) < 0.6, 'the box is not');
});

test('every texture keeps the box closed, inside its original envelope when cut in, with printable overhangs', () => {
  const m = box(), v0 = M.signedVolume(m), b0 = M.bounds(m);
  for (const tex of X.TEXTURES) {
    const r = T.applyTexture(m, { texture: tex.id, where: 'walls', period: tex.defaults.period, depth: tex.defaults.depth, maxTriangles: 150000 });
    const w = M.watertight(r.mesh), b = M.bounds(r.mesh);
    assert.ok(w.closed, `${tex.id} closed`);
    assert.equal(w.inconsistentEdges, 0, `${tex.id} consistent`);
    assert.ok(r.stats.volume < v0 && r.stats.volume > v0 * 0.9, `${tex.id} removes a little material (${r.stats.volume} of ${v0})`);
    for (let k = 0; k < 3; k++) {
      assert.ok(b.min[k] >= b0.min[k] - 1e-3 && b.max[k] <= b0.max[k] + 1e-3, `${tex.id} stays inside the envelope`);
    }
    assert.ok(r.stats.overhang < 60, `${tex.id} overhang ${r.stats.overhang}°`);
    assert.equal(r.mapping, 'flat');
    assert.ok(r.textured > 0);
    assert.ok(Math.abs(b.min[2]) < 1e-6, `${tex.id} still sits on the plate`);
  }
});

test('raising out grows the part; the plate clearance and top clearance leave bands untouched', () => {
  const m = box(), v0 = M.signedVolume(m);
  const out = T.applyTexture(m, { texture: 'knurl', where: 'walls', depth: 0.5, direction: 'out', maxTriangles: 150000 });
  assert.ok(out.stats.volume > v0, 'raised texture adds material');
  assert.ok(M.watertight(out.mesh).closed);
  const r = T.applyTexture(m, { texture: 'flutes', where: 'walls', depth: 0.6, bottomClear: 3, topClear: 3, maxTriangles: 150000 });
  const { positions: p } = r.mesh, { positions: q } = m;
  // the walls of the original box are at |x| = 30 or |y| = 20 (centred box); any
  // vertex low or high enough must still lie on them
  const b = M.bounds(m), cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2;
  let checked = 0;
  for (let i = 0; i < p.length; i += 3) {
    const z = p[i + 2];
    if (z > 0.2 && z < 2.5 || z > b.max[2] - 2.5 && z < b.max[2] - 0.2) {
      const dx = Math.abs(p[i] - cx), dy = Math.abs(p[i + 1] - cy);
      if (dx > 29.9 || dy > 19.9) { assert.ok(dx <= 30 + 1e-3 && dy <= 20 + 1e-3); checked++; }
    }
  }
  assert.ok(checked > 50, 'the clear bands have vertices on the original walls');
  void q;
});

test('a round part wraps around its axis with a period that closes the seam', () => {
  const c = cup();
  const r = T.applyTexture(c, { texture: 'knurl', where: 'walls', period: 2.4, depth: 0.4, maxTriangles: 200000 });
  assert.equal(r.mapping, 'around');
  assert.ok(Math.abs(r.stats.period - 2.4) < 0.1, `period ${r.stats.period} near 2.4`);
  assert.ok(M.watertight(r.mesh).closed);
  assert.ok(r.stats.overhang < 60);
  // inside walls stay smooth by default: every inner-wall vertex still lies on the profile (0.02 mm is the chord sag of 96 segments)
  const inner = z => (z < 30 ? 26 + (z - 4) / 26 : 27 + 1.5 * (z - 30) / 38), outer = z => (z < 30 ? 28 + (z - 2) / 28 : 29 + 2 * (z - 30) / 38);
  const { positions: p } = r.mesh;
  let innerChecked = 0, worst = 0;
  for (let i = 0; i < p.length; i += 3) {
    const z = p[i + 2];
    if (z < 6 || z > 60) continue;
    const rad = Math.hypot(p[i], p[i + 1]);
    if (rad < (inner(z) + outer(z)) / 2) { worst = Math.max(worst, inner(z) - rad); innerChecked++; }
  }
  assert.ok(innerChecked > 500 && worst < 0.02, `inner wall untouched (${innerChecked} vertices, worst ${worst})`);
  const flat = T.applyTexture(c, { texture: 'knurl', where: 'walls', mapping: 'flat', depth: 0.4, maxTriangles: 100000 });
  assert.equal(flat.mapping, 'flat');
  const none = T.applyTexture(c, { texture: 'knurl', depth: 0 });
  assert.equal(none.textured, 0);
  assert.equal(none.mesh, c);
});

test('the overhang readout ignores slivers and reports the steepest real down-facing triangle', () => {
  // a wedge whose underside slopes at 30° from vertical... build a prism with a 45° chamfer below
  const m = revolve([[0, 0], [10, 0], [15, 5], [15, 10], [0, 10]], 48);
  const s = T.stats(m);
  assert.ok(s.overhang > 44 && s.overhang < 46, `45° chamfer reads ${s.overhang}`);
  assert.ok(s.steepArea === 0, 'nothing beyond 50°');
  assert.ok(s.triangles === m.indices.length / 3);
});

test('texture functions stay in [0, 1] and their knobs have sane ranges', () => {
  for (const tex of X.TEXTURES) {
    const k = Object.fromEntries(tex.knobs.map(x => [x.key, x.value]));
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 400; i++) { const h = tex.h(Math.random() * 40 - 20, Math.random() * 40 - 20, tex.defaults.period, k); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    assert.ok(lo >= -1e-9 && hi <= 1 + 1e-9, `${tex.id} in range`);
    assert.ok(hi - lo > 0.2, `${tex.id} has relief`);
    for (const knob of tex.knobs) assert.ok(knob.min <= knob.value && knob.value <= knob.max, `${tex.id}.${knob.key}`);
  }
  assert.equal(X.textureById('nope'), X.TEXTURES[0]);
  assert.equal(X.inlayById('hexgrid').name, 'Honeycomb lines');
});
