/* layout.js — where everything goes, on any screen.

   One pure function turns a viewport and its safe-area insets into
   rectangles: the playing face of the well, the lip above its mouth, the
   Keep niche, the previews, the HUD, the side panel. Both renderers draw
   from the same rectangles and the input layer hit-tests against them, so
   the place a finger lands and the place a piece is drawn can never
   disagree. Everything is in CSS pixels; nothing here touches the DOM.

   ## Two shapes

   **Tall** (phones held upright). The well is as tall as the screen
   allows, and the screen is narrow, so nothing can sit beside it. A slim
   HUD runs across the top of the safe area with the pause button at its
   trailing end. Between the HUD and the mouth of the well is a band: the
   Keep niche sits at its left, carved into the rim over the left wall,
   and the next piece stands above the right of the mouth, with the two
   after it over the rim and down the outside of the wall, each smaller
   than the last.
   Three, not five: on a phone a fourth and fifth would be a few pixels
   wide and against the bezel (brief §9.1 allows three). The band never
   covers columns 3 to 5 above the mouth, because that is where a new
   piece appears and the row it peeks into above the face must stay clear.

   **Wide** (iPad, Mac, a phone on its side). Height is the limit, so the
   well is centred and fills it, and the room left either side becomes two
   columns: Keep at the mouth on the left with the HUD and a free panel
   (stats, the Glass Well) under it, and on the right the previews in an
   arc that leaves the end of the coping heading out and curves down, each
   smaller than the last (the 3D well also sets each further back into the
   world's air). There is no room above the mouth on a landscape screen,
   so the arc bends down rather than up.

   The shape that gives the bigger well wins, unless the caller forces
   one with "o.wide".

   ## The gates (brief §9.6)

   A cell is at least 29 px on a 390 × 844 phone, 31 on a 1024 × 768 iPad
   and 33 on a 1440 × 900 Mac. Those numbers decide the vertical budget,
   because 22 rows and a half-row lip are 22.5 cells of height before
   anything else gets a pixel. On the phone the arithmetic is tight —
   844 − 47 (status bar) − 34 (home indicator) − 24 (the gesture-free
   band) − 44 (HUD) leaves 695 px, and 22.5 cells plus a 1.15-cell band
   is 23.65 cells: 29 px, with 9 to spare. So the band is exactly as tall
   as the next piece needs, and the slack is handed back afterwards.

   ## Crisp edges

   A cell is a whole number of *device* pixels — "cell × dpr" is an
   integer — and so is every rectangle's origin. A fused piece is drawn
   from tiles that must abut exactly; a cell of 29.3 px would leave a
   hairline seam between tiles on one row and an overlap on the next.
   "o.dpr" (optional, capped at 2 like the renderers) sets the grid;
   without it cells are whole CSS pixels, which is exact at 1× and 2×.

   ## The bottom of the screen

   Nothing interactive sits in the bottom safe.b + 24 px: that is where
   the home indicator lives and where an upward swipe leaves the app, and
   input.js ignores any gesture that starts there. The well's face ends
   above it; only the floor slab's depth, which is scenery, is allowed to
   reach into it. With the Buttons scheme the tray sits directly above
   that band and the well shrinks to make room.

   ## Beyond the contract

   Besides the fields SPEC §4 names, L carries what the renderers and the
   app would otherwise each work out for themselves: "pause" (the 44 pt
   pause button's rectangle, matching #btnMenu's CSS), "tray" (the Buttons
   tray, when shown), "band" (tall: the strip between HUD and mouth),
   "wall" and "floor" (the drawn thickness of the walls and the floor slab,
   in CSS px), "dpr" (the grid it snapped to), and "hud.stack" (true when
   the HUD column is too narrow for its cards side by side).

   Pure: no window, no document, no clock. tools/ runs it in node across
   a table of real devices.                                               */
