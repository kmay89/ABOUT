import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// light.js imports image-processing.js, so both are loaded from source and the import rewritten.
const read = name => readFile(new URL(`../${name}`, import.meta.url), 'utf8');
const url = src => `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
const ip = url(await read('image-processing.js'));
const { absorption } = await import(ip);
const { recommendThickness, illuminance, LIGHT_SOURCES } = await import(url((await read('light.js')).replace("'./image-processing.js'", `'${ip}'`)));

const k = absorption('pla', 'white');
const flat = { shape: 'flat', width: 100, height: 150, k };

test('a light pad in a dim room lands on the well-tried 0.8–3.2 mm', () => {
  const r = recommendThickness({ ...flat, source: 'pad', room: 'dim' });
  assert.equal(r.min, 0.8); assert.equal(r.max, 3.2); assert.equal(r.look, 'good');
});

test('a dim light gets a thinner range and is called soft; a bright one thicker', () => {
  const tea = recommendThickness({ shape: 'cylinder', width: 251, height: 100, k, source: 'tealight', distance: 40, room: 'dark' });
  const pad = recommendThickness({ ...flat, source: 'pad', room: 'dark' });
  assert.ok(tea.max < 3 && tea.min <= 0.6, 'tea light: thin'); assert.equal(tea.look, 'soft');
  assert.ok(pad.min >= 1.1, 'light pad in the dark: thicker highlights'); assert.equal(pad.look, 'glaring');
  assert.match(pad.tips.join(' '), /Dim it/);
});

test('a nightlight in a bright room is washed out, and says so', () => {
  const r = recommendThickness({ shape: 'curved', width: 94, height: 115, k, source: 'nightlight', distance: 45, room: 'bright' });
  assert.equal(r.look, 'washed'); assert.ok(r.contrast < 2.5);
});

test('brightness follows the inverse square, and more lumens never thin the shadows', () => {
  const near = illuminance({ source: 'puck', lumens: 45, distance: 40 }), far = illuminance({ source: 'puck', lumens: 45, distance: 80 });
  assert.ok(Math.abs(near / far - 4) < 1e-9);
  let last = 0;
  for (const lumens of [5, 10, 20, 40, 80, 160]) {
    const r = recommendThickness({ ...flat, source: 'puck', lumens, distance: 60, room: 'dark' });
    assert.ok(r.max >= last - 1e-9, `${lumens} lm`); last = r.max;
    assert.ok(r.min >= 0.6 && r.min <= 1.2 && r.max <= 4 && r.max >= r.min + 1);
  }
});

test('a small light close behind a flat picture warns of a bright spot; coloured filament needs less plastic', () => {
  const close = recommendThickness({ ...flat, source: 'puck', distance: 15, room: 'dim' });
  assert.match(close.tips.join(' '), /bright spot/);
  const pink = recommendThickness({ ...flat, k: absorption('pla', 'pink'), source: 'pad', room: 'dim' });
  assert.ok(pink.max < 3.2);
  assert.equal(Object.keys(LIGHT_SOURCES).length, 7);
});
