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
  assert.ok(LOOKS.length >= 8);
});
