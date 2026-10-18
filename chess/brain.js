/* brain.js — the engine on a thread of its own.

   A mentor move used to take the main thread for most of a second, and
   while it had it nothing else could happen: the clock stopped ticking,
   the board stopped animating, taps went nowhere. The work was never the
   problem — doing it in the only place the page can draw was.

   So the search moves to a worker and everything here is a promise. The
   page keeps drawing while the coach thinks, which is also what makes it
   safe to let the coach think for longer.

   Workers are not available everywhere — opened from a file:// URL most
   browsers refuse to build one. So this falls back to running the same
   engine on the main thread, with the same promise-shaped API, and the
   only thing the player notices is the pause coming back. A feature that
   degrades is a feature; a feature that throws is a bug.

   One worker answers one question at a time, in the order they were
   asked. That is right while every question is still worth answering,
   and wrong the moment the board changes underneath them: after a new
   game or a take-back, a coach search that has a second or two left to
   run is answering a question nobody is asking, and the next real one
   waits behind it. Brain.cancel() is for that moment — see below. */
(function (root) {
"use strict";

/* The page's own engine. In node there is no page, so the module beside
   this one stands in — which is what lets tools/brain-check.js drive the
   whole queue with a pretend Worker. */
var Chess = root.Chess || (typeof require === "function" ? require("./engine.js") : null);

var worker = null,      /* the thread doing the thinking, built when first needed */
    noWorker = false,   /* latched once a worker can't be built, or has died */
    nextId = 1,         /* never reused, so an old answer can't fit a new question */
    waiting = {};       /* id → { resolve, req }, every question not yet answered */

function sameThread(d) {
  /* the exact work the worker would have done, done here */
  var g = Chess.create(d.fen);
  Chess.seedRepetition(g, d.history);
  function lite(m) { return m ? { from: m.from, to: m.to, promo: m.promo || 0 } : null; }
  if (d.op === "search") {
    /* opts go through untouched — node budgets, rank depth, noise, and
       whatever the coach learns to ask for next */
    var r = Chess.search(g, d.opts || {});
    return { move: lite(r.move), score: r.score, depth: r.depth, nodes: r.nodes, pv: r.pv || [],
             ranked: (r.ranked || []).map(function (x) {
               return { move: lite(x.move), score: x.score, shallow: !!x.shallow };
             }) };
  }
  if (d.op === "review") {
    var ms = Chess.moves(g), m = null, i;
    for (i = 0; i < ms.length; i++) {
      if (ms[i].from === d.move.from && ms[i].to === d.move.to &&
          (ms[i].promo || 0) === (d.move.promo || 0)) { m = ms[i]; break; }
    }
    var rv = m ? Chess.review(g, m, d.opts || {}) : null;
    return rv ? { best: lite(rv.best), bestSAN: Chess.toSAN(g, rv.best),
                  bestScore: rv.bestScore, playedScore: rv.playedScore, loss: rv.loss,
                  pv: rv.pv || [], refute: rv.refute || null, depth: rv.depth,
                   only: rv.only == null ? null : rv.only, alone: !!rv.alone,
                   altSAN: rv.alt ? Chess.toSAN(g, rv.alt) : null } : null;
  }
  return null;
}
/* the worker answers null when the engine throws; so does this, so a
   caller never has to know which thread it got */
function safeSameThread(d) {
  try { return sameThread(d); } catch (e) { return null; }
}

/* Every answer, from any source, comes through here, and a question
   leaves `waiting` the moment it is answered. So a question answered
   once — by its worker, by cancel(), by a collapse — can never be
   answered again, whatever turns up afterwards. */
function settle(id, result) {
  var job = waiting[id];
  if (!job) return false;
  delete waiting[id];
  job.resolve(result);
  return true;
}

/* Anything still in flight when the worker dies is finished here rather
   than left hanging: a coach that never moves is worse than a coach that
   stutters. A worker that died once (usually because its script never
   arrived) would only die again, so the main thread keeps the job. */
function collapse() {
  var pending = waiting;
  waiting = {};
  if (worker) { try { worker.terminate(); } catch (e) { /* already gone */ } }
  worker = null; noWorker = true;
  Object.keys(pending).forEach(function (id) {
    pending[id].resolve(safeSameThread(pending[id].req));
  });
}

/* Built lazily, and built again after a cancel. Each thread's handlers
   check that it is still *the* thread before they touch anything: a
   terminated worker can have one last message already on its way, and
   it is not allowed to answer for its replacement. */
function ensure() {
  if (worker || noWorker) return worker;
  try {
    var w = new Worker("brain-worker.js");
    w.onmessage = function (e) {
      if (w !== worker || !e.data) return;
      settle(e.data.id, e.data.result);
    };
    w.onerror = function () { if (w === worker) collapse(); };
    worker = w;
  } catch (e) { worker = null; noWorker = true; }
  return worker;
}

function send(req) {
  var w = ensure();
  if (!w) return Promise.resolve(safeSameThread(req));
  return new Promise(function (resolve) {
    var id = req.id = nextId++;
    waiting[id] = { resolve: resolve, req: req };
    /* postMessage throws if the options can't be copied across (a
       function in opts, say): answer here instead */
    try { w.postMessage(req); }
    catch (e) { delete waiting[id]; resolve(safeSameThread(req)); }
  });
}

/* the positions a game has already stood in, which is what lets the
   search know a repetition when it sees one */
function historyOf(g) {
  var out = [], i;
  for (i = 0; i < g.played.length; i++) if (g.played[i].fen) out.push(g.played[i].fen);
  return out;
}

var Brain = {
  /* true once a real worker is carrying the load */
  offThread: function () { ensure(); return !!worker; },
  /* is anything still being thought about? */
  busy: function () { return Object.keys(waiting).length > 0; },
  /* opts reach Chess.search exactly as given, on either thread */
  search: function (g, opts) {
    return send({ op: "search", fen: Chess.fen(g), history: historyOf(g), opts: opts || {} });
  },
  review: function (g, move, opts) {
    return send({ op: "review", fen: Chess.fen(g), history: historyOf(g),
                  move: { from: move.from, to: move.to, promo: move.promo || 0 }, opts: opts || {} });
  },
  /* Stop thinking about positions nobody is looking at any more.

     A worker can't be interrupted halfway through a search — it is busy,
     which is the point of it — so if anything is in flight, the thread
     is ended outright and every question still waiting is answered with
     null, which every caller already reads as "nothing to say". The next
     question builds a fresh worker; its script comes out of the service
     worker's cache, so that costs a few milliseconds rather than a
     download. With nothing in flight the thread is kept, and its warm
     tables with it.

     On the main thread there is nothing to cancel: a same-thread search
     has already finished by the time anyone could ask, and its answer
     arrives as usual — the caller's own ticket decides whether it still
     matters. Returns how many questions were dropped. */
  cancel: function () {
    var pending = waiting, ids = Object.keys(pending);
    if (!ids.length) return 0;
    waiting = {};
    if (worker) { try { worker.terminate(); } catch (e) { /* already gone */ } }
    worker = null;
    ids.forEach(function (id) { pending[id].resolve(null); });
    return ids.length;
  },
  /* resolve a {from,to,promo} from the worker into a real move of this game */
  resolve: function (g, lite) {
    if (!lite) return null;
    var ms = Chess.moves(g), i;
    for (i = 0; i < ms.length; i++) {
      if (ms[i].from === lite.from && ms[i].to === lite.to && (ms[i].promo || 0) === (lite.promo || 0)) return ms[i];
    }
    return null;
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Brain;
else root.Brain = Brain;
})(typeof self !== "undefined" ? self : this);
