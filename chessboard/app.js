import { loadKit, makeStage, buildStory, buildParts, setFilament, CHAPTERS, STORY_END } from './viewer.js';
import { LINES, FILAMENTS } from './filaments.js';

const $ = (s, r = document) => r.querySelector(s);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ======================================================================= the plan
   Estimates for a Bambu Lab P2S, 0.4 nozzle, at the project's own settings, from the
   volume and surface of the real parts (see README). Purge and swap time included. */
const PLATE_GAP = 10; // minutes to take a plate off and start the next
const PLATES = {
  two: [
    { n: 1, img: 'img/plate-1.webp', name: 'Fit test', note: 'The real hinge, latch and a corner peg. Pin them and close them: a firm push, a click, then they pull themselves shut.', min: 50, light: 37, dark: 0, layer: '0.20' },
    { n: 2, img: 'img/plate-2.webp', name: 'Lid · half A', note: 'Ranks 1–4, face down, the ERRERLabs panel inside. Don\'t rotate it: the plate forms the playing surface.', min: 220, light: 179, dark: 14, layer: '0.20' },
    { n: 3, img: 'img/plate-3.webp', name: 'Tray · half B', note: 'Ranks 5–8, face down, with the latch springs and the star ornament.', min: 220, light: 182, dark: 14, layer: '0.20' },
    { n: 4, img: 'img/plate-4.webp', name: 'Marble pieces', note: 'Sixteen pieces, upright, solid, at fine layers.', min: 135, light: 40, dark: 0, layer: '0.16' },
    { n: 5, img: 'img/plate-5.webp', name: 'Black pieces', note: 'The other sixteen. A 44 mm king, a 22 mm pawn.', min: 135, light: 0, dark: 40, layer: '0.16' },
  ],
  mono: [
    { n: 1, img: 'img/plate-1.webp', name: 'Fit test', note: 'The real hinge, latch and a corner peg. Check the fits before the long prints.', min: 50, light: 37, dark: 0, layer: '0.20' },
    { n: 2, img: 'img/plate-2.webp', name: 'Lid · half A', note: 'One colour, with 0.8 mm pockets where the dark squares and rules go.', min: 205, light: 177, dark: 0, layer: '0.20' },
    { n: 3, img: 'img/plate-3.webp', name: 'Tray · half B', note: 'One colour, with the same pockets for the inlays.', min: 205, light: 180, dark: 0, layer: '0.20' },
    { n: 4, img: null, name: 'Inlay tiles', note: '32 dark tiles, printed face-down so they match the board. Press each in with a drop of CA.', min: 30, light: 0, dark: 20, layer: '0.20' },
    { n: 5, img: 'img/plate-4.webp', name: 'Marble pieces', note: 'Sixteen pieces, upright, solid, at fine layers.', min: 135, light: 40, dark: 0, layer: '0.16' },
    { n: 6, img: 'img/plate-5.webp', name: 'Black pieces', note: 'The other sixteen.', min: 135, light: 0, dark: 40, layer: '0.16' },
  ],
};
const TILE_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><g fill="#1b1b1d">${Array.from({ length: 32 }, (_, i) => `<rect x="${8 + (i % 8) * 10.6}" y="${24 + Math.floor(i / 8) * 13}" width="8" height="10" rx="1"/>`).join('')}</g></svg>`;

let kitMode = 'two';
const fmtDur = (m) => { const h = Math.floor(m / 60), r = Math.round(m % 60); return h ? `${h} h${r ? ` ${String(r).padStart(2, '0')} m` : ''}` : `${r} min`; };
const fmtG = (g) => `${Math.round(g)} g`;
const clock = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

function defaultStart() {
  const d = new Date();
  d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function renderPlan() {
  const plates = PLATES[kitMode];
  const start = new Date($('#startAt').value || defaultStart());
  let t = start.getTime();
  const ol = $('#plates');
  ol.innerHTML = '';
  ol.style.gridTemplateColumns = '';
  let light = 0, dark = 0, mins = 0;
  plates.forEach((p, i) => {
    const end = new Date(t + p.min * 60000);
    const h = end.getHours();
    const night = h >= 22 || h < 7;
    const li = document.createElement('li');
    li.className = 'plate';
    li.innerHTML = `
      <div class="pimg">${p.img ? `<img src="${p.img}" alt="" loading="lazy" width="400" height="400">` : TILE_SVG}<span class="pnum">${p.n}</span></div>
      <div class="pbody">
        <h3>${p.name}</h3>
        <p>${p.note}</p>
        <div class="pmeta">
          <span><b>≈ ${fmtDur(p.min)}</b></span>
          <span class="swatches">${p.light ? `<i class="sw l" title="Filament 1"></i><b>${fmtG(p.light)}</b>` : ''}${p.dark ? `<i class="sw d" title="Filament 2"></i><b>${fmtG(p.dark)}</b>` : ''}</span>
          <span>${p.layer} mm layers</span>
        </div>
        <span class="pdone${night ? ' night' : ''}">${night ? '☾ ' : '✓ '}done ${clock.format(end)}</span>
      </div>`;
    ol.appendChild(li);
    light += p.light; dark += p.dark; mins += p.min;
    t = end.getTime() + (i < plates.length - 1 ? PLATE_GAP * 60000 : 0);
  });
  if (plates.length === 6 && innerWidth > 1000) ol.style.gridTemplateColumns = 'repeat(6,1fr)';

  // the ribbon: each plate's share of the printer's time
  const rib = $('#ribbon');
  rib.innerHTML = plates.map((p) => {
    const bg = p.light && p.dark ? 'linear-gradient(180deg,var(--fil-l) 0 70%,var(--fil-d) 70%)' : p.dark ? 'var(--fil-d)' : 'var(--fil-l)';
    return `<span style="flex:${p.min};background:${bg}" title="${p.name}: ${fmtDur(p.min)}"></span>`;
  }).join('');
  const total = mins + PLATE_GAP * (plates.length - 1);
  const marks = [0, 0.25, 0.5, 0.75, 1].map((f) => `<span>${f === 0 ? 'start' : fmtDur(total * f)}</span>`);
  $('#ribbonScale').innerHTML = marks.join('');

  $('#totTime').textContent = `≈ ${fmtDur(mins)}`;
  $('#totFinish').textContent = `all done ${clock.format(new Date(t))}, with ${PLATE_GAP} min between plates`;
  $('#totLight').textContent = fmtG(light);
  $('#totDark').textContent = fmtG(dark);
  const perKg = Math.max(0, +$('#perKg').value || 0);
  $('#totCost').textContent = (() => {
    try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format((light + dark) / 1000 * perKg); }
    catch { return `$${((light + dark) / 1000 * perKg).toFixed(2)}`; }
  })();
  if (kitMode === 'two') {
    $('#factHours').textContent = `≈ ${Math.round(mins / 30) / 2} h`.replace('.5', '½');
    $('#factGrams').textContent = `≈ ${Math.round((light + dark) / 10) * 10} g`;
  }
}

function initPlan() {
  $('#startAt').value = defaultStart();
  $('#startAt').addEventListener('input', renderPlan);
  $('#perKg').addEventListener('input', renderPlan);
  document.querySelectorAll('[data-kit]').forEach((b) => b.addEventListener('click', () => {
    kitMode = b.dataset.kit;
    document.querySelectorAll('[data-kit]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    renderPlan();
  }));
  addEventListener('resize', () => { if (kitMode === 'mono') renderPlan(); });
  renderPlan();
}

/* ======================================================================= the story */
function initStory(kit) {
  const stage = makeStage($('#storyCanvas'));
  const story = buildStory(stage, kit);
  const { camera, controls } = stage;
  const frame = () => {
    const a = camera.aspect;
    const d = a < 0.8 ? 860 : a < 1.2 ? 680 : 520;
    camera.position.set(-d * 0.18, d * 0.62, d * 0.78);
    controls.target.set(0, 18, 0);
  };
  frame();

  const scrub = $('#scrub'), playBtn = $('#playBtn');
  let t = 0, dir = 1, playing = !reduceMotion, hold = 0, last = performance.now();
  let userTouched = false, touchTimer = 0;
  if (reduceMotion) t = 13.8;

  // chapters
  const chapBox = $('#chapters');
  CHAPTERS.forEach((c, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = `<i>${i + 1}</i>${c.title}`;
    b.addEventListener('click', () => { t = c.t + (i ? 0.001 : 0); dir = 1; hold = 0; setPlaying(true); });
    chapBox.appendChild(b);
    const tick = document.createElement('span');
    tick.style.left = `${(c.t / STORY_END) * 100}%`;
    $('#ticks').appendChild(tick);
  });
  const chapBtns = [...chapBox.children];

  let capKey = '';
  function caption() {
    let i = 0;
    CHAPTERS.forEach((c, k) => { if (t >= c.t) i = k; });
    const packing = dir < 0 && playing && t > 0.05;
    const key = packing ? 'pack' : String(i);
    chapBtns.forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
    if (key === capKey) return;
    capKey = key;
    const cap = $('.caption');
    $('#capStep').textContent = packing ? 'Packing away' : `${i + 1} / ${CHAPTERS.length}`;
    $('#capTitle').textContent = packing ? 'Pack it away' : CHAPTERS[i].title;
    $('#capText').textContent = packing ? 'Everything goes back the way it came, and the lid clicks shut over it.' : CHAPTERS[i].text;
    cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
  }

  function setPlaying(p) {
    playing = p;
    playBtn.classList.toggle('paused', !p);
    playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play');
    controls.autoRotate = p && !userTouched;
  }
  playBtn.addEventListener('click', () => {
    if (!playing && dir > 0 && t >= STORY_END - 0.01) t = 0;
    if (!playing && dir < 0 && t <= 0.01) dir = 1;
    hold = 0;
    setPlaying(!playing);
  });
  $('#packBtn').addEventListener('click', () => {
    if (t < 0.05) t = STORY_END;
    dir = -1; hold = 0; setPlaying(true);
  });
  scrub.addEventListener('input', () => { t = (scrub.value / 1000) * STORY_END; setPlaying(false); });

  controls.autoRotateSpeed = 0.35;
  controls.addEventListener('start', () => {
    userTouched = true; controls.autoRotate = false;
    $('#dragHint').classList.add('gone');
    clearTimeout(touchTimer);
    touchTimer = setTimeout(() => { userTouched = false; controls.autoRotate = playing; }, 9000);
  });

  stage.onTick((now) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (playing) {
      if (hold > 0) {
        hold -= dt;
        if (hold <= 0) { dir = -dir; }
      } else {
        t += dt * dir * (dir < 0 ? 1.35 : 1);
        if (t >= STORY_END) { t = STORY_END; hold = 3.2; }
        if (t <= 0) { t = 0; hold = 1.6; }
      }
    }
    story.pose(t);
    scrub.value = String(Math.round((t / STORY_END) * 1000));
    caption();
  });
  setPlaying(playing);
  story.pose(t);
  caption();
  $('#storyLoading').classList.add('done');
}

/* ======================================================================= the parts */
const PARTS = [
  { id: 'fit', name: 'Fit test', sub: 'plate 1', what: 'Two coupons cut from the real case: the hinge knuckles, the latch tongue and springs, and a corner peg with its socket. Pin them with a short length of filament and close them.',
    size: '43.6 × 61.8 × 16 mm each', file: 'fit_test_A.stl, fit_test_B.stl', tris: 29686 + 30054, orient: 'as shown, no supports', est: '≈ 50 min · 37 g', dl: 'files/fit_test.zip', kit: ['fitA', 'fitB'] },
  { id: 'lid', name: 'Lid · half A', sub: 'plate 2', what: 'Ranks 1–4. Inside: half of every nest, the latch tongue, and the ERRERLabs maker\'s panel in raised Crimson Text. The dark part is the first 0.8 mm of the face: squares, coordinates, double rule, stars.',
    size: '218 × 112.8 × 16 mm', file: 'half_A_light.stl + half_A_dark.stl', tris: 244750 + 3656, orient: 'face down: the plate is the playing surface', est: '≈ 3 h 40 m · 193 g', dl: 'files/board_two_colour.zip', kit: ['lidLight', 'lidDark'], flip: true },
  { id: 'tray', name: 'Tray · half B', sub: 'plate 3', what: 'Ranks 5–8. The other half of every nest, the twin-beam latch springs, the finger notch and the compass-star ornament.',
    size: '218 × 112.8 × 16 mm', file: 'half_B_light.stl + half_B_dark.stl', tris: 238086 + 3992, orient: 'face down, like the lid', est: '≈ 3 h 40 m · 196 g', dl: 'files/board_two_colour.zip', kit: ['trayLight', 'trayDark'], flip: true },
  { id: 'marble', name: 'Marble pieces', sub: 'plate 4', what: 'Sixteen Staunton-style pieces sized for 25 mm squares. Every lathe overhang is under 45–50°, and the bottom edge is chamfered against elephant\'s foot, so they print upright with nothing under them.',
    size: 'king 44.2 mm tall, Ø 19 mm', file: 'pieces_marble.stl', tris: 96092, orient: 'upright', est: '≈ 2 h 15 m · 40 g', dl: 'files/pieces.zip', kit: ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'] },
  { id: 'black', name: 'Black pieces', sub: 'plate 5', what: 'The same sixteen, in black. The queen\'s crown points have 1.6 mm bases so they print crisply with a 0.4 mm nozzle.',
    size: 'pawn 21.8 mm tall, Ø 14.5 mm', file: 'pieces_black.stl', tris: 96092, orient: 'upright', est: '≈ 2 h 15 m · 40 g', dl: 'files/pieces.zip', kit: ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'] },
  { id: 'tiles', name: 'Inlay tiles', sub: 'single-colour kit', what: 'For a printer with one extruder: print the halves in one light colour, and these 32 tiles in a dark one, face-down, then press them into the board\'s 0.8 mm pockets.',
    size: '212.4 × 105.2 × 0.8 mm plate', file: 'mono_inlay_tiles.stl', tris: 768, orient: 'face down', est: '≈ 30 min · 20 g', dl: 'files/board_single_colour.zip', kit: ['tiles'], flip: true },
];

function initParts(kit) {
  const stage = makeStage($('#partCanvas'), { fov: 30 });
  const parts = buildParts(stage, kit);
  const list = $('#partList'), card = $('#partCard'), faceBtn = $('#faceBtn'), spinBtn = $('#spinBtn');
  let current = PARTS[0], face = false, spin = !reduceMotion;
  spinBtn.setAttribute('aria-pressed', String(spin));

  function select(p) {
    current = p;
    [...list.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === p.id)));
    if (!p.flip) face = false;
    const { size } = parts.show(p.id, face);
    faceBtn.disabled = !p.flip;
    faceBtn.setAttribute('aria-pressed', String(face));
    faceBtn.textContent = face ? 'Show it as printed' : 'Turn it over';
    const r = Math.max(size.x, size.y, size.z * 2.2);
    const d = r * (stage.camera.aspect < 1 ? 2.4 : 1.75) + 40;
    stage.camera.position.set(-d * 0.35, d * 0.7, d * 0.75);
    stage.controls.target.set(0, size.z * 0.3, 0);
    const shown = p.kit.reduce((s, k) => s + kit.meshes[k].tris, 0);
    card.innerHTML = `
      <h3>${p.name}</h3>
      <p>${p.what}</p>
      <dl>
        <dt>Size</dt><dd>${p.size}</dd>
        <dt>Prints</dt><dd>${p.orient}</dd>
        <dt>Estimate</dt><dd>${p.est}</dd>
        <dt>File</dt><dd><code>${p.file}</code></dd>
        <dt>Triangles</dt><dd>${p.tris.toLocaleString()} in the file${p.id === 'marble' || p.id === 'black' ? '' : ` · ${shown.toLocaleString()} drawn here`}</dd>
      </dl>
      <a href="${p.dl}" download><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-5-5m5 5l5-5M4 19h16"/></svg>Download ${p.dl.split('/').pop()}</a>`;
  }
  PARTS.forEach((p) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.id = p.id; b.setAttribute('role', 'option');
    b.innerHTML = `${p.name}<small>${p.sub}</small>`;
    b.addEventListener('click', () => select(p));
    list.appendChild(b);
  });
  faceBtn.addEventListener('click', () => { face = !face; select(current); });
  spinBtn.addEventListener('click', () => { spin = !spin; spinBtn.setAttribute('aria-pressed', String(spin)); });
  let last = performance.now();
  stage.onTick((now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (spin) parts.root.rotation.z += dt * 0.25;
  });
  stage.controls.addEventListener('start', () => { spin = false; spinBtn.setAttribute('aria-pressed', 'false'); });
  select(PARTS[0]);
}

