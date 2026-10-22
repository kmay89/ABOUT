/* desk-check.js — dev-only. The desk's regression and performance harness.

   The front page has no depth buffer. One thing is in front of another only
   because it was pushed onto the scene later, so a line moved in the scene
   builder is a thing moved through space — and nothing in node can see that.
   It has three lightings that all have to keep working (1999, 2026, the
   lamp off), plus a phone, plus reduced motion. This opens each of those in
   a real Chromium, photographs it, and compares the photographs with the
   ones taken last time it was known to be right.

   Four parts, in order:

   1. States. Each one is a fresh page brought to a known condition (a year,
      a lighting, a sheet open, a hover), scrolled so the desk's top edge
      sits at the same place on screen, and photographed. The dust is hidden
      for the photograph and every CSS animation is held at its start: both
      are motion, and a photograph of motion never matches the last one.
   2. Crops. Five boxes in the room's own coordinates (the front corners of
      the desk, the two walls, the CRT and keyboard), projected through the
      SVG's live transform, so a crop still lands on the same things when the
      header above the desk changes height. A crop fails if more than 0.5 %
      of its pixels moved by more than 24 in any channel — unless the change
      is art (`--art`, DESK_ART=1, or a HEAD commit subject starting "art:"),
      in which case the diffs are printed and saved for a person to look at.
   3. DOM assertions: the painter's-order and bookkeeping rules a picture
      can't check. Rules about things a later piece of work adds (the
      regrouped legend, the commentary notes, the no-JS index) say "not yet
      present" until those things exist, and are enforced from then on.
   4. Performance probes, traced: idle work with the desk in view, scrolled
      away, and under a sheet; a pointer sweep; a hover; a torch sweep in the
      dark. Each at 1× and again at 4× CPU throttle and DPR 2.

   Baselines live in tools/desk-baseline/ (gitignored: they are this
   machine's fonts and this machine's Chromium, not the truth everywhere).

   Run: node tools/desk-check.js --update   take the baselines (an untouched tree), and
                                            record this machine's idle numbers
        node tools/desk-check.js            compare against them
        --only=visual,dom,perf              just those parts
        --art                               report crop diffs, don't fail on them
        --out=DIR                           where this run's photographs go

   Needs playwright-core and a Chromium (CHROMIUM_PATH, or /opt/pw-browsers).
   Without them it says so and exits 0, like tools/open-check.js: it is a
   tool for whoever is changing the desk, not a gate for CI without a browser. */
"use strict";
const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const BASE = path.join(__dirname, "desk-baseline");
const PORT = +process.env.DESK_CHECK_PORT || 8395;

const ARGV = process.argv.slice(2);
const flag = (n) => ARGV.includes("--" + n);
const opt = (n) => { const a = ARGV.find((s) => s.startsWith("--" + n + "=")); return a ? a.slice(n.length + 3) : null; };
const UPDATE = flag("update");
const ONLY = (opt("only") || "visual,dom,perf").split(",");
const OUT = opt("out") || fs.mkdtempSync(path.join(os.tmpdir(), "desk-check-"));
let ART = flag("art") || process.env.DESK_ART === "1";
try { ART = ART || /^art:/i.test(execSync("git log -1 --format=%s", { cwd: ROOT }).toString().trim()); } catch (e) { /* not a checkout */ }

let pw = null;
for (const name of ["playwright-core", "playwright"]) {
  try { pw = require(name); break; } catch (e) { /* try the next */ }
}
if (!pw) {
  console.log("\nplaywright-core isn't installed — skipping the desk check.\n  npm i --no-save playwright-core\n");
  process.exit(0);
}

/* ---------------------------------------------------------------- budgets
   Section 0.1 of the rethink's spec, in one place. Each is a merge gate. */
