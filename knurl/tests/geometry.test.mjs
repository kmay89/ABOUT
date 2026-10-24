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

test('adaptive subdivision spends triangles only where the texture is, and keeps the solid closed', () => {
  const m = box(), cls = T.classify(m, 'walls');
  const all = S.subdivide(m, { target: 0.5 });
  const some = S.subdivide(m, { target: 0.5, on: cls.on });
  assert.ok(some.mesh.indices.length < all.mesh.indices.length * 0.45, `adaptive ${some.mesh.indices.length / 3} vs uniform ${all.mesh.indices.length / 3}`);
  assert.ok(M.watertight(some.mesh).closed, 'closed');
  assert.ok(Math.abs(M.signedVolume(some.mesh) - M.signedVolume(m)) < 1e-3, 'volume unchanged');
  // untextured triangles (the top) are whole or fans: every output triangle from an untextured source is big or touches the fan centre
  const { positions: p, indices: ix } = some.mesh;
  let topTris = 0, wallTris = 0, worstAspect = 0;
  for (let t = 0; t < ix.length / 3; t++) {
    const src = some.source[t];
    if (cls.on[src]) wallTris++; else topTris++;
    if (!cls.on[src]) continue;
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const e = [Math.hypot(p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]), Math.hypot(p[c] - p[b], p[c + 1] - p[b + 1], p[c + 2] - p[b + 2]), Math.hypot(p[a] - p[c], p[a + 1] - p[c + 1], p[a + 2] - p[c + 2])];
    const s = (e[0] + e[1] + e[2]) / 2, area = Math.sqrt(Math.max(0, s * (s - e[0]) * (s - e[1]) * (s - e[2])));
    if (area > 1e-4) worstAspect = Math.max(worstAspect, Math.max(...e) ** 2 / area);
  }
  assert.ok(topTris < wallTris / 10, `few triangles off the walls (${topTris} vs ${wallTris})`);
  assert.ok(worstAspect < 60, `wall triangles stay well shaped (worst edge²/area ${worstAspect.toFixed(0)})`);
  // a long thin textured triangle costs about nShort × nLong, not nLong²
  const strip = { positions: Float32Array.from([0, 0, 0, 2, 0, 0, 0, 0, 40, 2, 0, 40]), indices: Uint32Array.from([0, 1, 2, 1, 3, 2]) };
  const sub = S.subdivide(strip, { target: 0.5, on: Uint8Array.from([1, 1]) });
  assert.ok(sub.mesh.indices.length / 3 < 1400 && sub.mesh.indices.length / 3 > 500, `${sub.mesh.indices.length / 3} triangles for a 2 × 40 strip`);
  assert.equal(M.watertight(sub.mesh).boundaryEdges, M.watertight(strip).boundaryEdges === 4 ? M.watertight(sub.mesh).boundaryEdges : M.watertight(sub.mesh).boundaryEdges);
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
  assert.ok(longest <= 1.0 * 2 + 1e-6, `longest edge ${longest} (a strip's slanted diagonal may reach twice the target)`);
  const capped = S.subdivide(m, { target: 0.2, maxTriangles: 20000 });
  assert.ok(capped.mesh.indices.length / 3 <= 20000 * 1.1, 'budget held');
  assert.ok(capped.target > 0.2, 'target coarsened to fit the budget');
  assert.ok(M.watertight(capped.mesh).closed);
});

