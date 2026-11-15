import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function moduleFile(relative) {
  const source = await readFile(new URL(relative, import.meta.url), 'utf8');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

const { imagePlacement, grayscale, photoLevels, enhanceDetail, estimateBounds, printerFit, safeResolution, absorption, transmissionRGB, recommendedRange, contrastWords, COLOURS } = await moduleFile('../image-processing.js');
const { buildMesh, estimateGrid, MAX_VERTICES } = await moduleFile('../mesh.js');

function near(actual, expected, tolerance = 1e-6) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `Expected ${expected}; got ${actual}`);
}

test('grayscale distinguishes channels and treats transparent pixels as white', () => {
  const values = grayscale(new Uint8ClampedArray([
    0, 0, 0, 255,
    255, 255, 255, 255,
    255, 0, 0, 255,
    0, 255, 0, 255,
    0, 0, 255, 255,
    0, 0, 0, 0,
    0, 0, 0, 128,
  ]));
  [0, 1, 0.2126, 0.7152, 0.0722, 1, 127 / 255].forEach((v, i) => near(values[i], v));
});

test('default tone preserves a neutral ramp and all allowed tones stay finite, bounded, and monotonic', () => {
  const ramp = new Uint8ClampedArray(256 * 4);
  for (let i = 0; i < 256; i++) ramp.set([i, i, i, 255], i * 4);
  const original = grayscale(ramp);
  for (let i = 0; i < 256; i++) near(original[i], i / 255);
  for (const brightness of [-40, -15, 0, 15, 40]) {
    for (const contrast of [50, 100, 150]) {
      const values = grayscale(ramp, { brightness, contrast });
      for (let i = 0; i < values.length; i++) {
        assert.ok(Number.isFinite(values[i]));
        assert.ok(values[i] >= 0 && values[i] <= 1);
        if (i) assert.ok(values[i] >= values[i - 1]);
      }
    }
  }
  near(grayscale(new Uint8ClampedArray([128, 128, 128, 255]), { brightness: 20 })[0], 128 / 255 + 0.2);
});

test('tone changes map to the same physical thickness convention as the mesh', () => {
  const rgba = new Uint8ClampedArray([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]);
  const values = grayscale(rgba, { brightness: 0, contrast: 100 });
  const mesh = buildMesh({ width: 6, height: 4, border: 0, minThickness: 0.8, maxThickness: 3, resolution: 3, values, nx: 3, ny: 1 });
  const topOffset = (mesh.grid.rows - 1) * mesh.grid.columns;
  near(mesh.thicknesses[topOffset], 3);
  near(mesh.thicknesses[topOffset + 1], 0.8 + (1 - 128 / 255) * 2.2);
  near(mesh.thicknesses[topOffset + 2], 0.8);
});

test('cover and contain center a known landscape photograph without stretching it', () => {
  assert.deepEqual(imagePlacement(400, 200, 100, 100), { width: 200, height: 100, x: -50, y: 0 });
  assert.deepEqual(imagePlacement(400, 200, 100, 100, { fit: 'contain' }), { width: 100, height: 50, x: 0, y: 25 });
  const left = imagePlacement(400, 200, 100, 100, { cropX: -100 });
  const right = imagePlacement(400, 200, 100, 100, { cropX: 100 });
  near(left.x, -100);
  near(right.x, 0);
  assert.deepEqual(imagePlacement(400, 200, 100, 100, { cropX: 1000 }), right);
});

test('cover crop extremes keep the photo covering the opening at every valid zoom and aspect', () => {
  for (const source of [[4000, 3000], [3000, 4000], [2200, 12], [12, 2200], [1, 1]]) {
    for (const target of [[100, 150], [234, 4], [4, 234], [377, 255], [2.1, 250]]) {
      for (const zoom of [1, 1.05, 3]) {
        for (const cropX of [-100, 0, 100]) {
          for (const cropY of [-100, 0, 100]) {
            const p = imagePlacement(...source, ...target, { fit: 'cover', zoom, cropX, cropY });
            assert.ok(Object.values(p).every(Number.isFinite));
            assert.ok(p.width > 0 && p.height > 0);
            near(p.width / p.height, source[0] / source[1], 1e-8);
            assert.ok(p.x <= 1e-7 && p.y <= 1e-7);
            assert.ok(p.x + p.width >= target[0] - 1e-7);
            assert.ok(p.y + p.height >= target[1] - 1e-7);
          }
        }
      }
    }
  }
});

