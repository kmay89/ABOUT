/* press-check.js — dev-only. Does a key go down when it is pressed?

   The room's buttons are keys with travel: a face standing proud of an
   edge, that goes down under a finger and springs back. Whether that
   feels right is decided by moments too short to see in a screenshot,
   so this checks the moments. In Node, press.js against a pretend page
   with a clock that is stepped by hand: a mouse press goes down at
   once; a tap on glass shorter than the eye can see still stays down
   long enough to be seen; a finger that lands on a key and then scrolls
   never presses it; a disabled key does nothing. Then in a real
   browser, phone and laptop: every kind of key in the room has an edge
   to travel onto, a held one has travelled, a let-go one comes back, a
   press that starts on the strip the key leaves behind still lands, the
   switches are switches to a screen reader, each kind of key has its
   own pitch, and someone who asked for stillness gets a press that
   moves nothing.

   Needs `playwright-core` for the browser half; without it, or without
   a browser, the Node half still runs and the rest says so.

   Run: node chess/tools/press-check.js                                   */
"use strict";
const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = path.join(__dirname, "..", "..");
let failed = 0;
const ok = (what, cond, detail) => {
  if (cond) console.log("ok    " + what);
  else { failed++; console.log("FAIL  " + what + (detail ? "  → " + detail : "")); }
};

/* ---------------- Node: the moments ---------------- */
const Press = require("../press.js");

