/* brain-worker.js — the engine, on its own thread.

   Everything here is the same engine.js the page would have run itself;
   the only difference is which thread it blocks. It is handed a position
   and the positions that came before it (so repetitions are still
   understood), and it hands back plain numbers — never a move object,
   because the page has to find the move in its own game anyway. */
"use strict";
importScripts("engine.js");

function lite(m) { return m ? { from: m.from, to: m.to, promo: m.promo || 0 } : null; }
function find(g, l) {
  if (!l) return null;
  var ms = Chess.moves(g), i;
  for (i = 0; i < ms.length; i++) {
    if (ms[i].from === l.from && ms[i].to === l.to && (ms[i].promo || 0) === (l.promo || 0)) return ms[i];
  }
  return null;
}
function position(d) {
  var g = Chess.create(d.fen);
  Chess.seedRepetition(g, d.history);
  return g;
}

self.onmessage = function (e) {
  var d = e.data, out = null;
  try {
    var g = position(d);
    if (d.op === "search") {
      var r = Chess.search(g, d.opts || {});
      out = { move: lite(r.move), score: r.score, depth: r.depth, nodes: r.nodes, pv: r.pv || [],
              ranked: (r.ranked || []).map(function (x) {
                return { move: lite(x.move), score: x.score, shallow: !!x.shallow };
              }) };
    } else if (d.op === "review") {
      var m = find(g, d.move);
      var rv = m ? Chess.review(g, m, d.opts || {}) : null;
      out = rv ? { best: lite(rv.best), bestSAN: Chess.toSAN(g, rv.best),
                   bestScore: rv.bestScore, playedScore: rv.playedScore, loss: rv.loss,
                   pv: rv.pv || [], refute: rv.refute || null, depth: rv.depth,
                   only: rv.only == null ? null : rv.only, alone: !!rv.alone,
                   altSAN: rv.alt ? Chess.toSAN(g, rv.alt) : null } : null;
    }
  } catch (err) {
    out = null;
  }
  self.postMessage({ id: d.id, result: out });
};