/* ======================================================================= the latch
   The section at the latch centre, in the tray's frame (u across the latch, z up, mm),
   built from the generator's own numbers (case.py: latch()). The springs move by
   exactly the tongue's half-width at their lower inner corner, less their inner offset;
   force = both sides × stiffness × deflection × tan(wedge angle ± friction), with the
   stiffness and friction that reproduce snapfit_model.py's curve (peak 329 g close,
   633 g hold, −63 g on the ramp when opening). */
const L = {
  H: 12.2, zb: 11.0, ztop: 15.6, inner: 1.45, beamT: 0.8, sep: 0.8, slotW: 5.0, slotFloor: 8.21,
  pocketW: 5.4, pocketFloor: 16.1,
  tongue: [[1.2, 16.15], [1.2, 11.33], [2.05, 10.48], [2.05, 10.28], [1.25, 8.71]],
  k2: 572, rho: 17 * Math.PI / 180,
};
const TPROF = L.tongue.slice().sort((a, b) => a[1] - b[1]);
function halfWidth(z) {
  if (z < TPROF[0][1]) return 0;
  for (let i = 1; i < TPROF.length; i++) {
    const [w0, z0] = TPROF[i - 1], [w1, z1] = TPROF[i];
    if (z <= z1) return w0 + (w1 - w0) * ((z - z0) / (z1 - z0 || 1));
  }
  return TPROF[TPROF.length - 1][0];
}
function latchAt(s) {
  const z = L.zb - s;
  const d = Math.max(0, halfWidth(z) - L.inner);
  const deg = Math.PI / 180;
  let regime = 'free', close = 0, open = 0;
  if (d > 0) {
    if (z < 10.28) { regime = 'ramp'; close = L.k2 * d * Math.tan(27 * deg + L.rho); open = -L.k2 * d * Math.tan(27 * deg - L.rho); }
    else if (z <= 10.48) { regime = 'crest'; close = open = L.k2 * d * Math.tan(L.rho); }
    else { regime = 'shoulder'; close = -L.k2 * d * Math.tan(45 * deg - L.rho); open = L.k2 * d * Math.tan(45 * deg + L.rho); }
  }
  return { d, regime, close, open };
}