const BUDGET = {
  lines: 5850,                 // index.html, wc -l
  idleTop: 95,                 // ms/s of main-thread render work, desk in view, 1×
  idleTopSlow: 120,            // the same at 4× CPU throttle and DPR 2
  idleAway: 10,                // ms/s, scrolled to the footer or under a sheet: the dust is asleep
  sweepStyle: 2,               // ms of style recalc per pointer-move frame
  sweepRaster: 5,              // ms of raster per pointer-move frame
  hoverRaster: 4,              // ms of raster per frame while one object reacts
  torchRaster: 1,              // ms of raster per frame while the torch moves (lights out)
  cropMismatch: 0.005,         // fraction of a crop's pixels allowed to move
  pixelDelta: 24               // "moved" means more than this in any channel
};

/* ------------------------------------------------------------------ states
   prep runs first (it may click things that scroll the page), then the page
   is aligned so the desk's top edge is 16 px from the top of the viewport,
   then post runs (hovers and clicks on the desk itself, which need the desk
   to stay where it was photographed). `needs` is a selector a later piece
   of work adds: until it exists, the state is reported as not yet present. */
const DESK = { width: 1400, height: 1000, dpr: 2 };
const STATES = [
  { name: "1999" },
  { name: "2026", prep: toNow },
  { name: "dark-1999", post: lightsOut },
  { name: "dark-2026", prep: toNow, post: lightsOut },
  { name: "reduced", reduced: true },
  { name: "mobile", width: 390, height: 844, dpr: 3, touch: true },
  { name: "luma-dossier", post: (p) => tapObj(p, "luma", 900) },
  { name: "tour-1", needs: "#tourBtn", post: (p) => clickJS(p, "#tourBtn", 1200) },
  { name: "commentary", needs: "#commBtn", prep: (p) => clickJS(p, "#commBtn", 400) },
  { name: "well-hover-dark", post: async (p) => { await lightsOut(p); await hoverObj(p, "well"); } }
];

/* the crops, as boxes in world units [x0,x1, y0,y1, z0,z1]; P(x,y,z) = [x−y, (x+y)/2 − z] */
const CROPS = {
  "front-right": [440, 560, 260, 380, 0, 40],      // the floppy, the jewel case's corner, the console
  "front-left":  [0, 140, 250, 380, 0, 40],        // the cube, the novel, the bones
  "wall-B":      [-30, -30, 150, 420, 60, 200],    // the lithophane, the clock's spot, the shelf
  "wall-A":      [270, 470, -30, -30, 90, 200],    // the switch and what the dark writes beside it
  "crt-keyboard":[140, 340, 40, 270, 0, 110]       // the tube and the keys in front of it
};