function fakeEl(classes, opts) {
  opts = opts || {};
  const set = new Set(classes || []);
  const el = {
    disabled: !!opts.disabled, attrs: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
    classList: { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getBoundingClientRect() { return { left: 100, top: 200, width: 200, height: 50 }; },
    closest() { return opts.notAKey ? null : el; }
  };
  return el;
}
function fakeDoc() {
  const on = {};
  return { on, addEventListener(t, fn) { (on[t] = on[t] || []).push(fn); },
           fire(t, e) { (on[t] || []).forEach((fn) => fn(e)); } };
}
function rig() {
  let t = 1000; const timers = [];
  const doc = fakeDoc(), downs = [];
  Press.attach(doc, {
    selector: ".key", now: () => t,
    setTimeout: (fn, ms) => { const h = { fn, at: t + ms, dead: false }; timers.push(h); return h; },
    clearTimeout: (h) => { if (h) h.dead = true; },
    onDown: (el, kind, how) => downs.push({ el, kind, how, t })
  });
  const step = (ms) => {
    const end = t + ms;
    for (;;) {
      const due = timers.filter((h) => !h.dead && h.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      t = due.at; due.dead = true; due.fn();
    }
    t = end;
  };
  return { doc, downs, step, get t() { return t; } };
}

{
  const r = rig(), el = fakeEl(["chip"]);
  r.doc.fire("pointerdown", { target: el, pointerId: 1, pointerType: "mouse", button: 0, clientX: 150, clientY: 225 });
  ok("a mouse press goes down at once", el.classList.contains("dn") && r.downs.length === 1 && r.downs[0].how === "now");
  ok("…and the key knows where it was touched", el.style.props["--px"] === "25.0%" && el.style.props["--py"] === "50.0%",
     JSON.stringify(el.style.props));
  r.step(20);
  r.doc.fire("pointerup", { target: el, pointerId: 1 });
  ok("let go after 20 ms, it is still down: the eye has not seen it yet", el.classList.contains("dn"));
  r.step(Press.MIN_DOWN - 21);
  ok("…and still down a hair before its time", el.classList.contains("dn"));
  r.step(2);
  ok("…then it comes up", !el.classList.contains("dn"));
}
{
  const r = rig(), el = fakeEl(["chip"]);
  r.doc.fire("pointerdown", { target: el, pointerId: 1, pointerType: "mouse", button: 0, clientX: 150, clientY: 225 });
  r.step(400);
  r.doc.fire("pointerup", { target: el, pointerId: 1 });
  ok("a long press comes up the moment it is let go", !el.classList.contains("dn"));
}
{
  const r = rig(), el = fakeEl(["bigbtn"]);
  r.doc.fire("pointerdown", { target: el, pointerId: 7, pointerType: "touch", clientX: 150, clientY: 225 });
  ok("a finger landing on a key has not pressed it yet (it may be about to scroll)", !el.classList.contains("dn") && r.downs.length === 0);
  r.step(30);
  r.doc.fire("pointerup", { target: el, pointerId: 7 });
  ok("a tap quicker than the wait still presses, at the moment it ends", el.classList.contains("dn") && r.downs.length === 1 && r.downs[0].how === "tap");
  r.step(Press.MIN_DOWN + 1);
  ok("…and shows the whole press before coming up", !el.classList.contains("dn"));
}
{
  const r = rig(), el = fakeEl(["bigbtn"]);
  r.doc.fire("pointerdown", { target: el, pointerId: 7, pointerType: "touch", clientX: 150, clientY: 225 });
  r.step(Press.HOLD_OFF + 1);
  ok("a finger that rests on a key presses it after a beat", el.classList.contains("dn") && r.downs[0].how === "hold");
  r.doc.fire("pointerup", { target: el, pointerId: 7 });
  r.step(Press.MIN_DOWN + 1);
  ok("…once only", r.downs.length === 1 && !el.classList.contains("dn"));
}
{
  const r = rig(), el = fakeEl(["bigbtn"]);
  r.doc.fire("pointerdown", { target: el, pointerId: 7, pointerType: "touch", clientX: 150, clientY: 225 });
  r.step(20);
  r.doc.fire("pointercancel", { target: el, pointerId: 7 });   /* the browser took the touch to scroll */
  r.step(300);
  ok("a finger that starts a scroll presses nothing", !el.classList.contains("dn") && r.downs.length === 0);
}
{
  const r = rig(), el = fakeEl(["bigbtn"]);
  r.doc.fire("pointerdown", { target: el, pointerId: 7, pointerType: "touch", clientX: 150, clientY: 225 });
  r.step(15);
  r.doc.fire("pointermove", { target: el, pointerId: 7, clientX: 150, clientY: 225 + Press.SLOP + 3 });
  r.step(300);
  r.doc.fire("pointerup", { target: el, pointerId: 7 });
  ok("…nor one that drifts away while it waits", !el.classList.contains("dn") && r.downs.length === 0);
}
{
  const r = rig(), el = fakeEl(["chip"], { disabled: true });
  r.doc.fire("pointerdown", { target: el, pointerId: 1, pointerType: "mouse", button: 0, clientX: 150, clientY: 225 });
  ok("a disabled key does not go down", !el.classList.contains("dn") && r.downs.length === 0);
  const el2 = fakeEl(["chip"]);
  r.doc.fire("pointerdown", { target: el2, pointerId: 1, pointerType: "mouse", button: 2, clientX: 150, clientY: 225 });
  ok("the right button presses nothing", !el2.classList.contains("dn"));
}
{
  const r = rig(), el = fakeEl(["chip"]);
  r.doc.fire("keydown", { target: el, key: "Enter" });
  ok("Enter presses a key too", el.classList.contains("dn") && r.downs[0].how === "key");
  r.step(Press.MIN_DOWN + 1);
  ok("…and lets it go", !el.classList.contains("dn"));
  r.doc.fire("keydown", { target: el, key: "a" });
  ok("another letter does not", r.downs.length === 1);
}
ok("a key knows what kind it is",
   Press.kindOf(fakeEl(["chip", "sw"])) === "switch" && Press.kindOf(fakeEl(["playBtn"])) === "play" &&
   Press.kindOf(fakeEl(["ptab"])) === "tab" && Press.kindOf(fakeEl(["tact", "ghost"])) === "quiet" &&
   Press.kindOf(fakeEl(["chip", "sel"])) === "bright" && Press.kindOf(fakeEl(["tile"])) === "key");
ok("the touch point never leaves the key", (() => {
  const a = Press.pointOn({ left: 0, top: 0, width: 100, height: 40 }, -30, 900);
  return a.x === 0 && a.y === 1;
})());
ok("what a key is owed is never negative", Press.owed(0, 5000) === 0 && Press.owed(1000, 1040) === Press.MIN_DOWN - 40);

/* ---------------- a browser: the look ---------------- */
const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
let pw = null;
try { pw = require("playwright-core"); } catch (e) { pw = null; }
if (!CHROME || !pw) {
  console.log(!CHROME ? "no chromium on this machine — skipping the browser half." :
    "playwright-core is not installed — skipping the browser half.\n  npm i --no-save playwright-core");
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nthe moments are right (the look was not checked)");
  process.exit(failed ? 1 : 0);
}

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml",
  ".css": "text/css", ".ico": "image/x-icon" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end("not found"); return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

/* how far down the page a key's face has moved, and whether it has an edge */
const LOOK = `(sel) => {
  const el = typeof sel === "string" ? document.querySelector(sel) : sel;
  if (!el) return null;
  const cs = getComputedStyle(el);
  const m = /matrix\\(([^)]+)\\)/.exec(cs.transform);
  const ty = m ? parseFloat(m[1].split(",")[5]) : 0;
  return { ty: ty, shadow: cs.boxShadow, d: parseFloat(cs.getPropertyValue("--d")) || 0, dn: el.classList.contains("dn"),
           trans: cs.transitionDuration, pos: cs.position };
}`;

/* A first visit is the greeting (hub.js): a face, a question and two
   answers. A check that is here for the rest of the room looks around
   first, the way a person would. */
const lookAround = async (page) => {
  await page.waitForFunction(() => ["mLook", "hubDock"].some((id) => { const e = document.getElementById(id); return !!e && e.getClientRects().length > 0; }),
                             null, { timeout: 30000 }).catch(() => {});
  if (await page.isVisible("#mLook")) { await page.click("#mLook"); await page.waitForTimeout(600); }
};

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = "http://127.0.0.1:" + server.address().port;
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  const errs = [];

  async function run(name, ctxOpts, touch) {
    const ctx = await browser.newContext(ctxOpts);
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push(name + ": " + e.message));
    page.on("console", (m) => { if (m.type() === "error") errs.push(name + ": " + m.text()); });
    /* a machine drawing in software may take a second over one frame;
       the check asks where a key ends up, not how far the machine has got */
    const look = async (sel) => {
      await page.evaluate(() => document.getAnimations().forEach((a) => { try { if (a.effect && a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) {} }));
      return page.evaluate(([f, s]) => eval(f)(s), [LOOK, sel]);
    };
    const tag = name + ": ";
    try {
      await page.goto(base + "/chess/index.html");
      await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 90000 });
      await page.waitForTimeout(900);
      await lookAround(page);

      /* every kind of key the room is built from stands proud of an edge */
      const kinds = await page.evaluate(() => {
        __cr.showMenu();
        const want = [".playBtn", ".bigbtn", ".tile", ".rung", ".abtn", ".chip:not(.sw):not(.sel)", ".chip.sel:not(.sw)", ".lchip"];
        return want.map((sel) => {
          const el = document.querySelector(sel);
          if (!el) return { sel, missing: true };
          const cs = getComputedStyle(el), d = parseFloat(cs.getPropertyValue("--d")) || 0;
          /* the edge is a hard shadow straight down: "<colour> 0px <d>px 0px 0px" */
          const edge = new RegExp("\\) 0px " + d + "px 0px 0px").test(cs.boxShadow);
          return { sel, d, edge, pos: cs.position, grad: /gradient/.test(cs.backgroundImage) };
        });
      });
      ok(tag + "every kind of key has a lit face and an edge to travel onto",
         kinds.every((k) => !k.missing && k.d >= 3 && k.edge && k.grad && k.pos === "relative"), JSON.stringify(kinds.filter((k) => k.missing || !(k.d >= 3 && k.edge && k.grad))));
      const depths = await page.evaluate(() => ["#mPlay", "#mPass", "#btnMenu"].map((s) => parseFloat(getComputedStyle(document.querySelector(s)).getPropertyValue("--d"))));
      ok(tag + "the hero is the deepest key on the card, a tile deeper than a small key", depths[0] > depths[1] && depths[1] > depths[2], depths.join(" "));

      /* held: it has travelled; let go: it comes back */
      await page.evaluate(() => document.getElementById("mPass").scrollIntoView({ block: "center" }));
      await page.waitForTimeout(500);
      /* the lobby has finished arriving (arrive-check.js) before the key is measured */
      await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).map((a) => a.finished)));
      const box = await (await page.$("#mPass")).boundingBox();
      const at = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.5 };
      const rest = await look("#mPass");
      if (touch) {
        const cdp = await ctx.newCDPSession(page);
        await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y, id: 1 }] });
        await page.waitForTimeout(25);
        const early = await look("#mPass");
        ok(tag + "a finger that has only just landed has not pressed the key", !early.dn);
        await page.waitForTimeout(200);
        const held = await look("#mPass");
        ok(tag + "held, the key has travelled down onto its edge", held.dn && Math.abs(held.ty - (held.d - 1)) < 0.6, JSON.stringify(held));
        /* slide away and let go: no click, and the key comes back */
        await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
      } else {
        await page.mouse.move(at.x, at.y);
        await page.mouse.down();
        await page.waitForTimeout(160);
        const held = await look("#mPass");
        ok(tag + "held, the key has travelled down onto its edge", held.dn && Math.abs(held.ty - (held.d - 1)) < 0.6, JSON.stringify(held));
        const lit = await page.evaluate(() => {
          document.getAnimations().forEach((a) => { try { if (a.effect && a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) {} });
          const el = document.getElementById("mPass");
          return { px: el.style.getPropertyValue("--px"), op: getComputedStyle(el, "::after").opacity };
        });
        ok(tag + "…with the light where the pointer is", /^2[0-9]\.\d%$/.test(lit.px) && +lit.op > 0.9, JSON.stringify(lit));
        await page.mouse.move(2, 2);
        await page.mouse.up();
      }
      await page.waitForTimeout(700);
      const back = await look("#mPass");
      ok(tag + "let go, it comes back to where it stood", !back.dn && Math.abs(back.ty - rest.ty) < 0.3, JSON.stringify(back));
      ok(tag + "…and letting go off the key started nothing", await page.evaluate(() => !__cr.mode));

      /* the strip a pressed key leaves behind still belongs to it */
      if (!touch) {
        await page.evaluate(() => { __cr.showMenu(); document.getElementById("mSettings").scrollIntoView({ block: "center" }); });
        await page.waitForTimeout(400);
        await page.evaluate(() => document.getElementById("mSettings").click());
        await page.waitForTimeout(500);
        await page.evaluate(() => { window.__clicked = 0; document.getElementById("setOpenStudio").addEventListener("click", (e) => { window.__clicked++; e.stopImmediatePropagation(); }, true); });
        /* the card has finished arriving (arrive-check.js) before the key is
           measured: measured mid-arrival, the edge is still moving, and the
           press lands where it used to be */
        await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => !(a instanceof CSSAnimation) && !(a instanceof CSSTransition)).map((a) => a.finished)));
        const b = await (await page.$("#setOpenStudio")).boundingBox();
        await page.mouse.move(b.x + b.width / 2, b.y + 0.6);
        await page.mouse.down();
        await page.waitForTimeout(140);
        await page.mouse.up();
        await page.waitForTimeout(200);
        ok(tag + "a press on a key's very top edge still lands, though the key has moved from under it", await page.evaluate(() => window.__clicked === 1));
      } else {
        await page.evaluate(() => { __cr.showMenu(); document.getElementById("mSettings").click(); });
        await page.waitForTimeout(500);
      }

      /* switches */
      const sw = await page.evaluate(() => {
        const list = [...document.querySelectorAll("#ovSettings .sw")];
        return list.map((el) => ({ id: el.id, role: el.getAttribute("role"), checked: el.getAttribute("aria-checked"), sel: el.classList.contains("sel"),
          text: el.textContent.trim(), w: el.getBoundingClientRect().width, fs: getComputedStyle(el).fontSize }));
      });
      ok(tag + "the on/off chips are switches, and say so to a screen reader",
         sw.length >= 5 && sw.every((s) => s.role === "switch" && s.checked === String(s.sel) && /^(On|Off)$/.test(s.text)), JSON.stringify(sw));
      ok(tag + "…drawn as a track with a thumb, the word kept for the reader but not for the eye", sw.filter((s) => s.w > 0).length >= 4 && sw.every((s) => s.fs === "0px" && (s.w === 0 || (s.w > 50 && s.w < 62))), JSON.stringify(sw.map((s) => [s.id, s.w, s.fs])));
      const taps = await page.evaluate(async () => {
        const heard = []; const was = Sound.ui;
        Sound.ui = function (kind, o) { if (kind === "tap") heard.push(o && o.hz); return was.apply(Sound, arguments); };
        const el = document.getElementById("setHelpers"), before = el.classList.contains("sel");
        el.click(); await new Promise((r) => setTimeout(r, 60));
        const mid = { sel: el.classList.contains("sel"), aria: el.getAttribute("aria-checked") };
        el.click(); await new Promise((r) => setTimeout(r, 60));
        const end = { sel: el.classList.contains("sel"), aria: el.getAttribute("aria-checked") };
        Sound.ui = was;
        return { before, mid, end, heard };
      });
      ok(tag + "flipping one flips what the reader hears, both ways",
         taps.mid.sel === !taps.before && taps.mid.aria === String(taps.mid.sel) && taps.end.sel === taps.before && taps.end.aria === String(taps.end.sel), JSON.stringify(taps));
      ok(tag + "…and a switch has two voices: one for on, a lower one for off",
         taps.heard.length === 2 && taps.heard[0] !== taps.heard[1] && Math.max(taps.heard[0], taps.heard[1]) === (taps.before ? taps.heard[1] : taps.heard[0]), JSON.stringify(taps.heard));

      /* each kind of key has its own pitch, and a tick */
      await page.evaluate(() => __cr.showMenu());
      await page.waitForTimeout(400);
      const voices = await page.evaluate(async () => {
        const heard = []; const was = Sound.ui;
        Sound.ui = function (kind, o) { if (kind === "tap") heard.push(o && o.hz); return 0; };
        const press = async (sel) => {
          const el = document.querySelector(sel), r = el.getBoundingClientRect();
          const o = { bubbles: true, pointerId: 5, pointerType: "mouse", button: 0, clientX: r.left + 4, clientY: r.top + 4 };
          el.dispatchEvent(new PointerEvent("pointerdown", o));
          el.dispatchEvent(new PointerEvent("pointercancel", o));
          await new Promise((r2) => setTimeout(r2, 160));
        };
        await press("#mPlay"); await press("#mPass"); await press("#mCoach");
        Sound.ui = was;
        return heard;
      });
      ok(tag + "the hero, a plain key and a quiet link each have their own pitch",
         voices.length === 3 && new Set(voices).size === 3 && voices.every((h) => h > 400 && h < 3000), JSON.stringify(voices));

      /* a key that cannot be pressed sits down in its bed and stays there */
      await page.evaluate(() => { __cr.startGame("pass", { clockStr: "none" }); });
      await page.waitForTimeout(1500);
      const dis = await page.evaluate(() => {
        const el = document.getElementById("btnUndo");
        const o = { bubbles: true, pointerId: 6, pointerType: "mouse", button: 0, clientX: 1, clientY: 1 };
        el.dispatchEvent(new PointerEvent("pointerdown", o));
        const cs = getComputedStyle(el);
        return { disabled: el.disabled, dn: el.classList.contains("dn"), op: +cs.opacity, shadow: cs.boxShadow };
      });
      ok(tag + "a key that cannot be pressed is dim, down, and does not answer", dis.disabled && !dis.dn && dis.op < 0.5 && !/ 3px 0px 0px/.test(dis.shadow), JSON.stringify(dis));
      await ctx.close();
    } catch (e) {
      ok(tag + "the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
      await ctx.close().catch(() => {});
    }
  }

  await run("desk", { viewport: { width: 1280, height: 860 } }, false);
  await run("phone", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, true);

  /* someone who asked for stillness: the press is there, and moves nothing */
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errs.push("still: " + e.message));
    try {
      await page.goto(base + "/chess/index.html");
      await page.waitForFunction(() => window.__cr && document.getElementById("splash").classList.contains("gone"), null, { timeout: 90000 });
      await page.waitForTimeout(600);
      await lookAround(page);
      await page.evaluate(() => { __cr.showMenu(); document.getElementById("mPass").scrollIntoView({ block: "center" }); });
      await page.waitForTimeout(300);
      const box = await (await page.$("#mPass")).boundingBox();
      await page.mouse.move(box.x + 30, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(120);
      await page.evaluate(() => document.getAnimations().forEach((a) => { try { a.finish(); } catch (e) {} }));
      const held = await page.evaluate(([f, s]) => eval(f)(s), [LOOK, "#mPass"]);
      const anim = await page.evaluate(() => getComputedStyle(document.getElementById("mPlay")).animationName);
      await page.mouse.move(2, 2); await page.mouse.up();
      ok("still: with reduced motion a pressed key is marked pressed and has not moved", held.dn && held.ty === 0 && !/ 4px 0px 0px/.test(held.shadow), JSON.stringify(held));
      ok("still: …and nothing on the hero is animating", anim === "none", anim);
    } catch (e) {
      ok("still: the check itself fell over", false, String(e && e.stack || e).split("\n").slice(0, 3).join(" "));
    }
    await ctx.close();
  }

  ok("nothing shouted at the console", errs.length === 0, errs.slice(0, 3).join(" | "));
  await browser.close();
  server.close();
  console.log(failed ? `\n${failed} FAILURE(S)` : "\nevery key goes down under a finger, shows it, and comes back");
  process.exit(failed ? 1 : 0);
})();
