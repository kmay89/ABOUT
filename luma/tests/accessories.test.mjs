import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const load = async name => import(`data:text/javascript;base64,${Buffer.from(await readFile(new URL(`../${name}`, import.meta.url), 'utf8')).toString('base64')}`);
const { lightBox, deskStand, lampBase, shadeStand, triangulate, ACCESSORIES } = await load('accessories.js');
const { binarySTL } = await load('mesh.js');

/** Every shell closed, every edge used once each way, wound outward, and writable as STL. */
function assertSolid(mesh, expectedEuler) {
  const edges = new Map(), I = mesh.indices, V = mesh.vertices;
  for (let i = 0; i < I.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = I[i + k], b = I[i + (k + 1) % 3], key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const e = edges.get(key) ?? { count: 0, direction: 0 };
      e.count++; e.direction += a < b ? 1 : -1; edges.set(key, e);
    }
  }
  for (const [key, e] of edges) {
    assert.equal(e.count, 2, `Edge ${key} has two faces`);
    assert.equal(e.direction, 0, `Edge ${key} is used both ways`);
  }
  assert.ok(V.every(Number.isFinite));
  assert.ok(mesh.volume > 0, 'Wound outward');
  assert.equal(V.length / 3 - edges.size + mesh.triangleCount, expectedEuler, 'Expected topology');
  assert.equal(new DataView(binarySTL(mesh)).getUint32(80, true), mesh.triangleCount, 'Writes as STL with no degenerate faces');
  const z = []; for (let i = 2; i < V.length; i += 3) z.push(V[i]);
  assert.equal(Math.min(...z), 0, 'Sits on the plate');
}

const panel = { width: 101.6, height: 152.4, maxThickness: 3, border: 3 };

test('triangulates a notched outline into the right number of ears', () => {
  const outline = [[0, 0], [4, 0], [4, 1], [6, 1], [6, 0], [10, 0], [10, 5], [0, 5]];
  assert.equal(triangulate(outline).length, outline.length - 2);
});

test('light box: a ring frame the picture presses into, and a back that fits its rabbet', () => {
  const { parts } = lightBox({ ...panel, depth: 30 });
  const frame = parts[0].mesh, cover = parts[1].mesh;
  assertSolid(frame, 0);
  assertSolid(cover, 2);
  // The opening clears the picture by 0.25 mm a side; the walls add 2.4 mm.
  assert.ok(Math.abs(frame.size[0] - (101.6 + 0.5 + 4.8)) < 1e-3);
  assert.ok(Math.abs(frame.size[1] - (152.4 + 0.5 + 4.8)) < 1e-3);
  assert.equal(frame.size[2], 30);
  // The back is smaller than the frame's back opening by the clearance, and thinner than its rabbet.
  assert.ok(cover.size[0] < 101.6 && cover.size[0] > 95);
  assert.ok(cover.size[2] < 2);
  // In the preview the frame's front sits flush with the picture's front face.
  assert.deepEqual(frame.place([0, 0, 0]), [0, -3, 76.2]);
  assert.throws(() => lightBox({ ...panel, depth: 10 }), /deeper/);
});

test('desk stand: the slot takes the picture with clearance', () => {
  const { parts, notes } = deskStand(panel);
  assertSolid(parts[0].mesh, 2);
  assert.ok(Math.abs(parts[0].mesh.size[0] - 101.6) < 1e-3);
  assert.match(notes, /slot/);
});

test('lamp base: the groove straddles the lamp wall, with room for a tea light', () => {
  const { parts, notes } = lampBase({ diameter: 80, maxThickness: 3, border: 3 });
  assertSolid(parts[0].mesh, 0);
  // Outside: lamp outer radius 43 + 0.3 clearance + 2.4 wall, polygon edges at that radius.
  assert.ok(parts[0].mesh.size[0] >= 2 * 45.7 && parts[0].mesh.size[0] < 2 * 45.7 + 0.1);
  assert.match(notes, /76 mm across/);
  assert.match(lampBase({ diameter: 40, maxThickness: 3, border: 3 }).notes, /won’t fit/);
  assert.throws(() => lampBase({ diameter: 20, maxThickness: 3, border: 3 }), /too narrow/);
});

test('nightlight stand: a capped curved rim and a round floor, overlapping', () => {
  const { parts } = shadeStand({ width: 45 * 2 * Math.PI / 3, angleDeg: 120, maxThickness: 3, border: 3 });
  assertSolid(parts[0].mesh, 4);                    // two closed shells, no holes
  assert.equal(parts[0].mesh.shells, 2);
});

test('each shape offers its own extras', () => {
  assert.deepEqual(ACCESSORIES.flat.map(a => a.id), ['lightbox', 'stand']);
  assert.deepEqual(ACCESSORIES.cylinder.map(a => a.id), ['base']);
  assert.deepEqual(ACCESSORIES.curved.map(a => a.id), ['stand']);
});