async function toNow(page) {
  await page.click("#eraBtn");
  /* the forward ride is a few seconds of timers; the chip is disabled until it lands */
  await page.waitForFunction(() => !document.getElementById("eraBtn").disabled &&
    document.getElementById("iso").classList.contains("now"), null, { timeout: 20000 });
  await page.waitForTimeout(500);
}
async function lightsOut(page) {
  await page.locator('.iso-obj[data-id="switch"]').first().click();
  await page.waitForTimeout(1900);                   // the dark fades .8 s; the wall's words 1.65 s
}
async function clickJS(page, sel, wait) {
  /* a plain element.click(), so the browser doesn't scroll to it first */
  await page.evaluate((s) => document.querySelector(s).click(), sel);
  await page.waitForTimeout(wait);
}
async function objBox(page, id) {
  return page.evaluate((id) => {
    const el = [...document.querySelectorAll('.iso-obj[data-id="' + id + '"]')]
      .find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
}
async function hoverObj(page, id) {
  const b = await objBox(page, id);
  if (b) await page.mouse.move(b.x, b.y);
  await page.waitForTimeout(700);
}
async function tapObj(page, id, wait) {
  const b = await objBox(page, id);
  if (b) await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(wait);
}

/* ------------------------------------------------------------------ server
   A static server, as tools/open-check.js has. Two extras: `/?probe` serves
   the page with one line added at the end of its script that hands the
   WORLDS and NOTES tables to the DOM assertions (nothing else reads it), and
   /__img/ serves this run's photographs and the baselines to the diff page. */
const TYPES = { ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const [rawPath, query] = req.url.split("?");
  let p = decodeURIComponent(rawPath);
  if (p.startsWith("/__img/")) {
    const [, , which, name] = p.split("/");
    const file = path.join(which === "base" ? BASE : OUT, path.basename(name));
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "content-type": "image/png" });
    return fs.createReadStream(file).pipe(res);
  }
  if (p === "/__blank") { res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><title>diff</title>"); }
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end("no");
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "text/plain" });
  if (p === "/index.html" && /(^|&)probe/.test(query || "")) {
    let html = fs.readFileSync(file, "utf8");
    const k = html.lastIndexOf("})();");
    html = html.slice(0, k) + ';try{window.__desk={WORLDS:typeof WORLDS!=="undefined"?WORLDS:null,' +
      'NOTES:typeof NOTES!=="undefined"?NOTES:null};}catch(e){}\n' + html.slice(k);
    return res.end(html);
  }
  fs.createReadStream(file).pipe(res);
});
const URL0 = "http://127.0.0.1:" + PORT + "/";

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  if (!fs.existsSync(base)) return undefined;
  for (const dir of fs.readdirSync(base).sort().reverse()) {
    const p = path.join(base, dir, "chrome-linux/chrome");
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/* ------------------------------------------------------------- reporting */
let fails = 0;
const errors = [];                                   // assertion (e): every console error, from every page
function ok(what, cond, detail) {
  if (cond) console.log("  ✓ " + what + (detail ? " — " + detail : ""));
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}
function notYet(what, why) { console.log("  · " + what + " — not yet present" + (why ? " (" + why + ")" : "")); }
function note(what) { console.log("  " + what); }

/* A page with the run's fixed conditions: a fixed evening (the moon and the
   chess clock read the date), the arrival already seen (a fresh tab may
   start in the dark), and every console error collected. */
const FIXED_NOW = Date.UTC(2026, 9, 22, 21, 0, 0);
async function openDesk(browser, o) {
  const ctx = await browser.newContext({
    viewport: { width: o.width || DESK.width, height: o.height || DESK.height },
    deviceScaleFactor: o.dpr || DESK.dpr, hasTouch: !!o.touch, isMobile: !!o.touch,
    reducedMotion: o.reduced ? "reduce" : "no-preference", timezoneId: "UTC"
  });
  await ctx.addInitScript((t0) => {
    const D = Date, shift = t0 - D.now();
    class FixedDate extends D {
      constructor(...a) { if (a.length) super(...a); else super(D.now() + shift); }
      static now() { return D.now() + shift; }
    }
    window.Date = FixedDate;
    try { sessionStorage.setItem("km_lit", "1"); } catch (e) {}
  }, FIXED_NOW);
  const page = await ctx.newPage();
  const tag = o.name || "page";
  page.on("console", (m) => {
    if (m.type() === "error" && !/favicon/.test((m.location() || {}).url || "")) errors.push(tag + ": " + m.text());
  });
  page.on("pageerror", (e) => errors.push(tag + ": " + e.message));
  await page.goto(URL0 + (o.query || ""), { waitUntil: "load" });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(700);
  return { ctx, page };
}

/* scroll so the SVG's top edge is 16 px down the viewport (as far as the page allows) */
async function alignDesk(page) {
  await page.evaluate(() => {
    const r = document.getElementById("iso").getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, scrollY + r.top - 16), behavior: "instant" });
  });
  await page.waitForTimeout(250);
}

/* the crop boxes, projected through the SVG's live screen transform, in CSS px */
async function cropRects(page) {
  return page.evaluate((crops) => {
    const iso = document.getElementById("iso"), m = iso.getScreenCTM(), out = {};
    for (const k in crops) {
      const [x0, x1, y0, y1, z0, z1] = crops[k];
      let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
      for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) {
        const q = new DOMPoint(x - y, (x + y) / 2 - z).matrixTransform(m);
        a = Math.min(a, q.x); b = Math.min(b, q.y); c = Math.max(c, q.x); d = Math.max(d, q.y);
      }
      a = Math.max(0, Math.floor(a - 4)); b = Math.max(0, Math.floor(b - 4));
      c = Math.min(innerWidth, Math.ceil(c + 4)); d = Math.min(innerHeight, Math.ceil(d + 4));
      if (c - a > 8 && d - b > 8) out[k] = { x: a, y: b, w: c - a, h: d - b };
    }
    const r = iso.getBoundingClientRect();
    out.__iso = { x: r.left, y: r.top };
    return out;
  }, CROPS);
}

