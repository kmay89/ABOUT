/* lines.js — the racing line.

   A racing driver's line is one curve that contains a whole paragraph:
   brake here, turn in there, the apex is that point, and everything
   after it is exit speed. Nobody writes that down mid-corner. They see
   the line.

   Chess has the same problem — "your bishop, along this diagonal, is
   the reason their knight can't move" — and the same solution. So this
   module turns a handful of chess facts into a small grammar of curves
   that both renderers can draw, and the meaning lives in the shape:

     RUN     the line your best move takes. Thick where the piece is,
             tapering to a point where it lands, because that is the
             direction the idea travels.
     THREAT  the enemy's line into your position, drawn the same way but
             coming *at* you. A threat and a plan look different at a
             glance because one points out and one points in.
     LANE    a pawn's road to promotion — a long, straight, wide-open
             lane. It reads as distance, which is what a passed pawn is.
     NET     the cage around a king: not a line at all, but a set of
             squares. Drawn as marks rather than curves, because a net
             is a *place*, not a direction.

   Every curve carries a bright spark that travels along it, so the eye
   is pulled the way the idea moves. Motion is the cheapest teaching
   there is: you cannot help but follow it.

   Three more words were added when the room learned to let you draw
   too, and when every line it draws became one language:

     INK     your own pen. Straight, even, no spark — a note you made,
             not a thing that is happening, so it sits perfectly still.
     SIGHT   a reach rather than a move: a thin ray with no head.
     RING    a square circled, for "look here" — a place, like the net,
             but a place somebody meant.

   And every line now *arrives*: it grows from the piece to the square
   it is about in a little over a third of a second (reveal, revealAt),
   because the direction is the content and drawing it on shows the
   direction before the eye has to work it out. Colour is not a number
   here but a meaning — a tone — which each renderer turns into its own
   skin's colour, so a threat is the same threat on wood or on glass.

   Pure geometry — no DOM, no GL, no canvas. Both renderers ask for the
   same points and draw them their own way, so a line means exactly the
   same thing in 2D and in 3D. */
