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
   and the next piece floats above the right of the mouth, with the one
   after it further along the rim under the pause button. The rest continue
   the arc over the right rim and down the outside of the wall, smaller as
   they are further away. The band never covers columns 3 to 5 above the
   mouth, because that is where a new piece appears and the row it peeks
   into above the face must stay clear.

   **Wide** (iPad, Mac, a phone on its side). Height is the limit, so the
   well is centred and fills it, and the room left either side becomes two
   columns: Keep at the mouth on the left with the HUD and a free panel
   (stats, the Glass Well) under it, and the previews streaming down the
   right side, the next one level with the mouth.

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
/* preview mini-cell scales, nearest first. Tall previews after the first
   are capped by the gutter instead, so only their ratios matter there. */
var TALL_S = [0.6, 0.45, 0.4, 0.36, 0.33, 0.3];
var WIDE_S = [0.6, 0.5, 0.45, 0.41, 0.38, 0.35];
/* in the wide shape, width of each side column in cells: a Keep niche or
   a preview of 4 × 0.6 cells, its padding, and the gap to the wall */
var SIDE = 3.2;
/* on big monitors the well stops growing at this cell size, so a 1440p
   screen gets a well you can take in at a glance rather than one you have
   to look up and down; the board-size setting can push past it */
var WIDE_CAP = 48;
var PAUSE = 44, PAUSE_INSET = 6;

function num(v, d) { return (typeof v === "number" && isFinite(v)) ? v : d; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function rect(x, y, w, h) { return { x: x, y: y, w: w, h: h }; }

var Layout = {
  COLS: COLS, ROWS: ROWS, LIP: LIP,

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
    var yLimit = h - sb - 24 - trayH;       /* the face of the well ends above this */
    var W = Math.max(1, x1 - x0), H = Math.max(1, yLimit - y0);

    /* The biggest cell each shape allows. Tall needs gutters either side
       of the well: wide enough for the walls, and on the right for the
       previews that run down the outside of the wall (a wall, a preview
       of four cells at about 0.27 of a cell each, and a little air). */
    var gutterK = previews > 1 ? 1.3 : 0.5;
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
    var wide = o.wide === true ? true : o.wide === false ? false
             : (wideOk && (cWide > cTall || (cWide === cTall && w > h)));
    var cMax = wide ? cWide : cTall;
    var cPref = wide ? Math.min(cMax, WIDE_CAP) : cMax;
    var c = floorQ(Math.max(6, Math.min(cMax, cPref * scale)));
    if (c > cMax) c = floorQ(cMax);
    if (c < 6) c = 6;

    var wall = snap(Math.max(3, c * 0.22));
    var lip = snap(c * LIP);
    var floor = snap(c * 0.3);
    var pause = rect(snap(w - sr - PAUSE_INSET - PAUSE), snap(st + PAUSE_INSET), PAUSE, PAUSE);

    var L = {
      shape: wide ? "wide" : "tall",
      cell: c, dpr: q, lip: lip, wall: wall, floor: floor,
      well: null, keep: null, next: [], side: null, hud: null, pause: pause, tray: null,
      band: null, safe: { t: st, r: sr, b: sb, l: sl }, w: w, h: h
    };
    if (buttons) L.tray = rect(x0, snap(h - sb - 24 - trayH), W, trayH);

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
      L.well = rect(snap(x0 + (W - c * COLS) / 2), snap(lipTop + lip), c * COLS, c * ROWS);
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
        /* the next piece, above the right of the mouth: right of the spawn
           columns, left of the pause button, sitting on the rim */
        var px0 = snap(L.well.x + c * 6.5);
        var px1 = Math.min(pause.x - 4, L.well.x + L.well.w + wall);
        pad = snap(Math.max(2, c * 0.1));
        m = Math.min(c * TALL_S[0], (px1 - px0 - 2 * pad) / 4, (band - 2 * pad) / 2);
        if (m >= 5) {
          r = { x: px0, y: 0, w: snap(4 * m + 2 * pad), h: snap(2 * m + 2 * pad), s: m / c };
          r.y = snap(lipTop - r.h);
          L.next.push(r);
        }
        /* the second sits on the rim further right, under the pause button,
           and the rest continue the arc over the right rim and down the
           outside of the wall, shrinking with distance */
        var pad2 = 2;
        if (L.next.length === 1 && previews > 1) {
          var bx0 = L.next[0].x + L.next[0].w + 4, bx1 = x1 - 3;
          var by0 = Math.max(bandTop, pause.y + pause.h + 4);
          m = Math.min(c * TALL_S[1], (bx1 - bx0 - 2 * pad2) / 4, (lipTop - by0 - 2 * pad2) / 2);
          if (m >= c * 0.3) {
            r = { x: snap(bx0 + (bx1 - bx0 - (4 * m + 2 * pad2)) / 2), y: 0, w: snap(4 * m + 2 * pad2), h: snap(2 * m + 2 * pad2), s: m / c };
            r.y = snap(lipTop - r.h);
            L.next.push(r);
          }
        }
        var first = L.next.length;
        var gx0 = L.well.x + L.well.w + wall + 3, gx1 = x1 - 3, gw = gx1 - gx0;
        var mFit = (gw - 2 * pad2) / 4;
        y = Math.max(first > 1 ? lipTop + 4 : lipTop - c * 0.2, pause.y + pause.h + 6);
        var gyMax = L.well.y + L.well.h * 0.62;
        for (i = first; i < previews && L.next.length === i && i > 0; i++) {
          ratio = TALL_S[i] / TALL_S[first];
          m = Math.min(c * TALL_S[i], mFit * ratio, L.next[i - 1].s * c);
          if (m < 5) break;
          var rw = snap(4 * m + 2 * pad2), rh = snap(2 * m + 2 * pad2);
          if (y + rh > gyMax) break;
          L.next.push({ x: snap(gx0 + (gw - rw) / 2), y: snap(y), w: rw, h: rh, s: m / c });
          y += rh + Math.max(4, c * 0.22);
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
      var sideW = leftEdge - colX, sideH = yLimit - sideY;
      if (sideW >= 120 && sideH >= 80) L.side = rect(colX, snap(sideY), snap(sideW), snap(sideH));

      if (previews > 0) {
        pad = snap(Math.max(3, c * 0.2));
        var colR = x1 - 8;
        y = lipTopW;
        n = previews;
        for (i = 0; i < n; i++) {
          /* a gentle outward curve, so the stream reads as drifting rather
             than as a column of boxes */
          var bow = c * 0.5 * Math.sin((i / Math.max(1, n - 1)) * Math.PI * 0.5);
          var sx = rightEdge + bow;
          m = Math.min(c * WIDE_S[i], (colR - sx - 2 * pad) / 4);
          if (m < 5) break;
          var ww = snap(4 * m + 2 * pad), hh = snap(2 * m + 2 * pad);
          var ry = y;
          /* step under the pause button rather than through it */
          if (sx + ww > pause.x - 4 && ry < pause.y + pause.h + 6) ry = pause.y + pause.h + 6;
          if (ry + hh > yLimit) break;
          L.next.push({ x: snap(sx), y: snap(ry), w: ww, h: hh, s: m / c });
          y = ry + hh + Math.max(6, c * 0.28);
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
