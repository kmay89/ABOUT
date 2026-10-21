/* gfx2d.js — the table, drawn flat.

   The 2D renderer is not the consolation prize. It is the one that
   works on every phone ever made, the one that comes up if WebGL is
   missing or the context is lost mid-hand, and the one some people
   simply prefer because a domino table seen from above is a perfectly
   honest way to look at a domino table.

   It reads exactly the same `Layout.table()` geometry as the 3D
   renderer, so a bone is in the same place in both and the slot you tap
   is the slot the bone lands in either way.

   Everything is drawn from the skin. The patterns are generated into
   small offscreen tiles once and then repeated — building a wood grain
   inside the per-frame draw call is the classic way to turn a 60fps
   table into a 20fps one.                                             */
(function (root) {
"use strict";

var L = (typeof require === "function" && typeof module !== "undefined")
  ? require("./layout.js") : root.Layout;
var Rl = (typeof require === "function" && typeof module !== "undefined")
  ? require("./rules.js") : root.Rules;

/* ---------- little helpers ---------- */
function rr(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function mix(a, b, t) {
  var ar = parseInt(a.slice(1, 3), 16), ag = parseInt(a.slice(3, 5), 16), ab = parseInt(a.slice(5, 7), 16);
  var br = parseInt(b.slice(1, 3), 16), bg = parseInt(b.slice(3, 5), 16), bb = parseInt(b.slice(5, 7), 16);
  var f = function (x, y) { return Math.round(x + (y - x) * t); };
  return "rgb(" + f(ar, br) + "," + f(ag, bg) + "," + f(ab, bb) + ")";
}
function alpha(hex, a) {
  return "rgba(" + parseInt(hex.slice(1, 3), 16) + "," + parseInt(hex.slice(3, 5), 16) + "," +
    parseInt(hex.slice(5, 7), 16) + "," + a + ")";
}
/* a small deterministic noise, so a pattern looks the same every frame */
function nrand(i) {
  var x = Math.sin(i * 127.1) * 43758.5453;
  return x - Math.floor(x);
}
function nrand2(i) { var x = Math.sin(i * 127.1 + 1.7) * 43758.5453; return x - Math.floor(x); }
/* the same nudge off the slot the round table gives each bone (gfx3d.js) */
function jit(tile) {
  return { dx: (nrand2(tile * 3 + 1) - 0.5) * 0.07, dy: (nrand2(tile * 3 + 2) - 0.5) * 0.07, dr: (nrand2(tile * 3 + 3) - 0.5) * 0.05 };
}

/* ---------- pips ----------
   The layout every domino in the world uses: a 3×3 grid on each half,
   with the familiar arrangements. */
var PIPS = [
  [],
  [[1, 1]],
  [[0, 0], [2, 2]],
  [[0, 0], [1, 1], [2, 2]],
  [[0, 0], [2, 0], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]
];

/* ---------- pattern tiles, made once ---------- */
function makePattern(g, skin, dpr) {
  var p = skin.table.pattern, size = 64;
  var c = document.createElement("canvas");
  c.width = c.height = size;
  var x = c.getContext("2d");
  var felt = skin.table.felt, edge = skin.table.edge, line = skin.table.line;
  var grain = skin.table.grain;
  x.fillStyle = felt; x.fillRect(0, 0, size, size);
  var i, j;

  if (p === "pano") {
    /* felt: a fine nap, drawn as scattered short strokes */
    x.globalAlpha = 0.10 + grain * 0.16;
    for (i = 0; i < 420; i++) {
      var px = nrand(i) * size, py = nrand(i + 900) * size;
      x.strokeStyle = nrand(i + 77) > 0.5 ? edge : skin.table.rim;
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + 1.5, py + 1.5); x.stroke();
    }
  } else if (p === "madera") {
    /* wood: long grain down the table */
    for (i = 0; i < size; i += 2) {
      var t = (Math.sin(i * 0.42) * 0.5 + 0.5) * grain;
      x.strokeStyle = mix(felt, i % 8 < 4 ? skin.table.rim : edge, 0.10 + t * 0.28);
      x.lineWidth = 2;
      x.beginPath(); x.moveTo(0, i); x.lineTo(size, i + (nrand(i) - 0.5) * 2); x.stroke();
    }
  } else if (p === "talavera") {
    /* painted tile: a four-petal motif in the corners and the middle */
    x.strokeStyle = alpha(line, 0.35 + grain * 0.4);
    x.lineWidth = 1.4;
    x.strokeRect(0.5, 0.5, size - 1, size - 1);
    var petal = function (cx, cy, r) {
      x.beginPath();
      for (var a = 0; a < 4; a++) {
        var an = a * Math.PI / 2;
        x.moveTo(cx, cy);
        x.quadraticCurveTo(cx + Math.cos(an - 0.5) * r, cy + Math.sin(an - 0.5) * r,
                           cx + Math.cos(an) * r, cy + Math.sin(an) * r);
        x.quadraticCurveTo(cx + Math.cos(an + 0.5) * r, cy + Math.sin(an + 0.5) * r, cx, cy);
      }
      x.stroke();
    };
    x.strokeStyle = alpha(line, 0.45 + grain * 0.35);
    petal(size / 2, size / 2, 13);
    petal(0, 0, 8); petal(size, 0, 8); petal(0, size, 8); petal(size, size, 8);
  } else if (p === "hule") {
    /* oilcloth: little flowers, the kitchen-table kind */
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
      var cx = i * 32 + 16, cy = j * 32 + 16, k = i * 2 + j;
      x.fillStyle = alpha(k % 2 ? line : edge, 0.30 + grain * 0.45);
      for (var a2 = 0; a2 < 5; a2++) {
        var an2 = a2 * Math.PI * 2 / 5 + k;
        x.beginPath();
        x.ellipse(cx + Math.cos(an2) * 6, cy + Math.sin(an2) * 6, 4.2, 3, an2, 0, Math.PI * 2);
        x.fill();
      }
      x.fillStyle = alpha(line, 0.6);
      x.beginPath(); x.arc(cx, cy, 2.4, 0, Math.PI * 2); x.fill();
    }
  } else if (p === "hojalata") {
    /* punched tin: faint stars in a grid */
    x.strokeStyle = alpha(line, 0.22 + grain * 0.4);
    x.lineWidth = 1.2;
    for (i = 0; i < 2; i++) for (j = 0; j < 2; j++) {
      var sx = i * 32 + 16, sy = j * 32 + 16;
      for (var s = 0; s < 8; s++) {
        var sa = s * Math.PI / 4;
        x.beginPath();
        x.moveTo(sx + Math.cos(sa) * 3, sy + Math.sin(sa) * 3);
        x.lineTo(sx + Math.cos(sa) * 9, sy + Math.sin(sa) * 9);
        x.stroke();
      }
    }
  }
  /* "liso" leaves the flat colour alone, which is the point of it */
  x.globalAlpha = 1;
  return g.createPattern(c, "repeat");
}

/* the wood of the frame round the cloth: long grain in the skin's rim
   and edge colours, the same recipe the round table's texture uses */
function makeWood(g, skin) {
  var size = 96, c = document.createElement("canvas");
  c.width = c.height = size;
  var x = c.getContext("2d"), dark = skin.table.rim, light = skin.table.edge;
  x.fillStyle = mix(dark, light, 0.38); x.fillRect(0, 0, size, size);
  for (var i = 0; i < size; i += 2) {
    var t = Math.sin(i * 0.5) * 0.5 + 0.5, u = nrand(i + 11) * 0.5;
    x.strokeStyle = mix(dark, light, 0.15 + t * 0.45 + u * 0.2);
    x.globalAlpha = 0.55; x.lineWidth = 1 + nrand(i + 3);
    x.beginPath(); x.moveTo(i + nrand(i), 0); x.lineTo(i + (nrand(i + 1) - 0.5) * 3, size); x.stroke();
  }
  x.globalAlpha = 1;
  return g.createPattern(c, "repeat");
}

/* the floor beyond the table's edge: saltillo tile, tinted towards the
   room so a midnight table stands on a midnight floor */
function makeTiles(g, skin) {
  var size = 88, c = document.createElement("canvas");
  c.width = c.height = size;
  var x = c.getContext("2d"), bg = skin.room.bg;
  x.fillStyle = mix(mix("#5a3a2a", bg, 0.35), "#000000", 0.2); x.fillRect(0, 0, size, size);
  var gap = 4;
  for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
    var k = i * 2 + j, cell = size / 2;
    x.fillStyle = mix(mix(mix("#b5643c", "#8a4a2e", nrand(k * 7 + 2)), bg, 0.30), "#000000", 0.25);
    x.fillRect(i * cell + gap / 2, j * cell + gap / 2, cell - gap, cell - gap);
    x.globalAlpha = 0.12;
    for (var s = 0; s < 24; s++) {
      x.fillStyle = mix("#d08a5a", "#6a3620", nrand(k * 131 + s));
      x.beginPath();
      x.arc(i * cell + gap / 2 + nrand(k * 977 + s) * (cell - gap), j * cell + gap / 2 + nrand(k * 313 + s * 3) * (cell - gap), 2 + nrand(s + k) * 5, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
  }
  return g.createPattern(c, "repeat");
}

/* ---------- the renderer ---------- */
function Gfx2D(canvas) {
  this.cv = canvas;
  this.g = canvas.getContext("2d");
  this.skin = null;
  this.pat = null;
  this.w = 0; this.h = 0; this.dpr = 1;
  this.ok = !!this.g;
  this.kind = "2d";
  this.hand = [];
  this.slots = [];
}

Gfx2D.prototype.setSkin = function (skin) {
  this.skin = skin;
  this.pat = null;         /* rebuilt lazily, next frame */
  this.woodPat = null; this.tilePat = null;
};

/* how much of the flat table's edge is frame and floor: the wooden
   frame round the cloth and the strip of tile beyond it. Scaled to the
   screen so a phone keeps its cloth and a tablet gets a proper rail. */
Gfx2D.prototype.edges = function () {
  var m = Math.min(this.w, this.h);
  var floor = Math.max(8, Math.min(20, m * 0.028));
  var rail = Math.max(11, Math.min(26, m * 0.040));
  return { floor: floor, rail: rail, all: floor + rail };
};

Gfx2D.prototype.resize = function (w, h, dpr) {
  this.dpr = dpr || (root.devicePixelRatio || 1);
  this.w = w; this.h = h;
  this.cv.width = Math.max(1, Math.round(w * this.dpr));
  this.cv.height = Math.max(1, Math.round(h * this.dpr));
  this.cv.style.width = w + "px";
  this.cv.style.height = h + "px";
  this.pat = null;
};

/* one bone, at a position and angle, in table units already scaled.

   `w`×`h` is the bone in its own frame and `a` is the half at its local
   -x end (or the top, for an upright bone). When `rot` is a quarter turn
   — every bone at rest — the body, the edge and the bevel are drawn in
   *screen* space and only the pips are turned. Rotating the whole
   drawing used to rotate the lighting with it: a bone heading left had
   its thick front edge along the top and its lit bevel on the bottom, so
   half the line looked lit from below. A bone in mid-air during the slam
   is at an arbitrary angle, and there the whole thing turns — nobody can
   read the light on something moving that fast. */
Gfx2D.prototype.bone = function (x, y, w, h, rot, a, b, opts) {
  var g = this.g, sk = this.skin;
  opts = opts || {};
  var q = ((Math.round(rot) % 360) + 360) % 360;
  var square = Math.abs(rot - Math.round(rot / 90) * 90) < 0.01;
  /* in square mode, the body is drawn unrotated at its screen footprint */
  var sw = w, sh = h, turn = 0;
  if (square) {
    turn = q;
    if (q === 90 || q === 270) { sw = h; sh = w; }
  }
  g.save();
  g.translate(x, y);
  if (!square) g.rotate(rot * Math.PI / 180);
  var hw = sw / 2, hh = sh / 2, r = Math.min(sw, sh) * 0.16;

  if (opts.lift) {
    g.shadowColor = "rgba(0,0,0,.5)";
    g.shadowBlur = opts.lift * 14;
    g.shadowOffsetY = opts.lift * 7;
  }

  /* The front edge. A bone in the hand used to be a rounded rectangle
     with a bevel painted on, which is fine on its own but stopped being
     fine once the table started drawing bones as solids: the hand read
     as a row of cards below a tray of objects. One darker rounded rect
     offset down by the bone's thickness, drawn under the face, and the
     sliver left showing along the bottom is an edge. It costs one fill
     and it is the same trick the eye is being offered in 3D. */
  var thick = Math.max(2.5, Math.min(sw, sh) * 0.14);
  var edgeCol = opts.faceDown ? sk.bones.back : sk.bones.face;
  rr(g, -hw, -hh + thick, sw, sh, r);
  g.fillStyle = mix(edgeCol, "#000000", 0.42);
  g.fill();
  g.shadowColor = "transparent";

  /* the body */
  if (opts.faceDown) {
    rr(g, -hw, -hh, sw, sh, r);
    var gd = g.createLinearGradient(-hw, -hh, hw, hh);
    gd.addColorStop(0, mix(sk.bones.back, "#ffffff", 0.16));
    gd.addColorStop(1, mix(sk.bones.back, "#000000", 0.22));
    g.fillStyle = gd; g.fill();
    g.shadowColor = "transparent";
    g.strokeStyle = alpha("#000000", 0.35); g.lineWidth = Math.max(1, sw * 0.03); g.stroke();
    /* a small mark so a face-down bone is not a blank lozenge */
    g.strokeStyle = alpha(sk.bones.face, 0.30);
    g.lineWidth = Math.max(1, Math.min(sw, sh) * 0.05);
    rr(g, -hw * 0.55, -hh * 0.72, sw * 0.55, sh * 0.72, r * 0.7);
    g.stroke();
    g.restore();
    return;
  }

  rr(g, -hw, -hh, sw, sh, r);
  var face = g.createLinearGradient(-hw, -hh, hw, hh);
  face.addColorStop(0, mix(sk.bones.face, "#ffffff", 0.20 + sk.bones.shine * 0.22));
  face.addColorStop(0.55, sk.bones.face);
  face.addColorStop(1, mix(sk.bones.face, "#000000", 0.10));
  g.fillStyle = face;
  g.fill();
  g.shadowColor = "transparent";

  /* the bevel: a light top-left edge and a dark bottom-right one */
  g.save();
  rr(g, -hw, -hh, sw, sh, r); g.clip();
  g.strokeStyle = alpha("#ffffff", 0.30 + sk.bones.rim * 0.45);
  g.lineWidth = Math.max(1, Math.min(sw, sh) * 0.07);
  g.beginPath(); g.moveTo(-hw, hh); g.lineTo(-hw, -hh); g.lineTo(hw, -hh); g.stroke();
  g.strokeStyle = alpha("#000000", 0.22);
  g.beginPath(); g.moveTo(hw, -hh); g.lineTo(hw, hh); g.lineTo(-hw, hh); g.stroke();
  g.restore();

  g.strokeStyle = alpha(sk.bones.pip, 0.28);
  g.lineWidth = Math.max(1, Math.min(sw, sh) * 0.028);
  rr(g, -hw, -hh, sw, sh, r); g.stroke();

  /* the divider and the pips, in the bone's own frame — turned by the
     quarter turns the body was spared */
  if (turn) g.rotate(turn * Math.PI / 180);
  var longAxis = h >= w;
  var hw2 = w / 2, hh2 = h / 2;
  g.strokeStyle = alpha(sk.bones.pip, 0.55);
  g.lineWidth = Math.max(1, Math.min(w, h) * 0.045);
  g.beginPath();
  if (longAxis) { g.moveTo(-hw2 * 0.78, 0); g.lineTo(hw2 * 0.78, 0); }
  else { g.moveTo(0, -hh2 * 0.78); g.lineTo(0, hh2 * 0.78); }
  g.stroke();

  var half = longAxis ? { w: w, h: h / 2 } : { w: w / 2, h: h };
  this.pips(longAxis ? 0 : -half.w / 2, longAxis ? -half.h / 2 : 0, half.w, half.h, a);
  this.pips(longAxis ? 0 : half.w / 2, longAxis ? half.h / 2 : 0, half.w, half.h, b);
  if (turn) g.rotate(-turn * Math.PI / 180);
  /* the perno: a brass pin raised in the middle of the face */
  var pr = Math.max(2, Math.min(w, h) * 0.078);
  var brass = g.createRadialGradient(-pr * 0.35, -pr * 0.35, pr * 0.1, 0, 0, pr);
  brass.addColorStop(0, "#f6dc8c"); brass.addColorStop(0.55, "#c9a24f"); brass.addColorStop(1, "#7a5a1e");
  g.beginPath(); g.arc(0, pr * 0.25, pr, 0, Math.PI * 2); g.fillStyle = "rgba(0,0,0,.28)"; g.fill();
  g.beginPath(); g.arc(0, 0, pr, 0, Math.PI * 2); g.fillStyle = brass; g.fill();
  g.strokeStyle = "rgba(60,40,10,.55)"; g.lineWidth = Math.max(0.8, pr * 0.18); g.stroke();
  g.beginPath(); g.arc(-pr * 0.3, -pr * 0.3, pr * 0.28, 0, Math.PI * 2); g.fillStyle = "rgba(255,250,235,.75)"; g.fill();

  if (opts.glow) {
    g.strokeStyle = opts.glow;
    g.lineWidth = Math.max(2, Math.min(sw, sh) * 0.10);
    rr(g, -hw, -hh, sw, sh, r);
    g.stroke();
  }
  g.restore();
};

Gfx2D.prototype.pips = function (cx, cy, w, h, n) {
  var g = this.g, sk = this.skin;
  var set = PIPS[n] || [];
  var span = Math.min(w, h) * 0.60;
  var rad = Math.min(w, h) * 0.105;
  for (var i = 0; i < set.length; i++) {
    var px = cx + (set[i][0] - 1) * span / 2;
    var py = cy + (set[i][1] - 1) * span / 2;
    /* the shadow the hole steals from the face around its rim */
    var halo = g.createRadialGradient(px, py, rad, px, py, rad * 1.55);
    halo.addColorStop(0, alpha(sk.bones.pip, 0.20));
    halo.addColorStop(1, alpha(sk.bones.pip, 0));
    g.fillStyle = halo;
    g.beginPath(); g.arc(px, py, rad * 1.55, 0, Math.PI * 2); g.fill();

    g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2);
    g.fillStyle = sk.bones.pip; g.fill();

    /* A pip is drilled, and a pit is lit on the wall *opposite* the
       light — the near wall is the one in its own shadow. The highlight
       used to sit up and to the left, on the same side as the bevel's
       lit edge, which is how you shade a dome. Every pip in the hand was
       reading as a bump while the table drew holes. (The gradient is in
       whatever frame the pips are drawn in, so on a turned bone the lit
       wall turns with it — a degree of wrongness nobody can see at the
       size of a pip.) */
    g.save();
    g.beginPath(); g.arc(px, py, rad, 0, Math.PI * 2); g.clip();
    var bore = g.createLinearGradient(px - rad, py - rad, px + rad, py + rad);
    bore.addColorStop(0, alpha("#000000", 0.45));
    bore.addColorStop(0.55, alpha("#000000", 0));
    bore.addColorStop(1, alpha("#fff6e4", 0.30 + sk.bones.shine * 0.20));
    g.fillStyle = bore;
    g.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    g.restore();
  }
};

/* ---------- the frame, in two halves ----------
   The table and the hand are drawn by separate passes on purpose. In 2D
   the renderer does both onto one canvas. In 3D the table is WebGL and
   this file still draws the hand, onto a transparent canvas laid over
   the top.

   That is not a shortcut — it is the reason a bone is in exactly the
   same place, at exactly the same size, with exactly the same tap
   target, whichever renderer you are using. It also keeps the bones in
   your hand crisp at any pixel ratio, which a perspective camera cannot
   promise, and halves the work the 3D path has to do. */
Gfx2D.prototype.draw = function (scene, now) {
  if (!this.skin || !this.ok) return;
  this.drawTable(scene, now);
  this.drawHand(scene, now);
};

Gfx2D.prototype.drawTable = function (scene, now) {
  var g = this.g, sk = this.skin;
  if (!sk || !this.ok) return;
  g.save();
  g.scale(this.dpr, this.dpr);
  g.clearRect(0, 0, this.w, this.h);

  /* The room, then the table in it. The flat table is seen from
     straight above, so what shows round the cloth is the wooden frame
     it is let into and, past that, a strip of the cantina's tile floor
     — enough to say the table ends, not enough to steal cloth from the
     line. */
  if (!this.pat) this.pat = makePattern(g, sk, this.dpr);
  if (!this.woodPat) this.woodPat = makeWood(g, sk);
  if (!this.tilePat) this.tilePat = makeTiles(g, sk);
  var ed = this.edges();
  g.fillStyle = this.tilePat || sk.room.bg;
  g.fillRect(0, 0, this.w, this.h);
  /* the one bulb does not reach the floor much */
  g.fillStyle = alpha("#000000", 0.38);
  g.fillRect(0, 0, this.w, this.h);

  /* the frame, with the shadow it throws on the floor */
  var fx = ed.floor, fw = this.w - fx * 2, fh = this.h - fx * 2, fr = Math.max(10, ed.rail * 0.9);
  g.save();
  g.shadowColor = "rgba(0,0,0,.55)"; g.shadowBlur = ed.floor * 1.4; g.shadowOffsetY = ed.floor * 0.5;
  rr(g, fx, fx, fw, fh, fr);
  g.fillStyle = this.woodPat || sk.table.rim;
  g.fill();
  g.restore();
  /* a bevel on the outer edge: light along the top-left, dark below */
  g.save();
  rr(g, fx, fx, fw, fh, fr); g.clip();
  g.lineWidth = 2.5;
  g.strokeStyle = "rgba(255,240,215,.22)";
  g.beginPath(); g.moveTo(fx, fx + fh); g.lineTo(fx, fx); g.lineTo(fx + fw, fx); g.stroke();
  g.strokeStyle = "rgba(0,0,0,.35)";
  g.beginPath(); g.moveTo(fx + fw, fx); g.lineTo(fx + fw, fx + fh); g.lineTo(fx, fx + fh); g.stroke();
  g.restore();

  /* the cloth, let into the frame */
  var inset = ed.all, tw = this.w - inset * 2, th = this.h - inset * 2, cr = 8;
  g.save();
  rr(g, inset, inset, tw, th, cr);
  g.clip();
  g.fillStyle = this.pat || sk.table.felt;
  g.fillRect(inset, inset, tw, th);
  /* one warm bulb overhead */
  var lamp = g.createRadialGradient(this.w / 2, this.h * 0.34, 10, this.w / 2, this.h * 0.34, this.h * 0.78);
  lamp.addColorStop(0, alpha("#ffffff", 0.10 + sk.table.gloss * 0.14));
  lamp.addColorStop(1, alpha("#000000", 0.30));
  g.fillStyle = lamp;
  g.fillRect(inset, inset, tw, th);
  /* the lip of the frame, standing a little proud of the cloth, throws
     a thin shadow onto it along the inside edge */
  g.lineWidth = 6;
  g.strokeStyle = "rgba(0,0,0,.28)";
  rr(g, inset - 2, inset - 2, tw + 4, th + 4, cr + 2); g.stroke();
  g.restore();
  g.strokeStyle = mix(sk.table.rim, "#000000", 0.35);
  g.lineWidth = 1.5;
  rr(g, inset, inset, tw, th, cr);
  g.stroke();

  var t = scene.table, i;
  /* leave room for the hand below and the seat strip above, and keep
     the line off the frame at the sides */
  var top = scene.topPad || 44, bot = scene.botPad || 130;
  var fit = L.fit(t.bbox, this.w - inset * 2, this.h - top - bot, 10);
  var unit = fit.scale;
  var ox = fit.ox + inset, oy = fit.oy + top;
  this.lastFit = { ox: ox, oy: oy, unit: unit };

  /* ghost slots first, under everything */
  this.slots = [];
  if (scene.ghosts) {
    for (i = 0; i < scene.ghosts.length; i++) {
      var gh = scene.ghosts[i];
      var gx = ox + gh.x * unit, gy = oy + gh.y * unit;
      var along = (gh.rot === undefined ? gh.h * 90 : gh.rot) % 180 === 0;
      var gw = (along ? L.LEN : L.WID) * unit;
      var ghh = (along ? L.WID : L.LEN) * unit;
      this.slots.push({ end: gh.end, x: gx - gw / 2, y: gy - ghh / 2, w: gw, h: ghh });
      var over = scene.hover === gh.end, lean = scene.lean === gh.end;
      g.save();
      if (over) {
        /* the slot under a dragged bone fills in: this is where it lands */
        rr(g, gx - gw / 2, gy - ghh / 2, gw, ghh, Math.min(gw, ghh) * 0.16);
        g.fillStyle = alpha(sk.marks.playable, 0.35);
        g.fill();
      }
      g.setLineDash(over ? [] : [6, 5]);
      g.strokeStyle = over ? sk.marks.playable : alpha(lean ? sk.marks.last : sk.marks.ghost, 0.55 + 0.35 * Math.sin(now / 320));
      g.lineWidth = over || lean ? 3.5 : 2.5;
      rr(g, gx - gw / 2, gy - ghh / 2, gw, ghh, Math.min(gw, ghh) * 0.16);
      g.stroke();
      if (lean && !over) {
        /* Don Chuy's lean: a small star by the end he would choose */
        g.setLineDash([]);
        g.font = "700 " + Math.max(12, Math.min(gw, ghh) * 0.5) + "px system-ui, sans-serif";
        g.textAlign = "center"; g.textBaseline = "middle";
        g.fillStyle = sk.marks.last;
        g.shadowColor = "rgba(0,0,0,.6)"; g.shadowBlur = 6;
        g.fillText("★", gx, gy);
      }
      g.restore();
    }
  }

  /* the line of play */
  for (i = 0; i < t.bones.length; i++) {
    var b = t.bones[i];
    /* The bone is sized in its own frame — always long along local x —
       and `rot` turns it. Sizing it by the screen-space footprint as well
       turned every upright bone and every crosswise mula twice, so they
       lay flat along the line in 2D while the 3D table stood them up. */
    var bw = L.LEN * unit, bh = L.WID * unit;
    var fc = L.faces(b), a = fc[0], c = fc[1];
    var anim = scene.anim && scene.anim.idx === b.idx ? scene.anim : null;
    /* hand-laid: the same hair off the slot the round table gives it */
    var jj = jit(b.tile);
    var px = ox + (b.x + jj.dx) * unit, py = oy + (b.y + jj.dy) * unit, lift = 0, rot = b.rot + jj.dr * 57.3;
    if (anim) {
      var k = Math.min(1, anim.t);
      var e = 1 - Math.pow(1 - k, 3);
      var fx = ox + anim.fromX * unit, fy = oy + anim.fromY * unit;
      px = fx + (px - fx) * e;
      py = fy + (py - fy) * e;
      rot = anim.fromRot + (rot - anim.fromRot) * e;
      lift = Math.sin(k * Math.PI) * 1.1;
    }
    this.bone(px, py, bw, bh, rot, a, c, {
      lift: lift,
      glow: (b.idx === scene.lastIdx && !anim) ? alpha(sk.marks.last, 0.45 + 0.4 * Math.max(0, 1 - (scene.lastAge || 0) / 2600)) : null
    });
    /* a ring that spreads out from a bone the moment it lands — the eye
       goes to movement, and this is the movement that says "here" */
    if (b.idx === scene.lastIdx && !anim && (scene.lastAge || 0) < 700) {
      var rk = (scene.lastAge || 0) / 700;
      g.save();
      g.strokeStyle = alpha(sk.marks.last, 0.6 * (1 - rk));
      g.lineWidth = 3;
      var rw = (b.rot % 180 === 0 ? bw : bh) + unit * rk * 1.6, rh = (b.rot % 180 === 0 ? bh : bw) + unit * rk * 1.6;
      rr(g, px - rw / 2, py - rh / 2, rw, rh, Math.min(rw, rh) * 0.25);
      g.stroke();
      g.restore();
    }
  }

  g.restore();
};

/* the hand along the bottom, plus the other three seats. Drawn onto a
   transparent canvas when the 3D table is underneath. */
Gfx2D.prototype.drawHand = function (scene, now) {
  var g = this.g, sk = this.skin, i;
  if (!sk || !this.ok) return;
  g.save();
  g.scale(this.dpr, this.dpr);
  if (this.transparent) g.clearRect(0, 0, this.w, this.h);

  /* the other three seats, as face-down stacks around the edge */
  if (scene.seats) this.seats(scene);

  this.hand = L.handRow(scene.hand.length, this.w, this.h, { pad: 10 });
  /* each bone eases towards how high it should sit rather than jumping:
     lifting one out of your hand should feel like picking it up */
  if (!this.lifts) this.lifts = {};
  var dt = this.lastHandT ? Math.min(0.1, (now - this.lastHandT) / 1000) : 0;
  this.lastHandT = now;
  var drag = scene.drag;
  for (i = 0; i < scene.hand.length; i++) {
    var r = this.hand[i], tile = scene.hand[i];
    var playable = scene.playable && scene.playable[tile];
    var sel = scene.selected === tile;
    if (drag && drag.tile === tile) {
      /* the bone is in the player's fingers: leave its place in the row
         marked, and draw it where the finger is, below */
      g.save();
      g.setLineDash([5, 4]);
      g.strokeStyle = alpha(sk.marks.playable, 0.5);
      g.lineWidth = 2;
      rr(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, r.w * 0.16);
      g.stroke();
      g.restore();
      continue;
    }
    var goal = sel ? 18 : (playable ? 6 : 0);
    var cur = this.lifts[tile] === undefined ? goal : this.lifts[tile];
    cur += (goal - cur) * Math.min(1, dt * 14);
    this.lifts[tile] = cur;
    /* the bones you can play breathe, very slightly, on your turn */
    var bob = (playable && !sel && scene.yourTurn) ? Math.sin(now / 420 + i * 0.7) * 1.2 : 0;
    var y = r.y - cur - bob;
    this.bone(r.x + r.w / 2, y + r.h / 2, r.w, r.h, 0, Rl.A(tile), Rl.B(tile), {
      lift: 0.2 + cur / 18,
      glow: sel ? sk.marks.playable : (playable ? alpha(sk.marks.playable, 0.55) : null)
    });
    if (!playable && scene.yourTurn) {
      /* a bone that cannot go anywhere is dimmed, not hidden — you
         still need to see what you are holding */
      g.save();
      rr(g, r.x, y, r.w, r.h, r.w * 0.16);
      g.fillStyle = alpha(sk.room.bg, 0.52);
      g.fill();
      g.restore();
    }
  }
  if (drag && this.hand.length) {
    /* the dragged bone, a little bigger, well off the table, turned
       slightly as a bone is when you carry it */
    var r0 = this.hand[0], dw = r0.w * 1.12, dh = r0.h * 1.12;
    this.bone(drag.x, drag.y - dh * 0.35, dw, dh, drag.over ? 0 : -6, Rl.A(drag.tile), Rl.B(drag.tile), {
      lift: 1.6, glow: drag.over ? sk.marks.playable : alpha(sk.marks.playable, 0.7)
    });
  }

  g.restore();
};

/* The other three, as face-down bones held at their side of the table.

   Three things this has to get right: it must not collide with the seat
   chips along the top (it did — the partner's hand was drawn straight
   through them), it must read as *a hand somebody is holding* rather
   than as clutter at the edge of the screen, and the count has to be
   legible at a glance, because how many bones somebody has left is the
   single most-watched number in the game. So they overlap like held
   cards, tight and slightly fanned, rather than lying in a neat row. */
Gfx2D.prototype.seats = function (scene) {
  var g = this.g, sk = this.skin;
  var topSafe = (scene.topPad || 74) + 4;
  var midY = topSafe + (this.h - topSafe - (scene.botPad || 132)) * 0.42;
  var spots = [
    null,
    { x: this.w - 20, y: midY, rot: 90 },     /* to your right */
    { x: this.w / 2, y: topSafe + 12, rot: 180 }, /* your partner, across */
    { x: 20, y: midY, rot: -90 }              /* to your left */
  ];
  for (var s = 0; s < scene.seats.length; s++) {
    var seat = scene.seats[s];
    if (seat.you) continue;
    var sp = spots[seat.rel];
    if (!sp) continue;
    var n = Math.max(0, seat.count), bw = 17, bh = 29, step = 9;
    g.save();
    g.translate(sp.x, sp.y);
    g.rotate(sp.rot * Math.PI / 180);
    var total = (n - 1) * step + bw;
    for (var i = 0; i < n; i++) {
      var x = -total / 2 + i * step + bw / 2;
      /* a shallow fan, so a hand of seven reads as seven */
      var tilt = (i - (n - 1) / 2) * 1.6;
      this.bone(x, Math.abs(tilt) * 0.10, bw, bh, tilt, 0, 0, { faceDown: true, lift: 0.2 });
    }
    g.restore();
  }
};

/* a point on the screen, back in table units — the twin of the round
   table's pointOnTable, so a bone can be flown in from a plate */
Gfx2D.prototype.pointOnTable = function (px, py) {
  var f = this.lastFit;
  if (!f || !f.unit) return null;
  return { x: (px - f.ox) / f.unit, y: (py - f.oy) / f.unit };
};

/* which thing a tap landed on */
Gfx2D.prototype.hit = function (x, y) {
  var i = L.hitHand(this.hand, x, y);
  if (i >= 0) return { kind: "hand", i: i };
  for (var k = 0; k < this.slots.length; k++) {
    var s = this.slots[k];
    /* slots get a generous margin — they are small and often near the
       edge of the table */
    if (x >= s.x - 14 && x <= s.x + s.w + 14 && y >= s.y - 14 && y <= s.y + s.h + 14) {
      return { kind: "end", end: s.end };
    }
  }
  return { kind: "table" };
};

Gfx2D.prototype.destroy = function () { this.pat = null; this.woodPat = null; this.tilePat = null; };

if (typeof module !== "undefined" && module.exports) module.exports = Gfx2D;
else root.Gfx2D = Gfx2D;
})(typeof self !== "undefined" ? self : this);