/* ================================================================ visual */
async function shootState(browser, st) {
  const { ctx, page } = await openDesk(browser, st);
  try {
    if (st.needs && !(await page.$(st.needs))) return { name: st.name, absent: st.needs };
    if (st.prep) await st.prep(page);
    await alignDesk(page);
    if (st.post) await st.post(page);
    await page.waitForTimeout(400);
    const rects = await cropRects(page);
    const file = st.name + ".png";
    await page.screenshot({ path: path.join(OUT, file), animations: "disabled",
      style: "#dust{visibility:hidden !important}" });
    return { name: st.name, file, rects, dpr: st.dpr || DESK.dpr };
  } finally { await ctx.close(); }
}

/* Pixel diff, in a page: both PNGs drawn onto canvases, and every crop
   compared pixel by pixel. Each crop is taken at its own measured rectangle
   in each photograph, so a header that grew by a line doesn't fail the
   desk. The whole frame is compared too, aligned on the desk, for the
   record; and a picture of what moved is saved whenever anything did. */
async function diffState(page, shot, baseRects) {
  return page.evaluate(async ({ shot, baseRects, B }) => {
    const load = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const [bi, ci] = await Promise.all([load("/__img/base/" + shot.file), load("/__img/cur/" + shot.file)]);
    const pix = (img) => { const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(img, 0, 0); return g; };
    const bg = pix(bi), cg = pix(ci), k = shot.dpr;
    function cmp(br, cr, mark) {
      const w = Math.round(Math.min(br.w, cr.w) * k), h = Math.round(Math.min(br.h, cr.h) * k);
      if (w < 1 || h < 1) return { frac: 0, n: 0 };
      const a = bg.getImageData(Math.round(br.x * k), Math.round(br.y * k), w, h).data;
      const b = cg.getImageData(Math.round(cr.x * k), Math.round(cr.y * k), w, h).data;
      let bad = 0;
      for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) > B || Math.abs(a[i + 1] - b[i + 1]) > B || Math.abs(a[i + 2] - b[i + 2]) > B) {
          bad++;
          if (mark) mark.push(i / 4);
        }
      }
      return { frac: bad / (w * h), n: bad, w, h };
    }
    const out = { crops: {} };
    for (const key in shot.rects) {
      if (key === "__iso" || !baseRects[key]) continue;
      out.crops[key] = cmp(baseRects[key], shot.rects[key]).frac;
    }
    /* the whole frame, shifted so the two desks line up */
    const dy = shot.rects.__iso.y - baseRects.__iso.y, dx = shot.rects.__iso.x - baseRects.__iso.x;
    const W = Math.min(bi.width, ci.width) / k, H = Math.min(bi.height, ci.height) / k;
    const fb = { x: Math.max(0, -dx), y: Math.max(0, -dy), w: W - Math.abs(dx), h: H - Math.abs(dy) };
    const fc = { x: Math.max(0, dx), y: Math.max(0, dy), w: fb.w, h: fb.h };
    const marks = [];
    const f = cmp(fb, fc, marks);
    out.frame = f.frac;
    if (f.n) {
      /* what moved, in red over a dimmed copy of the new photograph */
      const c = document.createElement("canvas"); c.width = f.w; c.height = f.h;
      const g = c.getContext("2d");
      g.globalAlpha = 0.3; g.drawImage(ci, Math.round(fc.x * k), Math.round(fc.y * k), f.w, f.h, 0, 0, f.w, f.h); g.globalAlpha = 1;
      const im = g.getImageData(0, 0, f.w, f.h);
      for (const p of marks) { im.data[p * 4] = 255; im.data[p * 4 + 1] = 40; im.data[p * 4 + 2] = 40; im.data[p * 4 + 3] = 255; }
      g.putImageData(im, 0, 0);
      out.diffPng = c.toDataURL("image/png");
    }
    return out;
  }, { shot, baseRects, B: BUDGET.pixelDelta });
}

