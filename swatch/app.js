/**
 * Swatch — the page. Pick a test, type the values to try, download the
 * plate. All the thinking is in tests.js (what can be set and how it is
 * written), geometry.js (the coupons), plate.js (where they go) and
 * export.js (the files); this file only wires them to the controls.
 */
import { TESTS, SETTINGS, COMPOSITES, parseValues, format, axisLabel } from './tests.js';
import { PRINTERS, build, estimate } from './plate.js';
import { threeMF, sheet, legendSVG, slug } from './export.js';

const $ = id => document.getElementById(id);
const els = {
  printerSelect: $('printerSelect'), printerSelect2: $('printerSelect2'), guideBtn: $('guideBtn'), guide: $('guide'), guideClose: $('guideClose'),
  testChips: $('testChips'), testBlurb: $('testBlurb'),
  axisX: $('axisX'), axisXLabel: $('axisXLabel'), axisXUnit: $('axisXUnit'), axisXValues: $('axisXValues'), axisXOptions: $('axisXOptions'), axisXError: $('axisXError'),
  axisY: $('axisY'), axisYLabel: $('axisYLabel'), axisYUnit: $('axisYUnit'), axisYValues: $('axisYValues'), axisYOptions: $('axisYOptions'), axisYError: $('axisYError'),
  gridNote: $('gridNote'), fixedList: $('fixedList'), resetBtn: $('resetBtn'),
  plate: $('plate'), plateTitle: $('plateTitle'), plateStats: $('plateStats'), warnings: $('warnings'), lookText: $('lookText'), pickText: $('pickText'),
  totalsLine: $('totalsLine'), download3mf: $('download3mf'), downloadSheet: $('downloadSheet'), downloadLegend: $('downloadLegend'), toast: $('toast'),
};

const state = { testId: TESTS[0].id, printerId: PRINTERS[0].id, x: null, y: null, fixed: null, built: null, test: null };

/* ---------- helpers ---------- */

let toastTimer = 0;
function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

function download(name, data, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const preset = () => TESTS.find(t => t.id === state.testId) || TESTS[0];
const printer = () => PRINTERS.find(p => p.id === state.printerId) || PRINTERS[0];
const minutes = m => (m < 60 ? `${Math.round(m)} min` : `${Math.floor(m / 60)} h ${String(Math.round(m % 60)).padStart(2, '0')} min`);

/** Load a test's defaults into the editable state. */
function loadTest(id) {
  state.testId = id;
  const t = preset();
  state.x = { ...t.x, values: [...t.x.values] };
  state.y = t.y ? { ...t.y, values: [...t.y.values] } : null;
  state.fixed = { ...t.fixed };
  renderControls();
  update();
}

/** The test as the builder wants it, from the current state. */
function currentTest() {
  const t = preset();
  const y = state.y && state.y.values.length ? state.y : null;
  return { ...t, x: state.x, y, fixed: state.fixed };
}

/* ---------- controls ---------- */

function renderPrinters() {
  for (const sel of [els.printerSelect, els.printerSelect2]) {
    sel.innerHTML = '';
    for (const p of PRINTERS) {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.name; sel.append(o);
    }
    sel.value = state.printerId;
    sel.addEventListener('change', () => { state.printerId = sel.value; els.printerSelect.value = els.printerSelect2.value = sel.value; update(); });
  }
}

function renderChips() {
  els.testChips.innerHTML = '';
  for (const t of TESTS) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.dataset.id = t.id;
    b.setAttribute('aria-pressed', String(t.id === state.testId));
    b.innerHTML = `<span>${t.name}</span><small>${t.tag}</small>`;
    b.addEventListener('click', () => { if (t.id !== state.testId) { loadTest(t.id); history.replaceState(null, '', `#${t.id}`); } });
    els.testChips.append(b);
  }
}

function renderAxis(which, axis) {
  const cap = which.toUpperCase();
  const label = els[`axis${cap}Label`], unit = els[`axis${cap}Unit`], input = els[`axis${cap}Values`], options = els[`axis${cap}Options`], error = els[`axis${cap}Error`];
  error.hidden = true;
  if (!axis) { els[`axis${cap}`].hidden = true; return; }
  els[`axis${cap}`].hidden = false;
  label.textContent = axisLabel(axis);
  if (axis.composite) {
    const comp = COMPOSITES[axis.composite];
    unit.textContent = 'tick the ones to try';
    input.hidden = true; options.hidden = false; options.innerHTML = '';
    for (const o of comp.options) {
      const l = document.createElement('label');
      const c = document.createElement('input');
      c.type = 'checkbox'; c.checked = axis.values.includes(o.id);
      c.addEventListener('change', () => {
        axis.values = comp.options.filter(opt => [...options.querySelectorAll('input')].find(i => i.dataset.id === opt.id)?.checked).map(opt => opt.id);
        update();
      });
      c.dataset.id = o.id;
      l.append(c, document.createTextNode(o.label));
      options.append(l);
    }
  } else {
    const def = SETTINGS[axis.key];
    unit.textContent = def.kind === 'enum' ? Object.values(def.options).join(' · ') : (def.unit || '');
    options.hidden = true; input.hidden = false;
    input.value = axis.values.join(', ');
    input.oninput = () => {
      const { values, errors } = parseValues(axis.key, input.value);
      error.hidden = !errors.length; error.textContent = errors.join(' ');
      axis.values = values;
      update();
    };
  }
}

