import test from 'node:test';
import assert from 'node:assert/strict';
const S = await import('../settings.js');
const { LOOKS } = await import('../looks.js');
const X = await import('../textures.js');

test('settings round-trip through the fragment, drop unknown keys and clamp numbers', () => {
  const s = { texture: 'hex', period: 4.5, depth: 0.45, angle: 15, direction: 'out', where: 'walls-top', bottomClear: 1.2, edgeFade: 1, mapping: 'auto', insideWalls: true,
    bandFrom: 2, bandTo: 20, ramp: 'up', tile: false, stampText: 'Hi there', inlayPattern: 'text', inlayPeriod: 6, inlayWeight: 0.3, inlayAngle: 0, inlayLayers: 2, inlayMargin: 1,
    inlayText: 'Made by Karl', inlayColour: '#2b2b2b', bodyColour: '#f0ece2', printerId: 'p2s', bed: 'Cool Plate', knobs: { groove: 0.3 } };
  const text = S.encodeSettings(s);
  assert.ok(!text.includes('tile='), 'false booleans are left out');
  const back = S.decodeSettings('#' + text);
  for (const [k, v] of Object.entries(s)) { if (k === 'tile') continue; assert.deepEqual(back[k], v, k); }
  assert.equal(back.tile, undefined);
  assert.equal(S.decodeSettings(''), null);
  assert.equal(S.decodeSettings('#foo=bar&x=1'), null);
  assert.deepEqual(S.decodeSettings('#d=99&p=0.01&t=knurl'), { depth: 3, period: 0.5, texture: 'knurl' });
  assert.equal(S.decodeSettings('#t=' + 'a'.repeat(500)).texture.length, 80);
  assert.deepEqual(S.decodeSettings('#k.sharp=0.7&k.bad!=1'), { knobs: { sharp: 0.7 } });
});

test('every look names a real texture, real knobs, a real place and a real inlay', () => {
  const ids = new Set();
  for (const l of LOOKS) {
    assert.ok(!ids.has(l.id), `${l.id} unique`); ids.add(l.id);
    const t = X.textureById(l.texture);
    assert.equal(t.id, l.texture, `${l.id} texture`);
    for (const k of Object.keys(l.knobs)) assert.ok(t.knobs.some(x => x.key === k), `${l.id} knob ${k}`);
    assert.ok(['walls', 'walls-top', 'top', 'all'].includes(l.where), `${l.id} where`);
    assert.ok(['in', 'out'].includes(l.direction));
    assert.ok(['none', 'up', 'down'].includes(l.ramp));
    assert.ok(l.period > 0 && l.depth > 0 && l.depth <= 1);
    assert.equal(X.inlayById(l.inlay.pattern).id, l.inlay.pattern, `${l.id} inlay`);
    assert.ok(l.name.length < 20 && l.blurb.length < 90);
  }
  assert.ok(LOOKS.length >= 20);
});

test('the shared swatch shades a tile with relief, and the pattern tile follows its function', async () => {
  const W = await import('../swatch.js');
  const t = X.textureById('knurl');
  const data = new Uint8ClampedArray(32 * 32 * 4);
  W.shadeTile(data, 32, 32, (u, v) => t.h(u, v, 2.4, { sharp: 0.6 }), { span: 6, depth: 0.4 });
  let lo = 255, hi = 0; for (let i = 0; i < data.length; i += 4) { lo = Math.min(lo, data[i]); hi = Math.max(hi, data[i]); assert.equal(data[i + 3], 255); }
  assert.ok(hi - lo > 60, `the tile has light and shade (${lo}..${hi})`);
  const flat = new Uint8ClampedArray(8 * 8 * 4);
  W.shadeTile(flat, 8, 8, () => 1, { span: 6, depth: 0.4, colour: [200, 100, 50] });
  for (let i = 0; i < flat.length; i += 4) { assert.equal(flat[i], flat[0]); assert.ok(Math.abs(flat[i] / flat[i + 1] - 2) < 0.1, 'keeps the colour'); }
  const pat = new Uint8ClampedArray(10 * 10 * 4);
  W.patternTile(pat, 10, 10, (u, v) => u > 0, { span: 10 });
  assert.equal(pat[(5 * 10 + 7) * 4], 43, 'ink on the right');
  assert.equal(pat[(5 * 10 + 2) * 4], 240, 'paper on the left');
  assert.deepEqual(W.rgb('#ff8000'), [255, 128, 0]);
  assert.deepEqual(W.rgb('nope'), [240, 236, 226]);
  // every texture's tile has relief at its defaults
  for (const tex of X.ALL_TEXTURES) {
    if (tex.id === 'stamp') continue;
    const k = Object.fromEntries(tex.knobs.map(x => [x.key, x.value]));
    const d = new Uint8ClampedArray(24 * 24 * 4);
    W.shadeTile(d, 24, 24, (u, v) => tex.h(u, v, tex.defaults.period, k), { span: tex.defaults.period * 2.5, depth: tex.defaults.depth });
    let a = 255, b = 0; for (let i = 0; i < d.length; i += 4) { a = Math.min(a, d[i]); b = Math.max(b, d[i]); }
    assert.ok(b - a > 20, `${tex.id} tile has relief (${a}..${b})`);
  }
});
