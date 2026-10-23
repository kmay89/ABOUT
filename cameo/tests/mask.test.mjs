import test from 'node:test';
import assert from 'node:assert/strict';
const m = await import('../mask.js');

function disc(w, h, cx, cy, r) { const k = m.makeMask(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r) k.data[y * w + x] = 1; return k; }

test('components are counted, the largest kept, and holes filled by area', () => {
  const k = disc(60, 60, 20, 30, 12);
  const small = disc(60, 60, 50, 10, 4);
  const both = m.union(k, small);
  assert.equal(m.components(both).sizes.length - 1, 2);
  assert.equal(m.count(m.largest(both)), m.count(k));
  const holed = m.clone(k); holed.data[30 * 60 + 20] = 0; holed.data[30 * 60 + 21] = 0;
  assert.equal(m.count(m.fillHoles(holed, 10)), m.count(k), 'a two-pixel hole closes');
  const bigHole = m.subtract(k, disc(60, 60, 20, 30, 5));
  assert.equal(m.count(m.fillHoles(bigHole, 10)), m.count(bigHole), 'a big hole stays open under the area limit');
  assert.equal(m.count(m.fillHoles(bigHole)), m.count(k), 'and closes with no limit');
});

test('the distance transform is exact: a disc’s centre is its radius from the edge, and the outside is 0', () => {
  const k = disc(81, 81, 40.5, 40.5, 20);
  const d = m.distanceTransform(k);
  assert.ok(Math.abs(d[40 * 81 + 40] - 20) < 1.2, `centre ${d[40 * 81 + 40]}`);
  assert.equal(d[0], 0);
  for (let i = 0; i < d.length; i++) if (!k.data[i]) assert.equal(d[i], 0);
  // a set pixel next to an unset one is 1 away
  let edge = -1;
  for (let x = 0; x < 81; x++) if (k.data[40 * 81 + x]) { edge = x; break; }
  assert.equal(d[40 * 81 + edge], 1);
  // a full mask with the image edge counted as outside: the centre is half the width away
  const full = m.makeMask(21, 21, 1);
  assert.ok(Math.abs(m.distanceTransform(full)[10 * 21 + 10] - 11) < 1e-6);
  assert.ok(m.distanceTransform(full, { edgeIsOutside: false })[10 * 21 + 10] > 1e9, 'with no outside at all the distance is unbounded');
});

test('open removes hairs, close fills nicks, tidy does both and keeps one piece', () => {
  const k = disc(60, 60, 30, 30, 15);
  const hairy = m.clone(k); for (let x = 45; x < 58; x++) hairy.data[30 * 60 + x] = 1;
  const opened = m.open(hairy, 2);
  assert.ok(!opened.data[30 * 60 + 56] && !opened.data[30 * 60 + 52], 'the one-pixel hair is gone');
  assert.ok(m.count(opened) - m.count(m.open(k, 2)) <= 3, 'but for a stub at its root');
  const nicked = m.clone(k); for (let y = 15; y < 45; y++) nicked.data[y * 60 + 30] = 0;
  assert.ok(m.count(m.close(nicked, 2)) > m.count(nicked));
  const messy = m.union(hairy, disc(60, 60, 5, 5, 3));
  const t = m.tidy(messy, { radius: 2 });
  assert.equal(m.components(t).sizes.length - 1, 1);
});

test('the wand floods a flat colour and stops at a different one; the brush paints and erases a disc', () => {
  const w = 20, h = 20, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const x = i % w; const v = x < 10 ? 200 : 20; rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; }
  const left = m.wand(rgba, w, h, 2, 2, 30);
  assert.equal(m.count(left), 10 * 20);
  const k = m.makeMask(20, 20);
  m.brush(k, 10, 10, 3, 1);
  const painted = m.count(k);
  assert.ok(painted >= 25 && painted <= 37);
  m.brush(k, 10, 10, 3, 0);
  assert.equal(m.count(k), 0);
});

test('resampling keeps a mask’s shape and a field’s values; the blur is a mean', () => {
  const k = disc(100, 100, 50, 50, 40);
  const s = m.resample(k, 25, 25);
  assert.ok(Math.abs(m.count(s) / 625 - m.count(k) / 10000) < 0.05);
  const f = new Float32Array(16).fill(3);
  assert.ok(m.resampleField(f, 4, 4, 8, 8).every(v => Math.abs(v - 3) < 1e-6));
  assert.ok(m.blurField(f, 4, 4, 1, 3).every(v => Math.abs(v - 3) < 1e-6));
});
