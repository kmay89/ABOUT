/* fit-check.js — dev-only. Every screen of the game, on every kind of device.

   Opens the title, the how-to, the HUD, dialogue, a choice, the pause card
   and its settings, all eight sections of Gran's book, a found thing, the
   lens, each set piece and the end, on twenty-eight sizes of device (phones
   upright and on their sides, iPads, split view, laptops, small windows, big
   monitors), with each device's notch, home bar and round corners drawn in.
   For each it lists what is wrong: a control off the glass (OFF) or in the
   unsafe area (UNSAFE), a target too small for a thumb (SMALL), one hidden
   under another (COVERED), two things that shouldn't share a place
   (OVERLAP), words cut off (CLIP, TEXTOFF), type under 10.5 px (TINYTEXT).
   It also saves a picture of every screen.

   Serve the site first (from the repo root: python3 -m http.server 8765),
   then, from this folder's parent:

     node tools/fit-check.js                      everything (slow: about an hour)
     node tools/fit-check.js phones               a group: phones, phonesL, tablets, tabletsL, desk, big
     node tools/fit-check.js ip13,ipadL menu,dlg  some devices, some screens

   FIT_URL  where the game is served (default http://localhost:8765/sunlight/)
   FIT_OUT  where the pictures and report.json go (default: a folder in the system's temp directory)
   POOL     how many devices at once (default 3)

   Needs Playwright. Nothing in the game depends on this file. Some OVERLAP
   lines are expected: a Moment's card does cover the HUD for the three
   seconds it is up.                                                          */
"use strict";
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = (process.env.FIT_OUT || path.join(os.tmpdir(), 'sunlight-fit')).replace(/\/?$/, '/');
const URL = process.env.FIT_URL || 'http://localhost:8765/sunlight/';

/* w, h, touch, safe {t,r,b,l}, corner radius, notch kind */
const DEV = {
  se1:     { w: 320, h: 568, touch: 1, safe: [20, 0, 0, 0], g: 'phones' },
  android: { w: 360, h: 760, touch: 1, safe: [24, 0, 16, 0], g: 'phones' },
  se3:     { w: 375, h: 667, touch: 1, safe: [20, 0, 0, 0], g: 'phones' },
  ip13:    { w: 390, h: 844, touch: 1, safe: [47, 0, 34, 0], rad: 47, notch: 'notch', g: 'phones' },
  ipmax:   { w: 430, h: 932, touch: 1, safe: [59, 0, 34, 0], rad: 55, notch: 'island', g: 'phones' },
  se1L:    { w: 568, h: 320, touch: 1, safe: [0, 0, 0, 0], g: 'phonesL' },
  se3L:    { w: 667, h: 375, touch: 1, safe: [0, 0, 0, 0], g: 'phonesL' },
  ip13L:   { w: 844, h: 390, touch: 1, safe: [0, 47, 21, 47], rad: 47, notch: 'notchL', g: 'phonesL' },
  ipmaxL:  { w: 932, h: 430, touch: 1, safe: [0, 59, 21, 59], rad: 55, notch: 'islandL', g: 'phonesL' },
  split3:  { w: 375, h: 834, touch: 1, safe: [24, 0, 20, 0], g: 'tablets' },           // iPad, a third of the screen
  split2:  { w: 590, h: 834, touch: 1, safe: [24, 0, 20, 0], g: 'tablets' },           // iPad, half the screen
  mini:    { w: 744, h: 1133, touch: 1, safe: [24, 0, 20, 0], rad: 22, g: 'tablets' },
  ipad:    { w: 834, h: 1194, touch: 1, safe: [24, 0, 20, 0], rad: 18, g: 'tablets' },
  ipad13:  { w: 1024, h: 1366, touch: 1, safe: [24, 0, 20, 0], rad: 18, g: 'tablets' },
  miniL:   { w: 1133, h: 744, touch: 1, safe: [24, 0, 20, 0], rad: 22, g: 'tabletsL' },
  ipadL:   { w: 1194, h: 834, touch: 1, safe: [24, 0, 20, 0], rad: 18, g: 'tabletsL' },
  ipad13L: { w: 1366, h: 1024, touch: 1, safe: [24, 0, 20, 0], rad: 18, g: 'tabletsL' },
  ipadK:   { w: 1194, h: 834, touch: 0, safe: [24, 0, 20, 0], rad: 18, g: 'tabletsL' }, // iPad with a keyboard and trackpad
  tiny:    { w: 640, h: 480, touch: 0, safe: [0, 0, 0, 0], g: 'desk' },
  narrow:  { w: 480, h: 900, touch: 0, safe: [0, 0, 0, 0], g: 'desk' },
  short:   { w: 1100, h: 420, touch: 0, safe: [0, 0, 0, 0], g: 'desk' },
  win:     { w: 900, h: 600, touch: 0, safe: [0, 0, 0, 0], g: 'desk' },
  laptop:  { w: 1280, h: 720, touch: 0, safe: [0, 0, 0, 0], g: 'desk' },
  mba:     { w: 1440, h: 900, touch: 0, safe: [0, 0, 0, 0], g: 'desk' },
  hd:      { w: 1920, h: 1080, touch: 0, safe: [0, 0, 0, 0], g: 'big' },
  qhd:     { w: 2560, h: 1440, touch: 0, safe: [0, 0, 0, 0], g: 'big' },
  wide:    { w: 3440, h: 1440, touch: 0, safe: [0, 0, 0, 0], g: 'big' },
  uhd:     { w: 3840, h: 2160, touch: 0, safe: [0, 0, 0, 0], g: 'big' },
};

