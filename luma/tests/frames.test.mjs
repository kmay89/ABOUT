import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Load the browser modules from source; frames.js and extras.js import their neighbours, so rewrite those imports.
const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const url = src => `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
const accessoriesURL = url(await read('accessories.js'));
const framesURL = url((await read('frames.js')).replace("'./accessories.js'", `'${accessoriesURL}'`));
const { galleryFrame, lantern, FITS, PLUGS, BOARD, recommendedGap } = await import(framesURL);
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

/** Closed and wound outward, whatever its holes: every edge shared by two faces running opposite ways. */
function assertClosed(mesh, name = '') {
  const edges = new Map(), I = mesh.indices;
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = I[i + k], b = I[i + (k + 1) % 3], key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    const e = edges.get(key) ?? { count: 0, direction: 0 };
    e.count++; e.direction += a < b ? 1 : -1; edges.set(key, e);
  }
  for (const [key, e] of edges) { assert.equal(e.count, 2, `${name} edge ${key}`); assert.equal(e.direction, 0, `${name} edge ${key}`); }
  assert.ok(mesh.volume > 0, name);
  assert.doesNotThrow(() => binarySTL(mesh), `${name}: no sliver triangles, so it writes as an STL`);
  let low = Infinity; for (let i = 2; i < mesh.vertices.length; i += 3) low = Math.min(low, mesh.vertices[i]);
  assert.ok(Math.abs(low) < 1e-4, `${name} on the plate`);
  return mesh.vertices.length / 3 - edges.size + mesh.triangleCount;     // Euler characteristic: 2 per shell, less 2 per hole
}

/** A slicer welds an STL by position, so shells that merely touch along an edge read as non-manifold. */
function welded(mesh) {
  const V = new Float32Array(mesh.vertices), id = new Map(), at = i => {
    const key = `${V[i * 3]},${V[i * 3 + 1]},${V[i * 3 + 2]}`;
    if (!id.has(key)) id.set(key, id.size);
    return id.get(key);
  };
  const edges = new Map(), I = mesh.indices;
  for (let i = 0; i < I.length; i += 3) for (let k = 0; k < 3; k++) {
    const a = at(I[i + k]), b = at(I[i + (k + 1) % 3]), key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  return [...edges.values()].filter(n => n > 2).length;
}

const four6 = { width: 101.6, height: 152.4, maxThickness: 3, border: 3 };
const five7 = { width: 127, height: 177.8, maxThickness: 3, border: 3 };
const six4 = { width: 152.4, height: 101.6, maxThickness: 3.2, border: 3 };

test('gallery frame for an LED board: closed, and the border is the same width on every side', () => {
  const r = galleryFrame({ ...four6, light: 'board', margin: 0 });
  const frame = r.parts[0].mesh, lid = r.parts[1].mesh, cover = r.parts[2].mesh;
  assertSolid(frame, 2 * frame.shells);      // the U in pieces round the cable bay, and the top lip, each a closed shell
  assertSolid(lid, 2 * lid.shells - 2 * r.vents.length);     // a plate with its vent slots, fins and tongues
  assert.ok(assertClosed(cover) <= 2 - 2 * 6, 'the back cover has vents and two keyholes');
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
    assert.equal(r.slots.at(-1).kind, 'cover');
  }
});

test('landscape pictures turn the board; own light gets a hollow and a slide-in cover', () => {
  const land = galleryFrame({ width: 152.4, height: 101.6, maxThickness: 3.2, border: 3, light: 'board' });
  assertSolid(land.parts[0].mesh, 2 * land.parts[0].mesh.shells);
  assert.ok(land.parts[0].mesh.size[0] > land.parts[0].mesh.size[1]);
  const own = galleryFrame({ ...four6, light: 'own', depth: 25 });
  assert.equal(own.parts.length, 3);
  assertClosed(own.parts[2].mesh);
  assert.equal(own.parts[2].mesh.shells, 3, 'a cover and a light-trapping hood over each row of vents');
  assert.equal(own.vents.length, 0, 'no slots in the lid over a lit hollow');
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
    { light: 'board' }, { light: 'board', storage: 6 }, { light: 'own', depth: 40 }, { light: 'own', storage: 3 },
    { light: 'board', fit: 'loose', margin: 14 }, { light: 'board', style: 'flat' }, { light: 'board', gap: 6 },
  ];
  for (const c of cases) for (const pic of [four6, five7, six4, { width: 120, height: 120, maxThickness: 2.4, border: 2 }]) {
    const r = galleryFrame({ ...pic, ...c });
    const inner = r.inside;                  // the inside edge, front to back
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

test('read back as an STL, no part has an edge shared by more than two faces', () => {
  const cases = [{ light: 'board', foot: true }, { light: 'own', depth: 30, foot: true }, { light: 'board', plug: 'straight' },
    { light: 'board', port: { edge: 'left', at: 30 } }, { light: 'board', port: { edge: 'right', at: 120 } }];
  for (let storage = 1; storage <= 6; storage++) cases.push({ light: 'board', storage }, { light: 'own', storage });
  for (const c of cases) for (const pic of [four6, five7, six4]) {
    for (const part of galleryFrame({ ...pic, ...c }).parts) {
      assertClosed(part.mesh, `${JSON.stringify(c)} ${part.id}`);
      assert.equal(welded(part.mesh), 0, `${JSON.stringify(c)} ${part.id}`);
    }
  }
  for (const part of [...lantern(four6).parts, ...lantern(five7).parts]) assert.equal(welded(part.mesh), 0, part.id);
});

test('5 × 7 on a 156 × 120 board: a funnel down to the board, the LEDs further back, the board held on every side', () => {
  assert.equal(recommendedGap(four6), 12);
  assert.ok(recommendedGap(five7) >= 18, 'a picture past the LEDs gets them further back');
  const r = galleryFrame({ ...five7, light: 'board' });
  const board = r.slots.find(s => s.kind === 'board');
  assert.deepEqual(board.edge.map(v => Math.round(v * 10) / 10), [-3.5, -10.9]);
  assert.ok(board.z0 - r.slots[0].z1 >= recommendedGap(five7) - 1e-9);
  // The ledge in front of the board overlaps its unlit margin by at least 1.4 mm all round.
  const ledge = r.segs[r.segs.indexOf(r.segs.find(s => s.kind === 'board')) - 1];
  for (const a of [0, 1]) assert.ok(board.edge[a] - ledge.inner[a] >= 1.4, `axis ${a}`);
  assert.throws(() => galleryFrame({ width: 203.2, height: 254, maxThickness: 3, border: 3, light: 'board' }), /larger than/);
});

test('the light stays in: the cable bay never opens into the lit chamber, and every vent is behind the board', () => {
  for (const pic of [four6, five7, six4]) for (const extra of [{}, { storage: 3 }, { port: { edge: 'left', at: 40 } }, { plug: 'straight' }]) {
    const r = galleryFrame({ ...pic, light: 'board', ...extra }), bay = r.bay, a = bay.axis;
    const board = r.slots.find(s => s.kind === 'board');
    // Between the bay's front and the board, only walls that sit inside the bay's ceiling: the ledge.
    for (const s of r.segs) {
      if (s.z1 <= bay.zc || s.z0 >= board.z0) continue;
      const most = s.inner ? s.inner[a] : Math.max(s.from[a], s.to[a]);
      assert.ok(most <= bay.ceil - 1.4, `${JSON.stringify(extra)}: ${most} against ${bay.ceil}`);
    }
    // Room for the plug, a floor under it, and the border even all the same.
    assert.ok(bay.floor - bay.ceil >= PLUGS[extra.plug || 'angled'].room - 1e-9);
    assert.ok(r.out >= bay.floor + 3 - 1e-9);
    assert.ok(bay.zb - bay.zc >= 13, 'deep enough for a right-angle plug turned backward');
    // Lid slots only over the air space behind the board.
    assert.ok(r.vents.length > 0);
    for (const [, , z0, z1] of r.vents) assert.ok(z0 >= board.z1 && z1 <= r.slots.at(-1).z0, 'a vent over the lit chamber');
  }
});

test('it stands: the desk foot holds it past 15° of lean, and clips the cable', () => {
  for (const pic of [four6, five7, six4]) for (const extra of [{ light: 'board' }, { light: 'own' }, { light: 'board', storage: 4 }]) {
    const r = galleryFrame({ ...pic, ...extra, foot: true });
    const foot = r.parts.find(p => p.id === 'foot').mesh, frame = r.parts[0].mesh;
    assert.ok(r.tip.foot >= 15 - 1e-6, `${JSON.stringify(extra)} tips at ${r.tip.foot}`);
    assert.ok(r.tip.foot > r.tip.bare);
    assert.ok(foot.size[0] >= frame.size[0] + 10 && foot.size[1] >= frame.size[2] + 10, 'the pocket and a rim round it');
    assert.ok(r.warm < 15, 'a 5 W board leaves the frame well short of PLA’s softening point');
  }
  assert.equal(galleryFrame({ ...four6, light: 'board' }).parts.length, 3, 'no foot unless asked');
});

test('the page has no two elements with the same id', async () => {
  const html = await read('index.html'), ids = [...html.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});
