/**
 * Swatch — the page. Pick a session or a test, type the values to try,
 * download the plate. The thinking is in tests.js (what can be set and how
 * it is written), geometry.js (the coupons), plate.js (where they go) and
 * export.js (the files); this file wires them to the controls.
 */
import { TESTS, SESSIONS, SETTINGS, PARAMS, COMPOSITES, parseValues, format, axisLabel, axisKey, withDetail } from './tests.js';
import { PRINTERS, BED_TYPES, build, estimate } from './plate.js';
import { threeMF, sheet, legendSVG, slug, plateTitle } from './export.js';

const $ = id => document.getElementById(id);
const els = {
  printerSelect: $('printerSelect'), printerSelect2: $('printerSelect2'), bedField: $('bedField'), bedSelect: $('bedSelect'), guideBtn: $('guideBtn'), guide: $('guide'), guideClose: $('guideClose'),
  sessionChips: $('sessionChips'), sessionWhy: $('sessionWhy'), testChips: $('testChips'), testBlurb: $('testBlurb'), detailQuick: $('detailQuick'), detailThorough: $('detailThorough'),
  onPlate: $('onPlate'), plateList: $('plateList'),
  axisX: $('axisX'), axisXLabel: $('axisXLabel'), axisXUnit: $('axisXUnit'), axisXValues: $('axisXValues'), axisXOptions: $('axisXOptions'), axisXError: $('axisXError'),
  axisY: $('axisY'), axisYLabel: $('axisYLabel'), axisYUnit: $('axisYUnit'), axisYValues: $('axisYValues'), axisYOptions: $('axisYOptions'), axisYError: $('axisYError'),
  gridNote: $('gridNote'), gridTitle: $('gridTitle'), fixedList: $('fixedList'), resetBtn: $('resetBtn'),
  plate: $('plate'), plateStats: $('plateStats'), warnings: $('warnings'), lookList: $('lookList'),
  calc: $('calc'), calcW: $('calcW'), calcD: $('calcD'), calcH: $('calcH'), calcOut: $('calcOut'),
  totalsLine: $('totalsLine'), profileNote: $('profileNote'), download3mf: $('download3mf'), downloadSheet: $('downloadSheet'), downloadLegend: $('downloadLegend'), toast: $('toast'),
};

/** The plate is a list of tests (each with its own editable axes and fixed settings); one is being edited. */
const state = { plate: [], active: 0, detail: 'quick', printerId: PRINTERS[0].id, bed: BED_TYPES[0].id, built: null };

/* ---------- helpers ---------- */

let toastTimer = 0;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2800);
}

function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const testById = id => TESTS.find(t => t.id === id);
const printer = () => PRINTERS.find(p => p.id === state.printerId) || PRINTERS[0];
const active = () => state.plate[state.active] || null;
const minutes = m => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`);

/** Put one test on the plate (alone), or add it beside the others. */
function addTest(id, { alone = false } = {}) {
  if (alone) state.plate = [];
  if (!state.plate.some(t => t.id === id)) state.plate.push(withDetail(testById(id), state.detail));
  state.active = state.plate.findIndex(t => t.id === id);
  renderControls();
  update();
}

function removeTest(id) {
  const i = state.plate.findIndex(t => t.id === id);
  if (i < 0 || state.plate.length === 1) return;
  state.plate.splice(i, 1);
  state.active = Math.max(0, Math.min(state.active, state.plate.length - 1));
  renderControls();
  update();
}

function loadSession(id) {
  const s = SESSIONS.find(x => x.id === id);
  if (!s) return;
  state.plate = s.tests.map(tid => withDetail(testById(tid), state.detail));
  state.active = 0;
  state.session = id;
  renderControls();
  update();
  history.replaceState(null, '', `#${id}`);
}

/** The plate as the builder wants it: tests with an empty second axis as one row. */
function currentTests() {
  return state.plate.map(t => ({ ...t, y: t.y && t.y.values.length ? t.y : null }));
}

/* ---------- controls ---------- */

function renderPrinters() {
  for (const sel of [els.printerSelect, els.printerSelect2]) {
    sel.innerHTML = '';
    for (const p of PRINTERS) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.name; sel.append(o); }
    sel.value = state.printerId;
    sel.addEventListener('change', () => { state.printerId = sel.value; els.printerSelect.value = els.printerSelect2.value = sel.value; update(); });
  }
  els.bedSelect.innerHTML = '';
  for (const b of BED_TYPES) { const o = document.createElement('option'); o.value = b.id; o.textContent = b.name; els.bedSelect.append(o); }
  els.bedSelect.value = state.bed;
  els.bedSelect.addEventListener('change', () => { state.bed = els.bedSelect.value; update(); });
}