(function (root) {
"use strict";

var COLS = 10, ROWS = 22, LIP = 0.5;
/* the band above the mouth in the tall shape, in cells: the next piece at
   about half a cell per mini-cell is two mini-cells tall plus a little air */
var BAND = 1.15;
/* preview mini-cell scales, nearest first. A phone shows three (brief
   §9.1 allows it): one standing on the coping, the next beside it at the
   coping's end, the third over the rim and down the outside of the wall.
   Beside a wide well five arc away from the end of the coping, each
   smaller than the last, so the stream reads as things drifting off into
   the distance rather than as a column of boxes. */
var TALL_S = [0.58, 0.45, 0.36];
var WIDE_S = [0.8, 0.62, 0.5, 0.42, 0.36, 0.32];
/* nothing that floats comes nearer the edge of the screen than this */
var EDGE = 12;
/* in the wide shape, width of each side column in cells: a Keep niche or
   a preview of 4 × 0.6 cells, its padding, and the gap to the wall */
var SIDE = 3.2;
/* on big monitors the well stops growing at this cell size, so a 1440p
   screen gets a well you can take in at a glance rather than one you have
   to look up and down; the board-size setting can push past it */
var WIDE_CAP = 48;
var PAUSE = 44, PAUSE_INSET = 6;
/* the coping stone along the mouth stands this many cells above the lip
   and overhangs the frame by this much: the 3D well draws it, and nothing
   that floats (a preview) may sit on it */
var COPE = 0.3, COPE_OVER = 0.15;

function num(v, d) { return (typeof v === "number" && isFinite(v)) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }

var Layout = {
  COLS: COLS, ROWS: ROWS, LIP: LIP, COPE: COPE,

  compute: function (w, h, o) {
    o = o || {};
    var sf = o.safe || {};
    var st = num(sf.t, 0), sr = num(sf.r, 0), sb = num(sf.b, 0), sl = num(sf.l, 0);
    var hudTop = num(o.hudTop, 44);
    var buttons = !!o.buttons;
    var trayH = buttons ? num(o.trayH, 140) : 0;
    var previews = clamp(Math.round(num(o.previews, 5)), 0, 6);
    var keepOn = o.keep !== false;
    var scale = clamp(num(o.scale, 1), 0.9, 1.3);
    /* the device-pixel grid everything snaps to */
    var q = o.dpr > 0 ? Math.min(2, o.dpr) : 1;
    function snap(v) { return Math.round(v * q) / q; }
    function floorQ(v) { return Math.floor(v * q + 1e-6) / q; }

    w = Math.max(1, num(w, 1)); h = Math.max(1, num(h, 1));
    var x0 = sl, x1 = w - sr, y0 = st;
    var floorY = h - sb - 24;               /* nothing interactive below this */
    var yLimit = floorY - trayH;            /* the face of the well ends above this */
    var W = Math.max(1, x1 - x0), H = Math.max(1, yLimit - y0), Hfull = Math.max(1, floorY - y0);

    /* The biggest cell each shape allows. Tall needs gutters either side
       of the well: wide enough for the walls, and on the right for the
       previews that run down the outside of the wall (a wall, a preview
       of four cells at about a third of a cell each, and a little air). */
    var gutterK = previews > 2 ? 1.3 : 0.5;
    /* with the Buttons tray the floor slab must clear the tray too; without
       it the slab is scenery and may sit in the gesture-free band */
    var below = buttons ? 0.5 : 0;
    var cTall = Math.min((H - hudTop) / (ROWS + LIP + BAND + below), (W - 20) / (COLS + 2 * gutterK));
    /* on a screen with height to spare the wide well keeps a little air
       above and below; on an iPad held sideways every pixel goes to cells */
    var air = clamp((H - 760) / H * 0.6, 0, 0.05);
    var cWide = Math.min(H * (1 - air) / (ROWS + LIP + below), (W - 24) / (COLS + 0.44 + 2 * SIDE));
    /* wide also needs a left column the HUD can live in */
    var wideCol = (W - cWide * (COLS + 0.44)) / 2 - cWide * 0.3 - 12;
    var wideOk = wideCol >= 110;

    /* The Buttons tray on a screen held sideways. Along the bottom it
       takes a third of a short screen's height, and a phone at 667 × 375
       is left with cells of 9 px. Its two clusters (input.js puts them at
       the two ends of the tray) fit either side of a well that keeps the
       full height instead, so when that gives the bigger well the tray's
       height is not taken from the well at all. "o.trayW" is the wider
       cluster's width with its outer padding; without it the width is
       worked out from the tray's height, the way input.js sizes its keys
       (two rows of keys plus a gap and a 6 px top, three keys and two
       gaps across the d-pad). */
    var sides = false, cSide = 0, clusterW = 0;
    if (buttons && w > h && o.wide !== false) {
      var key = Math.max(40, (trayH - 6) / 2.16);
      clusterW = num(o.trayW, 0) > 0 ? o.trayW : Math.ceil(3.32 * key + 10);
      var airS = clamp((Hfull - 760) / Hfull * 0.6, 0, 0.05);
      cSide = Math.min(Hfull * (1 - airS) / (ROWS + LIP), (W - 2 * (clusterW + 12)) / (COLS + 0.44 + 0.6));
      var sideCol = (W - cSide * (COLS + 0.44)) / 2 - cSide * 0.3 - 12;
      sides = sideCol >= 110 && cSide > Math.max(cTall, wideOk ? cWide : 0);
    }
    var wide = sides ? true : o.wide === true ? true : o.wide === false ? false
             : (wideOk && (cWide > cTall || (cWide === cTall && w > h)));
    var cMax = sides ? cSide : (wide ? cWide : cTall);
    var cPref = wide ? Math.min(cMax, WIDE_CAP) : cMax;
    var c = floorQ(Math.max(6, Math.min(cMax, cPref * scale)));
    if (c > cMax) c = floorQ(cMax);
    if (c < 6) c = 6;
    if (sides) { below = 0; H = Hfull; }

    var wall = snap(Math.max(3, c * (wide ? 0.3 : 0.22)));
    var lip = snap(c * LIP);
    var floor = snap(c * 0.4);
    var pause = rect(snap(w - sr - PAUSE_INSET - PAUSE), snap(st + PAUSE_INSET), PAUSE, PAUSE);

    var L = {
      shape: wide ? "wide" : "tall",
      cell: c, dpr: q, lip: lip, wall: wall, floor: floor,
      well: null, keep: null, next: [], side: null, hud: null, pause: pause, tray: null,
      band: null, safe: { t: st, r: sr, b: sb, l: sl }, w: w, h: h
    };
    /* the tray strip, as #pad lays it out; beside a wide well, also the
       two clusters at its ends, which are all of it that is solid */
    var trayTop = snap(floorY - trayH);
    if (buttons) {
      L.tray = rect(x0, trayTop, W, trayH);
      L.tray.sides = sides;
      if (sides) {
        L.tray.left = rect(x0, trayTop, snap(clusterW), trayH);
        L.tray.right = rect(snap(x1 - clusterW), trayTop, snap(clusterW), trayH);
      }
    }
    /* everything that floats beside a well with the tray at its sides
       stops above the clusters */
    var floatLimit = sides ? trayTop - 6 : yLimit;

    var i, m, pad, r, y, n, ratio;
    if (!wide) {
      /* ---------- tall ---------- */
      var band = Math.ceil(c * BAND * q) / q;
      var slack = Math.max(0, H - hudTop - lip - c * ROWS - band - c * below);
      var extra = Math.min(slack, c * 0.45);
      band = snap(band + extra);
      slack -= extra;
      var topM = snap(slack * 0.35);
      var bandTop = snap(y0 + hudTop + topM);
      var lipTop = snap(bandTop + band);
      /* The second and third previews hang down the outside of the right
         wall, so that gutter must hold a piece at nearly half a cell with
         the screen edge kept clear. On a narrow phone it is short; the
         left gutter is empty (the Keep niche sits above the mouth, not
         beside it), so the well gives up a little of its centring rather
         than the previews their size. Never more than seven tenths of a
         cell. */
      var lg = (W - c * COLS) / 2, shift = 0;
      if (previews > 1) {
        var need = 2 + (4 * c * TALL_S[1] + 4) + EDGE;
        shift = clamp(need - lg, 0, Math.min(c * 0.7, lg - wall - 8));
        if (shift < 0) shift = 0;
      }
      L.well = rect(snap(x0 + lg - shift), snap(lipTop + lip), c * COLS, c * ROWS);
      L.band = rect(x0, bandTop, W, lipTop - bandTop);
      L.hud = rect(snap(x0 + 8), snap(y0 + 2), 0, hudTop - 4);
      L.hud.w = snap(pause.x - 6 - L.hud.x);

      if (keepOn) {
        /* flush with the outside of the left wall, stopping short of the
           spawn columns; it may sink into the lip, which is rim, not face */
        var kx = snap(Math.max(x0 + 4, L.well.x - wall));
        var kRight = L.well.x + c * 2.8;
        var kAvailH = L.well.y - bandTop;
        pad = snap(Math.max(3, c * 0.18));
        m = Math.min(c * 0.5, (kRight - kx - 2 * pad) / 4, (kAvailH - 2 * pad) / 2);
        m = Math.max(4, m);
        var kw = snap(4 * m + 2 * pad), kh = snap(Math.min(kAvailH, Math.max(44, 2 * m + 2 * pad)));
        L.keep = { x: kx, y: snap(L.well.y - kh), w: kw, h: kh, s: m / c };
      }

      if (previews > 0) {
        /* An arc over the right rim: the next piece stands on the rim
           above the right of the mouth, right of the spawn columns; the two
           after it hang over the rim and down the outside of the wall. */
        var frameR = L.well.x + L.well.w + wall;
        var faceR = L.well.x + L.well.w;
        var underPause = pause.y + pause.h + 4;
        var ax0 = snap(L.well.x + c * 6.6), ax1 = L.well.x + L.well.w - c * COPE_OVER;
        var aTop = Math.max(bandTop, ax1 > pause.x - 4 ? Math.min(underPause, lipTop - 12) : bandTop);
        m = Math.min(c * TALL_S[0], (ax1 - ax0) / 4.4, (lipTop - aTop) / 2.4);
        if (m >= 5) {
          pad = snap(Math.max(2, m * 0.2));
          var w0 = snap(4 * m + 2 * pad), h0 = snap(2 * m + 2 * pad);
          L.next.push({ x: snap(ax0 + Math.max(0, (ax1 - ax0 - w0) * 0.35)), y: snap(lipTop - h0), w: w0, h: h0, s: m / c });
        }
        /* the other two go over the rim and down the outside of the right
           wall, below the coping, hanging in front of the frame's stone if
           they must but never over the face of the well, and never nearer
           the edge of the screen than EDGE */
        var xR = x1 - EDGE, gl0 = faceR + 2;
        y = L.well.y + 2;
        for (i = 1; i < Math.min(previews, 3) && L.next.length === i; i++) {
          m = Math.min(c * TALL_S[i], (xR - gl0 - 4) / 4, L.next[i - 1].s * c);
          if (m < 5) break;
          var wq = snap(4 * m + 4), hq = snap(2 * m + 4);
          if (y + hq > Math.min(L.well.y + L.well.h * 0.5, floatLimit)) break;
          L.next.push({ x: snap(Math.max(gl0, xR - wq - Math.max(0, (xR - gl0 - wq) * 0.4))), y: snap(y), w: wq, h: hq, s: m / c });
          y += hq + Math.max(5, c * 0.2);
        }
      }
    } else {
      /* ---------- wide ---------- */
      var slackW = Math.max(0, H - lip - c * ROWS - c * below);
      var lipTopW = snap(y0 + slackW * 0.45);
      L.well = rect(snap(x0 + (W - c * COLS) / 2), snap(lipTopW + lip), c * COLS, c * ROWS);
      var gap = snap(Math.max(6, c * 0.3));
      var leftEdge = L.well.x - wall - gap;           /* right edge of the left column */
      var rightEdge = L.well.x + L.well.w + wall + gap; /* left edge of the right column */
      var colX = snap(x0 + 12);

      if (keepOn) {
        pad = snap(Math.max(4, c * 0.25));
        m = Math.min(c * 0.6, (leftEdge - colX - 2 * pad) / 4);
        m = Math.max(4, m);
        var kw2 = snap(Math.max(44, 4 * m + 2 * pad)), kh2 = snap(Math.max(44, 2 * m + 2 * pad));
        L.keep = { x: snap(leftEdge - kw2), y: lipTopW, w: kw2, h: kh2, s: m / c };
      }
      /* the HUD beside the Keep niche at the top of the left column if it
         fits there, else under it */
      var besideR = (L.keep ? L.keep.x : leftEdge) - 10;
      if (besideR - colX >= 200) {
        L.hud = rect(colX, snap(y0 + 6), snap(besideR - colX), hudTop);
      } else {
        /* a narrow column (an iPad held upright): the HUD goes under the
           niche, and if even the column is narrow its cards stack */
        var hy = L.keep ? L.keep.y + L.keep.h + 10 : y0 + 6;
        var hw = snap(leftEdge - colX);
        L.hud = rect(colX, snap(hy), hw, hw < 200 ? hudTop * 3 : hudTop);
        if (hw < 200) L.hud.stack = true;
      }
      var sideY = Math.max(L.hud.y + L.hud.h, L.keep ? L.keep.y + L.keep.h : 0) + 12;
      var sideW = leftEdge - colX, sideH = floatLimit - sideY;
      if (sideW >= 120 && sideH >= 80) L.side = rect(colX, snap(sideY), snap(sideW), snap(sideH));

      if (previews > 0) {
        /* An arc away from the end of the coping: the next piece beside
           the mouth, the rest drifting out to the right and curving down,
           each smaller and (in 3D) further off. A landscape screen has no
           room above the mouth, so the arc bends down, not up. The curve
           runs from beside the coping's end toward the far corner of the
           column, and is lowered further until no two of them touch. */
        var colL = rightEdge, colR = x1 - 8;
        var colW = colR - colL;
        var sz = [], ws = [], hs = [];
        n = Math.min(previews, WIDE_S.length);
        for (i = 0; i < n; i++) {
          pad = snap(Math.max(3, c * 0.2 * WIDE_S[i] / 0.6));
          m = Math.min(c * WIDE_S[i], (colW - 2 * pad) / 4);
          if (m < 5) { n = i; break; }
          sz.push({ m: m, pad: pad });
          ws.push(snap(4 * m + 2 * pad)); hs.push(snap(2 * m + 2 * pad));
        }
        if (n > 0) {
          /* a quarter of an ellipse: it leaves the coping heading right
             and arrives heading down; as wide as the column allows, and
             lowered until the pieces sit evenly along it, none touching */
          var ax = colL + ws[0] / 2, ay = lipTopW + hs[0] / 2;
          var rxMax = Math.max(0, colR - ws[n - 1] / 2 - ax), rxE = 0;
          var gapK = 0.62, placed = null;
          for (var tries = 0; tries < 40 && !placed; tries++, gapK += 0.06) {
            var need = 0, steps = [0];
            for (i = 1; i < n; i++) {
              need += (Math.max(ws[i - 1], hs[i - 1] * 1.6) + Math.max(ws[i], hs[i] * 1.6)) * 0.5 * gapK;
              steps.push(need);
            }
            /* how far down the ellipse must reach for its length to hold them */
            var ryE = c * 2, len = 0, K = 48, k2;
            for (var grow = 0; grow < 60; grow++, ryE += c * 0.4) {
              rxE = Math.min(rxMax, ryE * 1.15);
              len = 0;
              for (k2 = 0; k2 < K; k2++) {
                var f0 = k2 / K * Math.PI / 2, f1 = (k2 + 1) / K * Math.PI / 2;
                len += Math.sqrt(Math.pow(rxE * (Math.sin(f1) - Math.sin(f0)), 2) + Math.pow(ryE * (Math.cos(f0) - Math.cos(f1)), 2));
              }
              if (len >= need) break;
            }
            var pts = [], ok = true, walked = 0, f = 0, df = Math.PI / 2 / 400;
            for (i = 0; i < n && ok; i++) {
              while (walked < steps[i] && f < Math.PI) {
                var fx = rxE * (Math.sin(f + df) - Math.sin(f)), fy = ryE * (Math.cos(f) - Math.cos(f + df));
                walked += Math.sqrt(fx * fx + fy * fy); f += df;
              }
              var cxp = ax + rxE * Math.sin(Math.min(f, Math.PI / 2)), cyp = ay + ryE * (1 - Math.cos(f));
              var rx = snap(clamp(cxp - ws[i] / 2, colL, colR - ws[i])), ry = snap(cyp - hs[i] / 2);
              if (rx + ws[i] > pause.x - 4 && ry < pause.y + pause.h + 6) ry = snap(pause.y + pause.h + 6);
              if (ry + hs[i] > floatLimit) { ok = false; break; }
              for (var j = 0; j < pts.length; j++) {
                var pj = pts[j];
                if (rx < pj.x + pj.w + 4 && pj.x < rx + ws[i] + 4 && ry < pj.y + pj.h + 4 && pj.y < ry + hs[i] + 4) ok = false;
              }
              pts.push({ x: rx, y: ry, w: ws[i], h: hs[i], s: sz[i].m / c });
            }
            if (ok) placed = pts;
          }
          if (!placed) {
            /* no room for a curve: a plain stream down the column */
            placed = []; y = lipTopW;
            for (i = 0; i < n; i++) {
              var ry2 = y;
              if (colL + ws[i] > pause.x - 4 && ry2 < pause.y + pause.h + 6) ry2 = pause.y + pause.h + 6;
              if (ry2 + hs[i] > floatLimit) break;
              placed.push({ x: snap(colL), y: snap(ry2), w: ws[i], h: hs[i], s: sz[i].m / c });
              y = ry2 + hs[i] + Math.max(6, c * 0.2);
            }
          }
          for (i = 0; i < placed.length; i++) L.next.push(placed[i]);
        }
      }
    }

    /* hit tests: screen (CSS px) to board coordinates, fractional, y up */
    var wx = L.well.x, wb = L.well.y + L.well.h;
    L.screenToCell = function (px, py, into) {
      var out = into || {};
      out.x = (px - wx) / c;
      out.y = (wb - py) / c;
      return out;
    };
    return L;
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = Layout;
else root.Layout = Layout;
})(typeof self !== "undefined" ? self : this);