function renderFixed() {
  const t = preset();
  els.fixedList.innerHTML = '';
  const keys = Object.keys(state.fixed);
  if (!keys.length) {
    const p = document.createElement('p'); p.className = 'fixed-empty';
    p.textContent = 'Nothing: this test changes only its two settings, and everything else is your profile’s.';
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
      control.value = state.fixed[key];
      control.addEventListener('change', () => { state.fixed[key] = control.value; update(); });
    } else if (def.kind === 'bool') {
      control = document.createElement('input'); control.type = 'checkbox'; control.checked = !!state.fixed[key];
      control.addEventListener('change', () => { state.fixed[key] = control.checked ? 1 : 0; update(); });
    } else {
      control = document.createElement('input'); control.type = 'number'; control.inputMode = 'decimal';
      if (def.min !== undefined) control.min = def.min;
      if (def.max !== undefined) control.max = def.max;
      if (def.step !== undefined) control.step = def.step;
      control.value = state.fixed[key];
      control.addEventListener('input', () => {
        const { values, errors } = parseValues(key, control.value);
        if (values.length && !errors.length) { state.fixed[key] = values[0]; update(); }
      });
    }
    control.id = `fixed-${key}`;
    row.append(label, control);
    els.fixedList.append(row);
  }
  void t;
}

function renderControls() {
  for (const b of els.testChips.querySelectorAll('.chip')) b.setAttribute('aria-pressed', String(b.dataset.id === state.testId));
  const t = preset();
  els.testBlurb.textContent = t.blurb;
  renderAxis('x', state.x);
  renderAxis('y', state.y);
  renderFixed();
  els.lookText.textContent = t.look;
  els.pickText.textContent = t.pick;
}

/* ---------- the plate ---------- */

function update() {
  const t = currentTest();
  state.test = t;
  if (!t.x.values.length) {
    els.plate.innerHTML = '';
    els.plateStats.innerHTML = '';
    els.warnings.innerHTML = '<p class="warning">Type at least one value across.</p>';
    els.totalsLine.textContent = '';
    els.download3mf.disabled = els.downloadSheet.disabled = els.downloadLegend.disabled = true;
    state.built = null;
    return;
  }
  const built = build(t, { printer: printer() });
  state.built = built;
  els.plate.innerHTML = legendSVG(t, built, { printer: printer() });
  const est = estimate(built.items);
  const [w, d] = built.footprint;
  els.plateStats.innerHTML = `<strong>${built.items.length} coupon${built.items.length === 1 ? '' : 's'}</strong><span>${built.cols} across × ${built.rows} deep</span><span>${Math.round(w)} × ${Math.round(d)} mm on the plate</span>`;
  els.warnings.innerHTML = built.warnings.map(m => `<p class="warning">${m}</p>`).join('');
  els.gridNote.textContent = `${built.cols} × ${built.rows} = ${built.items.length} coupons, ${t.coupon.type === 'tile' ? 'flat tiles' : t.coupon.type === 'stencil' ? 'thin tiles read from underneath' : t.coupon.type === 'pillar' ? 'square pillars' : 'cylinders'} of ${built.items[0].size.slice(0, 2).map(Math.round).join(' × ')} mm.`;
  const fixedWords = Object.keys(t.fixed).length ? ` with ${Object.entries(t.fixed).map(([k, v]) => `${SETTINGS[k].label.toLowerCase()} ${format(k, v)}`).join(', ')}` : '';
  els.totalsLine.innerHTML = `About <strong>${Math.round(est.grams)} g</strong> and <strong>${minutes(est.minutes)}</strong> on the ${printer().short}, roughly — the slicer knows better. Every coupon prints${fixedWords}; the rest is your process profile.`;
  els.download3mf.disabled = els.downloadSheet.disabled = els.downloadLegend.disabled = false;
}

/* ---------- downloads ---------- */

function fileBase() { return `swatch-${slug(state.test.name)}`; }

els.download3mf.addEventListener('click', () => {
  if (!state.built) return;
  download(`${fileBase()}.3mf`, threeMF(state.test, state.built.items, { printer: printer() }), 'model/3mf');
  toast('Open it as a project in Bambu Studio — not Import.');
});
els.downloadSheet.addEventListener('click', () => {
  if (!state.built) return;
  download(`${fileBase()}.txt`, sheet(state.test, state.built, { printer: printer() }), 'text/plain');
});
els.downloadLegend.addEventListener('click', () => {
  if (!state.built) return;
  download(`${fileBase()}.svg`, legendSVG(state.test, state.built, { printer: printer() }), 'image/svg+xml');
});
els.resetBtn.addEventListener('click', () => { loadTest(state.testId); toast('Back to the test’s defaults.'); });

/* ---------- the guide ---------- */

els.guideBtn.addEventListener('click', () => { if (typeof els.guide.showModal === 'function') els.guide.showModal(); else els.guide.setAttribute('open', ''); });
els.guideClose.addEventListener('click', () => els.guide.close());
els.guide.addEventListener('click', e => { if (e.target === els.guide) els.guide.close(); });

/* ---------- go ---------- */

renderPrinters();
renderChips();
const fromHash = location.hash.replace('#', '');
loadTest(TESTS.some(t => t.id === fromHash) ? fromHash : TESTS[0].id);
window.addEventListener('hashchange', () => { const id = location.hash.replace('#', ''); if (TESTS.some(t => t.id === id) && id !== state.testId) loadTest(id); });