(function (root) {
"use strict";

/* ---------- the curve ----------
   A knight's move is bent (it goes over things), everything else is
   drawn with a gentle lift so it reads as a path rather than a ruler
   line. The bend is always to the same side so two lines between the
   same squares never sit on top of each other. */
function curve(from, to, bend, steps) {
  steps = steps || 24;
  var dx = to.x - from.x, dy = to.y - from.y;
  var len = Math.hypot(dx, dy) || 1;
  /* the control point sits off to one side of the midpoint */
  var mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
  var nx = -dy / len, ny = dx / len;
  var lift = (bend || 0) * len;
  var cx = mx + nx * lift, cy = my + ny * lift;
  var pts = [];
  for (var i = 0; i <= steps; i++) {
    var t = i / steps, u = 1 - t;
    pts.push({
      x: u * u * from.x + 2 * u * t * cx + t * t * to.x,
      y: u * u * from.y + 2 * u * t * cy + t * t * to.y
    });
  }
  return pts;
}

/* how much a line should bend, by what kind of move it is */
function bendFor(kind, knight) {
  /* a pen is a ruler: what you drew is exactly the two squares you
     meant, knight or no knight, and a ray is a line of sight */
  if (kind === "ink" || kind === "sight") return 0;
  if (knight) return 0.22;          /* knights arc over the traffic */
  if (kind === "lane") return 0;    /* a promotion lane is dead straight */
  return 0.07;                      /* everything else lifts just enough */
}

/* ---------- the ribbon ----------
   Turn a centre-line into a filled outline that starts wide and ends in
   a point. Returned as a flat polygon so canvas can fill it and GL can
   triangulate it without either knowing about the other. */
function ribbon(pts, w0, w1, headLen, headW, taperOver) {
  var n = pts.length, left = [], right = [], i;
  /* the last stretch is the arrowhead, so the shaft stops short */
  var shaftEnd = n - 1;
  var total = 0, seg = [];
  for (i = 1; i < n; i++) {
    var d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    seg.push(d); total += d;
  }
  if (headLen > 0) {
    var back = 0;
    for (i = n - 1; i > 0; i--) {
      back += seg[i - 1];
      if (back >= headLen) { shaftEnd = i; break; }
    }
    if (shaftEnd < 2) shaftEnd = Math.max(1, n - 2);
  }
  /* a line still being drawn on tapers as the whole line will, not as
     the stub that is showing: `taperOver` is the full length */
  var over = taperOver > 0 ? taperOver : total;
  var run = 0;
  for (i = 0; i <= shaftEnd; i++) {
    if (i) run += seg[i - 1];
    var t = over ? Math.min(1, run / over) : 0;
    var w = (w0 + (w1 - w0) * t) / 2;
    var p = pts[i];
    var prev = pts[Math.max(0, i - 1)], next = pts[Math.min(n - 1, i + 1)];
    var tx = next.x - prev.x, ty = next.y - prev.y;
    var tl = Math.hypot(tx, ty) || 1;
    var nx = -ty / tl, ny = tx / tl;
    left.push({ x: p.x + nx * w, y: p.y + ny * w });
    right.push({ x: p.x - nx * w, y: p.y - ny * w });
  }
  var poly = left.concat(right.reverse());
  var head = null;
  if (headLen > 0) {
    var tip = pts[n - 1], base = pts[shaftEnd];
    var hx = tip.x - base.x, hy = tip.y - base.y;
    var hl = Math.hypot(hx, hy) || 1;
    var ux = hx / hl, uy = hy / hl, px = -uy, py = ux;
    var hw = (headW || w0 * 1.6) / 2;
    head = [
      { x: tip.x, y: tip.y },
      { x: base.x + px * hw, y: base.y + py * hw },
      { x: base.x - px * hw, y: base.y - py * hw }
    ];
  }
  return { poly: poly, head: head, length: total };
}

/* ---------- the spark ----------
   A point travelling the line, once every `period` ms. It is the whole
   reason the drawing feels alive rather than printed. */
function sparkAt(pts, phase) {
  var n = pts.length;
  if (n < 2) return { x: pts[0].x, y: pts[0].y, t: 0 };
  var seg = [], total = 0, i;
  for (i = 1; i < n; i++) {
    var d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    seg.push(d); total += d;
  }
  var want = Math.max(0, Math.min(1, phase)) * total, run = 0;
  for (i = 1; i < n; i++) {
    if (run + seg[i - 1] >= want) {
      var t = seg[i - 1] ? (want - run) / seg[i - 1] : 0;
      return {
        x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t,
        y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t,
        t: phase
      };
    }
    run += seg[i - 1];
  }
  return { x: pts[n - 1].x, y: pts[n - 1].y, t: 1 };
}

/* ---------- the grammar ----------
   Each kind knows how wide it starts, how it tapers, and how fast its
   spark travels. These numbers are the difference between "a diagram"
   and "something alive", so they're kept together where they can be
   compared rather than scattered through two renderers. */
var KINDS = {
  run:    { w0: 0.30, w1: 0.05, head: 0.42, headW: 0.52, alpha: 0.90, period: 1500, glow: 1.0 },
  threat: { w0: 0.24, w1: 0.04, head: 0.34, headW: 0.42, alpha: 0.78, period: 1100, glow: 0.7 },
  lane:   { w0: 0.34, w1: 0.34, head: 0.40, headW: 0.60, alpha: 0.55, period: 2200, glow: 0.8 },
  ghost:  { w0: 0.18, w1: 0.03, head: 0.26, headW: 0.30, alpha: 0.45, period: 2000, glow: 0.4 },
  /* period 0: no spark, and so nothing that ever asks for another frame */
  ink:    { w0: 0.24, w1: 0.24, head: 0.42, headW: 0.56, alpha: 0.85, period: 0, glow: 0.3 },
  sight:  { w0: 0.10, w1: 0.10, head: 0,    headW: 0,    alpha: 0.55, period: 0, glow: 0.3 },
  ring:   { w0: 0.08, w1: 0.08, head: 0,    headW: 0,    alpha: 0.85, period: 0, glow: 0.3 }
};

/* ---------- tone: colour by meaning ----------
   A renderer never gets a colour from here, only the name of what a line
   means. Each one turns the name into its own skin's colour — a CSS
   string on the flat board, a vec3 on the carved one — which is why a
   hint, a threat and your own pen look like the same family on every
   board, and why a colour can never be written one way and read the
   other. */
var TONES = ["plan", "hint", "threat", "lane", "sight", "theirs"];
var KIND_TONE = { run: "hint", ghost: "hint", threat: "threat", lane: "lane",
                  ink: "plan", sight: "sight", ring: "hint" };
function toneOf(spec) {
  var t = spec && spec.tone;
  if (t && TONES.indexOf(t) >= 0) return t;
  return KIND_TONE[spec && spec.kind] || "hint";
}
/* one name per line, so a renderer handed the same picture twice knows
   which lines it has already drawn on and does not start them again */
function keyOf(spec) {
  if (!spec) return "";
  var ring = spec.kind === "ring" || spec.sq != null || spec.from === spec.to;
  var a = spec.sq != null ? spec.sq : spec.from;
  return ring ? "o" + a + "|" + toneOf(spec) : spec.from + "|" + spec.to + "|" + (spec.kind || "run") + "|" + toneOf(spec);
}

/* ---------- the reveal ----------
   A line is drawn on, from where the idea starts to where it lands, in
   REVEAL_MS with a cubic ease-out: fast off the piece, settling onto
   the square. One easing, one duration, no bounce. Asked for stillness,
   it is simply there. */
var REVEAL_MS = 380;
function revealAt(ms, dur, reduced) {
  if (reduced) return { u: 1, live: false };
  dur = dur > 0 ? dur : REVEAL_MS;
  if (!(ms > 0)) return { u: 0, live: true };     /* not yet begun (or waiting its turn) */
  if (ms >= dur) return { u: 1, live: false };
  var t = ms / dur, e = 1 - (1 - t) * (1 - t) * (1 - t);
  return { u: e, live: true };
}
/* the first `u` of a centre-line, by distance along it */
function reveal(pts, u) {
  var n = pts.length;
  if (n < 2 || u >= 1) return pts.slice();
  if (!(u > 0)) return [{ x: pts[0].x, y: pts[0].y }, { x: pts[0].x, y: pts[0].y }];
  var seg = [], total = 0, i;
  for (i = 1; i < n; i++) {
    var d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    seg.push(d); total += d;
  }
  var want = u * total, run = 0, out = [{ x: pts[0].x, y: pts[0].y }];
  for (i = 1; i < n; i++) {
    if (run + seg[i - 1] >= want) {
      var t = seg[i - 1] ? (want - run) / seg[i - 1] : 0;
      out.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t });
      return out;
    }
    run += seg[i - 1];
    out.push({ x: pts[i].x, y: pts[i].y });
  }
  return out;
}
function arcLength(pts) {
  var total = 0;
  for (var i = 1; i < pts.length; i++) total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return total;
}

