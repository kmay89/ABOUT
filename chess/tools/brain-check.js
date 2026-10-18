/* brain-check.js — the coach's thread: in order, cancellable, honest.

   brain.js is a queue in front of a worker, and queues fail quietly. A
   lost answer is a coach that never moves; an answer delivered twice, or
   to the wrong question, is a coach that moves for a position that is
   no longer on the board; an option dropped on the way across is a
   level that plays at the wrong strength on one thread and not the
   other. None of that shows up in a screenshot.

   So, in two halves:

     • in node, with a pretend Worker that runs the real brain-worker.js
       and the real engine inside a sandbox, but only when told to — so
       the test decides exactly when each answer arrives: options reach
       the engine untouched on both threads (a node budget included),
       answers come back in order and once each, busy() tells the truth,
       cancel() drops everything in flight and nothing it dropped can
       come back, a fresh thread is built only when one was ended, and a
       worker that dies hands its questions to the main thread;

     • in a real browser, if there is one, with a real Worker: a long
       search is cancelled and the next one doesn't wait behind it.

   Run: node chess/tools/brain-check.js [--verbose]                      */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const http = require("http");

const CHESS = path.join(__dirname, "..");
const VERBOSE = process.argv.includes("--verbose");
const C = require("../engine.js");

let failed = 0;
const ok = (label, cond, extra) => {
  if (!cond) { failed++; console.log("FAIL  " + label + (extra ? "  → " + extra : "")); }
  else console.log("ok    " + label);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tick = () => new Promise((r) => setImmediate(r));

/* ---------- the pretend thread ---------- */
/* The real brain-worker.js, in a sandbox with its own copy of the engine,
   exactly as a browser would load it — importScripts and all. It runs a
   job only when step() is called, and its answer goes to whatever
   onmessage the page gave it, even after it has been terminated: a real
   worker can have one last message already on its way, and brain.js has
   to be the one that ignores it. */
const made = [];
class PretendWorker {
  constructor(url) {
    this.url = url; this.inbox = []; this.terminated = false; this.seen = [];
    const box = { console: console, __out: [] };
    box.self = box;
    box.postMessage = (m) => box.__out.push(m);
    box.importScripts = (f) => vm.runInContext(fs.readFileSync(path.join(CHESS, f), "utf8"), box, { filename: f });
    vm.createContext(box);
    vm.runInContext(fs.readFileSync(path.join(CHESS, url), "utf8"), box, { filename: url });
    /* watch what the engine is actually handed */
    const search = box.Chess.search, review = box.Chess.review;
    box.Chess.search = (g, o) => { this.seen.push({ op: "search", opts: o }); return search(g, o); };
    box.Chess.review = (g, m, o) => { this.seen.push({ op: "review", opts: o }); return review(g, m, o); };
    this.box = box;
    made.push(this);
  }
  postMessage(m) {
    if (this.terminated) return;
    this.inbox.push(structuredClone(m));   /* what crossing a thread really does to opts */
  }
  terminate() { this.terminated = true; }
  /* run the oldest question for real, and say the answer */
  step(forgeId) {
    const m = this.inbox.shift();
    if (!m) return false;
    this.box.onmessage({ data: m });
    const out = this.box.__out.shift();
    if (forgeId != null) out.id = forgeId;
    if (this.onmessage) this.onmessage({ data: out });
    return true;
  }
  crash() { if (this.onerror) this.onerror({ message: "the script never arrived" }); }
}

/* a fresh brain.js each time, so one case's latches don't leak into the next */
function freshBrain(WorkerImpl) {
  if (WorkerImpl) global.Worker = WorkerImpl; else delete global.Worker;
  delete require.cache[require.resolve("../brain.js")];
  return require("../brain.js");
}
function settled(p) {
  const s = { done: false, value: undefined, times: 0 };
  p.then((v) => { s.done = true; s.value = v; s.times++; });
  return s;
}

(async () => {
  const start = C.create();
  const opts = { ms: 60, maxDepth: 3, nodes: 1234, noise: 40, rank: true, rankDepth: 3, someday: "a new option" };

  /* ---- options reach the engine untouched, across the thread ---- */
  {
    const Brain = freshBrain(PretendWorker);
    const n0 = made.length;
    const p = settled(Brain.search(start, opts));
    const w = made[made.length - 1];
    ok("a search goes to a worker, not the main thread", Brain.offThread() && made.length === n0 + 1 && w.inbox.length === 1);
    ok("busy() is true while a question is out", Brain.busy());
    w.step(); await tick();
    ok("the worker hands the engine every option exactly as given, node budget included",
       w.seen.length === 1 && same(w.seen[0].opts, opts), JSON.stringify(w.seen[0] && w.seen[0].opts));
    ok("the answer arrives, once", p.done && p.times === 1 && p.value && !!p.value.move);
    ok("…as a plain move this game can resolve", !!Brain.resolve(start, p.value.move));
    ok("busy() is false once it is answered", !Brain.busy());

    /* a review's options travel the same way */
    const e4 = C.fromSAN(start, "e4");
    const r = settled(Brain.review(start, e4, { ms: 60, mark: true, nodes: 99 }));
    w.step(); await tick();
    ok("a review's options cross the thread intact too",
       w.seen.length === 2 && same(w.seen[1].opts, { ms: 60, mark: true, nodes: 99 }), JSON.stringify(w.seen[1] && w.seen[1].opts));
    ok("…and the review comes back", r.done && r.value && typeof r.value.loss === "number");
  }

  /* ---- in order, one answer per question ---- */
  {
    const Brain = freshBrain(PretendWorker);
    const a = settled(Brain.search(start, { ms: 30, maxDepth: 2 }));
    const b = settled(Brain.search(C.create("4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"), { ms: 30, maxDepth: 2 }));
    const w = made[made.length - 1];
    ok("two questions, one thread", w.inbox.length === 2);
    w.step(); await tick();
    ok("the first answer settles the first question only", a.done && !b.done && Brain.busy());
    w.step(); await tick();
    ok("…then the second", b.done && !Brain.busy() && a.times === 1 && b.times === 1);
  }

  /* ---- cancel ---- */
  {
    const Brain = freshBrain(PretendWorker);
    const a = settled(Brain.search(start, { ms: 30, maxDepth: 2 }));
    const b = settled(Brain.review(start, C.fromSAN(start, "d4"), { ms: 30 }));
    const w1 = made[made.length - 1];
    const dropped = Brain.cancel();
    await tick();
    ok("cancel() drops everything in flight, and says how much", dropped === 2, "dropped " + dropped);
    ok("every dropped question is answered with null", a.done && a.value === null && b.done && b.value === null);
    ok("the busy thread is ended", w1.terminated);
    ok("busy() is false straight away", !Brain.busy());

    /* the ended thread's last words */
    const n1 = made.length;
    const c = settled(Brain.search(start, { ms: 30, maxDepth: 2 }));
    const w2 = made[made.length - 1];
    ok("the next question builds a fresh worker", made.length === n1 + 1 && w2 !== w1 && w2.inbox.length === 1);
    const lateId = w2.inbox[0].id;
    w1.step(); w1.step(lateId);          /* one late answer as itself, one forged with the new question's id */
    await tick();
    ok("a cancelled thread's late answer settles nothing — not its own question, not the new one",
       a.value === null && a.times === 1 && b.value === null && b.times === 1 && !c.done && Brain.busy());
    w2.step(); await tick();
    ok("…and the fresh thread answers the new question", c.done && c.times === 1 && c.value && !!c.value.move);

    /* nothing in flight: keep the thread and its warm tables */
    const n2 = made.length;
    ok("cancel() with nothing in flight drops nothing", Brain.cancel() === 0 && !w2.terminated);
    const d = settled(Brain.search(start, { ms: 30, maxDepth: 2 }));
    ok("…and the same worker takes the next question", made.length === n2 && w2.inbox.length === 1);
    w2.step(); await tick();
    ok("…and answers it", d.done && !!(d.value && d.value.move));
  }

  /* ---- a worker that dies hands its work to the main thread ---- */
  {
    const Brain = freshBrain(PretendWorker);
    const a = settled(Brain.search(start, { ms: 40, maxDepth: 2 }));
    const w = made[made.length - 1];
    w.crash(); await tick();
    ok("a crashed worker's question is still answered, on the main thread", a.done && a.value && !!a.value.move);
    const n = made.length;
    const b = settled(Brain.search(start, { ms: 40, maxDepth: 2 }));
    await tick();
    ok("…and the main thread keeps the job after that", b.done && !!(b.value && b.value.move) && made.length === n && !Brain.offThread());
  }

  /* ---- no Worker at all (file://, or node): same thread, same options ---- */
  {
    const Brain = freshBrain(null);
    const seen = [];
    const search = C.search;
    C.search = (g, o) => { seen.push(o); return search(g, o); };
    try {
      const a = settled(Brain.search(start, opts));
      await tick();
      ok("with no workers the same API answers on the main thread", !Brain.offThread() && a.done && !!(a.value && a.value.move));
      ok("…and hands the engine the very same options, node budget included",
         seen.length === 1 && same(seen[0], opts), JSON.stringify(seen[0]));
      ok("…there is never anything in flight to cancel", !Brain.busy() && Brain.cancel() === 0);
    } finally { C.search = search; }
    const bad = settled(Brain.review(start, { from: 0, to: 63, promo: 0 }, { ms: 20 }));
    await tick();
    ok("a review of a move that isn't legal comes back null", bad.done && bad.value === null);
    /* an engine that throws: a worker answers null, so the main thread must too */
    C.search = () => { throw new Error("the engine fell over"); };
    let threw = false, boom = null;
    try { boom = settled(Brain.search(start, { ms: 20 })); } catch (e) { threw = true; }
    finally { C.search = search; }
    await tick();
    ok("an engine that throws comes back null on the main thread, as it does from a worker",
       !threw && boom && boom.done && boom.value === null, threw ? "Brain.search threw at the caller" : "");
  }

  /* ---------- and in a real browser, with a real Worker ---------- */
  await browserCase();

  console.log(failed ? `\n${failed} check(s) failed` : "\nthe coach's thread is in order");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.log("FAIL  brain-check crashed  → " + (e && e.stack || e)); process.exit(1); });

async function browserCase() {
  const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome"].filter((p) => fs.existsSync(p))[0] || null;
  let pw = null;
  try { pw = require("playwright-core"); } catch (e) { /* optional */ }
  if (!CHROME || !pw) { console.log("skip  the real-Worker case (no chromium or playwright-core here)"); return; }

  /* a bare page with just the engine and the brain — no board, no room —
     so the only thing on the main thread is the question being asked */
  const PAGE = '<!doctype html><meta charset="utf-8"><title>brain</title>' +
    '<script src="engine.js"></script><script src="brain.js"></script>';
  const server = http.createServer((req, res) => {
    const p = req.url.split("?")[0];
    if (p === "/chess/brain-test.html") { res.writeHead(200, { "Content-Type": "text/html" }); res.end(PAGE); return; }
    const f = path.join(CHESS, p.replace(/^\/chess\//, ""));
    if (!p.startsWith("/chess/") || !/^[\w.-]+\.js$/.test(path.basename(f)) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": "text/javascript" });
    res.end(fs.readFileSync(f));
  });
  await new Promise((r) => server.listen(0, r));
  const browser = await pw.chromium.launch({ executablePath: CHROME,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  try {
    const page = await browser.newPage();
    const errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    await page.goto("http://127.0.0.1:" + server.address().port + "/chess/brain-test.html", { waitUntil: "load" });
    const r = await page.evaluate(async () => {
      const g = Chess.create();
      const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
      const offThread = Brain.offThread();
      /* a coach-sized think, then the board changes underneath it */
      const t0 = performance.now();
      const long = Brain.search(g, { ms: 4000 });
      await sleep(300);
      const busyDuring = Brain.busy();
      const dropped = Brain.cancel();
      const longAnswer = await long;
      const tCancel = performance.now() - t0;
      /* the next real question, on a fresh thread */
      const t1 = performance.now();
      const next = await Brain.search(g, { ms: 200 });
      const tNext = performance.now() - t1;
      return { offThread, busyDuring, dropped, longAnswer, tCancel: Math.round(tCancel),
               nextMove: !!(next && next.move), tNext: Math.round(tNext),
               busyAfter: Brain.busy(), stillOffThread: Brain.offThread() };
    });
    if (VERBOSE) console.log("      cancel answered in " + r.tCancel + "ms; the next search took " + r.tNext + "ms");
    ok("browser: the engine thinks on a real worker", r.offThread && r.stillOffThread);
    ok("browser: busy() is true mid-search", r.busyDuring);
    ok("browser: cancel() drops the stale search at once, answered with null",
       r.dropped === 1 && r.longAnswer === null && r.tCancel < 1500, "dropped " + r.dropped + " in " + r.tCancel + "ms");
    ok("browser: the next search doesn't wait behind the dead one",
       r.nextMove && r.tNext < 2500, (r.nextMove ? "answered" : "no move") + " in " + r.tNext + "ms (the dead one had ~3.7s left)");
    ok("browser: nothing left in flight, no page errors", !r.busyAfter && errs.length === 0, errs.slice(0, 2).join(" | "));
  } finally {
    await browser.close();
    server.close();
  }
}