function renderSessionChips() {
  els.sessionChips.innerHTML = '';
  for (const s of SESSIONS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.id = s.id;
    b.innerHTML = `<span>${s.name}</span><small>${s.tests.length} tests</small>`;
    b.addEventListener('click', () => loadSession(s.id));
    els.sessionChips.append(b);
  }
}

function renderTestChips() {
  els.testChips.innerHTML = '';
  for (const t of TESTS) {
    const on = state.plate.some(p => p.id === t.id);
    const wrap = document.createElement('span'); wrap.className = 'chip-wrap';
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.id = t.id;
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'On the plate — click to edit it' : 'Click to put this test on the plate by itself; use + to add it beside the others';
    b.innerHTML = `<span>${t.name}</span><small>${t.tag}</small>`;
    b.addEventListener('click', () => { if (on) { state.active = state.plate.findIndex(p => p.id === t.id); renderControls(); } else addTest(t.id, { alone: true }); history.replaceState(null, '', `#${t.id}`); });
    wrap.append(b);
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'chip-x';
    x.textContent = on ? '×' : '+';
    x.setAttribute('aria-label', on ? `Take ${t.name} off the plate` : `Add ${t.name} to the plate`);
    x.addEventListener('click', () => (on ? removeTest(t.id) : addTest(t.id)));
    wrap.append(x);
    els.testChips.append(wrap);
  }
}

function renderAxis(which, axis, test) {
  const cap = which.toUpperCase();
  const box = els[`axis${cap}`], label = els[`axis${cap}Label`], unit = els[`axis${cap}Unit`], input = els[`axis${cap}Values`], options = els[`axis${cap}Options`], error = els[`axis${cap}Error`];
  error.hidden = true;
  if (!axis) { box.hidden = true; return; }
  box.hidden = false;
  label.textContent = axisLabel(axis);
  if (axis.composite) {
    const comp = COMPOSITES[axis.composite];
    unit.textContent = 'tick the ones to try';
    input.hidden = true; options.hidden = false; options.innerHTML = '';
    for (const o of comp.options) {
      const l = document.createElement('label');
      const c = document.createElement('input');
      c.type = 'checkbox'; c.checked = axis.values.includes(o.id); c.dataset.id = o.id;
      c.addEventListener('change', () => {
        axis.values = comp.options.filter(opt => options.querySelector(`input[data-id="${opt.id}"]`).checked).map(opt => opt.id);
        update();
      });
      l.append(c, document.createTextNode(o.label));
      options.append(l);
    }
  } else {
    const def = SETTINGS[axis.key] || PARAMS[axis.param];
    unit.textContent = def.kind === 'enum' ? Object.values(def.options).join(' · ') : (def.unit || '');
    options.hidden = true; input.hidden = false;
    input.value = axis.values.join(', ');
    input.oninput = () => {
      const { values, errors } = parseValues(axisKey(axis), input.value);
      error.hidden = !errors.length; error.textContent = errors.join(' ');
      axis.values = values;
      update();
    };
  }
  void test;
}

function renderFixed(test) {
  els.fixedList.innerHTML = '';
  const keys = Object.keys(test.fixed);
  if (!keys.length) {
    const p = document.createElement('p'); p.className = 'fixed-empty';
    p.textContent = 'Nothing: this test changes only what its grid says, and everything else is your profile’s.';
    els.fixedList.append(p);
    return;
  }
  for (const key of keys) {
    const def = SETTINGS[key];
    const row = document.createElement('div'); row.className = 'fixed-row';
    const label = document.createElement('label'); label.htmlFor = `fixed-${key}`;
    label.innerHTML = `${def.label}<small>${key}</small>`;
    let control;
    if (def.kind === 'enum') {
      control = document.createElement('select');
      for (const [v, name] of Object.entries(def.options)) { const o = document.createElement('option'); o.value = v; o.textContent = name; control.append(o); }
      control.value = test.fixed[key];
      control.addEventListener('change', () => { test.fixed[key] = control.value; update(); });
    } else if (def.kind === 'bool') {
      control = document.createElement('input'); control.type = 'checkbox'; control.checked = !!test.fixed[key];
      control.addEventListener('change', () => { test.fixed[key] = control.checked ? 1 : 0; update(); });
    } else {
      control = document.createElement('input'); control.type = 'number'; control.inputMode = 'decimal';
      if (def.min !== undefined) control.min = def.min;
      if (def.max !== undefined) control.max = def.max;
      if (def.step !== undefined) control.step = def.step;
      control.value = test.fixed[key];
      control.addEventListener('input', () => {
        const { values, errors } = parseValues(key, control.value);
        if (values.length && !errors.length) { test.fixed[key] = values[0]; update(); }
      });
    }
    control.id = `fixed-${key}`;
    row.append(label, control);
    els.fixedList.append(row);
  }
}