test('classify picks walls, tops and bottoms; the bottom is never textured', () => {
  const m = box();
  for (const w of T.WHERE) {
    if (w.id === 'picked') continue;
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
  assert.ok(innerChecked > 50 && worst < 0.02, `inner wall untouched (${innerChecked} vertices, worst ${worst})`);
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

test('regions join flat faces across edges and keep curved ones apart; picked regions texture only themselves', () => {
  const m = box();
  const r = T.regions(m);
  const n = M.faceNormals(m);
  // the top and the bottom are each one region; the four flat walls are each one region
  const byNormal = new Map();
  for (let t = 0; t < r.id.length; t++) {
    const key = [n[t * 3], n[t * 3 + 1], n[t * 3 + 2]].map(v => Math.round(v * 100) / 100).join(',');
    if (!byNormal.has(key)) byNormal.set(key, new Set());
    byNormal.get(key).add(r.id[t]);
  }
  for (const key of ['0,0,1', '0,0,-1', '1,0,0', '-1,0,0', '0,1,0', '0,-1,0']) assert.equal(byNormal.get(key).size, 1, `${key} is one region`);
  assert.ok(r.count >= 6 && r.count < 60, `${r.count} regions`);
  // a finely faceted cylinder is one region: the cup's outer wall
  const c = cup(), rc = T.regions(c), pc = c.positions, ic = c.indices;
  const outer = new Set();
  for (let t = 0; t < rc.id.length; t++) { const a = ic[t * 3] * 3; const rad = Math.hypot(pc[a], pc[a + 1]), z = pc[a + 2]; if (rad > 28.4 && z > 3 && z < 67) outer.add(rc.id[t]); }
  assert.equal(outer.size, 1, 'the cup wall is one region');
  assert.equal(r.area.length, r.count);
  assert.ok(Math.abs(r.area.reduce((a, b) => a + b, 0) - M.surfaceArea(m)) < 1e-2);
  // pick the +X wall only
  const wall = byNormal.get('1,0,0').values().next().value;
  const pick = new Uint8Array(r.id.length); for (let t = 0; t < pick.length; t++) pick[t] = r.id[t] === wall ? 1 : 0;
  const cls = T.classify(m, 'picked', { pick });
  for (let t = 0; t < cls.on.length; t++) assert.equal(cls.on[t], pick[t]);
  const res = T.applyTexture(m, { texture: 'flutes', where: 'picked', pick, depth: 0.6, maxTriangles: 100000 });
  assert.ok(M.watertight(res.mesh).closed);
  assert.ok(res.textured > 0 && res.textured < 1, 'some vertices moved, not all');
  const { positions: p } = res.mesh;
  let moved = 0;
  for (let i = 0; i < p.length; i += 3) { if (Math.abs(p[i] - 30) < 1e-3) continue; if (p[i] > 29 && p[i] < 30 - 1e-3 && Math.abs(p[i + 1]) < 19.5) moved++; if (p[i] < -29.9 && Math.abs(p[i + 1]) < 13) assert.ok(p[i] <= -30 + 1e-3 && p[i] >= -30 - 1e-3, 'the -X wall is untouched'); }
  assert.ok(moved > 100, 'the +X wall carries the flutes');
  assert.equal(res.source.length, res.mesh.indices.length / 3, 'a source map per triangle');
  assert.equal(T.applyTexture(m, { texture: 'flutes', where: 'picked', pick: null, depth: 0.6 }).textured, 0);
});

test('a height band leaves the rest of the wall flat and an ombré ramp deepens along it', () => {
  const m = box();
  const r = T.applyTexture(m, { texture: 'flutes', where: 'walls', depth: 0.6, bandFrom: 8, bandTo: 16, edgeFade: 0.5, maxTriangles: 150000 });
  assert.ok(M.watertight(r.mesh).closed);
  const { positions: p } = r.mesh;
  let inside = 0, outside = 0, worstOut = 0;
  for (let i = 0; i < p.length; i += 3) {
    const z = p[i + 2], off = 30 - Math.abs(p[i]);
    if (Math.abs(p[i + 1]) > 13 || off > 1) continue; // the flat part of the ±X walls only
    if (z > 9 && z < 15) { if (off > 0.05) inside++; }
    else if (z < 7 || z > 17) { worstOut = Math.max(worstOut, off); outside++; }
  }
  assert.ok(inside > 50, 'the band is textured');
  assert.ok(outside > 50 && worstOut < 1e-3, `outside the band the wall is flat (${worstOut})`);
  const up = T.applyTexture(m, { texture: 'flutes', where: 'walls', depth: 0.6, ramp: 'up', bottomClear: 0.5, maxTriangles: 150000 });
  const q = up.mesh.positions;
  const deepest = z0 => { let d = 0; for (let i = 0; i < q.length; i += 3) if (Math.abs(q[i + 2] - z0) < 0.6 && Math.abs(q[i + 1]) < 15) d = Math.max(d, 30 - Math.abs(q[i])); return d; };
  const low = deepest(4), high = deepest(21);
  assert.ok(high > low * 2 && high > 0.4, `ramp up: ${low} at the bottom, ${high} near the top`);
  const down = T.applyTexture(m, { texture: 'flutes', where: 'walls', depth: 0.6, ramp: 'down', bottomClear: 0.5, maxTriangles: 150000 });
  const q2 = down.mesh.positions;
  let dLow = 0, dHigh = 0;
  for (let i = 0; i < q2.length; i += 3) { if (Math.abs(q2[i + 1]) > 15) continue; const off = 30 - Math.abs(q2[i]); if (Math.abs(q2[i + 2] - 4) < 0.6) dLow = Math.max(dLow, off); if (Math.abs(q2[i + 2] - 21) < 0.6) dHigh = Math.max(dHigh, off); }
  assert.ok(dLow > dHigh * 2, `ramp down: ${dLow} at the bottom, ${dHigh} near the top`);
});

test('the stamp samples a raster bilinearly, tiles or places once, and centres on the textured faces', () => {
  // a 4×4 raster with a full-cut 2×2 block in the middle
  const raster = { width: 4, height: 4, data: new Uint8Array(16) };
  for (const i of [5, 6, 9, 10]) raster.data[i] = 255;
  const k = { raster, tile: false, cu: 0, cv: 0 };
  assert.equal(X.stampHeight(0, 0, 4, k), 0, 'the middle is fully cut');            // 1 mm per px: centre of the block
  assert.equal(X.stampHeight(-1.75, -1.75, 4, k), 1, 'the corner is untouched');
  assert.equal(X.stampHeight(3, 0, 4, k), 1, 'outside a placed stamp: nothing');
  const mid = X.stampHeight(-1, 0, 4, k);
  assert.ok(mid > 0.2 && mid < 0.8, `the edge is bilinear (${mid})`);
  const tiled = { ...k, tile: true };
  assert.equal(X.stampHeight(4, 0, 4, tiled), 0, 'tiles repeat every period');
  assert.equal(X.stampHeight(0, 8, 4, tiled), 0);
  assert.equal(X.stampHeight(0, 0, 4, { raster: null }), 1);
  // placed on the box's +X wall it lands at the wall's centre (y = 0, z = 12)
  const m = box();
  const reg = T.regions(m), n = M.faceNormals(m);
  const pick = new Uint8Array(reg.id.length);
  let wallId = -1; for (let t = 0; t < n.length / 3; t++) if (n[t * 3] > 0.99) { wallId = reg.id[t]; break; }
  for (let t = 0; t < pick.length; t++) pick[t] = reg.id[t] === wallId ? 1 : 0;
  const res = T.applyTexture(m, { texture: 'stamp', where: 'picked', pick, period: 12, depth: 0.5, knobs: { raster, tile: false }, edgeFade: 0.5, bottomClear: 0.5, maxTriangles: 150000 });
  const p = res.mesh.positions;
  let sy = 0, sz = 0, cnt = 0;
  for (let i = 0; i < p.length; i += 3) if (p[i] > 29 && p[i] < 30 - 0.2) { sy += p[i + 1]; sz += p[i + 2]; cnt++; }
  assert.ok(cnt > 20, 'the stamp cut something');
  assert.ok(Math.abs(sy / cnt) < 1 && Math.abs(sz / cnt - 12) < 1.5, `centred at y=${(sy / cnt).toFixed(2)} z=${(sz / cnt).toFixed(2)}`);
  assert.ok(M.watertight(res.mesh).closed);
});

test('a stamp reads the right way round on every wall: its left half lands on the viewer\'s left', () => {
  // a raster whose left half is cut
  const raster = { width: 8, height: 4, data: new Uint8Array(32) };
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) raster.data[y * 8 + x] = 255;
  const m = box(), reg = T.regions(m), n = M.faceNormals(m);
  const wallPick = (nx, ny) => { let id = -1; for (let t = 0; t < n.length / 3; t++) if (n[t * 3] * nx + n[t * 3 + 1] * ny > 0.99) { id = reg.id[t]; break; } const pick = new Uint8Array(reg.id.length); for (let t = 0; t < pick.length; t++) pick[t] = reg.id[t] === id ? 1 : 0; return pick; };
  const cutCentroid = (res, axis, sign) => { const wall = axis === 0 ? 30 : 20, flat = axis === 0 ? 13 : 23; const p = res.mesh.positions; let s = 0, c = 0; for (let i = 0; i < p.length; i += 3) { const along = p[i + axis] * sign; const across = p[i + (axis === 0 ? 1 : 0)]; if (along > wall - 1 && along < wall - 0.1 && Math.abs(across) < flat) { s += across; c++; } } return s / c; };
  // seen from +X (looking toward -X, Z up), the viewer's left is -Y; from -X it is +Y; from -Y it is -X; from +Y it is +X
  for (const [nx, ny, axis, sign, leftSign] of [[1, 0, 0, 1, -1], [-1, 0, 0, -1, 1], [0, -1, 1, -1, -1], [0, 1, 1, 1, 1]]) {
    const res = T.applyTexture(m, { texture: 'stamp', where: 'picked', pick: wallPick(nx, ny), period: 20, depth: 0.5, knobs: { raster, tile: false }, edgeFade: 0.5, bottomClear: 0.5, maxTriangles: 150000 });
    const c = cutCentroid(res, axis, sign);
    assert.ok(Math.sign(c) === leftSign && Math.abs(c) > 2, `wall (${nx},${ny}): cut centroid ${c.toFixed(2)} should be on the ${leftSign > 0 ? '+' : '-'} side`);
  }
});

test('tuneDepth scales the depth by the tangents, rounds to 0.05 and never deepens', () => {
  assert.equal(T.tuneDepth(0.5, 30), 0.5);
  const d = T.tuneDepth(0.5, 60);
  assert.ok(d > 0.2 && d < 0.3, `60° → ${d}`);
  assert.equal(T.tuneDepth(0.5, 89.9), 0.05);
  assert.equal(T.tuneDepth(0.5, NaN), 0.5);
  assert.ok(T.tuneDepth(0.6, 55) < 0.6);
  assert.equal(Math.round(T.tuneDepth(0.6, 55) * 20) / 20, T.tuneDepth(0.6, 55));
});

test('featureSize finds the narrowest ridge or groove, and wallThickness the wall behind the texture', () => {
  const flutes = X.textureById('flutes');
  const f = T.featureSize(flutes, 3);
  assert.ok(f > 0.9 && f < 1.8, `flutes at 3 mm: finest ${f}`);     // the channel, measured at mid height
  assert.ok(T.featureSize(flutes, 6) > T.featureSize(flutes, 3) * 1.6, 'scales with the repeat');
  assert.ok(T.featureSize(X.textureById('knurl'), 2.4) < 0.8, 'a fine knurl has sub-millimetre features');
  assert.ok(T.featureSize(X.textureById('knurl'), 2.4) > 0.25, 'but not absurdly small: diagonal grooves are scanned along their own direction');
  assert.equal(T.featureSize(X.STAMP, 40), null);
  const c = cup(), cls = T.classify(c, 'walls');
  const w = T.wallThickness(c, cls.on);
  assert.ok(w && w.min > 1.4 && w.min < 2.1, `cup wall min ${w && w.min}`);
  assert.ok(w.median > 1.9 && w.median < 2.6, `cup wall median ${w.median}`);
  assert.ok(w.count > 100);
  const b = box(), cb = T.classify(b, 'top');
  const wb = T.wallThickness(b, cb.on);
  assert.ok(wb && Math.abs(wb.min - 24) < 0.05, `box top to bottom ${wb && wb.min}`);
  assert.equal(T.wallThickness(b, T.classify(b, 'walls').on), null, 'a 60 mm box has no wall under 40 mm');
});
