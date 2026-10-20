import test from 'node:test';
import assert from 'node:assert/strict';

const { buildBin, buildClip, binarySTL, triangulateRings, JOINT, CLIP_FITS } = await import('../geometry.js');

function near(actual, expected, tolerance = 1e-5, message = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message} Expected ${expected}, received ${actual}`);
}

/** One closed, outward-wound surface of genus zero: every edge in exactly two
 * faces, in opposite directions; positive volume; Euler characteristic 2. */
function assertSolid(mesh) {
  const { vertices, indices, vertexCount, triangleCount } = mesh;
  assert.equal(vertices.length, vertexCount * 3);
  assert.equal(indices.length, triangleCount * 3);
  assert.ok(vertices.every(Number.isFinite));
  assert.ok(mesh.volume > 0, 'positive volume');
  const edges = new Map(), used = new Set();
  let originVolume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const tri = [indices[i], indices[i + 1], indices[i + 2]];
    assert.equal(new Set(tri).size, 3, 'no collapsed triangles');
    const p = tri.map(k => [vertices[k * 3], vertices[k * 3 + 1], vertices[k * 3 + 2]]);
    const u = p[1].map((v, k) => v - p[0][k]), v = p[2].map((w, k) => w - p[0][k]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.ok(Math.hypot(...n) > 1e-9, `Triangle ${i / 3} has zero area`);
    for (let k = 0; k < 3; k++) {
      const a = tri[k], b = tri[(k + 1) % 3];
      used.add(a);
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count++; edge.direction += a < b ? 1 : -1;
      edges.set(key, edge);
    }
    originVolume += (p[0][0] * n[0] + p[0][1] * n[1] + p[0][2] * n[2]) / 6;
  }
  for (const [key, edge] of edges) {
    assert.equal(edge.count, 2, `Edge ${key} must have exactly two incident faces`);
    assert.equal(edge.direction, 0, `Edge ${key} must be used in opposite directions`);
  }
  assert.equal(used.size, vertexCount, 'No unused vertices');
  assert.equal(vertexCount - edges.size + triangleCount, 2, 'One closed surface, no holes through it');
  near(originVolume, mesh.volume, mesh.volume * 1e-6 + 1e-6, 'Independent volume');
  near(mesh.bounds.min[2], 0, 1e-6, 'Sits on the plate');
}

const channels = (w, d, pitch) => ({
  front: Array.from({ length: Math.round(w / pitch) }, (_, i) => (i + 0.5) * pitch),
  back: Array.from({ length: Math.round(w / pitch) }, (_, i) => (i + 0.5) * pitch),
  left: Array.from({ length: Math.round(d / pitch) }, (_, i) => (i + 0.5) * pitch),
  right: Array.from({ length: Math.round(d / pitch) }, (_, i) => (i + 0.5) * pitch),
});

const bins = [
  { name: 'plain cup', spec: { width: 40, depth: 40, height: 50 } },
  { name: 'square corners', spec: { width: 40, depth: 40, height: 30, radius: 0 } },
  { name: 'one cell with channels', spec: { width: 39.6, depth: 39.6, height: 50, channels: channels(40, 40, 40) } },
  { name: '2 × 1 with channels', spec: { width: 79.6, depth: 39.6, height: 50, channels: channels(80, 40, 40) } },
  { name: 'scoop only', spec: { width: 60, depth: 40, height: 50, scoop: { depth: 12, width: 36 } } },
  { name: 'scoop and channels', spec: { width: 59.6, depth: 39.6, height: 50, scoop: { depth: 12, width: 30 }, channels: channels(60, 40, 20) } },
  { name: '3 × 2 compartments', spec: { width: 120, depth: 80, height: 40, compartmentsX: 3, compartmentsY: 2, channels: channels(120, 80, 40) } },
  { name: '3 × 2 compartments with scoop', spec: { width: 120, depth: 80, height: 40, compartmentsX: 3, compartmentsY: 2, scoop: { depth: 10, width: 70 }, channels: channels(120, 80, 40) } },
  { name: 'thick wall, no ribs needed', spec: { width: 40, depth: 40, height: 30, wall: 3, channels: channels(40, 40, 40) } },
  { name: 'low wide tray, 4 compartments', spec: { width: 200, depth: 30, height: 20, wall: 2, compartmentsX: 4, channels: { front: [25, 75, 125, 175], back: [25, 75, 125, 175], left: [15], right: [15] } } },
  { name: 'tiny cup at the smallest cell', spec: { width: 17.6, depth: 17.6, height: 20, channels: channels(18, 18, 18) } },
  { name: 'tall and thin walled', spec: { width: 56.7, depth: 113.7, height: 254, wall: 1.2, floor: 0.8, channels: channels(56.7, 113.7, 56.85) } },
  { name: 'many compartments', spec: { width: 150, depth: 150, height: 25, compartmentsX: 6, compartmentsY: 6, channels: channels(150, 150, 50) } },
];

for (const { name, spec } of bins) {
  test(`bin: ${name} is one closed solid of the right size`, () => {
    const mesh = buildBin(spec);
    assertSolid(mesh);
    near(mesh.size[0], spec.width, 1e-4, 'width');
    near(mesh.size[1], spec.depth, 1e-4, 'depth');
    near(mesh.size[2], spec.height, 1e-4, 'height');
    near(mesh.bounds.min[0], 0, 1e-6); near(mesh.bounds.min[1], 0, 1e-6);
  });
}

test('a plain bin has the volume of its walls and floor, less the rounded corners', () => {
  const s = { width: 40, depth: 40, height: 50, wall: 1.6, floor: 1.2, radius: 0 };
  const mesh = buildBin(s);
  // Sharp outside; inside, the smallest fillet (0.5 mm) stays, for strength and a clean first layer.
  const fillets = 4 * (1 - Math.PI / 4) * 0.5 * 0.5 * 48.8;
  const expected = 40 * 40 * 1.2 + (40 * 40 - 36.8 * 36.8) * 48.8 + fillets;
  near(mesh.volume, expected, 1.5, 'square-cornered volume; the four inside fillets are drawn as four flat segments each');
  const rounded = buildBin({ ...s, radius: 3 });
  assert.ok(rounded.volume < mesh.volume && rounded.volume > mesh.volume * 0.95, 'rounding takes a little plastic off');
});

test('channels cut into the wall and ribs grow behind them', () => {
  const plain = buildBin({ width: 40, depth: 40, height: 50 });
  const notched = buildBin({ width: 40, depth: 40, height: 50, channels: { front: [20], back: [20], left: [20], right: [20] } });
  // Four channels of 1.4 × ~3.8 mm over 48.8 mm come out; four ribs of 1.4 × 7.8 mm over 48.8 mm go in.
  const channel = (JOINT.neck + JOINT.base) / 2 * JOINT.depth * 48.8;
  const rib = (JOINT.base + 3.2) * (JOINT.depth + JOINT.backing - 1.6) * 48.8;
  near(notched.volume - plain.volume, 4 * (rib - channel), 4 * 48.8 * 0.6, 'ribs minus channels, less what the corners round off');
  assert.equal(notched.ribDepth, JOINT.depth + JOINT.backing - 1.6);
  const thick = buildBin({ width: 40, depth: 40, height: 50, wall: 3.2, channels: { front: [20] } });
  assert.equal(thick.ribDepth, 0, 'a wall thick enough needs no rib');
});

test('a channel ends at the floor so a clip cannot fall through', () => {
  const mesh = buildBin({ width: 40, depth: 40, height: 50, floor: 1.2, channels: { front: [20] } });
  // Inside the notch (y just inside the front wall at x = 20) there is solid floor below z = 1.2 and air above.
  const { vertices: v } = mesh;
  let notchFloorVertices = 0, notchBottomVertices = 0;
  for (let i = 0; i < v.length; i += 3) {
    const inNotch = Math.abs(v[i] - 20) < JOINT.base / 2 + 1e-6 && v[i + 1] > 0.5 && v[i + 1] < JOINT.depth + 1e-6;
    if (!inNotch) continue;
    if (Math.abs(v[i + 2] - 1.2) < 1e-6) notchFloorVertices++;
    if (Math.abs(v[i + 2]) < 1e-6) notchBottomVertices++;
  }
  assert.ok(notchFloorVertices >= 2, 'the ledge sits at floor height');
  assert.equal(notchBottomVertices, 0, 'the bottom outline is uncut');
});

test('the scoop dips the front wall and nothing else', () => {
  const H = 50, mesh = buildBin({ width: 60, depth: 40, height: H, scoop: { depth: 12, width: 36 } });
  const { vertices: v } = mesh;
  let lowest = H, backTop = 0;
  for (let i = 0; i < v.length; i += 3) {
    if (v[i + 1] < 4) lowest = Math.min(lowest, v[i + 2] > 5 ? v[i + 2] : lowest);
    if (v[i + 1] > 20) backTop = Math.max(backTop, v[i + 2]);
  }
  near(lowest, H - 12, 1e-4, 'the scoop reaches its depth at the centre');
  near(backTop, H, 1e-6, 'the back stays full height');
  near(mesh.size[2], H, 1e-6);
});

test('a scoop never goes deeper than three tenths of the bin', () => {
  const mesh = buildBin({ width: 60, depth: 40, height: 20, scoop: { depth: 12, width: 36 } });
  assert.equal(mesh.settings.scoop.depth, 6);
});

test('bins refuse sizes that cannot print', () => {
  assert.throws(() => buildBin({ width: 5, depth: 40, height: 50 }), /no room inside/);
  assert.throws(() => buildBin({ width: 40, depth: 40, height: 3 }), /taller than its floor/);
  assert.throws(() => buildBin({ width: 40, depth: 40, height: 50, wall: 0.4 }), /thinner than 0.8/);
  assert.throws(() => buildBin({ width: 40, depth: 40, height: 50, compartmentsX: 9 }), /narrower than 5 mm/);
  const tight = buildBin({ width: 20, depth: 20, height: 20, radius: 8, channels: { front: [10] } });
  assert.ok(tight.settings.radius < 8, 'a corner gives way to a channel rather than failing');
  assert.throws(() => buildBin({ width: 20, depth: 20, height: 20, radius: 0, channels: { front: [1] } }), /does not fit on this wall/);
  assert.throws(() => buildBin({ width: 40, depth: 40, height: 20, channels: { front: [18, 22] } }), /overlap/);
});

test('the clip is a closed bowtie that fits the channel with clearance', () => {
  for (const fit of Object.values(CLIP_FITS)) {
    const clip = buildClip({ length: 30, gap: 0.4, fit });
    assertSolid(clip);
    near(clip.size[0], 30, 1e-6, 'length');
    near(clip.size[1], JOINT.base - 2 * fit, 1e-6, 'as wide as the channel base, less the fit');
    near(clip.size[2], 2 * (JOINT.depth - 0.15) + 0.4, 1e-6, 'two keys and the gap');
  }
  assert.throws(() => buildClip({ length: 30, fit: 1.2 }), /too thin/);
});

test('triangulateRings keeps points that lie on a straight edge', () => {
  const square = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
  const tris = triangulateRings([square], true);
  const used = new Set(tris.flat());
  assert.equal(used.size, 5, 'the collinear point is in the surface');
  for (const [a, b, c] of tris) {
    const P = i => square[i];
    const area = (P(b).x - P(a).x) * (P(c).y - P(a).y) - (P(b).y - P(a).y) * (P(c).x - P(a).x);
    assert.ok(area > 0, 'wound to face up');
  }
  const hole = [{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }];
  const withHole = triangulateRings([square, hole], false);
  assert.equal(new Set(withHole.flat()).size, 9);
});

test('binary STL carries every triangle and its unit normal', () => {
  const mesh = buildBin({ width: 30, depth: 30, height: 20 });
  const buffer = binarySTL(mesh, { header: 'test' });
  assert.equal(buffer.byteLength, 84 + mesh.triangleCount * 50);
  const view = new DataView(buffer);
  assert.equal(view.getUint32(80, true), mesh.triangleCount);
  near(Math.hypot(view.getFloat32(84, true), view.getFloat32(88, true), view.getFloat32(92, true)), 1, 1e-6, 'unit normal');
  assert.equal(new TextDecoder().decode(new Uint8Array(buffer, 0, 4)), 'test');
});