function renderPlateList() {
  els.plateList.innerHTML = '';
  state.plate.forEach((t, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'plate-item';
    b.setAttribute('aria-pressed', String(i === state.active));
    const n = t.x.values.length * (t.y && t.y.values.length ? t.y.values.length : 1);
    b.innerHTML = `<span class="n">${i + 1}</span><span>${t.name}</span><small>${n} coupons</small>`;
    b.addEventListener('click', () => { state.active = i; renderControls(); });
    els.plateList.append(b);
  });
  const s = SESSIONS.find(x => x.id === state.session && x.tests.length === state.plate.length && x.tests.every((id, i) => state.plate[i] && state.plate[i].id === id));
  els.sessionWhy.textContent = s ? s.why : '';
  els.sessionWhy.hidden = !s;
  for (const b of els.sessionChips.querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(!!s && b.dataset.id === s.id));
}

function renderControls() {
  renderTestChips();
  renderPlateList();
  const t = active();
  if (!t) return;
  els.gridTitle.textContent = state.plate.length > 1 ? `The grid · ${t.name}` : 'The grid';
  els.testBlurb.textContent = t.blurb;
  renderAxis('x', t.x, t);
  renderAxis('y', t.y, t);
  renderFixed(t);
  els.detailQuick.setAttribute('aria-pressed', String(state.detail === 'quick'));
  els.detailThorough.setAttribute('aria-pressed', String(state.detail === 'thorough'));
  els.calc.hidden = t.id !== 'dimensions';
}

/* ---------- the plate ---------- */

function update() {
  const tests = currentTests();
  if (!tests.length || tests.some(t => !t.x.values.length)) {
    els.plate.innerHTML = '';
    els.plateStats.innerHTML = '';
    els.warnings.innerHTML = '<p class="warning">Type at least one value across for every test on the plate.</p>';
    els.totalsLine.textContent = '';
    els.download3mf.disabled = els.downloadSheet.disabled = els.downloadLegend.disabled = true;
    state.built = null;
    return;
  }
  const built = build(tests, { printer: printer() });
  state.built = built;
  els.plate.innerHTML = legendSVG(built, { printer: printer() });
  const est = estimate(built.items);
  const [w, d] = built.footprint;
  els.plateStats.innerHTML = `<strong>${built.items.length} coupon${built.items.length === 1 ? '' : 's'}</strong><span>${built.groups.length === 1 ? `${built.groups[0].cols} across × ${built.groups[0].rows} deep` : `${built.groups.length} tests`}</span><span>${Math.round(w)} × ${Math.round(d)} mm on the plate</span><span>about ${minutes(est.minutes)}, ${Math.round(est.grams)} g</span>`;
  els.warnings.innerHTML = built.warnings.map(m => `<p class="warning">${m}</p>`).join('');
  const t = active();
  if (t) {
    const g = built.groups[state.active];
    const kind = { tile: 'flat tiles', stencil: 'thin tiles read from underneath', pillar: 'square pillars', cylinder: 'cylinders', gauge: 'gauges with a Ø10 hole', socket: 'sockets with a Ø8 peg' }[t.coupon.type];
    els.gridNote.textContent = g ? `${g.cols} × ${g.rows} = ${g.items.length} ${kind} of ${g.items[0].size.slice(0, 2).map(Math.round).join(' × ')} mm.` : '';
  }
  els.lookList.innerHTML = built.groups.map((g, i) => `<section class="look-group"><h3>${built.groups.length > 1 ? `${i + 1} · ` : ''}${g.test.name}</h3><p class="look">${g.test.look}</p><p class="look pick"><strong>How to choose.</strong> ${g.test.pick}</p></section>`).join('');
  const pr = printer();
  els.bedField.hidden = !pr.presets;
  els.totalsLine.innerHTML = `About <strong>${Math.round(est.grams)} g</strong> and <strong>${minutes(est.minutes)}</strong> on the ${pr.short}, roughly — the slicer knows better.`;
  els.profileNote.innerHTML = pr.presets
    ? `<strong>Opens as a project with no warning.</strong> The file names the ${pr.short}’s own presets (<em>${pr.presets.process}</em>, <em>${pr.presets.filament}</em>, <em>${pr.presets.printer}</em>) and the ${BED_TYPES.find(b => b.id === state.bed).name.toLowerCase()}; Bambu Studio selects them from its own copies, nothing of yours is changed. Pick your own filament and process in the dropdowns after it opens — the coupons keep their differences as per-object settings. Click a coupon to see them in the object list.`
    : `<strong>Open it as a project</strong> (File › Open Project, not Import). The file carries no printer profile, so the slicer says it loaded geometry only; each coupon keeps its settings. Click a coupon to see them in the object list.`;
  els.download3mf.disabled = els.downloadSheet.disabled = els.downloadLegend.disabled = false;
}