function initLatch() {
  const svg = $('#latchSvg'), fsvg = $('#forceSvg');
  const NS = 'http://www.w3.org/2000/svg';
  const X = (u) => 320 + u * 38, Y = (z) => 430 - (z - 7.4) * 38;
  const el = (tag, attrs, parent = svg) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); parent.appendChild(e); return e; };
  const poly = (pts) => pts.map(([u, z]) => `${X(u).toFixed(1)},${Y(z).toFixed(1)}`).join(' ');

  // grid
  const g0 = el('g', { stroke: '#d9d2c4', 'stroke-width': 1 });
  for (let u = -8; u <= 8; u++) el('line', { x1: X(u), x2: X(u), y1: 0, y2: 440, opacity: u % 5 ? 0.45 : 1 }, g0);
  for (let z = 8; z <= 18; z++) el('line', { x1: 0, x2: 640, y1: Y(z), y2: Y(z), opacity: z % 5 ? 0.45 : 1 }, g0);
  // tray
  el('polygon', { points: poly([[-8.6, 7.0], [8.6, 7.0], [8.6, L.H], [L.slotW, L.H], [L.slotW, L.slotFloor], [-L.slotW, L.slotFloor], [-L.slotW, L.H], [-8.6, L.H]]), fill: '#ebe6dd', stroke: '#3b352d', 'stroke-width': 1.4 });
  el('text', { x: X(-7.9), y: Y(7.75), fill: '#6d6455', 'font-size': 13, 'font-family': 'system-ui,sans-serif' }).textContent = 'tray';
  // lid (moves)
  const lidG = el('g', {});
  el('polygon', { points: poly([[-8.6, 19.5], [8.6, 19.5], [8.6, L.H], [L.pocketW, L.H], [L.pocketW, L.pocketFloor], [-L.pocketW, L.pocketFloor], [-L.pocketW, L.H], [-8.6, L.H]]), fill: '#d6d0c5', 'fill-opacity': 0.92, stroke: '#3b352d', 'stroke-width': 1.4 }, lidG);
  el('text', { x: X(-7.9), y: Y(17.6), fill: '#6d6455', 'font-size': 13, 'font-family': 'system-ui,sans-serif' }, lidG).textContent = 'lid';
  const right = L.tongue, left = L.tongue.map(([u, z]) => [-u, z]).reverse();
  el('polygon', { points: poly([...right, ...left]), fill: 'var(--tongue, #d9655a)', stroke: '#8e3a32', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }, lidG);
  // springs
  const beams = [];
  for (const side of [-1, 1]) {
    const g = el('g', {});
    for (let j = 0; j < 2; j++) {
      const u0 = L.inner + j * (L.beamT + L.sep);
      const a = side > 0 ? u0 : -(u0 + L.beamT);
      el('rect', { x: X(a), y: Y(L.ztop), width: L.beamT * 38, height: (L.ztop - L.zb) * 38, rx: 2, fill: '#4fbf8f', stroke: '#24714f', 'stroke-width': 1.2 }, g);
    }
    beams.push({ g, side });
  }
  // annotations
  const note = (x, y, t, anchor = 'start') => { const e = el('text', { x, y, fill: '#3b352d', 'font-size': 12.5, 'font-family': 'system-ui,sans-serif', 'text-anchor': anchor }); e.textContent = t; return e; };
  const ann = el('g', {});
  el('line', { x1: X(1.85), y1: Y(9.5), x2: X(5.3), y2: Y(9.5), stroke: '#8e3a32', 'stroke-width': 1, 'stroke-dasharray': '3 2' }, ann);
  ann.appendChild(note(X(5.4), Y(9.5) + 4, '27° ramp'));
  el('line', { x1: X(1.65), y1: Y(10.95), x2: X(5.3), y2: Y(10.95), stroke: '#8e3a32', 'stroke-width': 1, 'stroke-dasharray': '3 2' }, ann);
  ann.appendChild(note(X(5.4), Y(10.95) + 4, '45° shoulder'));
  // force graph: s from 3.0 (left) to −0.1 (right), force −250 … 700 g
  const FX = (s) => 44 + ((3.0 - s) / 3.1) * 364, FY = (f) => 18 + ((700 - f) / 950) * 160;
  const fel = (tag, attrs) => el(tag, attrs, fsvg);
  for (const f of [-200, 0, 200, 400, 600]) {
    fel('line', { x1: 44, x2: 408, y1: FY(f), y2: FY(f), stroke: f ? '#2c261f' : '#5a5045', 'stroke-width': 1 });
    fel('text', { x: 38, y: FY(f) + 4, fill: '#6f6456', 'font-size': 10, 'text-anchor': 'end', 'font-family': 'system-ui,sans-serif' }).textContent = f;
  }
  for (const s of [3, 2, 1, 0]) fel('text', { x: FX(s), y: 196, fill: '#6f6456', 'font-size': 10, 'text-anchor': 'middle', 'font-family': 'system-ui,sans-serif' }).textContent = `${s} mm`;
  fel('text', { x: 44, y: 12, fill: '#a89a86', 'font-size': 10.5, 'font-family': 'system-ui,sans-serif' }).textContent = 'force at the latch (g) — lid height above closed →';
  const curve = (key) => { const pts = []; for (let s = 3; s >= -0.1; s -= 0.004) { const r = latchAt(s); pts.push(`${FX(s).toFixed(1)},${FY(key === 'close' ? r.close : r.open).toFixed(1)}`); } return pts.join(' '); };
  const cClose = fel('polyline', { points: curve('close'), fill: 'none', stroke: '#4fbf8f', 'stroke-width': 2.2 });
  const cOpen = fel('polyline', { points: curve('open'), fill: 'none', stroke: '#d9655a', 'stroke-width': 2.2 });
  const lg = (y, c, t) => { fel('line', { x1: 56, x2: 74, y1: y, y2: y, stroke: c, 'stroke-width': 2.4 }); fel('text', { x: 78, y: y + 4, fill: '#a89a86', 'font-size': 10.5, 'font-family': 'system-ui,sans-serif' }).textContent = t; };
  lg(150, '#4fbf8f', 'closing (push)'); lg(166, '#d9655a', 'opening (pull)');
  const cursor = fel('line', { x1: 0, x2: 0, y1: 18, y2: 178, stroke: '#e8a06a', 'stroke-width': 1, 'stroke-dasharray': '3 3' });
  const dot = fel('circle', { r: 5.5, fill: '#e8a06a', stroke: '#14110e', 'stroke-width': 2 });

  const range = $('#latchS');
  let dir = 'close';
  const STATE = {
    free: { close: 'Lid coming down. The tongue hasn\'t reached the springs yet.', open: 'Free. The tongue has cleared the springs.' },
    ramp: { close: 'The 27° ramp pushes both pairs of springs apart. This is the push you feel.', open: 'On the ramp the springs push back, so the lid comes away by itself.' },
    crest: { close: 'At the crest: the springs are spread their full 0.6 mm. Only friction now.', open: 'Over the crest. Only friction is holding it.' },
    shoulder: { close: 'Past the crest the 45° shoulder lets the springs close behind it, and they pull the lid shut. Click.', open: 'Lifting the shoulder against the springs: this is the ~640 g that keeps the case shut in a bag.' },
    shut: { close: 'Closed. 0.08 mm of preload stays on the springs, so the lid can\'t rattle.', open: 'Closed. Pull up at the finger notch to open it.' },
  };
  function draw() {
    const s = +range.value;
    const r = latchAt(s);
    lidG.setAttribute('transform', `translate(0 ${(-s * 38).toFixed(2)})`);
    ann.setAttribute('transform', `translate(0 ${(-s * 38).toFixed(2)})`);
    for (const b of beams) b.g.setAttribute('transform', `translate(${(b.side * r.d * 38).toFixed(2)} 0)`);
    const F = dir === 'close' ? r.close : r.open;
    const fShown = F;
    const k = Math.min(1, r.d / 0.6);
    for (const b of beams) for (const rect of b.g.children) rect.setAttribute('fill', `rgb(${Math.round(79 + k * 153)},${Math.round(191 - k * 31)},${Math.round(143 - k * 37)})`);
    // readouts
    $('#roS').textContent = `${Math.max(0, s).toFixed(2)} mm`;
    $('#roD').textContent = `${r.d.toFixed(2)} mm`;
    $('#roFLabel').textContent = dir === 'close' ? (r.close < 0 ? 'Latch pulls it in' : 'Push needed') : (r.open < 0 ? 'Springs push it open' : 'Pull needed');
    $('#roF').textContent = `${Math.round(Math.abs(F))} g`;
    const st = s <= 0.02 ? 'shut' : r.regime;
    $('#latchState').textContent = STATE[st][dir];
    cursor.setAttribute('x1', FX(s)); cursor.setAttribute('x2', FX(s));
    dot.setAttribute('cx', FX(s)); dot.setAttribute('cy', FY(fShown));
    dot.setAttribute('fill', dir === 'close' ? '#4fbf8f' : '#d9655a');
    cClose.setAttribute('opacity', dir === 'close' ? 1 : 0.35);
    cOpen.setAttribute('opacity', dir === 'open' ? 1 : 0.35);
  }
  const setDir = (d) => {
    dir = d;
    document.querySelectorAll('[data-dir]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.dir === d)));
    draw();
  };
  document.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => { setDir(b.dataset.dir); stop(); }));
  range.addEventListener('input', () => { stop(); draw(); });

  // play: close, rest, open, rest…
  const btn = $('#latchPlay');
  let raf = 0, phase = 0, tLast = 0, rest = 0;
  btn.classList.add('paused');
  function stop() { cancelAnimationFrame(raf); raf = 0; btn.classList.add('paused'); btn.setAttribute('aria-label', 'Play the latch'); }
  function step(now) {
    const dt = Math.min(0.05, (now - tLast) / 1000); tLast = now;
    let s = +range.value;
    if (rest > 0) { rest -= dt; if (rest <= 0) setDir(dir === 'close' ? 'open' : 'close'); }
    else {
      const r = latchAt(s);
      const slow = r.d > 0 ? 0.55 : 1.6;                 // slow through contact so you can see it
      s += (dir === 'close' ? -1 : 1) * dt * slow;
      if (dir === 'close' && s <= -0.0) { s = 0; rest = 1.2; }
      if (dir === 'open' && s >= 2.4) { s = 2.4; rest = 0.6; }
      range.value = String(s);
    }
    draw();
    raf = requestAnimationFrame(step);
  }
  btn.addEventListener('click', () => {
    if (raf) { stop(); return; }
    btn.classList.remove('paused'); btn.setAttribute('aria-label', 'Pause the latch');
    tLast = performance.now(); raf = requestAnimationFrame(step);
  });
  draw();
  // start it moving once it scrolls into view
  if (!reduceMotion) {
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) { io.disconnect(); if (!raf) btn.click(); } }, { threshold: 0.4 });
    io.observe(svg);
  }
}