/* ---------- the ring ----------
   A circle round a square, as a closed centre-line: the same ribbon
   makes it, so it is drawn on the same way a line is — starting at the
   top and going round, the way a hand circles something. */
function ring(c, r, steps) {
  steps = steps || 48;
  var pts = [];
  for (var i = 0; i <= steps; i++) {
    var a = -Math.PI / 2 + (i / steps) * Math.PI * 2;
    pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
  }
  return pts;
}
function buildRing(c, opts) {
  opts = opts || {};
  var K = KINDS.ring, scale = opts.scale || 1;
  var r = (opts.r || 0.40) * scale;
  var full = ring(c, r, opts.steps);
  var u = opts.reveal == null ? 1 : Math.max(0, Math.min(1, opts.reveal));
  var pts = u < 1 ? reveal(full, u) : full;
  var w = K.w0 * scale;
  var rb = ribbon(pts, w, w, 0, 0);
  return {
    kind: "ring", pts: pts, poly: rb.poly, head: null, length: rb.length, r: r, c: { x: c.x, y: c.y },
    alpha: (opts.alpha != null ? opts.alpha : K.alpha), glow: K.glow, period: 0, reveal: u
  };
}

/* Build everything a renderer needs for one line.
   `a` and `b` are square centres in whatever units the renderer uses
   (pixels in 2D, board units in 3D); `scale` is the size of one square,
   so the same widths look right in both. */
function build(a, b, opts) {
  opts = opts || {};
  var kind = KINDS[opts.kind] ? opts.kind : "run";
  var K = KINDS[kind];
  var scale = opts.scale || 1;
  var pts = curve(a, b, opts.bend != null ? opts.bend : bendFor(kind, opts.knight), opts.steps);
  /* drawn on: the first `reveal` of the curve, its head growing in only
     over the last stretch so a stub never wears a full-sized point */
  var u = opts.reveal == null ? 1 : Math.max(0, Math.min(1, opts.reveal));
  var hs = u >= 1 ? 1 : Math.max(0, (u - 0.85) / 0.15);
  var full = u < 1 ? arcLength(pts) : 0;
  if (u < 1) pts = reveal(pts, u);
  var r = ribbon(pts, K.w0 * scale, K.w1 * scale, K.head * scale * hs, K.headW * scale * hs, full);
  return {
    kind: kind, pts: pts, poly: r.poly, head: r.head, length: r.length,
    alpha: (opts.alpha != null ? opts.alpha : K.alpha),
    glow: K.glow, period: K.period, reveal: u
  };
}

/* where the spark is right now, given the clock */
function phase(line, timeMs) {
  if (!line.period) return 1;           /* a still line: its "spark" rests at the tip, unseen */
  return ((timeMs % line.period) / line.period);
}
/* whether a line, as it now stands, still wants frames: while it is
   being drawn on, and for as long as a spark rides it */
function lively(kind, u, reduced) {
  if (u < 1) return !reduced;
  var K = KINDS[kind];
  return !!(K && K.period && !reduced);
}

var Lines = {
  curve: curve, ribbon: ribbon, sparkAt: sparkAt, build: build, phase: phase,
  KINDS: KINDS, bendFor: bendFor,
  TONES: TONES, toneOf: toneOf, keyOf: keyOf,
  REVEAL_MS: REVEAL_MS, revealAt: revealAt, reveal: reveal, arcLength: arcLength,
  ring: ring, buildRing: buildRing, lively: lively
};
if (typeof module !== "undefined" && module.exports) module.exports = Lines;
else root.Lines = Lines;
})(typeof self !== "undefined" ? self : this);