test('contain crop extremes preserve the whole photograph at neutral zoom', () => {
  for (const source of [[4000, 3000], [3000, 4000], [2200, 12], [12, 2200]]) {
    for (const target of [[100, 150], [234, 4], [4, 234]]) {
      for (const cropX of [-100, 100]) {
        for (const cropY of [-100, 100]) {
          const p = imagePlacement(...source, ...target, { fit: 'contain', cropX, cropY });
          assert.ok(p.x >= -1e-7 && p.y >= -1e-7);
          assert.ok(p.x + p.width <= target[0] + 1e-7);
          assert.ok(p.y + p.height <= target[1] + 1e-7);
        }
      }
    }
  }
});

test('P2S object and brim checks distinguish tall panels from plate clearance', () => {
  assert.deepEqual(printerFit({ x: 240, y: 3, z: 255 }), { objectFits: true, brimFits: true, fits: true });
  assert.deepEqual(printerFit({ x: 250, y: 3, z: 255 }), { objectFits: true, brimFits: false, fits: false });
  assert.equal(printerFit({ x: 257, y: 3, z: 100 }).objectFits, false);
  assert.equal(printerFit({ x: 100, y: 3, z: 257 }).objectFits, false);
  for (const value of [NaN, Infinity, -1, 0]) assert.equal(printerFit({ x: value, y: 3, z: 100 }).objectFits, false);
});

test('conservative dimensions bound the actual flat and curved solids at UI extremes', () => {
  const presets = [
    { shape: 'flat', width: 250, height: 255, border: 8 },
    { shape: 'flat', width: 20, height: 20, border: 8 },
    { shape: 'curved', width: 10 * Math.PI / 6, height: 20, angleDeg: 30, border: 1.5 },
    { shape: 'curved', width: 120 * Math.PI, height: 255, angleDeg: 180, border: 8 },
    { shape: 'curved', width: 45 * Math.PI * 2 / 3, height: 115, angleDeg: 120, border: 3 },
  ];
  for (const preset of presets) {
    for (const tone of [0, 0.5, 1]) {
      const s = { angleDeg: 90, minThickness: 0.4, maxThickness: 5, borderThickness: 5, resolution: 3, ...preset };
      const estimate = estimateBounds(s);
      const mesh = buildMesh({ ...s, values: [tone], nx: 1, ny: 1 });
      for (const [i, key] of ['x', 'y', 'z'].entries()) {
        assert.ok(Number.isFinite(estimate[key]) && estimate[key] > 0);
        assert.ok(mesh.bounds.size[i] <= estimate[key] + 3e-5, `${key}: actual ${mesh.bounds.size[i]} > bound ${estimate[key]}`);
      }
    }
  }
});

test('automatic quality spacing stays within the actual geometry budget throughout the size range', () => {
  for (const [width, height] of [[20, 20], [100, 150], [127, 177.8], [250, 255], [120 * Math.PI, 255], [10 * Math.PI / 6, 255]]) {
    for (const requested of [0.15, 0.2, 0.3]) {
      const resolution = safeResolution(width, height, requested);
      assert.ok(Number.isFinite(resolution) && resolution >= requested);
      for (const border of [0, Math.min(3, Math.min(width, height) / 4)]) {
        const estimate = estimateGrid({ width, height, border, resolution });
        assert.ok(estimate.vertexCount <= MAX_VERTICES);
        assert.equal(estimate.withinLimit, true);
        assert.ok(Number.isFinite(estimate.stlBytes) && estimate.stlBytes > 84);
      }
    }
  }
});

test('printer fit uses the chosen plate, either way round, and the lamp bounds its own solid', () => {
  const mk4 = { x: 250, y: 210, z: 220 };
  assert.deepEqual(printerFit({ x: 230, y: 3, z: 200 }, 8, mk4), { objectFits: true, brimFits: true, fits: true });
  assert.equal(printerFit({ x: 240, y: 3, z: 200 }, 8, mk4).brimFits, false);
  assert.equal(printerFit({ x: 100, y: 3, z: 230 }, 8, mk4).objectFits, false, 'Too tall for the MK4');
  assert.equal(printerFit({ x: 205, y: 245, z: 100 }, 0, mk4).objectFits, true, 'Turned a quarter on the plate');
  const lamp = { shape: 'cylinder', width: Math.PI * 80, height: 100, border: 3, minThickness: 0.8, maxThickness: 3, resolution: 1 };
  const bounds = estimateBounds(lamp), mesh = buildMesh(lamp);
  assert.ok(bounds.x >= mesh.bounds.size[0] && bounds.y >= mesh.bounds.size[1] && bounds.z >= mesh.bounds.size[2]);
  near(bounds.x, 86, 1e-9);
});

