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
   degrades is a feature; a feature that throws is a bug. */
(function (root) {
"use strict";

var worker = null, nextId = 1, waiting = {};

function sameThread(d) {
  /* the exact work the worker would have done, done here */
  var g = root.Chess.create(d.fen);
  root.Chess.seedRepetition(g, d.history);
  function lite(m) { return m ? { from: m.from, to: m.to, promo: m.promo || 0 } : null; }
  if (d.op === "search") {
    var r = root.Chess.search(g, d.opts || {});
    return { move: lite(r.move), score: r.score, depth: r.depth, nodes: r.nodes, pv: r.pv || [],
             ranked: (r.ranked || []).map(function (x) {
               return { move: lite(x.move), score: x.score, shallow: !!x.shallow };
             }) };
  }
  if (d.op === "review") {
    var ms = root.Chess.moves(g), m = null, i;
    for (i = 0; i < ms.length; i++) {
      if (ms[i].from === d.move.from && ms[i].to === d.move.to &&
          (ms[i].promo || 0) === (d.move.promo || 0)) { m = ms[i]; break; }
    }
    var rv = m ? root.Chess.review(g, m, d.opts || {}) : null;
    return rv ? { best: lite(rv.best), bestSAN: root.Chess.toSAN(g, rv.best),
                  bestScore: rv.bestScore, playedScore: rv.playedScore, loss: rv.loss,
                  pv: rv.pv || [], refute: rv.refute || null, depth: rv.depth,
                   only: rv.only == null ? null : rv.only, alone: !!rv.alone,
                   altSAN: rv.alt ? root.Chess.toSAN(g, rv.alt) : null } : null;
  }
  return null;
}

/* Anything still in flight when the worker dies is finished here rather
   than left hanging: a coach that never moves is worse than a coach that
   stutters. */
function collapse() {
  var pending = waiting;
  waiting = {}; worker = null;
  Object.keys(pending).forEach(function (id) {
    var job = pending[id];
    try { job.resolve(sameThread(job.req)); } catch (e) { job.resolve(null); }
  });
}

var booted = false;
function ensure() {
  if (booted) return;
  booted = true;
  try {
    worker = new Worker("brain-worker.js");
    worker.onmessage = function (e) {
      var job = waiting[e.data.id];
      if (!job) return;
      delete waiting[e.data.id];
      job.resolve(e.data.result);
    };
    worker.onerror = function () { collapse(); };
  } catch (e) { worker = null; }
}

function send(req) {
  ensure();
  if (!worker) return Promise.resolve(sameThread(req));
  return new Promise(function (resolve) {
    req.id = nextId++;
    waiting[req.id] = { resolve: resolve, req: req };
    try { worker.postMessage(req); }
    catch (e) { delete waiting[req.id]; resolve(sameThread(req)); }
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
  search: function (g, opts) {
    return send({ op: "search", fen: root.Chess.fen(g), history: historyOf(g), opts: opts || {} });
  },
  review: function (g, move, opts) {
    return send({ op: "review", fen: root.Chess.fen(g), history: historyOf(g),
                  move: { from: move.from, to: move.to, promo: move.promo || 0 }, opts: opts || {} });
  },
  /* resolve a {from,to,promo} from the worker into a real move of this game */
  resolve: function (g, lite) {
    if (!lite) return null;
    var ms = root.Chess.moves(g), i;
    for (i = 0; i < ms.length; i++) {
      if (ms[i].from === lite.from && ms[i].to === lite.to && (ms[i].promo || 0) === (lite.promo || 0)) return ms[i];
    }
    return null;
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Brain;
else root.Brain = Brain;
})(typeof self !== "undefined" ? self : this);