/* ======================================================================= the filaments
   Real colours: each is the code Bambu Studio itself uses for that spool (filaments.js),
   drawn with the finish it really has. */
const LINE = Object.fromEntries(LINES.map((l) => [l.id, l]));
const FIL = Object.fromEntries(FILAMENTS.map((f) => [f.id, f]));
const PAIRS = [
  { name: 'Marble & black', note: 'the design, as drawn', light: 'marble:white-marble', dark: 'basic:black' },
  { name: 'Tournament', note: 'ivory and charcoal, all matte', light: 'matte:ivory-white', dark: 'matte:charcoal' },
  { name: 'Club green', note: 'the roll-up board at every club', light: 'matte:desert-tan', dark: 'basic:mistletoe-green' },
  { name: 'Oak & walnut', note: 'a wooden set, in wood PLA', light: 'wood:white-oak', dark: 'wood:black-walnut' },
  { name: 'Café', note: 'latte and dark chocolate', light: 'matte:latte-brown', dark: 'matte:dark-chocolate' },
  { name: 'Gilded', note: 'silk gold against onyx sparkle', light: 'silkplus:gold', dark: 'sparkle:onyx-black-sparkle' },
  { name: 'Stone', note: 'white marble and red granite', light: 'marble:white-marble', dark: 'marble:red-granite' },
  { name: 'Harbour', note: 'ice blue and navy', light: 'matte:ice-blue', dark: 'matte:dark-blue' },
  { name: 'Terracotta', note: 'bone and fired clay', light: 'matte:bone-white', dark: 'matte:terracotta' },
  { name: 'Blossom', note: 'sakura and plum', light: 'matte:sakura-pink', dark: 'matte:plum' },
  { name: 'Starlight', note: 'silk silver and a galaxy', light: 'silk:silver', dark: 'galaxy:nebulae' },
  { name: 'Copper', note: 'bone and metallic copper', light: 'matte:bone-white', dark: 'metal:copper-brown-metallic' },
];
const DEFAULT_PICK = { light: 'marble:white-marble', dark: 'basic:black' };