const LONG = "The house was the only one on the hill, and the hill was the only thing for a mile in any direction that had bothered to stand up. From the third stair I could see the whole yard, the shed, the long gravel drive falling away toward the road.";

/* each screen: beat to start from (or null for a fresh title), what to do, how long to wait */
const SCR = {
  title:    { beat: null, wait: 2600 },
  title2:   { beat: null, save: 1, wait: 2600 },
  howto1:   { beat: null, run: () => document.getElementById('t-how').click(), wait: 900 },
  howto2:   { beat: null, run: () => { document.getElementById('t-how').click(); setTimeout(() => document.getElementById('h-next').click(), 300); }, wait: 1300 },
  howto3:   { beat: null, run: () => { document.getElementById('t-how').click(); setTimeout(() => document.getElementById('h-next').click(), 300); setTimeout(() => document.getElementById('h-next').click(), 700); }, wait: 1700 },
  hud_house:{ beat: 'arrive', wait: 1500 },
  hud_hill: { beat: 'hill', wait: 1500 },
  hud_hill2:{ beat: 'woods', run: () => { BS.G.toast('The deer path is open.'); }, wait: 1200 },
  hud_cellar:{ beat: 'lens', wait: 1500 },
  prompt:   { beat: 'arrive', run: () => { const G = BS.G; G.go('house', 3.5, 2.6, 0, { instant: true }); }, wait: 1500 },
  dlg:      { beat: 'hill', run: (L) => { BS.G.say('dad', L); }, wait: 5200, args: 1 },
  dlg_beck: { beat: 'woods', run: () => { BS.G.say('beck', "You're the kid from the Renner place. I'm Beck. My dad's crew is doing your gran's cellar."); }, wait: 4200 },
  narr:     { beat: 'hill', run: (L) => { BS.G.prefs.fullText = true; BS.G.narrate(L); }, wait: 6500, args: 1 },
  mo:       { beat: 'lens', run: () => { BS.G.mo('*look long. we are still here.*'); }, wait: 2600 },
  choice:   { beat: 'hill', run: () => { BS.G.choice('What do you tell Dad?', ["It's nothing. Just the cellar.", "There's something alive down there, and it glows.", "Say nothing. Keep cranking."]); }, wait: 900 },
  chapter:  { beat: 'hill', run: () => { BS.G.chapter(3, 'The Back of the World'); }, wait: 1900 },
  region:   { beat: 'hill', run: () => { BS.juice.announce("Gran's House", 'forty years of her, in boxes'); }, wait: 1500 },
  ach:      { beat: 'hill', run: () => { const a = BS.prog.ACH[0]; const d = document.createElement('div'); d.className = 'achpop on'; d.innerHTML = '<div class="achmed">' + BS.prog.medal(a[0]) + '</div><div class="achtx"><small>Moment · 3 of ' + BS.prog.ACH.length + '</small><b>' + a[1] + '</b><p>' + a[2] + '</p></div>'; document.body.appendChild(d); document.body.classList.add('achon'); BS.juice.announce('The Shed', 'everything she ever fixed'); }, wait: 1500 },
  menu:     { beat: 'pit', run: () => BS.ui.open('menu'), wait: 900 },
  menu_opts:{ beat: 'pit', run: () => { BS.ui.open('menu'); setTimeout(() => document.getElementById('m-opts').click(), 200); }, wait: 1100 },
  menu_help:{ beat: 'pit', run: () => { BS.ui.open('menu'); setTimeout(() => document.getElementById('m-help').click(), 200); }, wait: 1300 },
  ask:      { beat: 'pit', run: () => { BS.ui.open('menu'); setTimeout(() => document.getElementById('m-opts').click(), 200); setTimeout(() => document.getElementById('m-restart').click(), 500); }, wait: 1500 },
  bk_pages: { beat: 'after', run: () => BS.ui.open('book', 'pages'), wait: 1100 },
  bk_story: { beat: 'after', run: () => BS.ui.open('book', 'story'), wait: 1100 },
  bk_keys:  { beat: 'after', run: () => BS.ui.open('book', 'keys'), wait: 1100 },
  bk_seen:  { beat: 'after', run: () => BS.ui.open('book', 'seen'), wait: 1100 },
  bk_map:   { beat: 'after', run: () => BS.ui.open('book', 'map'), wait: 1300 },
  bk_phone: { beat: 'after', run: () => BS.ui.open('book', 'phone'), wait: 1100 },
  bk_yours: { beat: 'after', run: () => BS.ui.open('book', 'yours'), wait: 1100 },
  bk_moments:{ beat: 'after', run: () => BS.ui.open('book', 'moments'), wait: 1100 },
  inspect:  { beat: 'build', run: () => { BS.inspect.show({ key: 'lantern', kind: 'Found', name: 'The crank lantern', sci: 'A dynamo: motion into light', text: 'A hand-crank lantern off the shelf in the shed. Turn the handle and a coil spins past a magnet, and the turning comes out the other end as light.', opens: 'The dark of the cellar' }); }, wait: 2200 },
  lens:     { beat: 'pit', run: () => { BS.G.s.items.lens = 1; BS.G.openLens({ look: BS.lens.byId.mo, scene: 'mo' }); }, wait: 2000 },
  slime:    { beat: 'dawn', flush: 1, run: () => { BS.G.slime('dawn'); }, wait: 1500 },
  slime2:   { beat: 'dawn', flush: 1, run: () => { BS.G.slime('hedge'); }, wait: 1500 },
  sand:     { beat: 'pit', flush: 1, run: () => { BS.G.sandPile(); }, wait: 1500 },
  board:    { beat: 'pit', flush: 1, run: () => { BS.G.board(); }, wait: 1100 },
  signal:   { beat: 'evening', flush: 1, run: () => { BS.G.go('hill', 40, 20, 0, { instant: true }); BS.G.findSignal(); }, wait: 1500 },
  ride:     { beat: 'hill', flush: 1, run: () => { BS.G.startRide(); }, wait: 2600 },
  end:      { beat: 'after', run: () => { BS.G.s.marginalia = 'I looked long. It was still there.'; BS.ui.ending(); }, wait: 5200 },
};

