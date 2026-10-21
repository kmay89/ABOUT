import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the browser modules from source; frames.js and extras.js import their neighbours, so rewrite those imports.
const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const url = src => `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
const accessoriesURL = url(await read('accessories.js'));
const framesURL = url((await read('frames.js')).replace("'./accessories.js'", `'${accessoriesURL}'`));
const { galleryFrame, lantern, FITS } = await import(framesURL);
const { ACCESSORIES } = await import(url((await read('extras.js')).replace("'./accessories.js'", `'${accessoriesURL}'`).replace("'./frames.js'", `'${framesURL}'`)));
const { printedGrams } = await import(accessoriesURL);
const { binarySTL } = await import(url(await read('mesh.js')));

/** Every shell closed and wound outward; the Euler characteristic says how many shells and holes. */
function assertSolid(mesh, euler) {
  const edges = new Map(), I = mesh.indices;
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = I[i + k], b = I[i + (k + 1) % 3], key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    const e = edges.get(key) ?? { count: 0, direction: 0 };
    e.count++; e.direction += a < b ? 1 : -1; edges.set(key, e);
  }
  for (const [key, e] of edges) { assert.equal(e.count, 2, `edge ${key}`); assert.equal(e.direction, 0, `edge ${key}`); }
  assert.ok(mesh.volume > 0);
  assert.equal(mesh.vertices.length / 3 - edges.size + mesh.triangleCount, euler);
  assert.equal(new DataView(binarySTL(mesh)).getUint32(80, true), mesh.triangleCount);
  let low = Infinity; for (let i = 2; i < mesh.vertices.length; i += 3) low = Math.min(low, mesh.vertices[i]);
  assert.ok(Math.abs(low) < 1e-4, 'on the plate');
}

const four6 = { width: 101.6, height: 152.4, maxThickness: 3, border: 3 };

test('gallery frame for an LED board: closed, and the border is the same width on every side', () => {
  const r = galleryFrame({ ...four6, light: 'board', margin: 0 });
  const frame = r.parts[0].mesh, lid = r.parts[1].mesh;
  assertSolid(frame, 2 * frame.shells);      // a U and three top bars, each a closed shell
  assertSolid(lid, 2 * lid.shells);          // a plate and its tongues
  // Even border: the frame is the picture plus the same amount on each side, both ways.
  const sideX = (frame.size[0] - 101.6) / 2, sideY = (frame.size[1] - 152.4) / 2;
  assert.ok(Math.abs(sideX - sideY) < 1e-3, `sides ${sideX} vs ends ${sideY}`);
  assert.ok(Math.abs(r.visibleBorder - (sideX + 3)) < 1e-3);
  // The board's groove reaches past the board's edge; the wall behind it is at least 2.4 mm.
  const board = r.slots.find(s => s.kind === 'board');
  assert.ok(board.g[0] > (120 - 101.6) / 2 && r.out - board.g[0] >= 2.4 - 1e-9);
  assert.ok(board.z0 - r.slots[0].z1 >= 12 - 1e-9, 'the LEDs sit the gap behind the picture');
});

test('every slot fits what goes in it, and the lid tongues fit the slots', () => {
  for (const fit of Object.keys(FITS)) {
    const f = FITS[fit].clear, r = galleryFrame({ ...four6, light: 'board', fit, storage: 2 });
    const pic = r.slots.find(s => s.kind === 'picture'), board = r.slots.find(s => s.kind === 'board');
    assert.ok(Math.abs(pic.z1 - pic.z0 - (3 + 2 * f + 0.1)) < 1e-9);
    assert.ok(board.z1 - board.z0 > 1 + 2 * f);
    assert.equal(r.slots.filter(s => s.kind === 'spare').length, 2);
    // A tongue in each end of every slot, and fins between them.
    const lid = r.parts[1].mesh;
    assert.ok(lid.shells > 1 + 2 * r.slots.length);
  }
});

test('landscape pictures turn the board; own light gets a hollow and a slide-in cover', () => {
  const land = galleryFrame({ width: 152.4, height: 101.6, maxThickness: 3.2, border: 3, light: 'board' });
  assertSolid(land.parts[0].mesh, 2 * land.parts[0].mesh.shells);
  assert.ok(land.parts[0].mesh.size[0] > land.parts[0].mesh.size[1]);
  const own = galleryFrame({ ...four6, light: 'own', depth: 25 });
  assert.equal(own.parts.length, 3);
  assertSolid(own.parts[2].mesh, 2);
  const cover = own.parts[2].mesh, frame = own.parts[0].mesh;
  assert.ok(cover.size[0] < frame.size[0] && cover.size[0] > 101.6, 'the cover reaches into the side grooves');
  assert.throws(() => galleryFrame({ width: 160, height: 200, maxThickness: 3, border: 3, light: 'board' }), /larger than/);
});

test('lantern: four posts on a grooved base, a ring on top, the pictures a slot apart at the corners', () => {
  const r = lantern({ ...four6 });
  assertSolid(r.parts[0].mesh, 8);           // the base is a ring (0) and four posts (2 each)
  assertSolid(r.parts[1].mesh, 0);           // the top is a ring
  const base = r.parts[0].mesh;
  assert.ok(base.size[2] > 152.4 - 6 && base.size[2] < 152.4 + 6, 'posts reach nearly the picture height');
  assert.ok(Math.abs(base.size[0] - base.size[1]) < 1e-6, 'square');
  // Neighbouring pictures do not collide at a corner: the plane of one sits beyond the edge of the next.
  assert.ok(r.pane.s - (3 + 0.5) / 2 > 101.6 / 2 + 0.5);
});

test('printed weight counts skin and infill, not the solid volume', () => {
  const frame = galleryFrame({ ...four6, light: 'board' }).parts[0].mesh;
  const solid = frame.volume / 1000 * 1.24, printed = printedGrams(frame);
  assert.ok(printed < solid * 0.8 && printed > solid * 0.15, `${printed} of ${solid}`);
});

test('the picker offers frames, a showcase and a lantern for flat pictures', () => {
  assert.deepEqual(ACCESSORIES.flat.map(a => a.id), ['gallery', 'showcase', 'lantern', 'stand']);
  assert.deepEqual(ACCESSORIES.cylinder.map(a => a.id), ['base']);
  assert.deepEqual(ACCESSORIES.curved.map(a => a.id), ['stand']);
  const show = ACCESSORIES.flat[1].make({ ...four6, light: 'board' });
  assert.equal(show.parts[0].name, 'Showcase frame');
});

test('the frame prints face down without supports: no inward step over 2.5 mm unless it slopes at 45°', () => {
  const cases = [
    { light: 'board' }, { light: 'board', storage: 6, cover: true }, { light: 'own', depth: 40 },
    { light: 'board', fit: 'loose', margin: 14 }, { light: 'board', style: 'flat' },
  ];
  for (const c of cases) for (const pic of [four6, { width: 152.4, height: 101.6, maxThickness: 3.2, border: 3 }, { width: 120, height: 120, maxThickness: 2.4, border: 2 }]) {
    const r = galleryFrame({ ...pic, ...c });
    // The inside edge, front to back: everything after the three outer points, reversed.
    const inner = r.profile.slice(3).reverse();
    for (const axis of [0, 1]) {
      for (let i = 1; i < inner.length; i++) {
        const [d0, z0] = [inner[i - 1][axis], inner[i - 1][2]], [d1, z1] = [inner[i][axis], inner[i][2]];
        const inward = d0 - d1, up = z1 - z0;
        if (inward <= 2.5 + 1e-9) continue;
        assert.ok(up >= inward - 2.5 - 1e-9, `${JSON.stringify(c)} axis ${axis}: steps in ${inward.toFixed(2)} mm over ${up.toFixed(2)} mm`);
      }
    }
  }
});
