import test from 'node:test';
import assert from 'node:assert/strict';
import { verdict } from '../verdict.js';
import { buildMold } from '../mold.js';
import { SAMPLES, extrude } from '../samples.js';

const quick = { quality: 'draft' };
const levels = (v) => Object.fromEntries(v.items.map(i => [i.title, i.level]));

test('a convex pebble in a two-part mold is good to go for concrete', () => {
  const r = buildMold(SAMPLES.pebble.make(), { ...quick, spout: { enabled: true, diameter: 14, mouth: 24 }, wall: 12 });
  const v = verdict(r, { material: 'concrete', printerName: 'your P2S' });
  assert.equal(v.grade, 'good', JSON.stringify(levels(v)));
  assert.match(v.headline, /Good to go/);
  assert.ok(v.outlook.length > 20);
  assert.ok(v.items.every(i => i.level === 'ok'));
  assert.ok(v.items.some(i => /Fits your P2S/.test(i.title)));
});

test('a narrow spout for concrete and a thin resin pour are flagged, not failed', () => {
  const r = buildMold(SAMPLES.pebble.make(), { ...quick, spout: { enabled: true, diameter: 8, mouth: 16 } });
  const v = verdict(r, { material: 'concrete' });
  assert.equal(v.grade, 'care');
  assert.ok(v.items.some(i => i.level === 'warn' && /spout is narrow/.test(i.title)));
  assert.ok(v.items.find(i => /spout is narrow/.test(i.title)).fix.includes('12 mm'));
  const resin = verdict(r, { material: 'resin' });
  assert.ok(!resin.items.some(i => /spout is narrow/.test(i.title)), 'resin pours through 8 mm');
});

test('a bad parting plane fails the verdict with a fix', () => {
  const r = buildMold(SAMPLES.knob.make(), { ...quick, partingZ: 8 });
  const v = verdict(r, { material: 'resin' });
  assert.equal(v.grade, 'no');
  const trapped = v.items.find(i => i.level === 'bad' && /trapped/.test(i.title));
  assert.ok(trapped && /parting plane/.test(trapped.fix));
  assert.match(v.headline, /Not yet/);
});

test('a thin tile is fragile in concrete but fine in resin', () => {
  // a 3 mm thick plate
  const plate = extrude([[0, 0], [60, 0], [60, 40], [0, 40]], 0, 3);
  const r = buildMold(plate, { ...quick, type: 'open', lip: 2 });
  assert.ok(r.model.thickness.under5mm > 0.9, `thickness map: ${JSON.stringify(r.model.thickness)}`);
  const concrete = verdict(r, { material: 'concrete' });
  assert.ok(concrete.items.some(i => i.level === 'bad' && /thinner than about 5 mm/.test(i.title)));
  assert.equal(concrete.grade, 'no');
  const resin = verdict(r, { material: 'resin' });
  assert.ok(resin.items.some(i => i.level === 'ok' && /sturdy enough for epoxy/.test(i.title)));
});

test('a part too big for the plate is a hard stop; a vessel explains its core', () => {
  const r = buildMold(SAMPLES.planter.make(), { ...quick, type: 'open', lip: 0 });
  const small = verdict(r, { material: 'concrete', bed: { x: 100, y: 100, z: 100 }, printerName: 'the mini' });
  assert.equal(small.grade, 'no');
  assert.ok(small.items.some(i => /Too big for the mini/.test(i.title)));
  const fine = verdict(r, { material: 'concrete' });
  assert.ok(fine.items.some(i => /inside of a vessel/.test(i.title)));
  assert.ok(fine.items.some(i => i.level === 'warn' && /no rim/.test(i.title)));
});

test('a silicone master reports its volume and its supports', () => {
  const r = buildMold(SAMPLES.knob.make(), { ...quick, type: 'box' });
  const v = verdict(r, { material: 'resin' });
  assert.ok(v.items.some(i => /mL of silicone/.test(i.title)));
  assert.ok(v.items.some(i => /needs supports/.test(i.title)));
  assert.equal(v.grade, 'care');
});