async function visual(browser) {
  console.log("\n──  states" + (UPDATE ? " (writing baselines)" : "") + "   photographs: " + OUT);
  /* four at a time: each state is its own page, and two of them sit through the era ride */
  const shots = [];
  for (let i = 0; i < STATES.length; i += 4) {
    shots.push(...await Promise.all(STATES.slice(i, i + 4).map((st) => shootState(browser, st))));
  }
  if (UPDATE) {
    fs.mkdirSync(BASE, { recursive: true });
    for (const s of shots) {
      if (s.absent) { notYet(s.name, s.absent + " isn't on the page"); continue; }
      fs.copyFileSync(path.join(OUT, s.file), path.join(BASE, s.file));
      fs.writeFileSync(path.join(BASE, s.name + ".json"), JSON.stringify(s.rects));
      note("✎ baseline " + s.name + " (" + Object.keys(s.rects).filter((k) => k !== "__iso").join(", ") + ")");
    }
    return;
  }
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(URL0 + "__blank");
  for (const s of shots) {
    if (s.absent) { notYet(s.name, s.absent + " isn't on the page"); continue; }
    const bj = path.join(BASE, s.name + ".json");
    if (!fs.existsSync(bj)) { note("? " + s.name + " — no baseline yet (node tools/desk-check.js --update)"); continue; }
    const d = await diffState(page, s, JSON.parse(fs.readFileSync(bj, "utf8")));
    if (d.diffPng) fs.writeFileSync(path.join(OUT, s.name + "-diff.png"), Buffer.from(d.diffPng.split(",")[1], "base64"));
    const parts = Object.entries(d.crops).map(([k, v]) => k + " " + (v * 100).toFixed(2) + "%");
    const worst = Math.max(0, ...Object.values(d.crops));
    const line = s.name + ": " + parts.join(", ") + " · whole frame " + (d.frame * 100).toFixed(2) + "%" +
      (d.diffPng ? " → " + s.name + "-diff.png" : "");
    if (ART && worst > BUDGET.cropMismatch) note("◐ " + line + "  (art: look at it)");
    else ok(line, worst <= BUDGET.cropMismatch);
  }
  await ctx.close();
}

