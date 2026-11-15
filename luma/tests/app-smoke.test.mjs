/**
 * Application smoke checks in a simulated DOM, not a browser.
 *
 * Run: node --test luma/tests/app-smoke.test.mjs
 * Development dependencies: linkedom and @napi-rs/canvas (see luma/README.md).
 * Resolve them from the project, or set LUMA_LINKEDOM_MODULE and
 * LUMA_CANVAS_MODULE to their package directories.
 *
 * Loads the actual HTML, application, Three.js modules, sample photograph,
 * image-processing code, mesh generator and STL exporter. WebGL deliberately
 * fails so the application's 2D fallback runs. Worker is deliberately absent
 * so this checks the main-thread export fallback only. It does not verify a
 * browser renderer, touch interaction, downloads on iOS, HEIC or a printer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { File } from 'node:buffer';

const require = createRequire(import.meta.url);
const dist = new URL('../', import.meta.url);

function dependency(name, override, fallbacks = []) {
  const candidates = process.env[override] ? [process.env[override]] : [name, ...fallbacks];
  for (const candidate of candidates.filter(Boolean)) {
    try { return require(candidate); }
    catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
  }
  throw new Error(`Install ${name}, or set ${override} to its package directory.`);
}

function near(actual, expected, tolerance = 1e-4, description = '') {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${description}: expected ${expected}, received ${actual}`);
}

async function until(predicate, description, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await pause(20);
  }
  assert.fail(`Timed out waiting for ${description}`);
}

/** Decode the downloaded file independently of the mesh generator. */
async function inspectSTL(blob, targets = [], innerRadius = null) {
  assert.equal(blob.type, 'model/stl');
  const buffer = await blob.arrayBuffer();
  const view = new DataView(buffer);
  const count = view.getUint32(80, true);
  const header = new TextDecoder().decode(buffer.slice(0, 80));
  assert.match(header, /units: mm.*upright Z.*image faces -Y/);
  assert.equal(buffer.byteLength, 84 + count * 50);
  assert.ok(count > 0);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const hits = targets.map(() => ({ distance: Infinity, point: null }));
  let volume = 0, minRadius = Infinity, maxRadius = -Infinity;
  for (let i = 0; i < count; i++) {
    const start = 84 + i * 50;
    const normal = [0, 4, 8].map(offset => view.getFloat32(start + offset, true));
    assert.ok(normal.every(Number.isFinite));
    near(Math.hypot(...normal), 1, 2e-6, 'Unit STL normal');
    const vertices = [];
    for (let v = 0; v < 3; v++) {
      const at = start + 12 + v * 12;
      const point = [0, 4, 8].map(offset => view.getFloat32(at + offset, true));
      assert.ok(point.every(Number.isFinite));
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], point[a]);
        hi[a] = Math.max(hi[a], point[a]);
      }
      if (innerRadius !== null) {
        const radius = Math.hypot(point[0], point[1] - innerRadius);
        minRadius = Math.min(minRadius, radius);
        maxRadius = Math.max(maxRadius, radius);
      }
      // Flat panels have their relief face at negative Y and the back at Y=0.
      if (point[1] < -0.1) for (let q = 0; q < targets.length; q++) {
        const distance = (point[0] - targets[q].x) ** 2 + (point[2] - targets[q].z) ** 2;
        if (distance < hits[q].distance) hits[q] = { distance, point };
      }
      vertices.push(point);
    }
    const [a, b, c] = vertices;
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1])
      + a[1] * (b[2] * c[0] - b[0] * c[2])
      + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    assert.equal(view.getUint16(start + 48, true), 0, 'Monochrome STL has no color attribute');
  }
  assert.ok(volume > 0, 'Downloaded STL has positive signed volume');
  near(lo[2], 0, 1e-6, 'Panel rests at Z=0');
  for (let q = 0; q < targets.length; q++) {
    assert.ok(hits[q].distance < 0.1, `Found a relief vertex near ${targets[q].name}`);
    near(-hits[q].point[1], targets[q].thickness, 2e-4, targets[q].name);
  }
  return { count, lo, hi, size: hi.map((value, i) => value - lo[i]), volume, minRadius, maxRadius };
}