/* runs in the page: what is wrong with this screen on this device */
function audit(o) {
  const W = innerWidth, H = innerHeight, S = o.safe, out = [];
  const sr = { l: S[3], t: S[0], r: W - S[1], b: H - S[2] };
  const name = el => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + (el.textContent && el.textContent.trim().length < 26 && el.textContent.trim() ? '"' + el.textContent.trim() + '"' : '');
  const shown = el => {
    if (!el.getClientRects().length) return false;
    for (let a = el; a && a !== document.documentElement; a = a.parentElement) {
      const s = getComputedStyle(a);
      if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.08) return false;
    }
    return true;
  };
  const scroller = el => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (/(auto|scroll)/.test(s.overflowY) && a.scrollHeight > a.clientHeight + 2) return a; if (/(auto|scroll)/.test(s.overflowX) && a.scrollWidth > a.clientWidth + 2) return a; } return null; };
  const R = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const outside = r => r.l < sr.l - 1 || r.r > sr.r + 1 || r.t < sr.t - 1 || r.b > sr.b + 1;
  const offscreen = r => r.l < -1 || r.r > W + 1 || r.t < -1 || r.b > H + 1;
  const top = BS.hands && BS.hands.top ? BS.hands.top() : null;
  const busy = !!document.querySelector('#lens.on,#dlg.on,#narr.on,#choice.on,#mo.on,#chap.on,.phx.on,.hero.on,#sig.on') || !document.getElementById('cine').hidden;

  /* 1. things to press */
  const ctrls = [...document.querySelectorAll('button,a[href],input,textarea')].filter(el => !el.closest('.__dev') && !el.classList.contains('skip') && shown(el));
  ctrls.forEach(el => {
    const s = getComputedStyle(el); if (s.pointerEvents === 'none') return;
    if (top && !top.contains(el) && !el.closest('.cue')) return;            // under whatever is open
    if (busy && (el.closest('#hud') || el.closest('#touch'))) return;        // the hill's own controls, while something else has the floor
    const r = R(el), sc = scroller(el);
    if (sc) { const q = R(sc); if (r.b < q.t + 14 || r.t > q.b - 14) return; if (r.t < q.t || r.b > q.b) return; }     // scrolled (partly) out of its pane: reachable by scrolling
    if (offscreen(r)) out.push(['OFF', name(el), Math.round(r.l) + ',' + Math.round(r.t) + ' ' + Math.round(r.w) + 'x' + Math.round(r.h)]);
    else if (outside(r) && !sc) out.push(['UNSAFE', name(el), Math.round(r.l) + ',' + Math.round(r.t) + ' ' + Math.round(r.w) + 'x' + Math.round(r.h)]);
    const min = o.touch ? 40 : 24;
    if (el.type !== 'range' && el.type !== 'checkbox' && (r.h < min - 0.5 || r.w < min - 0.5)) {
      /* a label may be what is really pressed */
      const lab = el.closest('label'); const lr = lab ? R(lab) : r;
      if (lr.h < min - 0.5 || lr.w < min - 0.5) out.push(['SMALL', name(el), Math.round(r.w) + 'x' + Math.round(r.h)]);
    }
    const cx = Math.max(0, Math.min(W - 1, (r.l + r.r) / 2)), cy = Math.max(0, Math.min(H - 1, (r.t + r.b) / 2));
    const hit = document.elementFromPoint(cx, cy);
    if (hit && !el.contains(hit) && !hit.contains(el) && !(hit.closest('label') && hit.closest('label').contains(el)) && !hit.closest('.__dev') && !(sc && !sc.contains(hit)))
      out.push(['COVERED', name(el), 'by ' + name(hit)]);
  });

  /* 2. things to read: on screen, and not on top of one another */
  const SEL = ['#day', '#place', '#clock', '#goalcard', '#hud .hr', '#obj', '#prompt', '#toast', '#caption', '#region', '#chap', '.coach', '.cue', '.achpop', '.objdone', '#ridehud', '#sig', '#charge', '#stick', '.tb', '#dlg', '#narr', '#mo', '#choice', '.lcap', '#lenscv', '.gcard', '.ipanel', '.mcard', '.wb', '.hcard', '#title .tin', '.ein', '#book .bcard', '#menu .bcard', '.askc', '.phd', '.hero .hbook', '.cskip', '.ccap', '.hskip', '.rcin', '.contcard', '.updcard'];
  const els = [];
  SEL.forEach(q => document.querySelectorAll(q).forEach(el => { if (shown(el)) els.push([q, el, R(el)]); }));
  els.forEach(([q, el, r]) => {
    if (r.w < 2 || r.h < 2) return;
    if (q === '#stick' || q === '.tb') { if (outside(r)) out.push(['UNSAFE', q, Math.round(r.l) + ',' + Math.round(r.t) + ' ' + Math.round(r.w) + 'x' + Math.round(r.h)]); return; }
    if (offscreen(r)) out.push(['OFF', q, Math.round(r.l) + ',' + Math.round(r.t) + ' ' + Math.round(r.w) + 'x' + Math.round(r.h)]);
    else if (outside(r) && !/bcard|phd|hbook|#title|ein|lenscv|ipanel/.test(q)) out.push(['UNSAFE', q, Math.round(r.l) + ',' + Math.round(r.t) + ' ' + Math.round(r.w) + 'x' + Math.round(r.h)]);
  });
  const HUDQ = /^(#day|#place|#clock|#goalcard|#hud \.hr|#obj|#prompt|#toast|#caption|#region|#chap|\.coach|\.cue|\.achpop|\.objdone|#ridehud|#sig|#charge|#stick|\.tb|#dlg|#narr|#mo|#choice|\.lcap)$/;
  const hudEls = els.filter(e => HUDQ.test(e[0]) && e[2].w > 2 && e[2].h > 2);
  for (let i = 0; i < hudEls.length; i++) for (let j = i + 1; j < hudEls.length; j++) {
    const a = hudEls[i], b = hudEls[j];
    if (a[1].contains(b[1]) || b[1].contains(a[1])) continue;
    if (a[0] === '.tb' && b[0] === '.tb') continue;
    const ox = Math.min(a[2].r, b[2].r) - Math.max(a[2].l, b[2].l), oy = Math.min(a[2].b, b[2].b) - Math.max(a[2].t, b[2].t);
    if (ox > 3 && oy > 3) out.push(['OVERLAP', a[0] + ' × ' + b[0], Math.round(ox) + 'x' + Math.round(oy)]);
  }

  /* 3. words cut off */
  const scope = top || document.body;
  scope.querySelectorAll('*').forEach(el => {
    if (el.closest('.__dev') || el.closest('svg') || el.closest('.sr') || el.classList.contains('skip') || !el.childNodes.length) return;
    const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!hasText || !shown(el)) return;
    const s = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== 'ellipsis' && el.clientWidth > 0) out.push(['CLIP', name(el), el.scrollWidth + '>' + el.clientWidth]);
    const r = R(el);
    if (!scroller(el) && (r.r > W + 2 || r.l < -2) && r.w > 0 && !el.closest('#touch')) out.push(['TEXTOFF', name(el), Math.round(r.l) + '..' + Math.round(r.r)]);
    const fs = parseFloat(s.fontSize);
    if (fs > 1 && fs < 10.5 && r.w > 0) out.push(['TINYTEXT', name(el).replace(/"[^"]*"/, ''), fs.toFixed(1) + 'px']);
  });
  if (document.documentElement.scrollWidth > W + 1) out.push(['HSCROLL', 'document', document.documentElement.scrollWidth + '>' + W]);
  return out;
}

/* a notch, a home bar and round corners, so a screenshot shows what the glass hides */
function frameCSS(d) {
  const s = d.safe, rad = d.rad || 0;
  let css = `:root{--safe-t:${s[0]}px!important;--safe-r:${s[1]}px!important;--safe-b:${s[2]}px!important;--safe-l:${s[3]}px!important}`;
  css += '.__dev{position:fixed;z-index:99999;pointer-events:none}';
  css += `.__dev.c{width:${rad}px;height:${rad}px;background:radial-gradient(circle at var(--x) var(--y),transparent ${rad - 0.5}px,#000 ${rad}px)}`;
  return css;
}
function frameHTML(d) {
  const rad = d.rad || 0; let h = '';
  if (rad) h += `<i class="__dev c" style="left:0;top:0;--x:100%;--y:100%"></i><i class="__dev c" style="right:0;top:0;--x:0%;--y:100%"></i><i class="__dev c" style="left:0;bottom:0;--x:100%;--y:0%"></i><i class="__dev c" style="right:0;bottom:0;--x:0%;--y:0%"></i>`;
  if (d.notch === 'notch') h += '<i class="__dev" style="left:50%;top:0;width:160px;height:32px;margin-left:-80px;background:#000;border-radius:0 0 20px 20px"></i>';
  if (d.notch === 'island') h += '<i class="__dev" style="left:50%;top:11px;width:126px;height:37px;margin-left:-63px;background:#000;border-radius:20px"></i>';
  if (d.notch === 'notchL') h += '<i class="__dev" style="left:0;top:50%;width:32px;height:160px;margin-top:-80px;background:#000;border-radius:0 20px 20px 0"></i>';
  if (d.notch === 'islandL') h += '<i class="__dev" style="left:11px;top:50%;width:37px;height:126px;margin-top:-63px;background:#000;border-radius:20px"></i>';
  if (d.safe[2] >= 16) h += `<i class="__dev" style="left:50%;bottom:8px;width:${d.w > d.h ? 210 : 134}px;height:5px;margin-left:-${d.w > d.h ? 105 : 67}px;background:rgba(255,255,255,.85);border-radius:3px"></i>`;
  return h;
}

async function newPage(browser, d) {
  const ctx = await browser.newContext({ viewport: { width: d.w, height: d.h }, hasTouch: !!d.touch, isMobile: !!d.touch, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.errs = []; p.on('pageerror', e => p.errs.push(e.message));
  return p;
}
async function dress(p, d) {
  await p.addStyleTag({ content: frameCSS(d) });
  await p.evaluate(h => { const w = document.createElement('div'); w.className = '__dev'; w.innerHTML = h; document.body.appendChild(w); window.dispatchEvent(new Event('resize')); }, frameHTML(d));
}

/* put everything away, and stand somewhere fresh */
function resetTo(beat) {
  const G = BS.G, $ = id => document.getElementById(id);
  try { if (G.choosing) G.choosing.pick(); } catch (e) { }
  try { if (G.modal) G.modal(); } catch (e) { }
  try { if (G.mode === 'lens') G.closeLens(); } catch (e) { }
  try { BS.ui.closeAll(); } catch (e) { }
  document.querySelectorAll('.achpop,.ask,.coach,.cue,.objdone,.badgepop').forEach(e => e.remove());
  document.body.classList.remove('achon', 'directing', 'framed', 'coaching');
  $('dlg').className = 'dlg'; $('mini').className = 'mini';
  ['narr', 'mo', 'choice', 'board', 'sig', 'ridehud', 'chap', 'region', 'toast', 'get', 'lens', 'prompt', 'caption'].forEach(id => $(id).classList.remove('on'));
  $('insp').classList.remove('on'); $('insp').hidden = true;
  const e = $('end'); e.classList.remove('on'); e.hidden = true;
  $('pzopts').hidden = true; $('help').hidden = true;
  const hw = $('howto'); hw.classList.remove('on'); hw.hidden = true; const tt = $('title'); if (tt) tt.classList.add('off');
  G.ride = null; G.cut = 0; G.cueFn = null; G.choosing = null; G.modal = null; G.holdUp = null; G.lensState = null; G.talking = false; G.camFocus = null; G.zoom = 1; G.directing = false;
  G.skipWaits = true; G.prefs.seenHow = true; G.prefs.fullText = false;
  BS.ui.debugBeat(beat);
}

async function runDevice(browser, key, screens, out) {
  const d = DEV[key], dir = ROOT + out + '/' + key + '/'; fs.mkdirSync(dir, { recursive: true });
  const p = await newPage(browser, d), rep = {};
  const snap = async sk => { rep[sk] = await p.evaluate(audit, { safe: d.safe, touch: !!d.touch }); await p.screenshot({ path: dir + sk + '.png' });
    if (p.errs.length) { rep[sk] = rep[sk].concat(p.errs.map(m => ['PAGEERROR', m.slice(0, 160), ''])); p.errs.length = 0; } };
  const want = k => screens.includes(k);
  try {
    await p.goto(URL, { waitUntil: 'load' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'load' });
    await p.waitForTimeout(600); await dress(p, d);
    if (want('title')) { await p.waitForTimeout(2200); await snap('title'); }
    if (want('howto1') || want('howto2') || want('howto3')) {
      await p.evaluate(() => document.getElementById('t-how').click()); await p.waitForTimeout(800); if (want('howto1')) await snap('howto1');
      await p.evaluate(() => document.getElementById('h-next').click()); await p.waitForTimeout(700); if (want('howto2')) await snap('howto2');
      await p.evaluate(() => document.getElementById('h-next').click()); await p.waitForTimeout(700); if (want('howto3')) await snap('howto3');
      await p.evaluate(() => document.getElementById('h-skip').click()); await p.waitForTimeout(300);
    }
    for (const sk of screens) {
      const s = SCR[sk]; if (!s || !s.beat) continue;
      try {
        await p.evaluate(resetTo, s.beat); await p.waitForTimeout(650);
        if (s.flush) for (let i = 0; i < 5; i++) { await p.evaluate(() => { BS.G.advance(); }); await p.waitForTimeout(220); }
        if (s.run) await p.evaluate(s.run, s.args ? LONG : undefined);
        await p.waitForTimeout(s.wait || 1000);
        await snap(sk);
      } catch (e) { rep[sk] = [['ERROR', e.message.slice(0, 160), '']]; }
    }
    if (want('title2')) {
      await p.evaluate(resetTo, 'pit'); await p.waitForTimeout(300);
      await p.evaluate(() => { BS.G.s.objective = 'Find out what the second board says'; BS.G.s.playMs = 42 * 60000; BS.G.save(); });
      await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(600); await dress(p, d); await p.waitForTimeout(2200); await snap('title2');
    }
  } catch (e) { rep._crash = [['ERROR', e.message.slice(0, 200), '']]; }
  await p.context().close();
  return rep;
}

module.exports = { DEV, SCR, audit, dress, newPage, frameCSS, frameHTML, ROOT, URL, LONG, resetTo };

if (require.main === module) (async () => {
  const dArg = process.argv[2] || 'all', sArg = process.argv[3] || 'all', out = process.argv[4] || 'run';
  const groups = ['phones', 'phonesL', 'tablets', 'tabletsL', 'desk', 'big'];
  let devs = dArg === 'all' ? Object.keys(DEV) : dArg.split(',').flatMap(k => groups.includes(k) ? Object.keys(DEV).filter(x => DEV[x].g === k) : [k]);
  const screens = sArg === 'all' ? Object.keys(SCR) : sArg.split(',');
  const browser = await chromium.launch();
  const report = {}; const POOL = +process.env.POOL || 3; let i = 0;
  await Promise.all(Array.from({ length: POOL }, async () => { while (i < devs.length) { const k = devs[i++]; report[k] = await runDevice(browser, k, screens, out); process.stderr.write(k + ' '); } }));
  await browser.close();
  const rp = ROOT + out + '/report.json';
  let prev = {}; try { prev = JSON.parse(fs.readFileSync(rp, 'utf8')); } catch (e) { }
  for (const k in report) prev[k] = Object.assign(prev[k] || {}, report[k]);
  fs.writeFileSync(rp, JSON.stringify(prev, null, 1));
  /* a summary: each kind of problem, and where */
  const by = {};
  for (const dk of devs) for (const sk in report[dk]) for (const it of report[dk][sk]) { const key = it[0] + ' ' + it[1]; (by[key] = by[key] || []).push(dk + ':' + sk + (it[2] ? '(' + it[2] + ')' : '')); }
  const keys = Object.keys(by).sort();
  console.log('\npictures and report.json in ' + ROOT + out + '/\n' + keys.length + ' kinds of thing to look at');
  keys.forEach(k => console.log(k + '\n    ' + by[k].slice(0, 12).join('  ') + (by[k].length > 12 ? '  …+' + (by[k].length - 12) : '')));
})();