/* =================================================================== DOM */
async function dom(browser) {
  console.log("\n──  painter's order and bookkeeping");
  const { ctx, page } = await openDesk(browser, { name: "probe", query: "?probe" });
  const r = await page.evaluate(() => {
    const W = window.__desk || {}, iso = document.getElementById("iso");
    const objIds = new Set([...document.querySelectorAll(".iso-obj")].map((e) => e.dataset.id));
    const pills = [...document.querySelectorAll(".legend button[data-id]")].map((b) => b.dataset.id);
    const after = (a, b) => !!(a && b && (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING));
    const dk = document.getElementById("darkness");
    const sw = document.querySelector('.iso-obj[data-id="switch"]');
    const night = ["wellNight", "lumaNight", "eggWall"].map((id) => document.getElementById(id));
    const comm = document.getElementById("commLayer");
    const before = [...document.querySelectorAll(".iso-obj")].filter((e) => e !== sw && !after(e, dk))
      .map((e) => e.dataset.id);
    /* in order: darkness, wellNight, lumaNight, eggWall, switch, commLayer */
    const chain = [dk].concat(night, [sw], comm ? [comm] : []);
    const chainOk = chain.every((e, i) => e && (i === 0 || after(chain[i - 1], e)));
    const notes = W.NOTES || null;
    let noteIssues = null;
    if (notes && comm) {
      noteIssues = [];
      notes.forEach((n, i) => {
        if (n.id && !objIds.has(n.id)) noteIssues.push("note " + (i + 1) + " names a missing object " + n.id);
        const x = n.at[0] - n.at[1] + ((n.off && n.off[0]) || 0), y = (n.at[0] + n.at[1]) / 2 - n.at[2] + ((n.off && n.off[1]) || 0);
        if (x < -465 || x > 670 || y < -245 || y > 570) noteIssues.push("note " + (i + 1) + " lands outside the room at " + x.toFixed(0) + "," + y.toFixed(0));
      });
      const nodes = comm.querySelectorAll(".cnode").length;
      if (nodes !== notes.length) noteIssues.push(nodes + " nodes for " + notes.length + " notes");
    }
    return {
      worlds: W.WORLDS ? Object.keys(W.WORLDS) : null,
      titles: W.WORLDS ? Object.keys(W.WORLDS).map((k) => [k, W.WORLDS[k].title]) : [],
      pills, objIds: [...objIds], regrouped: !!document.querySelector(".legend .lg"),
      before, chainOk, chainIds: chain.map((e) => e ? (e.id || e.dataset.id) : "missing"),
      hasComm: !!comm, notes: !!notes, noteIssues
    };
  });

  /* (a) every legend pill points at something on the desk (cv is the floppy's own sheet) */
  const lonely = r.pills.filter((id) => id !== "cv" && !r.objIds.includes(id));
  ok("(a) every legend pill has an object on the desk", !lonely.length, lonely.join(", "));

  /* (b) every world has a pill. The legend lagged the desk by six worlds,
     which is the regrouped legend's job to fix; until it lands, list them. */
  if (!r.worlds) ok("(b) WORLDS is readable", false, "the probe found no WORLDS table");
  else {
    const want = r.worlds.concat(["mandel", "prism"]);
    const missing = want.filter((id) => !r.pills.includes(id));
    if (r.regrouped) ok("(b) every world, plus mandel and prism, has a pill", !missing.length, missing.join(", "));
    else notYet("(b) every world has a pill", "the regrouped legend; today " + missing.length + " without one: " + missing.join(", "));
  }

  /* (c) the commentary's notes name real things and land inside the room */
  if (r.notes && r.hasComm) ok("(c) every note names a real object and lands in the room", !r.noteIssues.length, r.noteIssues.join("; "));
  else notYet("(c) commentary notes", "NOTES / #commLayer");

  /* (d) the dark is drawn after every object but the switch; what glows through it after */
  ok("(d) #darkness is above every object except the switch", !r.before.length, r.before.length ? "drawn after it: " + r.before.join(", ") : "");
  ok("(d) after the dark, in order: " + r.chainIds.join(" → "), r.chainOk);
  if (!r.hasComm) notYet("(d) #commLayer last", "the commentary layer");

  /* (f) the no-JS index lists every world */
  const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const ns = (src.match(/<noscript>[\s\S]*?<\/noscript>/g) || []).find((s) => /plain-index/.test(s));
  if (!ns) notYet("(f) the no-JS index names every world", "<noscript> .plain-index");
  else {
    const esc = (t) => t.replace(/&/g, "&amp;");
    const absent = r.titles.filter(([, t]) => t && !ns.includes(t) && !ns.includes(esc(t))).map(([k]) => k);
    ok("(f) the no-JS index names every world", !absent.length, absent.join(", "));
  }

  /* (g) the file stays one readable file */
  const lines = src.split("\n").length - (src.endsWith("\n") ? 1 : 0);
  ok("(g) index.html is within budget", lines <= BUDGET.lines, lines + " / " + BUDGET.lines + " lines");

  /* the sleep gate: under a sheet, the room's loops hold still. */
  const sleep = await page.evaluate(async () => {
    const el = document.querySelector('.iso-obj[data-id="hive"]');
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 500));
    const steam = document.querySelector(".steam");
    const st = steam ? steam.getAnimations().map((a) => a.playState) : [];
    const gated = document.body.classList.contains("modal-open");
    document.getElementById("dClose").click();
    await new Promise((r) => setTimeout(r, 500));
    return { gated, st };
  });
  if (!sleep.gated) notYet("the sleep gate pauses the room under a sheet", "body.modal-open");
  else ok("the sleep gate pauses the room under a sheet", sleep.st.length && sleep.st.every((s) => s === "paused"), ".steam: " + sleep.st.join(","));
  await ctx.close();
}

/* ================================================================== perf */
/* "Main-thread render work" is the sum of these trace events, which is how
   the spec's ~95 ms/s was measured. Raster runs on worker threads and is
   counted on its own. */