test('photo-to-STL application flow in a DOM simulation', { timeout: 90_000 }, async t => {
  const { parseHTML } = dependency('linkedom', 'LUMA_LINKEDOM_MODULE', ['/tmp/luma-qa/node_modules/linkedom']);
  const { createCanvas, loadImage } = dependency('@napi-rs/canvas', 'LUMA_CANVAS_MODULE', [
    process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES && `${process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES}/@napi-rs/canvas`,
  ]);
  const { window, document } = parseHTML(await readFile(new URL('index.html', dist), 'utf8'));
  const $ = id => { const element = document.getElementById(id); assert.ok(element, `HTML contains #${id}`); return element; };
  const objects = new Map(), downloads = [], canvases = new WeakMap(), timers = new Set();
  let objectNumber = 0, webglAttempts = 0;
  const originals = new Map();
  const replaceGlobal = (key, value) => {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  const originalCreateURL = URL.createObjectURL, originalRevokeURL = URL.revokeObjectURL;
  const originalSetTimeout = globalThis.setTimeout;
  const originalConsoleError = console.error;
  t.after(() => {
    for (const timer of timers) clearTimeout(timer);
    URL.createObjectURL = originalCreateURL; URL.revokeObjectURL = originalRevokeURL;
    console.error = originalConsoleError;
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });

  // Reflect browser form properties that linkedom does not implement.
  for (const name of ['min', 'max', 'step']) Object.defineProperty(window.HTMLInputElement.prototype, name, {
    configurable: true, get() { return this.getAttribute(name) || ''; },
    set(value) { this.setAttribute(name, String(value)); },
  });
  Object.defineProperty(window.HTMLInputElement.prototype, 'labels', {
    configurable: true, get() { return [...document.querySelectorAll('label')].filter(label => label.getAttribute('for') === this.id); },
  });
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get() { return [...this.options].find(option => option.hasAttribute('selected'))?.value ?? this.options[0]?.value ?? ''; },
    set(value) { for (const option of this.options) option.toggleAttribute('selected', option.value === String(value)); },
  });

  // HTML canvases retain their DOM identity while rasterizing with NAPI.
  for (const [name, defaultValue] of [['width', 300], ['height', 150]]) {
    Object.defineProperty(window.HTMLCanvasElement.prototype, name, {
      configurable: true,
      get() { return this.hasAttribute(name) ? Number(this.getAttribute(name)) : defaultValue; },
      set(value) {
        const dimension = Math.max(0, Math.floor(Number(value)));
        this.setAttribute(name, String(dimension));
        if (canvases.has(this)) canvases.get(this).native[name] = dimension;
      },
    });
  }
  function backing(canvas) {
    if (!canvases.has(canvas)) canvases.set(canvas, { native: createCanvas(canvas.width, canvas.height) });
    return canvases.get(canvas);
  }
  const unwrap = image => image instanceof window.HTMLCanvasElement ? backing(image).native : image.nativeImage || image;
  window.HTMLCanvasElement.prototype.getContext = function (kind) {
    if (kind !== '2d') { webglAttempts++; throw new Error('WebGL deliberately unavailable in DOM simulation'); }
    const record = backing(this), domCanvas = this;
    if (!record.context) record.context = new Proxy({}, {
      get(_target, key) {
        if (key === 'canvas') return domCanvas;
        const ctx = record.native.getContext('2d');
        if (key === 'drawImage') return (image, ...args) => ctx.drawImage(unwrap(image), ...args);
        const value = ctx[key];
        return typeof value === 'function' ? value.bind(ctx) : value;
      },
      set(_target, key, value) { record.native.getContext('2d')[key] = value; return true; },
    });
    return record.context;
  };
  window.HTMLCanvasElement.prototype.toDataURL = function (...args) { return backing(this).native.toDataURL(...args); };
  window.HTMLCanvasElement.prototype.setPointerCapture = () => {};

  class ImageShim {
    get width() { return this.nativeImage?.width || 0; }
    get height() { return this.nativeImage?.height || 0; }
    get naturalWidth() { return this.width; }
    get naturalHeight() { return this.height; }
    get src() { return this.source; }
    set src(value) {
      this.source = String(value);
      Promise.resolve().then(async () => {
        let input;
        if (objects.has(this.source)) input = Buffer.from(await objects.get(this.source).arrayBuffer());
        else if (this.source.startsWith('data:image/')) input = this.source;
        else {
          assert.ok(!/^https?:/i.test(this.source), 'The smoke test never fetches network images');
          input = fileURLToPath(new URL(this.source, dist));
        }
        this.nativeImage = await loadImage(input);
        this.onload?.({ target: this });
      }).catch(error => this.onerror?.(error));
    }
  }
  URL.createObjectURL = blob => { const url = `blob:luma-smoke/${++objectNumber}`; objects.set(url, blob); return url; };
  URL.revokeObjectURL = url => objects.delete(String(url));
  window.HTMLAnchorElement.prototype.click = function () {
    const url = this.href, blob = objects.get(url);
    assert.ok(blob, `Download ${this.download} references an existing in-memory Blob`);
    downloads.push({ name: this.download || this.getAttribute('download'), url, blob });
  };
  replaceGlobal('window', window); replaceGlobal('document', document);
  replaceGlobal('self', window); replaceGlobal('Image', ImageShim); replaceGlobal('Worker', undefined);
  replaceGlobal('setTimeout', (callback, delay, ...args) => {
    const timer = originalSetTimeout(callback, delay, ...args); timers.add(timer);
    if (delay >= 6000) timer.unref();
    return timer;
  });
  console.error = (...args) => {
    if (args.map(String).join(' ').includes('WebGL deliberately unavailable in DOM simulation')) return;
    originalConsoleError(...args);
  };

  function event(id, kind = 'click') { $(id).dispatchEvent(new window.Event(kind, { bubbles: true })); }
  function set(id, value, kind = 'input') { $(id).value = String(value); event(id, kind); }
  async function settled() {
    await pause(160);
    await until(() => !$('viewerStatus').textContent.includes('Updating preview'), 'preview update');
  }
  async function upload(id, file) {
    Object.defineProperty($(id), 'files', { configurable: true, value: [file] });
    event(id, 'change');
    await until(() => !$('projectSaveBtn').disabled, 'file processing');
    await settled();
  }
  async function download(id) {
    const before = downloads.length; event(id);
    await until(() => downloads.length > before, `${id} download`);
    await until(() => !$('projectSaveBtn').disabled, 'export completion');
    return downloads.at(-1);
  }
  const pixels = () => $('photoCanvas').getContext('2d').getImageData(0, 0, $('photoCanvas').width, $('photoCanvas').height).data;

  await import(new URL('app.js', dist));
  await until(() => !$('exportBtn').disabled && $('viewerStatus').textContent.includes('2D preview'), 'sample initialization');
  await settled();

  await t.test('loads the actual sample and the intentional 2D fallback', () => {
    assert.ok(webglAttempts > 0, 'Actual Three.js renderer attempted to create WebGL');
    assert.equal($('fallbackCanvas').hidden, false);
    assert.match($('fileName').textContent, /Sample/);
    assert.match($('dimensionLabel').textContent, /100 × 150 mm/);
    assert.match($('modelStats').textContent, /0.3 mm detail/);
    assert.equal($('fitBadge').textContent, 'Fits P2S');
    const data = pixels();
    assert.ok(data.some((value, i) => i % 4 === 0 && value < 100), 'Sample raster has dark content');
    assert.ok(data.some((value, i) => i % 4 === 0 && value > 200), 'Sample raster has light content');
  });

  await t.test('shape controls and the 4×6 preset update the actual form', async () => {
    event('shape-curved'); await settled();
    assert.equal($('shape-curved').getAttribute('aria-pressed'), 'true');
    assert.equal($('flatFields').hidden, true); assert.equal($('curvedFields').hidden, false);
    assert.match($('radiusLabel').textContent, /Ø 90 mm inside/);
    set('presetSelect', '4x6', 'change'); await settled();
    assert.equal($('shape-flat').getAttribute('aria-pressed'), 'true');
    assert.equal($('widthInput').value, '101.6'); assert.equal($('heightInput').value, '152.4');
    assert.match($('dimensionLabel').textContent, /101.6 × 152.4 mm/);
  });

  let saved;
  await t.test('tone, crop, rotation and mirror are saved with the photo', async () => {
    const before = Buffer.from(pixels());
    set('brightnessInput', 17); set('contrastInput', 125); set('zoomInput', 1.25);
    set('cropX', 32); set('cropY', -20); set('fitSelect', 'contain');
    event('rotateBtn'); event('mirrorBtn'); await settled();
    assert.equal($('brightnessValue').textContent, '+17'); assert.equal($('contrastValue').textContent, '125%');
    assert.equal($('mirrorBtn').getAttribute('aria-pressed'), 'true');
    assert.notDeepEqual(Buffer.from(pixels()), before, 'Tone/transforms change rasterized photo');
    const file = await download('projectSaveBtn');
    assert.equal(file.name, 'luma-project.json'); saved = JSON.parse(await file.blob.text());
    assert.equal(saved.format, 'luma-lithophane'); assert.equal(saved.version, 1);
    assert.equal(saved.rotation, 90); assert.equal(saved.mirror, true);
    assert.equal(saved.fields.brightnessInput, '17'); assert.equal(saved.fields.fitSelect, 'contain');
    assert.match(saved.image, /^data:image\/jpeg;base64,/);
  });

  await t.test('opens a saved project and rejects invalid projects without losing work', async () => {
    set('presetSelect', 'nightlight', 'change'); set('brightnessInput', -20); await settled();
    await upload('projectInput', new File([JSON.stringify(saved)], 'saved.json', { type: 'application/json' }));
    assert.match($('toast').textContent, /Project opened/);
    for (const [id, value] of Object.entries(saved.fields)) assert.equal($(id).value, value, `${id} restored`);
    assert.equal($('shape-flat').getAttribute('aria-pressed'), 'true');
    assert.equal($('mirrorBtn').getAttribute('aria-pressed'), 'true');
    const invalid = structuredClone(saved); invalid.fields.widthInput = '999';
    await upload('projectInput', new File([JSON.stringify(invalid)], 'invalid.json', { type: 'application/json' }));
    assert.match($('toast').textContent, /out-of-range/);
    for (const [id, value] of Object.entries(saved.fields)) assert.equal($(id).value, value, `${id} kept after rejection`);
    assert.equal($('exportBtn').disabled, false);
    await upload('projectInput', new File(['{"format":"another-tool"}'], 'wrong.json', { type: 'application/json' }));
    assert.match($('toast').textContent, /valid Luma project/);
    assert.equal($('fileName').textContent, saved.name);
  });

  await t.test('invalid thickness and sizes disable export; large panels identify brim limits', async () => {
    set('widthInput', 0); await settled();
    assert.equal($('exportBtn').disabled, true); assert.match($('fitMessage').textContent, /Width must be between/);
    set('widthInput', 250); set('heightInput', 255); await settled();
    assert.equal($('exportBtn').disabled, false); assert.equal($('fitBadge').textContent, 'Check brim');
    set('minThicknessInput', 2); set('maxThicknessInput', 1.5); await settled();
    assert.equal($('exportBtn').disabled, true); assert.match($('fitMessage').textContent, /greater than/);
    set('minThicknessInput', 0.8); set('maxThicknessInput', 3);
    set('presetSelect', '4x6', 'change'); set('fitSelect', 'cover'); await settled();
    assert.equal($('exportBtn').disabled, false);
  });

  await t.test('uploads a new PNG through the file-input event and resets transformations', async () => {
    const source = createCanvas(120, 180), ctx = source.getContext('2d');
    for (const [color, x, y] of [['black', 0, 0], ['white', 60, 0], ['#ff0000', 0, 90], ['#00ff00', 60, 90]]) {
      ctx.fillStyle = color; ctx.fillRect(x, y, 60, 90);
    }
    await upload('photoInput', new File([source.toBuffer('image/png')], 'qa-asymmetric.png', { type: 'image/png' }));
    assert.equal($('fileName').textContent, 'qa-asymmetric.png');
    assert.equal($('mirrorBtn').getAttribute('aria-pressed'), 'false');
    assert.equal($('brightnessInput').value, '0'); assert.equal($('contrastInput').value, '100');
    assert.equal($('zoomInput').value, '1'); assert.equal($('cropX').value, '0');
    const canvas = $('photoCanvas'), ctx2 = canvas.getContext('2d');
    const sample = (x, y) => ctx2.getImageData(Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1).data[0];
    near(sample(0.25, 0.25), 0, 1); near(sample(0.75, 0.25), 255, 1);
    near(sample(0.25, 0.75), 54, 1); near(sample(0.75, 0.75), 182, 1);
    const project = JSON.parse(await (await download('projectSaveBtn')).blob.text());
    assert.equal(project.rotation, 0); assert.equal(project.mirror, false); assert.equal(project.sample, false);
  });

  await t.test('exports a full Standard 4×6 STL with correct size, grayscale and image orientation', async () => {
    assert.equal($('detailSelect').value, '0.3');
    // Standing as it hangs, so the image can be checked in place; the long-edge turn is checked below.
    set('standSelect', 'bottom'); await settled();
    const w = 101.6, h = 152.4, b = 3, light = 0.8, dark = 3;
    const target = (name, u, v, gray) => ({ name, x: -w / 2 + b + (w - 2 * b) * u,
      z: b + (h - 2 * b) * v, thickness: light + (dark - light) * (1 - gray) });
    const file = await download('exportBtn');
    assert.equal(file.name, 'qa-asymmetric-flat-101.6x152.4mm.stl');
    const result = await inspectSTL(file.blob, [
      target('Top-left black remains top-left and thick', 0.25, 0.75, 0),
      target('Top-right white remains top-right and thin', 0.75, 0.75, 1),
      target('Bottom-left red maps to luminance-weighted thickness', 0.25, 0.25, 0.2126),
      target('Bottom-right green maps to luminance-weighted thickness', 0.75, 0.25, 0.7152),
    ]);
    for (const [axis, expected] of [w, dark, h].entries()) near(result.size[axis], expected, 2e-5);
    assert.ok(result.count > 500_000, 'Tests a full-size Standard mesh, not a coarse miniature');
    assert.equal($('downloadResult').hidden, false); assert.match($('downloadDetails').textContent, /100% scale/);
    assert.equal($('exportLabel').textContent, 'Download STL again');
    const repeated = await download('exportBtn');
    assert.equal(repeated.url, file.url, 'Repeated download uses the completed export');
    assert.equal(repeated.blob, file.blob);
    set('brightnessInput', 1); await settled();
    assert.equal($('downloadResult').hidden, true); assert.equal(objects.has(file.url), false, 'Editing invalidates old export');
    set('brightnessInput', 0); await settled();
    set('standSelect', 'long'); await settled();
    assert.equal($('tuningNote').textContent, 'Prints on its long edge');
    const turned = await inspectSTL((await download('exportBtn')).blob);
    for (const [axis, expected] of [h, dark, w].entries()) near(turned.size[axis], expected, 2e-5);
    assert.match($('downloadDetails').textContent, /long edge/);
    t.diagnostic(`Standard 4×6: ${result.count.toLocaleString()} triangles, ${(file.blob.size / 1e6).toFixed(2)} MB, ${result.size.map(v => v.toFixed(2)).join(' × ')} mm.`);
  });

  await t.test('exports an upright curved panel with the selected inside diameter', async () => {
    event('shape-curved'); set('diameterInput', 60); set('angleInput', 120); set('curveHeightInput', 70); await settled();
    const file = await download('exportBtn'), result = await inspectSTL(file.blob, [], 30);
    assert.match(file.name, /-curved-/);
    near(result.size[0], 66 * Math.sin(Math.PI / 3), 1e-4);
    near(result.size[1], 18, 0.003); near(result.size[2], 70);
    near(result.minRadius, 30, 1e-5); near(result.maxRadius, 33, 1e-5);
    assert.equal($('fitBadge').textContent, 'Fits P2S');
  });

  await t.test('exports a lamp: a closed ring round the selected inside diameter', async () => {
    set('presetSelect', 'lamp', 'change'); await settled();
    assert.equal($('shape-cylinder').getAttribute('aria-pressed'), 'true');
    assert.equal($('angleField').hidden, true);
    assert.match($('dimensionLabel').textContent, /Ø 86 × 100 mm/);
    const file = await download('exportBtn'), result = await inspectSTL(file.blob, [], 40);
    assert.match(file.name, /-lamp-d80\.0x100\.0mm\.stl$/);
    near(result.size[0], 86, 0.05); near(result.size[1], 86, 0.05); near(result.size[2], 100);
    near(result.minRadius, 40, 1e-3); near(result.maxRadius, 43, 1e-3);
    set('presetSelect', 'custom', 'change'); event('shape-curved'); await settled();
  });

  await t.test('exports a seven-step calibration strip with its matching thickness key', async () => {
    const targets = Array.from({ length: 7 }, (_, i) => ({ name: `Calibration step ${i + 1}`,
      x: -35 + 1.5 + (i + 0.5) * 67 / 7, z: 12.5, thickness: 0.6 + 0.5 * i }));
    const file = await download('calibrationBtn'), result = await inspectSTL(file.blob, targets);
    assert.equal(file.name, 'luma-thickness-test-0.6-to-3.6mm.stl');
    for (const [axis, expected] of [70, 3.6, 25].entries()) near(result.size[axis], expected);
    assert.match($('calibrationInfo').textContent, /0\.6, 1\.1, 1\.6, 2\.1, 2\.6, 3\.1, 3\.6 mm/);
    // Reading the strip back sets the range.
    set('stripLight', '1.1', 'change'); set('stripDark', '2.6', 'change'); event('stripApplyBtn'); await settled();
    assert.equal($('minThicknessInput').value, '1.1'); assert.equal($('maxThicknessInput').value, '2.6');
    set('minThicknessInput', '0.8'); set('maxThicknessInput', '3'); await settled();
  });

  await t.test('rejects non-photo and corrupt-image uploads while preserving the active photo', async () => {
    await upload('photoInput', new File(['text'], 'not-a-photo.txt', { type: 'text/plain' }));
    assert.match($('toast').textContent, /Choose a photo/); assert.equal($('fileName').textContent, 'qa-asymmetric.png');
    await upload('photoInput', new File(['invalid PNG'], 'corrupt.png', { type: 'image/png' }));
    assert.match($('toast').textContent, /could not read that photo/); assert.equal($('fileName').textContent, 'qa-asymmetric.png');
    assert.equal($('exportBtn').disabled, false);
  });
  t.diagnostic('DOM + NAPI Canvas only. WebGL, a real browser, workers, HEIC and physical printing were not tested.');
});