test('auto levels find a dull photo\'s own black and white points and stretch them to the ends', () => {
  const rgba = new Uint8ClampedArray(4 * 1000);
  for (let i = 0; i < 1000; i++) rgba.set([60 + (i % 101), 60 + (i % 101), 60 + (i % 101), 255], i * 4);
  const levels = photoLevels(rgba);
  near(levels.lo, 60 / 255, 1 / 255);
  near(levels.hi, 160 / 255, 1 / 255);
  const values = grayscale(new Uint8ClampedArray([60, 60, 60, 255, 160, 160, 160, 255, 110, 110, 110, 255]), { levels });
  near(values[0], 0, 0.01); near(values[1], 1, 0.01); near(values[2], 0.5, 0.02);
  assert.deepEqual(photoLevels(new Uint8ClampedArray([128, 128, 128, 255, 130, 130, 130, 255])), { lo: 0, hi: 1 }, 'A flat photo is left alone');
});

test('detail keeps flat areas flat, sharpens an edge, and stays within range', () => {
  const nx = 40, ny = 10, flat = new Float32Array(nx * ny).fill(0.4);
  enhanceDetail(flat, nx, ny, 3, 1.5);
  assert.ok(flat.every(v => Math.abs(v - 0.4) < 1e-6));
  const edge = new Float32Array(nx * ny);
  for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) edge[y * nx + x] = x < nx / 2 ? 0.2 : 0.8;
  const before = Float32Array.from(edge);
  enhanceDetail(edge, nx, ny, 3, 1);
  const row = 5 * nx;
  assert.ok(edge[row + nx / 2 - 1] < before[row + nx / 2 - 1], 'Dark side of the edge darkens');
  assert.ok(edge[row + nx / 2] > before[row + nx / 2], 'Light side brightens');
  assert.ok(edge.every(v => v >= 0 && v <= 1));
  near(edge[row], 0.2, 1e-6, 'Far from the edge nothing changes');
});

test('filament model: white glows fully at 0.8 mm, colours tint and dim, black blocks, ranges keep white\'s contrast', () => {
  const neutral = [1, 1, 1];
  const white = transmissionRGB(0.8, absorption('pla', 'white'), neutral);
  assert.ok(white.every(v => Math.abs(v - 0.97) < 1e-9));
  const pink = transmissionRGB(0.8, absorption('pla', 'pink'), neutral);
  assert.ok(pink[0] > pink[1] && pink[0] > pink[2], 'Pink passes red best');
  assert.ok(transmissionRGB(0.8, absorption('pla', 'black'), neutral).every(v => v < 0.1), 'Black lets almost nothing through');
  assert.ok(transmissionRGB(3, absorption('petg', 'white'), neutral)[0] > transmissionRGB(3, absorption('pla', 'white'), neutral)[0], 'PETG is more translucent');
  assert.deepEqual(recommendedRange('pla', 'white'), [0.8, 3]);
  assert.deepEqual(recommendedRange('petg', 'white'), [0.8, 3.2]);
  const rich = contrastWords(0.8, 3, absorption('pla', 'white'));
  for (const colour of ['ivory', 'grey', 'yellow', 'pink', 'blue']) {
    const [min, max] = recommendedRange('pla', colour);
    assert.ok(min < max && max <= 3, `${colour} gets a thinner range`);
    assert.equal(contrastWords(min, max, absorption('pla', colour)).word, rich.word, `${colour} keeps white's contrast`);
  }
  assert.equal(contrastWords(0.8, 1.6, absorption('pla', 'white')).word, 'Flat');
  assert.equal(Object.keys(COLOURS).length, 9);
});

test('a tall panel laid on its long edge is bounded the way it prints', () => {
  const panel = { shape: 'flat', width: 101.6, height: 152.4, border: 3, minThickness: 0.8, maxThickness: 3, resolution: 1 };
  assert.deepEqual(estimateBounds({ ...panel, turn: true }), { x: 152.4, y: 3, z: 101.6 });
  assert.equal(printerFit(estimateBounds({ ...panel, turn: true }), 8, { x: 180, y: 180, z: 180 }).brimFits, true);
});