const MAIN = ["UpdateLayoutTree", "Layout", "PrePaint", "Paint", "Layerize", "Commit", "FireAnimationFrame"];
async function traced(browser, page, fn) {
  const tf = path.join(OUT, "trace.json");
  await browser.startTracing(page, { path: tf, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline"] });
  const t0 = Date.now();
  const extra = await fn();
  const secs = (Date.now() - t0) / 1000;
  await browser.stopTracing();
  const ev = JSON.parse(fs.readFileSync(tf, "utf8")).traceEvents.filter((e) => e.ph === "X" && e.dur);
  fs.unlinkSync(tf);
  const sum = (names) => ev.filter((e) => names.includes(e.name)).reduce((a, e) => a + e.dur / 1000, 0);
  return { secs, main: sum(MAIN), style: sum(["UpdateLayoutTree"]), raster: sum(["RasterTask"]), extra };
}
const frames = (page, n) => page.evaluate((n) => new Promise((r) => {
  let i = 0; (function f() { if (++i >= n) r(); else requestAnimationFrame(f); })();
}), n);

async function perfConfig(browser, label, slow) {
  const rows = [];
  const fresh = async () => {
    const o = await openDesk(browser, { name: "perf " + label, dpr: slow ? 2 : 1 });
    if (slow) { const cdp = await o.ctx.newCDPSession(o.page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
    await o.page.mouse.move(700, 120);
    await o.page.waitForTimeout(600);
    return o;
  };
  const idle = async (o, what, prep) => {
    if (prep) await prep(o.page);
    await o.page.waitForTimeout(800);
    const t = await traced(browser, o.page, () => o.page.waitForTimeout(2500));
    rows.push({ what, val: t.main / t.secs, unit: "ms/s" });
  };
  let o = await fresh();
  await idle(o, "idle, desk in view");
  await idle(o, "idle, scrolled to the footer", (p) => p.evaluate(() => window.scrollTo({ top: 1e5, behavior: "instant" })));
  await o.ctx.close();
  o = await fresh();
  await idle(o, "idle, under a sheet", (p) => p.evaluate(() =>
    document.querySelector('.iso-obj[data-id="hive"]').dispatchEvent(new MouseEvent("click", { bubbles: true }))));
  await o.ctx.close();

  /* the pointer sweep crosses the headline, so no object is hovered: this is
     the cost of the room answering the pointer, and nothing else */
  o = await fresh();
  const N = 60;
  let t = await traced(browser, o.page, async () => {
    for (let i = 0; i < N; i++) {
      await o.page.mouse.move(150 + i * 18, 90 + Math.sin(i / 6) * 60);
      await frames(o.page, 2);
    }
  });
  rows.push({ what: "pointer sweep: style", val: t.style / N, unit: "ms/frame" });
  rows.push({ what: "pointer sweep: raster", val: t.raster / N, unit: "ms/frame" });

  /* one hover, from the headline onto Hive Mind, for as long as it reacts */
  const hb = await objBox(o.page, "hive");
  await o.page.mouse.move(700, 120);
  await o.page.waitForTimeout(700);
  t = await traced(browser, o.page, async () => {
    await o.page.mouse.move(hb.x, hb.y);
    return o.page.evaluate(() => new Promise((r) => {
      let n = 0; const t0 = performance.now();
      (function f(now) { n++; if (now - t0 < 500) requestAnimationFrame(f); else r(n); })(t0);
    }));
  });
  rows.push({ what: "hover (Hive Mind): raster", val: t.raster / Math.max(1, t.extra), unit: "ms/frame" });
  await o.ctx.close();

  /* the torch: lights out, then a sweep over the desk */
  o = await fresh();
  if (await o.page.$("#torch")) {
    await alignDesk(o.page);
    await lightsOut(o.page);
    t = await traced(browser, o.page, async () => {
      for (let i = 0; i < N; i++) {
        await o.page.mouse.move(250 + i * 14, 300 + Math.sin(i / 5) * 120);
        await frames(o.page, 2);
      }
    });
    rows.push({ what: "torch sweep: raster", val: t.raster / N, unit: "ms/frame" });
  } else rows.push({ what: "torch sweep", absent: "#torch" });
  await o.ctx.close();
  return rows;
}

/* The idle budget with the desk in view is "no worse than today", and
   today is a property of the machine: the spec's ~95 ms/s and 120 ms/s were
   one desktop's numbers, and a container without a GPU spends several times
   that at 4× throttle on the very same page. So --update records this
   machine's numbers in desk-baseline/perf.json, and the in-view budget is
   that record plus 15 % for noise. Without a record, the spec's figures
   stand. Every other budget is absolute: asleep is asleep anywhere. */
const PERF_BASE = path.join(BASE, "perf.json");
async function perf(browser) {
  console.log("\n──  performance" + (UPDATE ? " (recording this machine's idle numbers)" : ""));
  const fast = await perfConfig(browser, "1×", false);
  const slow = await perfConfig(browser, "4×", true);
  if (UPDATE) {
    fs.mkdirSync(BASE, { recursive: true });
    fs.writeFileSync(PERF_BASE, JSON.stringify({ idleTop: fast[0].val, idleTopSlow: slow[0].val }));
  }
  const rec = !UPDATE && fs.existsSync(PERF_BASE) ? JSON.parse(fs.readFileSync(PERF_BASE, "utf8")) : null;
  const r1 = (v) => Math.round(v * 10) / 10;
  const limit = {
    "idle, desk in view": rec ? [r1(rec.idleTop * 1.15), r1(rec.idleTopSlow * 1.15)] : [BUDGET.idleTop, BUDGET.idleTopSlow],
    "idle, scrolled to the footer": [BUDGET.idleAway, null],
    "idle, under a sheet": [BUDGET.idleAway, null],
    "pointer sweep: style": [BUDGET.sweepStyle, null],
    "pointer sweep: raster": [BUDGET.sweepRaster, null],
    "hover (Hive Mind): raster": [BUDGET.hoverRaster, null],
    "torch sweep: raster": [BUDGET.torchRaster, null]
  };
  console.log("  " + "probe".padEnd(32) + "1×".padStart(10) + "4×, DPR 2".padStart(12) + "   budget");
  fast.forEach((row, i) => {
    if (row.absent) { notYet(row.what, row.absent); return; }
    const s = slow[i], lim = limit[row.what] || [null, null];
    const pass1 = lim[0] == null || row.val <= lim[0], pass4 = lim[1] == null || s.val <= lim[1];
    const cell = (v, pass, w) => (v.toFixed(1) + (pass ? " " : "!")).padStart(w);
    const budget = (lim[0] != null ? "≤ " + lim[0] : "") + (lim[1] != null ? " (4×: ≤ " + lim[1] + ")" : "") + " " + row.unit +
      (i === 0 ? (rec ? " (recorded + 15 %)" : " (spec)") : "");
    const line = row.what.padEnd(30) + cell(row.val, pass1, 10) + cell(s.val, pass4, 12) + "   " + budget;
    /* recording is not judging: an untouched tree may well be over budget */
    if (UPDATE) console.log("  ✎ " + line);
    else if (pass1 && pass4) console.log("  ✓ " + line);
    else { fails++; console.log("  ✗ " + line); }
  });
}

/* ================================================================== main */
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  let browser;
  try {
    browser = await pw.chromium.launch({ executablePath: findChromium(), args: ["--no-sandbox"] });
  } catch (e) {
    console.log("\nno Chromium to drive — skipping the desk check.\n  " + e.message + "\n");
    server.close();
    process.exit(0);
  }
  const t0 = Date.now();
  try {
    if (ONLY.includes("visual")) await visual(browser);
    if (ONLY.includes("dom")) await dom(browser);
    if (ONLY.includes("perf")) await perf(browser);
  } finally {
    await browser.close();
    server.close();
  }
  /* (e) last, because every page above has been listening */
  console.log("\n──  console");
  ok("(e) no console errors or page errors", !errors.length, errors.slice(0, 8).join(" | "));
  console.log("\n" + (fails ? fails + " failed" : "all good") + " · " + Math.round((Date.now() - t0) / 1000) + " s" +
    (ART ? " · art mode: crop diffs reported, not failed" : "") + "\n");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); server.close(); process.exit(1); });