/* ---------- the calculator ---------- */

function calc() {
  const t = active();
  if (!t || t.id !== 'dimensions') return;
  const nominal = { w: t.coupon.w, d: t.coupon.d, h: t.coupon.hole };
  const w = Number(els.calcW.value), d = Number(els.calcD.value), h = Number(els.calcH.value);
  const parts = [];
  const outer = [];
  if (w > 0) outer.push(w - nominal.w);
  if (d > 0) outer.push(d - nominal.d);
  if (outer.length) {
    const e = outer.reduce((a, b) => a + b, 0) / outer.length;
    const c = -e / 2;
    parts.push(`Outside is ${e >= 0 ? '+' : ''}${e.toFixed(2)} mm on average, so <strong>X-Y contour compensation ${c >= 0 ? '+' : ''}${c.toFixed(2)} mm</strong>${outer.length === 2 && Math.abs(outer[0] - outer[1]) > 0.06 ? ` (width and depth disagree by ${Math.abs(outer[0] - outer[1]).toFixed(2)} mm — one axis of the printer is off, which compensation cannot fix)` : ''}.`);
  }
  if (h > 0) {
    const e = h - nominal.h, c = -e / 2;
    parts.push(`The hole is ${e >= 0 ? '+' : ''}${e.toFixed(2)} mm, so <strong>X-Y hole compensation ${c >= 0 ? '+' : ''}${c.toFixed(2)} mm</strong>.`);
  }
  els.calcOut.innerHTML = parts.length ? parts.join(' ') + ' Measured on the zero-compensation gauge; if you measured another, add its values to these.' : 'Type what the calipers say on the gauge printed with both compensations at 0.';
}

/* ---------- downloads ---------- */

function fileBase() { return `swatch-${slug(plateTitle(state.built))}`.slice(0, 80); }

els.download3mf.addEventListener('click', () => {
  if (!state.built) return;
  download(`${fileBase()}.3mf`, threeMF(state.built, { printer: printer(), plate: state.bed }), 'model/3mf');
  toast(printer().presets ? 'Open it as a project in Bambu Studio; then pick your own filament.' : 'Open it as a project in Bambu Studio — not Import.');
});
els.downloadSheet.addEventListener('click', () => { if (state.built) download(`${fileBase()}.txt`, sheet(state.built, { printer: printer(), plate: state.bed }), 'text/plain'); });
els.downloadLegend.addEventListener('click', () => { if (state.built) download(`${fileBase()}.svg`, legendSVG(state.built, { printer: printer() }), 'image/svg+xml'); });
els.resetBtn.addEventListener('click', () => {
  const t = active();
  if (!t) return;
  state.plate[state.active] = withDetail(testById(t.id), state.detail);
  renderControls(); update();
  toast('Back to the test’s defaults.');
});
for (const [el, detail] of [[els.detailQuick, 'quick'], [els.detailThorough, 'thorough']]) {
  el.addEventListener('click', () => {
    if (state.detail === detail) return;
    state.detail = detail;
    state.plate = state.plate.map(t => withDetail(testById(t.id), detail));
    renderControls(); update();
  });
}
for (const el of [els.calcW, els.calcD, els.calcH]) el.addEventListener('input', calc);

/* ---------- the guide ---------- */

els.guideBtn.addEventListener('click', () => { if (typeof els.guide.showModal === 'function') els.guide.showModal(); else els.guide.setAttribute('open', ''); });
els.guideClose.addEventListener('click', () => els.guide.close());
els.guide.addEventListener('click', e => { if (e.target === els.guide) els.guide.close(); });

/* ---------- go ---------- */

renderPrinters();
renderSessionChips();
const fromHash = location.hash.replace('#', '');
if (SESSIONS.some(s => s.id === fromHash)) loadSession(fromHash);
else if (TESTS.some(t => t.id === fromHash)) addTest(fromHash, { alone: true });
else loadSession(SESSIONS[0].id);
window.addEventListener('hashchange', () => {
  const id = location.hash.replace('#', '');
  if (SESSIONS.some(s => s.id === id)) loadSession(id);
  else if (TESTS.some(t => t.id === id) && !state.plate.some(t => t.id === id)) addTest(id, { alone: true });
});