function luminance(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
function swatch(f, big = false) {
  const fin = LINE[f.line].finish;
  const k = luminance(f.hex) > 0.25 ? '#151515' : '#d9d4cb';
  return `<span class="fsw${big ? ' big' : ''}" data-finish="${fin}" style="--c:${f.hex};--k:${k}"></span>`;
}
function paintSwatch(el, f) {
  el.dataset.finish = LINE[f.line].finish;
  el.style.setProperty('--c', f.hex);
  el.style.setProperty('--k', luminance(f.hex) > 0.25 ? '#151515' : '#d9d4cb');
}

function initColours() {
  let pick = { ...DEFAULT_PICK };
  try { const saved = JSON.parse(localStorage.getItem('chessboard.filaments') || 'null'); if (saved && FIL[saved.light] && FIL[saved.dark]) pick = saved; } catch { /* private mode */ }
  let editing = null, tab = null;

  const picker = $('#picker'), tabs = $('#lineTabs'), grid = $('#swGrid');
  const roleBtns = [...document.querySelectorAll('.role')];

  function apply() {
    for (const role of ['light', 'dark']) {
      const f = FIL[pick[role]];
      setFilament(role, { hex: f.hex, finish: LINE[f.line].finish });
      const R = role === 'light' ? 'Light' : 'Dark';
      paintSwatch($(`#role${R}Sw`), f);
      $(`#role${R}Name`).textContent = f.name;
      $(`#role${R}Line`).textContent = `${LINE[f.line].name} · ${f.code ? `shown as printed (code ${f.code})` : f.hex}`;
      document.documentElement.style.setProperty(role === 'light' ? '--fil-l' : '--fil-d', f.hex);
      $(role === 'light' ? '#totLightLbl' : '#totDarkLbl').textContent = `${LINE[f.line].name} ${f.name}`;
    }
    const L = FIL[pick.light], D = FIL[pick.dark];
    const cr = contrast(L.hex, D.hex);
    let note = `To print it: in Bambu Studio's print dialog, map <b>slot 1 → ${LINE[L.line].name} ${L.name}</b> and <b>slot 2 → ${LINE[D.line].name} ${D.name}</b>. Nothing else in the project changes.`;
    if (cr < 2.2) note += '<span class="warn">These two are close in tone, so the squares will be hard to tell apart across the table. A lighter filament 1 or a darker filament 2 reads better.</span>';
    else if (luminance(L.hex) < luminance(D.hex)) note += '<span class="warn">Filament 1 is the darker one here. That works: the case and its army just take the darker colour.</span>';
    $('#mapNote').innerHTML = note;
    document.querySelectorAll('#pairs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.light === pick.light && b.dataset.dark === pick.dark)));
    [...grid.children].forEach((b) => b.setAttribute('aria-selected', String(editing && b.dataset.id === pick[editing])));
    try { localStorage.setItem('chessboard.filaments', JSON.stringify(pick)); } catch { /* private mode */ }
  }

  function showTab(id) {
    tab = id;
    [...tabs.children].forEach((b) => b.setAttribute('aria-selected', String(b.dataset.line === id)));
    grid.innerHTML = '';
    for (const f of FILAMENTS.filter((x) => x.line === id)) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.id = f.id; b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(f.id === pick[editing]));
      b.innerHTML = `${swatch(f, true)}<span>${f.name}</span><small>${f.code || f.hex}</small>`;
      b.title = f.code ? `${f.name}: official code ${f.code}, shown as it looks printed (${f.hex})` : `${f.name}: ${f.hex}`;
      b.addEventListener('click', () => { pick[editing] = f.id; apply(); });
      grid.appendChild(b);
    }
    $('#pickFine').textContent = 'Colour codes from Bambu Studio\'s own filament table, the same codes the AMS reads off each spool. Pure white and pure black codes are shown as the plastic really looks; a screen can only get close to a spool in your hand.';
  }
  LINES.forEach((l) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.line = l.id; b.setAttribute('role', 'tab');
    b.textContent = `${l.name.replace('PLA ', '')} · ${FILAMENTS.filter((f) => f.line === l.id).length}`;
    b.addEventListener('click', () => showTab(l.id));
    tabs.appendChild(b);
  });

  function open(role) {
    if (editing === role && !picker.hidden) { close(); return; }
    editing = role;
    roleBtns.forEach((b) => b.setAttribute('aria-expanded', String(b.dataset.role === role)));
    $('#pickTitle').textContent = role === 'light' ? 'Filament 1: case, light squares, one army' : 'Filament 2: dark squares, rules, stars, the other army';
    picker.hidden = false;
    showTab(FIL[pick[role]].line);
  }
  function close() { picker.hidden = true; editing = null; roleBtns.forEach((b) => b.setAttribute('aria-expanded', 'false')); }
  roleBtns.forEach((b) => b.addEventListener('click', () => open(b.dataset.role)));
  $('#pickClose').addEventListener('click', close);

  const pairs = $('#pairs');
  for (const p of PAIRS) {
    const L = FIL[p.light], D = FIL[p.dark];
    if (!L || !D) continue;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.light = p.light; b.dataset.dark = p.dark;
    b.innerHTML = `<span class="duo">${swatch(L)}${swatch(D)}</span><span><b>${p.name}</b><small>${p.note}</small></span>`;
    b.title = `${LINE[L.line].name} ${L.name} + ${LINE[D.line].name} ${D.name}`;
    b.addEventListener('click', () => { pick = { light: p.light, dark: p.dark }; if (editing) showTab(FIL[pick[editing]].line); apply(); });
    pairs.appendChild(b);
  }
  apply();
}

/* ======================================================================= gallery */
function initGallery() {
  const dlg = $('#lightbox'), img = $('#lbImg');
  document.querySelectorAll('.shot').forEach((b) => b.addEventListener('click', () => {
    img.src = b.dataset.src; img.alt = b.querySelector('img').alt;
    if (dlg.showModal) dlg.showModal(); else open(b.dataset.src);
  }));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
}

/* ======================================================================= go */
initPlan();
initColours();
initLatch();
initGallery();

(async () => {
  try {
    const kit = await loadKit('kit.bin', (f) => { $('#storyPct').textContent = `${Math.round(f * 100)}%`; });
    initStory(kit);
    initParts(kit);
  } catch (err) {
    console.error(err);
    $('#storyLoading').innerHTML = '<span>The 3D model could not load here. The renders below show the same case.</span>';
  }
})();
