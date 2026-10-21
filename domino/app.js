/* app.js — the conductor.

   Everything that is not the rules, the geometry, the players, the
   coach, the look or the link. Game flow, the tray of buttons, the
   settings panes, the join door, persistence, and the frame loop.

   One idea shapes most of this file: **the screen is always drawn from
   a view, never from the game.** In a solo match the view is
   `Rules.publicView(state, 0)`; on a joined phone it is the view the
   host sent. Both are the same shape, so there is exactly one drawing
   path, one hit-test, one hint panel — and a joined phone cannot render
   something it was not told, because it does not have it.            */
(function () {
"use strict";

var R = window.Rules, L = window.Layout, AI = window.AI, C = window.Coach,
    Sk = window.Skins, Net = window.Net, Room = window.Room,
    Snd = window.Sound, Car = window.Career, Rt = window.Rating,
    Fc = window.Faces, Cn = window.Cantina;
function reducedMotion() {
  return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
}
var RM = reducedMotion();

/* who this table is, as far as the shared front door is concerned
   (see room.js — the same four-letter door the chess room uses) */
Room.configure({ game: "domino", seats: 4, label: "table" });

/* ---------- the small change ---------- */
function $(id) { return document.getElementById(id); }
/* One place where iOS Safari's synthesized click is dealt with. Every
   tappable thing goes through this, never a bare click listener: a
   pointerdown that is followed by the ghost click would otherwise fire
   the same button twice. */
function press(el, fn) {
  if (!el) return;
  var used = false;
  el.addEventListener("pointerdown", function (e) {
    used = true;
    el.classList.add("down");
    e.preventDefault();
  }, { passive: false });
  el.addEventListener("pointerup", function (e) {
    el.classList.remove("down");
    if (!used) return;
    used = false;
    e.preventDefault();
    fn(e);
  }, { passive: false });
  el.addEventListener("pointercancel", function () { used = false; el.classList.remove("down"); });
  el.addEventListener("click", function (e) { e.preventDefault(); });
}
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function open(id) { $(id).classList.remove("hide"); }
function shut(id) { $(id).classList.add("hide"); }
document.addEventListener("pointerdown", function (e) {
  /* browsers keep audio asleep until a touch; any touch will do — and
     the trio in the corner starts with it, once the room is open */
  Snd.unlock();
  if (P.music && P.sound && $("splash").classList.contains("gone")) Snd.music.start();
  var c = e.target.getAttribute && e.target.getAttribute("data-close");
  if (c) shut(c);
  /* tapping the dark outside a sheet closes it too — except the curtain
     between two players on one phone, which only lifts on their word */
  if (e.target.classList && e.target.classList.contains("ov") && e.target.id !== "ovPass") e.target.classList.add("hide");
});

var toastT = 0;
function toast(msg) {
  var t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastT);
  toastT = setTimeout(function () { t.classList.remove("on"); }, 2600);
}

/* ---------- what we remember ---------- */
var SAVE = "dominotable.v1";
var P = {
  name: "", skin: null, view3d: true, level: null, rating: null,
  pace: "relaxed",
  rules: { target: 100, capicua: 25, countAll: false, trancaTie: "closer", firstSalida: "mula" },
  seen: {}, coach: true, sound: true, grade: true,
  career: null,
  face: "",             /* the face this player picked (faces.js code), or "" for the one their name draws */
  fiesta: true,         /* the papel picado and the bulbs over the table */
  music: true,          /* the trio in the corner */
  coachHold: true,      /* a tip stays until "Got it"; off, it fades on its own */
  hands: 0,             /* hands this player has finished — the first two are learning */
  id: ""                /* this phone, so a chair it drops is given back to it */
};
function load() {
  try {
    var raw = JSON.parse(localStorage.getItem(SAVE) || "null");
    if (raw && raw.v === 1) {
      P.name = Net.cleanName(raw.name || "");
      P.view3d = raw.view3d !== false;
      P.level = Rt.migrate(raw.level) || null;
      P.pace = PACES[raw.pace] ? raw.pace : "relaxed";
      P.coach = raw.coach !== false;
      P.sound = raw.sound !== false;
      P.grade = raw.grade !== false;
      P.seen = raw.seen || {};
      P.career = Car.clean(raw.career);
      P.face = Net.cleanFace(raw.face);
      P.fiesta = raw.fiesta !== false;
      P.music = raw.music !== false;
      P.coachHold = raw.coachHold !== false;
      P.hands = Math.max(0, parseInt(raw.hands, 10) || 0);
      P.fresh = false;
      if (typeof raw.id === "string" && /^[a-z0-9]{6,16}$/.test(raw.id)) P.id = raw.id;
      if (raw.rules) P.rules = R.houseRules(raw.rules);
      if (raw.skin) P.skin = Sk.clean(raw.skin);
    }
  } catch (e) { /* a corrupt save is quietly retired rather than fatal */ }
  if (!P.skin) P.skin = Sk.clean(Sk.PRESETS[0]);
  /* a newcomer's table is unhurried: nothing is assumed, nothing is rushed */
  if (P.fresh !== false) { P.fresh = true; P.pace = "slow"; }
  if (!P.name) P.name = "";
  if (!P.career) P.career = Car.fresh();
  P.rating = Rt.load(function (k) { return localStorage.getItem(k); });
  /* a newcomer is seated against the pareja the score suggests */
  if (!P.level) P.level = Rt.suggestLevel(P.rating);
  if (!P.id) P.id = (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12);
  Snd.on = P.sound;
  Net.id = P.id;
  Net.face = P.face;
  document.documentElement.classList.toggle("noFiesta", !P.fiesta);
}
function saveRating() {
  Rt.save(P.rating, function (k, v) { localStorage.setItem(k, v); return true; });
}
function save() {
  try {
    localStorage.setItem(SAVE, JSON.stringify({
      v: 1, name: P.name, skin: P.skin, view3d: P.view3d, level: P.level, pace: P.pace,
      rules: P.rules, seen: P.seen, coach: P.coach, sound: P.sound, grade: P.grade,
      career: P.career, id: P.id, face: P.face, fiesta: P.fiesta, music: P.music,
      coachHold: P.coachHold, hands: P.hands
    }));
  } catch (e) { /* private browsing; the game still plays */ }
}

/* ---------- the game ---------- */
var G = {
  mode: "solo",         /* solo | host | guest */
  match: null, st: null,
  view: null,
  mySeat: 0,
  names: { 0: "You", 1: "Beto", 2: "Lupe", 3: "Chuy" },
  sel: null,            /* the bone lifted out of your hand */
  thinking: -1,         /* which seat is deciding, so the table can see  */
  lastNote: null,       /* what just happened, in a few words            */
  anim: null,
  busy: false,
  hintOn: false,
  lastIdx: -1,
  lastAt: 0,            /* when the last bone landed, for the glow        */
  handNo: 0,
  hint: null,           /* the end the hint chose for the lifted bone     */
  lean: null,           /* the end the room leans to, for a lifted bone that fits both */
  leanKey: "",          /* the position a lean was last counted for       */
  rv: null,             /* the reviewer's verdicts for this position, kept for the grade */
  drag: null,           /* a bone in the player's fingers: {tile, x, y, over} */
  press: null,          /* a finger that has landed on a bone and not yet moved */
  moods: {},            /* what each face is doing, and until when        */
  faces: {},            /* face codes that came with the names at a table */
  hs: null,             /* this hand, for the record: sharp plays, feeds  */
  endKey: ""            /* which hand the end sheet last scored           */
};
var BOT_NAMES = ["Beto", "Lupe", "Chuy", "Nacho", "Tere", "Memo", "Rosa", "Paco"];
/* names for a phone whose owner left the box empty — so two friends who
   both skip it still arrive as two people */
var SPARE_NAMES = ["Toño", "Lalo", "Nena", "Kiko", "Chato", "Güera", "Pepe", "Flaca", "Beba", "Tavo"];
function myName() {
  if (!P.name) { P.name = SPARE_NAMES[Math.floor(Math.random() * SPARE_NAMES.length)]; save(); }
  return P.name;
}
/* a name for a chair the house is playing, never one a person at the
   table is already using — two "Chuy"s at one table is one too many */
function botName(seat, taken) {
  var used = {};
  for (var k in taken) if (Object.prototype.hasOwnProperty.call(taken, k) && +k !== seat) used[String(taken[k]).toLowerCase()] = 1;
  used[String(P.name || "").toLowerCase()] = 1;
  for (var i = 0; i < BOT_NAMES.length; i++) {
    var n = BOT_NAMES[(seat - 1 + i + BOT_NAMES.length) % BOT_NAMES.length];
    if (!used[n.toLowerCase()]) return n;
  }
  return "Seat " + (seat + 1);
}
function freshHandStats() { return { sharp: 0, graded: 0, feeds: 0, hangs: 0, moves: [] }; }

/* ---------- the canvas ---------- */
var tableCv = $("table"), overCv = $("overlay");
var gfx = null, over = null;

/* A canvas can only ever hand out one kind of context. Ask a canvas
   that has given you a WebGL context for a 2D one and you get null, for
   the rest of its life — so switching from the 3D table to the flat one
   on the same element leaves the flat renderer with nothing to draw on,
   and the table quietly freezes. (It did. The browser check caught it;
   nothing in node ever could, because node has no canvas at all.)

   So the element is replaced rather than reused. It is cheap, it
   happens twice in a session at most, and it is the only way to be sure
   the new renderer starts from a clean surface. */
function freshCanvas(old) {
  var n = document.createElement("canvas");
  n.id = old.id;
  n.className = old.className;
  old.parentNode.replaceChild(n, old);
  return n;
}

function makeRenderers() {
  if (gfx && gfx.destroy) gfx.destroy();
  gfx = null;
  tableCv = freshCanvas(tableCv);
  overCv = freshCanvas(overCv);
  if (P.view3d) {
    var g3 = new window.Gfx3D(tableCv);
    if (g3.ok) gfx = g3;
    else tableCv = freshCanvas(tableCv);   /* it took a WebGL context and failed; start over for 2D */
  }
  if (!gfx) {
    gfx = new window.Gfx2D(tableCv);
    if (P.view3d) {
      /* asked for 3D and could not have it — say so once, then get on
         with the game rather than blocking on a dialog */
      P.view3d = false;
      toast("No 3D on this browser — playing flat.");
    }
  }
  watchContext(tableCv);
  over = new window.Gfx2D(overCv);
  over.transparent = true;
  gfx.setSkin(P.skin);
  over.setSkin(P.skin);
  sized = false;
  resize();
}

var sized = false;
function resize() {
  var st = $("stage");
  var w = st.clientWidth, h = st.clientHeight;
  if (!w || !h) return;
  var dpr = window.devicePixelRatio || 1;
  gfx.resize(w, h, dpr);
  over.resize(w, h, dpr);
  var cf = $("confetti");
  if (cf) { cf.width = Math.round(w * dpr); cf.height = Math.round(h * dpr); cf.style.width = w + "px"; cf.style.height = h + "px"; }
  if (Cn) Cn.refresh();
  measureHud();
  sized = true;
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", function () { setTimeout(resize, 220); });

/* The 3D context is lost whenever a phone sleeps in a pocket, and the
   game carries on flat rather than showing a dead rectangle. Bound
   inside `makeRenderers` because the canvas element is replaced on
   every switch — a listener attached once at boot would be sitting on a
   node that is no longer in the page. */
function watchContext(cv) {
  cv.addEventListener("webglcontextlost", function (e) {
    e.preventDefault();
    setTimeout(function () {
      if (gfx && !gfx.ok) {
        P.view3d = false; save();
        makeRenderers();
        toast("Lost the 3D table — same game, flat.");
      }
    }, 60);
  }, false);
}

/* ---------- building the scene ---------- */
function scene() {
  var v = G.view;
  var line = v ? v.line : [];
  var bound = boundFor();
  var t = L.table(line, { bound: bound });
  var playable = {}, ghosts = [];
  var mine = v && v.turn === G.mySeat && !G.busy;
  if (mine && v) {
    var mv = AI.movesFor(v);
    for (var i = 0; i < mv.length; i++) {
      if (!playable[mv[i].tile]) playable[mv[i].tile] = [];
      playable[mv[i].tile].push(mv[i].end);
    }
    if (G.sel !== null && playable[G.sel]) {
      /* the slot is where the bone will actually lie — worked out by
         laying it, so a slot at a fold turns the corner and a mula's
         slot stands crosswise, exactly as the bone will */
      var ends = playable[G.sel];
      for (var k = 0; k < ends.length; k++) {
        var trial = L.table(line.concat([{ tile: G.sel, end: ends[k], flip: false, dbl: isDbl(G.sel), seat: G.mySeat }]), { bound: bound });
        var gb = trial.bones[trial.bones.length - 1];
        ghosts.push({ end: ends[k], x: gb.x, y: gb.y, h: gb.h, rot: gb.rot, dbl: gb.dbl });
      }
    }
  }
  /* the other three hands are on the plates now, not on the canvas */
  return {
    view: v, table: t, hand: v ? v.hand : [],
    playable: playable, selected: G.sel, ghosts: ghosts,
    lastIdx: G.lastIdx, lastAge: G.lastAt ? performance.now() - G.lastAt : 0, anim: G.anim,
    yourTurn: mine, topPad: hudBottom(), botPad: handTop(), bound: bound,
    drag: G.drag, hover: G.drag ? G.drag.over : null, lean: (G.sel !== null && ghosts.length === 2) ? G.lean : null,
    breathe: !RM
  };
}
/* how much of the top of the stage the plates and the score take, and
   how much of the bottom the hand takes — the table is fitted between */
var hudH = 112;
function hudBottom() { return hudH; }
function handTop() {
  var h = $("stage").clientHeight || 600;
  return Math.min(h * 0.20, 104) + 24;
}
function measureHud() {
  var lp = $("lastPlay");
  var top = $("top");
  if (lp && top) hudH = top.offsetTop + lp.offsetTop + Math.max(18, lp.offsetHeight) + 6;
  document.documentElement.style.setProperty("--handH", Math.round(handTop()) + "px");
  document.documentElement.style.setProperty("--hudH", Math.round(hudH) + "px");
}
function isDbl(t) { return R.isDouble(t); }
/* how far the line may run before it folds — a phone held upright folds
   sooner than a tablet on its side, which is the whole point of the
   bound being a parameter */
function boundFor() {
  var w = $("stage").clientWidth || 390, h = $("stage").clientHeight || 600;
  /* A phone held upright has more height than width to spare, so its
     line folds early and grows in rows — big bones in several rows read
     far better than tiny ones in one long strip. It was folding at 6½
     units on a 390×780 phone, which drew every bone at about two-thirds
     the size the screen could give it. */
  return Math.max(4, Math.min(16, w / Math.max(1, h - hudH - handTop()) * 5.4));
}

/* ---------- the frame loop ---------- */
var last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!sized || !G.view) return;
  var dt = Math.min(64, now - last) / 1000;
  last = now;
  if (G.anim) {
    G.anim.t += dt / G.anim.dur;
    /* the clack is heard the instant the bone meets the wood, not when
       the animation is tidied away a frame or two later */
    if (G.anim.t >= 0.86 && !G.anim.heard) {
      G.anim.heard = true;
      Snd.clack(G.anim.hard);
      if (G.anim.mine) Snd.buzz(10);
      /* a mula slammed down is felt through the table */
      if (G.anim.hard >= 1 && gfx.kind === "3d" && gfx.kick && !reducedMotion()) gfx.kick(0.7);
      G.lastAt = performance.now();
      if (G.anim.mine && G.pendingGrade) { var pg = G.pendingGrade; G.pendingGrade = null; setTimeout(function () { showGrade(pg); }, 120); }
    }
    if (G.anim.t >= 1) { G.anim = null; }
  }
  var sc = scene();
  if (gfx.kind === "3d") {
    gfx.draw(sc, now);
    over.drawHand(sc, now);
  } else {
    gfx.draw(sc, now);
    over.g.clearRect(0, 0, over.cv.width, over.cv.height);
  }
  confettiStep(dt);
}
requestAnimationFrame(frame);

/* ---------- taps on the table ---------- */
function stagePoint(e) {
  var r = $("stage").getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
/* Two ways to put a bone down, and both are the same gesture at a real
   table: tap it (one tap plays it where it fits, or lifts it to choose an
   end), or pick it up and carry it to the end you mean. A finger that
   lands on a bone and moves is carrying; one that lands and lifts is a
   tap. The carried bone follows the finger, the slot it is over fills
   in, and letting go over an end plays it there. Letting go anywhere
   else puts it back — nothing is played by accident. When a bone fits
   only one end, letting go anywhere on the table plays it: there is
   nothing to choose. */
function handGfx() { return gfx.kind === "3d" ? over : gfx; }
function endUnder(p) {
  if (gfx.kind === "3d") {
    var got = gfx.hitTable(p.x, p.y, scene());
    return got ? got.end : null;
  }
  var g2 = gfx.hit(p.x, p.y);
  return g2.kind === "end" ? g2.end : null;
}
$("stage").addEventListener("pointerdown", function (e) {
  if (!G.view || G.busy) return;
  /* the buttons that float on the stage handle themselves */
  if (e.target && e.target.closest && e.target.closest("#endPick, #me, #netChip")) return;
  var p = stagePoint(e);
  /* the hand is drawn by the same painter in both renderers — onto the
     overlay over the 3D table, onto the table itself when it is flat —
     so the tap target is identical whichever is on. Ask the one that
     drew it: the other's rectangles are from before the last switch. */
  var h = handGfx().hit(p.x, p.y);
  if (h.kind === "hand") {
    G.press = { tile: G.view.hand[h.i], x: p.x, y: p.y, id: e.pointerId };
    try { $("stage").setPointerCapture(e.pointerId); } catch (x) { /* older browsers; the tap still works */ }
    return;
  }
  if (G.view.turn !== G.mySeat) return;
  var end = endUnder(p);
  if (end && G.sel !== null) tryPlay(G.sel, end);
  else if (G.sel !== null) { G.sel = null; G.hint = null; syncAll(); }
});
$("stage").addEventListener("pointermove", function (e) {
  var p = stagePoint(e);
  if (G.drag) {
    G.drag.x = p.x; G.drag.y = p.y;
    var wasOver = G.drag.over;
    G.drag.over = endsFor(G.drag.tile).indexOf(endUnder(p) || "") >= 0 ? endUnder(p) : null;
    if (G.drag.over && G.drag.over !== wasOver) Snd.tick();
    return;
  }
  if (!G.press || !G.view) return;
  if (Math.hypot(p.x - G.press.x, p.y - G.press.y) < 9) return;
  /* it is being carried, not tapped */
  var tile = G.press.tile;
  G.press = null;
  if (G.view.turn !== G.mySeat || G.busy) return;
  var ends = endsFor(tile);
  if (!ends.length) { Snd.tick(); toast("That one doesn't fit — the ends are " + G.view.left + " and " + G.view.right + "."); return; }
  G.sel = tile; G.hint = null;
  G.drag = { tile: tile, x: p.x, y: p.y, over: null, ends: ends };
  if (ends.length === 2) leanFor(tile);
  Snd.buzz(8);
  syncAll();
});
function endPointer(e) {
  var p = stagePoint(e);
  if (G.drag) {
    var d = G.drag; G.drag = null;
    var end = d.over;
    /* one possible end: anywhere on the table above the hand will do */
    if (!end && d.ends.length === 1 && p.y < handTopPx()) end = d.ends[0];
    if (end) { tryPlay(d.tile, end); return; }
    /* put back — lifted, if it still needs an end chosen */
    if (d.ends.length < 2) G.sel = null;
    Snd.tick();
    syncAll();
    return;
  }
  if (G.press) { var t = G.press.tile; G.press = null; pickBone(t); }
}
$("stage").addEventListener("pointerup", endPointer);
$("stage").addEventListener("pointercancel", function () { G.press = null; if (G.drag) { G.drag = null; syncAll(); } });
function handTopPx() { return ($("stage").clientHeight || 600) - handTop(); }

/* ---------- which end, when a bone fits both ----------
   The room says which end it would choose — a star on the slot and on
   the button — so a player who has already picked their bone is never
   left guessing between two numbers that look the same. The lean comes
   from the same reviewer that grades the play afterwards (the same
   imagined deals for both ends), kept and reused so the grade costs
   nothing extra. It is shown while the coach is on, and it is help:
   each lean weighs the match a third of what a hint does. */
function leanFor(tile) {
  G.lean = null;
  if (!P.coach || !G.view) return;
  var rv = reviewNow();
  if (!rv) return;
  var vL = AI.valueOf(rv, { tile: tile, end: "L" }), vR = AI.valueOf(rv, { tile: tile, end: "R" });
  if (vL === null || vR === null) return;
  if (Math.abs(vL - vR) < 1e-9) return;              /* nothing to prefer */
  G.lean = vL > vR ? "L" : "R";
  var key = positionKey();
  if (G.mm && G.mm.rated && G.leanKey !== key) { G.leanKey = key; G.mm.leans = (G.mm.leans || 0) + 1; }
}
function positionKey() {
  var v = G.view;
  return v ? (G.st ? G.st.seed : 0) + ":" + v.line.length + ":" + v.passes + ":" + v.turn : "";
}
function reviewNow() {
  var key = positionKey();
  if (G.rv && G.rv.key === key) return G.rv.rv;
  var rv;
  try { rv = AI.review(G.view); } catch (e) { return null; }
  G.rv = { key: key, rv: rv };
  return rv;
}

function endsFor(tile) {
  var mv = AI.movesFor(G.view), ends = [];
  for (var i = 0; i < mv.length; i++) if (mv[i].tile === tile) ends.push(mv[i].end);
  return ends;
}
function pickBone(tile) {
  if (tile === undefined) return;
  if (G.view.turn !== G.mySeat) {
    /* not your turn: still let a bone be looked at, and say whose turn */
    toast("It's " + nameOf(G.view.turn) + "'s turn — plan your next bone.");
    return;
  }
  var ends = endsFor(tile);
  if (!ends.length) {
    toast(G.view.left < 0 ? "That one can't open this hand." :
      "That one doesn't fit — the ends are " + G.view.left + " and " + G.view.right + ".");
    Snd.tick();
    return;
  }
  /* Two steps, always: pick the bone up, then lay it down where you
     mean — on the marked spot, with the button, or by carrying it. A
     single tap used to play a bone that fitted only one end, which was
     quick and also the commonest way to play a bone you had not meant
     to. Tapping the lifted bone again puts it back. */
  G.sel = (G.sel === tile) ? null : tile;
  var hi = G.view.hand.indexOf(tile);
  if (G.sel === null) { G.hint = null; G.lean = null; Snd.note(hi, G.view.hand.length, true); }
  else { if (ends.length === 2) leanFor(tile); else G.lean = null; Snd.note(hi, G.view.hand.length); sayMoment({ k: "pickedUp", you: G.mySeat, ends: ends.length }); }
  syncAll();
}

function tryPlay(tile, end) {
  G.lastHandI = G.view ? G.view.hand.indexOf(tile) : 0;
  G.sel = null; G.hint = null; G.drag = null; G.press = null;
  /* how did that compare? Asked before the bone goes down, from this
     chair's own view — so a joined phone grades its own plays without
     the host's help, and nothing is graded with knowledge the player
     did not have */
  judge({ tile: tile, end: end });
  if (G.mode === "guest") {
    Net.send({ k: "mv", tile: tile, end: end });
    G.busy = true;
    setTimeout(function () { G.busy = false; }, 900);
    syncAll();
    return;
  }
  doPlay(G.mySeat, { tile: tile, end: end });
}

/* ---------- reviewing your plays ----------
   Every play with a real choice is read by the reviewer — the same
   imagined deals for every bone you could have played — whether or not
   the verdict is shown: the match's accuracy, and with it the rated
   score's second opinion, must not depend on a display setting. */
var gradeT = 0;
function judge(mv) {
  if (!G.view) return;
  var v = G.view;
  if (AI.movesFor(v).length < 2) return;
  var rv = reviewNow();
  if (!rv) return;
  var played = AI.valueOf(rv, mv);
  if (played === null) return;
  var acc = Rt.moveAccuracy(rv.bestValue, played);
  var mark = { best: rv.bestValue, played: played };
  if (G.mm) G.mm.moves.push(mark);
  if (!G.hs) G.hs = freshHandStats();
  G.hs.moves.push(mark);
  G.hs.graded++;
  record({ k: "graded" });
  var vd = Rt.verdict(acc);
  if (vd.id === "sharp") { G.hs.sharp++; record({ k: "sharp" }); }
  if (!P.grade) return;
  /* the words for a costly play are only worth the AI's time when they
     will actually be said */
  var opts = { names: G.names };
  if (vd.id === "miss" && P.coach) { try { opts.analysis = AI.analyse(v, { level: "maestro" }); } catch (e) {} }
  var gr = C.grade(v, rv, mv, opts);
  if (!gr) return;
  /* said when the bone lands, not when the finger lifts: the table
     answers the play, and a play is the bone on the wood */
  G.pendingGrade = gr;
}
var FEEL = { sharp: "¡Eso! A great play", good: "A good play", ok: "It works", miss: "There was a better one" };
/* ---------- how a play is answered ----------
   The verdict is immediate, musical and warm. A streak of sharp plays
   grows — ×2, ×3 — with a longer run of notes each time and a small
   shower of paper at three, because a reward that is sometimes bigger
   is the one people chase. Firsts are marked once and then never again:
   the first sharp play, the first streak. A costly play is answered as a
   shrug, with Don Chuy's better one, never as a buzzer. */
function showGrade(gr) {
  var el = $("grade");
  var sharp = gr.id === "sharp";
  G.streak = sharp ? (G.streak || 0) + 1 : 0;
  var first = sharp && !P.seen.firstSharp, firstRun = G.streak === 3 && !P.seen.firstStreak;
  if (first) { P.seen.firstSharp = 1; save(); }
  if (firstRun) { P.seen.firstStreak = 1; save(); }
  el.className = gr.id + (G.streak >= 2 ? " streak" : "") + (first || firstRun ? " first" : "");
  mood(G.mySeat, sharp ? "grin" : gr.id === "miss" ? "ouch" : "happy", 2200);
  var head = gr.icon + " " + gr.label + (G.streak >= 2 ? " ×" + G.streak : "");
  var feel = first ? "Your first Sharp — remember what that felt like" :
             firstRun ? "¡Racha! Three sharp in a row" :
             G.streak >= 2 ? "¡Sigue así! Keep it going" : (FEEL[gr.id] || "");
  el.innerHTML = "<b>" + esc(head) + "</b><small>" + esc(feel) + "</small>";
  void el.offsetWidth;
  el.classList.add("on");
  clearTimeout(gradeT);
  gradeT = setTimeout(function () { el.classList.remove("on"); }, first || firstRun ? 3200 : 2300);
  Snd.verdict(gr.id, G.streak);
  if (first || G.streak === 3) { confetti(first ? 60 : 40); }
  if (sharp && G.mode === "solo" && Math.random() < (G.streak >= 2 ? 0.7 : 0.35)) {
    chatter(R.partner(G.mySeat), G.streak >= 2 ? ["¡Órale!", "¡Eso es!", "¡Qué racha!"] : ["¡Bien!", "¡Eso!", "Así, compa"], 300);
  }
  /* a costly play is worth a sentence, but not every time — a coach who
     comments on everything is a coach you stop reading */
  if (gr.id === "miss" && P.coach && gr.say) chuy(gr.say, gr.why);
  sayMoment({ k: "landed", you: G.mySeat });
}

/* ---------- the hand, on the host or solo ---------- */
function doPlay(seat, mv) {
  var st = G.st;
  if (!st || st.over || st.turn !== seat) return false;
  var fromIdx = st.line.length;
  st.error = null;
  R.play(st, mv);
  if (st.error) { toast(st.error); st.error = null; return false; }
  var ev = { k: "play", seat: seat, tile: mv.tile, end: st.line[fromIdx].end, idx: fromIdx,
             feed: fedBy(st, fromIdx), out: st.over && st.result && st.result.how === "domino" };
  happen(ev);
  afterMove(ev);
  return true;
}
function doPass(seat) {
  var st = G.st;
  if (!st || st.over || st.turn !== seat) return false;
  st.error = null;
  var lastPlay = st.line.length ? st.line[st.line.length - 1] : null;
  var fresh = st.passes === 0;       /* the first pass since that bone went down */
  R.pass(st);
  if (st.error) { st.error = null; return false; }
  var ev = { k: "pass", seat: seat, ends: [st.left, st.right],
             by: (fresh && lastPlay) ? lastPlay.seat : -1, shut: st.over };
  happen(ev);
  afterMove(ev);
  return true;
}
/* Did this bone go down on an end your own partner left? That is a
   pareja working: one of you opened a number, the other answered it. */
function fedBy(st, idx) {
  var p = st.line[idx];
  if (!p || idx === 0) return -1;
  for (var i = idx - 1; i >= 0; i--) {
    var q = st.line[i];
    if (q.end === p.end || q.end === "S") {
      if (q.seat === R.partner(p.seat) && idx - i <= 3) return q.seat;
      return -1;
    }
  }
  return -1;
}

/* ---------- what just happened, said once for everyone ----------
   Every play and every pass goes through here — on a solo table, on the
   host, and on every joined phone (the host sends the same event along
   with the new view) — so the bubbles, the sounds, the commentary and
   Don Chuy's remarks are the same at all four seats. */
function happen(ev) {
  var me = G.mySeat, mate = R.partner(me);
  if (ev.k === "play") {
    G.lastIdx = ev.idx;
    G.lastAt = 0;                 /* it glows from the moment it lands */
    startAnim(ev.idx, ev.seat, R.isDouble(ev.tile) || ev.out);
    note(ev.seat, nameOf(ev.seat) + " played the " + C.boneName(ev.tile));
    if (ev.seat !== me) { bubble(ev.seat, C.boneName(ev.tile), "", 1500); mood(ev.seat, ev.out ? "party" : "happy", ev.out ? 4000 : 1400); }
    if (ev.idx === 0) sayMoment({ k: "salida", seat: ev.seat, tile: ev.tile, you: me });
    else sayMoment({ k: "play", seat: ev.seat, you: me, tile: ev.tile, dbl: R.isDouble(ev.tile) });
    /* a pareja answering each other */
    if (ev.feed >= 0 && R.team(ev.seat) === R.team(me)) {
      if (ev.feed === me) {
        if (!G.hs) G.hs = freshHandStats();
        if (G.hs.feeds < 3) { G.hs.feeds++; record({ k: "feed" }); }
        if (Math.random() < 0.55) chatter(ev.seat, ["¡Gracias, compa!", "¡Eso!", "Bien dado", "¡Ándale!"]);
      }
    }
  } else if (ev.k === "pass") {
    Snd.knock();
    bubble(ev.seat, "¡Paso!", "paso", 1700);
    mood(ev.seat, "paso", 2200);
    note(ev.seat, nameOf(ev.seat) + " · ¡paso!");
    sayMoment({ k: "pass", seat: ev.seat, you: me, ends: ev.ends });
    if (ev.by >= 0 && ev.by !== ev.seat) {
      var hungOpp = R.isOpponent(ev.by, ev.seat);
      if (hungOpp) mood(ev.by, "grin", 2000);
      sayMoment({ k: "hung", seat: ev.seat, by: ev.by, you: me });
      if (ev.by === me && hungOpp) {
        if (!G.hs) G.hs = freshHandStats();
        if (G.hs.hangs < 3) { G.hs.hangs++; record({ k: "hang" }); }
        /* the thing the tip taught, done: a different chime from a verdict */
        if (P.seen.theyPaso) Snd.lesson();
        if (Math.random() < 0.6) chatter(mate, ["¡Eso!", "¡Ahorcado!", "Je je", "¡Así se juega!"], 500);
      } else if (ev.by === me && ev.seat === mate) {
        chatter(mate, ["Ay, compadre…", "Uy…", "¿Y yo qué?"], 400);
      } else if (R.team(ev.by) !== R.team(me) && R.team(ev.seat) === R.team(me) && Math.random() < 0.4) {
        chatter(ev.by, ["Je je", "Ni modo", "¿Y ahora?"], 500);
      }
    }
  }
}

/* a bone comes down from the seat that played it — out of your own hand
   along the bottom, or from the plate of whoever is across or beside */
function startAnim(idx, seat, hard) {
  var t = L.table(G.st ? G.st.line : G.view.line, { bound: boundFor() });
  var b = t.bones[idx];
  if (!b) { G.lastAt = performance.now(); return; }
  var rel = (seat - G.mySeat + 4) % 4;
  var away = 9;
  /* layout y runs down the screen; the plates are along the top */
  var from = [[0, away], [away * 0.8, -away * 0.8], [0, -away], [-away * 0.8, -away * 0.8]][rel];
  var fx = b.x + from[0], fy = b.y + from[1];
  /* Better: from where that player *is* on the screen — their plate, or
     the bone's own place in your hand — turned back into table units
     through the renderer's camera, so the bone visibly leaves the person
     who played it. Capped so a plate at the top of the screen, which the
     camera sees a long way off, does not launch it from the next room. */
  var src = fromWhere(seat, idx);
  if (src) {
    var dx = src.x - b.x, dy = src.y - b.y, dd = Math.hypot(dx, dy);
    if (dd > 0.5) { var cap = Math.min(dd, 11) / dd; fx = b.x + dx * cap; fy = b.y + dy * cap; }
  }
  G.anim = {
    idx: idx, t: 0, dur: pace().anim,
    fromX: fx, fromY: fy,
    fromRot: b.rot + (rel % 2 ? 90 : 0) + (rel === 0 ? 0 : (rel === 1 ? -25 : 25)),
    hard: hard ? 1 : 0.6, mine: seat === G.mySeat
  };
}

function fromWhere(seat, idx) {
  var st = $("stage").getBoundingClientRect(), x, y;
  if (seat === G.mySeat) {
    /* the bone just left the hand: the slot its neighbours still mark */
    var hg = handGfx(), r = hg.hand && hg.hand.length ? hg.hand[Math.min(G.lastHandI || 0, hg.hand.length - 1)] : null;
    if (!r) return null;
    x = r.x + r.w / 2; y = r.y + r.h / 2;
  } else {
    var pl = $("plate" + ((seat - G.mySeat + 4) & 3));
    if (!pl) return null;
    var pr = pl.getBoundingClientRect();
    x = pr.left + pr.width / 2 - st.left; y = pr.top + pr.height / 2 - st.top;
  }
  var p = gfx.pointOnTable ? gfx.pointOnTable(x, y) : null;
  return p && isFinite(p.x) && isFinite(p.y) ? p : null;
}

function afterMove(ev) {
  refreshView();
  syncAll();
  saveMatch();
  if (G.mode === "host") Net.dealViews(G.st, hostExtra({ ev: ev, last: G.lastIdx }));
  if (G.st.over) {
    clearTimeout(turnT);
    /* let the last bone land, and the table look at it, before the count */
    turnT = setTimeout(endHand, Math.max(900, pace().settle + 500));
    return;
  }
  /* beat three: a pause to look at what just landed. The bone's own
     animation runs a good half second, so starting the next player's
     thinking immediately means the table never rests — which is what
     made three machines feel like one blur. */
  clearTimeout(turnT);
  turnT = setTimeout(scheduleTurn, pace().settle + (ev && ev.k === "pass" ? 250 : 0));
}

/* what just happened, in a few words under the plates. The point of
   the room is that you can read the table; that starts with being able
   to see who did what. */
function note(seat, text) {
  G.lastNote = { seat: seat, text: text };
  syncAll();
}

/* ---------- the pace of a hand ----------
   Three players moving as fast as a machine can decide is not a game you
   can follow — bones appear on the table and you are left working out
   backwards who put them there. A table has a rhythm: somebody thinks,
   somebody plays, everybody looks at it, the next one starts.

   So a turn is three beats rather than one timeout. The seat whose turn
   it is says so before anything happens, the play lands, and there is a
   pause afterwards to look at what landed before the next player starts
   thinking. `PACE` scales all three together, and the flight of the bone
   with them.

   The first version's "relaxed" still felt like being rushed: a whole
   turn of somebody else's was about two seconds, and the bone was in
   the air for a third of one. Relaxed is now roughly a person's pace —
   about three seconds a turn, with the bone visibly carried to the
   table — and the old relaxed is Brisk. */
var PACES = {
  slow:    { id: "slow",    label: "Unhurried", note: "Time to think about every play.", think: 2600, spread: 1600, settle: 1700, anim: 0.84 },
  relaxed: { id: "relaxed", label: "Relaxed", note: "A person's pace: a look at the table, then the bone.", think: 1800, spread: 1300, settle: 1300, anim: 0.70 },
  brisk:   { id: "brisk",   label: "Brisk",   note: "The usual pace of a table in a hurry.", think: 800, spread: 500, settle: 650, anim: 0.48 },
  quick:   { id: "quick",   label: "Quick",   note: "For when you just want the hand over.", think: 220, spread: 160, settle: 160, anim: 0.32 }
};
function pace() { return PACES[P.pace] || PACES.relaxed; }
/* How long this seat thinks about *this* bone. A person with one bone
   that fits puts it down almost at once; a person with four that fit
   looks at the table for a while. So the think is scaled by the choice:
   forced plays come quick, real decisions take their time, and no two
   turns take the same time — which is the whole difference between a
   table of people and three timers. */
function thinkFor(st, seat) {
  var p = pace(), n = R.moves(st, seat).length;
  var k = n <= 1 ? 0.5 : n === 2 ? 0.9 : n === 3 ? 1.1 : 1.3;
  /* late in a hand, with few bones, the counting is done — and quicker */
  if (st.hands[seat].length <= 2) k *= 0.75;
  var r = Math.random();
  return p.think * k * (0.75 + r * 0.5) + Math.random() * p.spread * k;
}

var turnT = 0;
function scheduleTurn() {
  clearTimeout(turnT);
  var st = G.st;
  if (!st || st.over) return;
  var seat = st.turn;
  G.thinking = -1;

  /* a newcomer reading a tip is not kept waiting by the machines */
  if (!isHuman(seat) && P.coach && P.coachHold && learning() && coachUp()) {
    syncAll();
    turnT = setTimeout(scheduleTurn, 400);
    return;
  }

  if (isHuman(seat)) {
    if (!R.canPlay(st, seat)) {
      /* a human who cannot play still has to say it out loud — but
         making them tap a button they have no choice about is theatre,
         so it is said for them after a beat (long enough to see why) */
      if (seat === G.mySeat) note(seat, "Nothing fits — you knock: paso.");
      else if (G.hot && seat === 2) note(seat, nameOf(seat) + " has nothing that fits — paso.");
      turnT = setTimeout(function () { doPass(seat); }, pace().think + 500);
    } else if (seat === G.mySeat) {
      yourTurn();
    } else if (G.hot) {
      /* the other person on this phone: the table is covered until they
         say it is them holding it */
      curtain(seat);
    }
    if (G.mode === "host") Net.broadcast({ k: "beat", thinking: -1, turn: seat });
    syncAll();
    return;
  }

  /* beat one: this seat is thinking, and the table can see who */
  var p = pace();
  G.thinking = seat;
  if (G.mode === "host") Net.broadcast({ k: "beat", thinking: seat, turn: seat });
  syncAll();
  turnT = setTimeout(function () {
    if (!G.st || G.st.over || G.st.turn !== seat) return;
    G.thinking = -1;
    /* beat two: the play */
    if (!R.canPlay(G.st, seat)) { doPass(seat); return; }
    var v = R.publicView(G.st, seat);
    var a = AI.analyse(v, { level: Rt.aiLevel(P.level) });
    if (a.move) doPlay(seat, a.move); else doPass(seat);
  }, thinkFor(st, seat));
}
/* it has come round to you: say so, quietly, three ways */
function yourTurn() {
  Snd.turn();
  Snd.buzz(18);
  if (G.view) sayMoment({ k: "yourTurn", you: G.mySeat, line: G.view.line.length });
}
function isHuman(seat) {
  if (G.mode === "solo") return seat === 0 || (!!G.hot && seat === 2);
  if (G.mode === "host") {
    if (seat === 0) return true;
    for (var i = 0; i < Net.peers.length; i++) if (Net.peers[i].seat === seat) return true;
    return false;
  }
  return false;
}

function refreshView() {
  if (G.mode !== "guest" && G.st) G.view = R.publicView(G.st, G.mySeat);
}

/* ---------- two of you on one phone ----------
   Partners, across the table from each other, taking turns holding the
   phone. Between one's turn and the other's the table is covered — the
   hands are the whole game, and a glance at a partner's bones is a
   glance too many. The curtain names who it is for, with their face, and
   lifts on their word. Nothing else about the room changes: the chair
   the phone is "sitting in" moves to whoever is holding it, and the
   plates, the hand and the coach follow. Not rated: the ladder only
   measures one person against the house. */
function curtain(seat) {
  var el = $("ovPass");
  $("passFace").innerHTML = faceSvg(seat, "happy", 96, "pass");
  $("passWho").textContent = "Pass the phone to " + nameOf(seat);
  $("passGo").textContent = "I'm " + nameOf(seat) + " — show my bones";
  el.classList.remove("hide");
}
press($("passGo"), function () {
  var st = G.st;
  shut("ovPass");
  if (!st || st.over || !G.hot) return;
  G.mySeat = st.turn;
  G.sel = null; G.hint = null; G.lean = null; G.rv = null; G.drag = null;
  refreshView();
  syncAll();
  yourTurn();
});
function hotSeat(a, b) {
  stopLocal(true);
  G.mode = "solo"; G.mySeat = 0;
  G.hot = { names: [a, b] };
  G.names = { 0: a, 2: b };
  for (var s = 1; s < 4; s += 2) G.names[s] = botName(s, G.names);
  syncNetChip();
  newMatch();
}

/* ---------- the match, kept ----------
   A solo match is written down after every play, so a phone that is
   closed on it — a call, a pocket, a battery — opens again on a splash
   that offers the same hand back, same bones, same score, same rating
   stakes. A table with friends at it is remembered by the room instead
   (room.js), because the host holds the game. */
var MATCH_KEY = "dominotable.match";
function saveMatch() {
  if (G.mode !== "solo" || !G.match) return;
  try {
    localStorage.setItem(MATCH_KEY, JSON.stringify({
      v: 1, at: Date.now(), match: G.match, st: G.st, names: G.names, mySeat: G.mySeat,
      mm: G.mm, hs: G.hs, hot: G.hot, level: P.level, endKey: G.endKey
    }));
  } catch (e) { /* private browsing; the match still plays */ }
}
function loadMatch() {
  try {
    var o = JSON.parse(localStorage.getItem(MATCH_KEY) || "null");
    if (!o || o.v !== 1 || !o.match || !o.st || o.match.over) return null;
    if (!o.match.rules || !Array.isArray(o.match.scores) || !Array.isArray(o.st.hands)) return null;
    if (Date.now() - (o.at || 0) > 14 * 24 * 60 * 60 * 1000) return null;
    return o;
  } catch (e) { return null; }
}
function clearMatch() { try { localStorage.removeItem(MATCH_KEY); } catch (e) {} }
function resumeMatch(o) {
  stopLocal(true);
  G.mode = "solo";
  G.hot = o.hot || null;
  G.names = o.names || { 0: myName() };
  for (var s = 0; s < 4; s++) if (!G.names[s]) G.names[s] = s === 0 ? myName() : botName(s, G.names);
  G.mySeat = G.hot ? (o.mySeat || 0) : 0;
  G.match = o.match; G.st = o.st; G.mm = o.mm || { level: P.level, rated: false, hints: 0, leans: 0, moves: [] };
  G.hs = o.hs || freshHandStats();
  G.endKey = o.endKey || "";
  if (o.level && Rt.levelById(o.level)) P.level = o.level;
  G.lastIdx = G.st.line.length - 1; G.lastAt = performance.now(); G.anim = null;
  refreshView();
  begin("resume");
  if (G.st.over) {
    /* closed on the count: deal on */
    turnT = setTimeout(function () { nextHand(false); }, 600);
    return;
  }
  banner("Where you left it", "Mano " + (G.match.handNo + 1) + " · " + G.match.scores[R.team(G.mySeat)] + "–" + G.match.scores[1 - R.team(G.mySeat)], 1600);
  turnT = setTimeout(scheduleTurn, 900);
}

/* ---------- a hand begins ---------- */
function newMatch(level) {
  /* the hand is dealt: the table stops advertising itself but keeps its
     four letters, because that is the address latecomers — and anyone
     whose phone locked — come back to */
  if (G.mode === "host") Net.roomStarted();
  if (level && Rt.levelById(level)) { P.level = level; save(); }
  G.match = R.newMatch({ seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, rules: P.rules });
  G.handNo = 0;
  /* Every solo match is rated against the pareja across the table. A
     table with friends at it is not — half of it is people, and the
     ladder only measures the house. */
  G.mm = { level: P.level, rated: G.mode === "solo" && !G.hot, hints: 0, leans: 0, moves: [] };
  G.leanKey = "";
  nextHand(true);
}
/* Starting again over a match still in progress. Free while the match is
   young or close; a match left behind that was already lost is the loss
   it was, said first (rating.js, abandonResult). */
function leaving() {
  if (!G.mm || !G.mm.rated || !G.match || G.match.over) return null;
  var us = R.team(G.mySeat);
  return Rt.abandonResult({ hands: G.match.handNo, us: G.match.scores[us], them: G.match.scores[1 - us], target: G.match.rules.target });
}
function freshMatch(level, why) {
  var res = leaving();
  if (res === 0) {
    ask("This one counts as a loss", "You're well behind in a rated match, so starting again resigns it.",
      [["Resign and start again", function () { rate(0); newMatch(level); if (why) toast(why); }],
       ["Keep playing", null]]);
    return;
  }
  newMatch(level);
  if (why) toast(why);
}
/* a small question above everything; the last answer is the gentle one */
function ask(title, lead, answers) {
  $("askTitle").textContent = title;
  $("askLead").textContent = lead;
  var row = $("askRow");
  row.innerHTML = "";
  answers.forEach(function (a, i) {
    var b = document.createElement("button");
    b.className = "btn" + (i === 0 ? " primary wide" : "");
    b.textContent = a[0];
    row.appendChild(b);
    press(b, function () { shut("ovAsk"); if (a[1]) a[1](); });
  });
  open("ovAsk");
}
function nextHand(first) {
  clearTimeout(turnT);
  G.sel = null; G.hint = null; G.anim = null; G.lastIdx = -1; G.lastNote = null; G.thinking = -1;
  G.drag = null; G.press = null; G.lean = null; G.rv = null; G.moods = {}; tipQ.length = 0; G.streak = 0;
  G.hs = freshHandStats();
  G.st = R.dealHand(G.match);
  refreshView();
  saveMatch();
  G.busy = true;
  Snd.shuffle();
  if (G.mode === "host") Net.dealViews(G.st, hostExtra({ start: true, shuffling: true }));
  syncAll();
  shuffleTitle(first, function () {
    G.busy = false;
    if (G.mode === "host") Net.dealViews(G.st, hostExtra({ start: true }));
    syncAll();
    var opener = G.st.turn;
    if (P.hands === 0 && G.mode === "solo" && !P.seen.welcome) sayMoment({ k: "welcome", you: G.mySeat });
    if (G.st.mustLeadMula && opener === G.mySeat) {
      banner("La mula de seis", "It opens the first hand — play it", 1600);
    } else if (G.st.mustLeadMula) {
      banner(nameOf(opener) + " has the 6|6", "La mula de seis opens the first hand", 1400);
    } else if (opener === G.mySeat) {
      banner("You open", "Lead with what you're long in", 1300);
    } else {
      banner(nameOf(opener) + " opens", R.team(opener) === R.team(G.mySeat) ? "Your partner leads" : "", 1100);
    }
    turnT = setTimeout(scheduleTurn, 700);
  });
}

/* the shuffle: the bones are washed face down with both hands, and the
   hand is named as it starts */
function shuffleTitle(first, then) {
  var n = (G.match ? G.match.handNo : 0) + 1;
  var subs = ["lavando las fichas", "washing the bones", "seven each, nothing left over"];
  banner(first ? "¡A jugar!" : "Mano " + n, subs[n % subs.length], 1300, true);
  setTimeout(then, 1350);
}

var bannerT = 0;
function banner(big, sub, ms, slam) {
  var b = $("banner");
  b.querySelector(".big").textContent = big;
  b.querySelector(".sub").textContent = sub || "";
  b.classList.add("on");
  b.classList.toggle("slam", !!slam);
  clearTimeout(bannerT);
  bannerT = setTimeout(function () { b.classList.remove("on"); }, ms || 1200);
}

/* ---------- a hand ends ---------- */
function endHand() {
  var st = G.st, r = st.result;
  if (!r) return;
  R.settle(G.match, st);
  if (G.mode === "solo") { P.hands++; save(); }
  if (G.match.over) clearMatch(); else saveMatch();
  var pack = {
    res: r, scores: G.match.scores.slice(), over: G.match.over,
    champion: G.match.champion, zapatero: G.match.zapatero,
    history: G.match.history, target: G.match.rules.target,
    /* the hand is over, so every bone is turned face up — at a real table
       everybody lays theirs down to be counted, and so do we */
    hands: st.hands.map(function (h) { return h.slice(); }),
    key: G.match.seed + ":" + G.match.handNo,
    capicua: G.match.rules.capicua
  };
  if (G.mode === "host") Net.broadcast({ k: "end", end: pack, names: G.names });
  finale(pack);
}

/* The moment before the count: whoever went out says so, and the table
   gets a second to see the last bone before a sheet covers it. */
function finale(pack) {
  var r = pack.res, us = R.team(G.mySeat), won = r.team === us;
  /* the moment itself is the cheer below; the bubble is the winner's own word */
  if (r.how === "domino") bubble(r.winner, r.capicua ? "¡Capicúa!" : "¡Dominó!", "big", 1800);
  $("chuy").classList.add("off");
  clearTimeout(chuyT);
  if (r.team >= 0) { if (won) { if (r.capicua || pack.over) Snd.fiesta(); else Snd.win(); } else Snd.lose(); }
  if (won) confetti(r.capicua || pack.over ? 200 : 90);
  cheer(pack);
  setTimeout(function () { showEnd(pack); }, pack.over ? 3200 : 2500);
}

/* ---------- the moment, before the count ----------
   A hand ending used to be a banner and then a sheet of numbers. The
   sheet is still there for the numbers; this is the part a table does
   first — everybody looks at whoever went out. The winner's face, big;
   what happened, in the table's own words; who it goes to and how much,
   counted up onto the score. A hand lost is said just as clearly and
   much more quietly. */
function cheer(pack) {
  var r = pack.res, us = R.team(G.mySeat), won = r.team === us, el = $("cheer");
  if (!el) return;
  var how, who, pts = r.team < 0 ? 0 : r.points;
  if (r.how === "domino") {
    how = r.capicua ? "¡Capicúa!" : "¡Dominó!";
    who = r.winner === G.mySeat ? "You went out" : nameOf(r.winner) + " went out" + (r.winner === R.partner(G.mySeat) ? " — your partner" : "");
  } else {
    how = "¡Tranca!";
    who = r.team < 0 ? "Dead even — nobody scores" : (won ? "Shut, and we held less" : "Shut, and they held less");
  }
  var faces = "";
  if (r.team >= 0) {
    var seats = r.how === "domino" ? [r.winner] : [r.team, r.team + 2];
    seats.forEach(function (sx, i) { faces += "<div class='cf" + (i ? " second" : "") + "'>" + faceSvg(sx, "party", i ? 72 : 112, "ch" + sx) + "</div>"; });
  } else {
    faces = "<div class='cf'>" + faceSvg(G.mySeat, "think", 96, "ch0") + "</div>";
  }
  el.className = "cheer on " + (r.team < 0 ? "even" : (won ? "won" : "lost")) + (pack.over ? " match" : "");
  el.innerHTML = "<div class='cfaces'>" + faces + "</div>" +
    "<div class='chow'>" + esc(how) + "</div><div class='cwho'>" + esc(who) + "</div>" +
    (r.team >= 0 ? "<div class='cpts'><b id='cheerPts'>0</b> <span>" + (won ? "to us" : "to them") +
      (r.capicua ? " · capicúa" : "") + "</span></div>" : "") +
    (pack.over ? "<div class='cmatch'>" + (pack.champion === us ? "¡Ganamos! We take the match" : "They take the match") +
      (pack.zapatero ? " · ¡zapatero!" : "") + " · " + pack.scores[us] + "–" + pack.scores[1 - us] + "</div>" : "");
  setTimeout(function () { countUp($("cheerPts"), pts, won ? "+" : "−"); }, 500);
  for (var s = 0; s < 4; s++) mood(s, r.team < 0 ? "think" : (R.team(s) === r.team ? "party" : "ouch"), 4000);
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove("on"); }, pack.over ? 3100 : 2400);
}

function showEnd(pack) {
  var r = pack.res;
  var us = R.team(G.mySeat);
  var won = r.team === us;
  var title, lead;
  if (r.how === "domino") {
    title = r.winner === G.mySeat ? "¡Dominó!" : nameOf(r.winner) + " went out";
    if (r.capicua) title = "¡Capicúa!";
    lead = won ? (r.winner === G.mySeat ? "You went out." : "Your partner went out.") + " Their bones count for us."
               : "They went out. What we're holding counts for them.";
  } else {
    title = "Trancado";
    lead = r.team < 0 ? "Dead even — nobody scores."
      : (won ? "Shut, and our side held less." : "Shut, and their side held less.");
  }
  $("endTitle").textContent = title;
  $("endLead").textContent = lead;

  /* every hand, face up, with what it is worth */
  var hv = "<div class='bigPts' id='endPts'>" + (r.team < 0 ? "0" : (won ? "+" : "−") + "0") + "</div>" +
    "<p class='note' style='text-align:center;margin-top:0'>" +
    (r.team < 0 ? "nobody scores" : (won ? "to us" : "to them")) +
    (r.capicua ? " · capicúa pays " + (pack.capicua || R.houseRules(P.rules).capicua) : "") + "</p><div class='reveal'>";
  var order = [G.mySeat, R.partner(G.mySeat), R.nextSeat(G.mySeat), R.nextSeat(R.partner(G.mySeat))];
  for (var oi = 0; oi < 4; oi++) {
    var s = order[oi], h = pack.hands ? pack.hands[s] : [];
    var mine = R.team(s) === us;
    hv += "<div class='rv " + (mine ? "us" : "them") + (h.length === 0 ? " out" : "") + "'>" +
      "<span class='who'>" + faceSvg(s, h.length === 0 ? "party" : (mine === won ? "happy" : "ouch"), 24, "rv" + s) +
      esc(s === G.mySeat ? "You" : nameOf(s)) + "</span>" +
      "<canvas data-hand='" + s + "'></canvas>" +
      "<span class='pts'>" + (h.length === 0 ? "out!" : r.pipsBySeat[s] + " pts") + "</span></div>";
  }
  hv += "</div>";
  $("endHands").innerHTML = hv;
  var cvs = $("endHands").querySelectorAll("canvas[data-hand]");
  for (var ci = 0; ci < cvs.length; ci++) {
    var seat = +cvs[ci].getAttribute("data-hand");
    miniHand(cvs[ci], pack.hands ? pack.hands[seat] : []);
  }
  countUp($("endPts"), r.team < 0 ? 0 : r.points, won ? "+" : "−");

  var hist = pack.history || [];
  var rows = "<table class='tally'><tr><th>Hand</th><th>Nosotros</th><th>Ellos</th></tr>";
  for (var i = 0; i < hist.length; i++) {
    var hh = hist[i];
    rows += "<tr" + (hh.team === us ? " class='win'" : "") + "><td>" + (i + 1) +
      (hh.how === "tranca" ? " <span class='cap'>trancado</span>" : "") +
      (hh.capicua ? " <span class='cap'>capicúa</span>" : "") +
      "</td><td>" + hh.scores[us] + "</td><td>" + hh.scores[1 - us] + "</td></tr>";
  }
  rows += "</table>";
  if (G.hs && G.hs.graded) {
    var hacc = 0;
    G.hs.moves.forEach(function (m) { hacc += Rt.moveAccuracy(m.best, m.played); });
    hacc = Math.round(hacc / G.hs.moves.length);
    rows += "<p class='note'>Your plays this hand: <b>" + G.hs.sharp + "</b> sharp of " + G.hs.graded + " with a real choice, about <b>" + hacc + "%</b> accurate" +
      (G.hs.feeds ? " · fed your partner " + G.hs.feeds + "×" : "") +
      (G.hs.hangs ? " · hung them " + G.hs.hangs + "×" : "") + ".</p>";
  }
  $("endBody").innerHTML = rows;

  var target = pack.target || 100;
  if (pack.over) {
    $("endTitle").textContent = pack.champion === us ? "¡Ganamos! We take the match" : "They take the match";
    $("endLead").textContent = pack.zapatero
      ? (pack.champion === us ? "¡Zapatero! They never scored once." : "Zapatero — we never scored once.")
      : "To " + target + ". " + pack.scores[us] + "–" + pack.scores[1 - us] + ".";
  }
  var nx = $("endNext");
  if (G.mode === "guest") {
    nx.textContent = "Back to the table";
    $("endLead").textContent += " " + nameOf(0) + " deals the next one.";
  } else {
    nx.textContent = pack.over ? "Another match" : "Next hand";
  }

  /* the record — once per hand per phone, however many times the
     message arrives */
  var recHtml = "";
  if (pack.key && G.endKey !== pack.key) {
    G.endKey = pack.key;
    var got = [];
    got = got.concat(record({ k: "hand", won: won, mine: r.winner === G.mySeat, how: r.how, capicua: r.capicua,
                              sharp: G.hs ? G.hs.sharp : 0, friends: G.mode !== "solo" }, true).badges);
    if (pack.over) {
      got = got.concat(record({ k: "match", won: pack.champion === us, level: G.mm ? G.mm.level : P.level,
                                zapatero: pack.zapatero && pack.champion === us }, true).badges);
      if (G.mm && G.mm.rated) recHtml += ratingBlock(rate(pack.champion === us ? 1 : 0));
      else if (G.mode !== "solo") recHtml += "<p class='note'>Matches with friends at the table aren't rated — the ladder only measures the house.</p>";
    }
    got.forEach(function (b) {
      recHtml += "<div class='badge new' style='margin-top:8px'><b>🏅 " + esc(b.name) + "</b><small>" + esc(b.note) + "</small></div>";
    });
  }
  $("endXP").innerHTML = recHtml;
  var bar = $("endXP").querySelector(".bar i");
  if (bar) setTimeout(function () { bar.style.width = bar.getAttribute("data-w"); }, 60);
  var stars = $("endXP").querySelectorAll(".bigStars i[data-new]");
  Array.prototype.forEach.call(stars, function (el, i) {
    setTimeout(function () { el.classList.add("on", "pop"); Snd.good(); }, 700 + i * 450);
  });

  sayMoment({ k: "end", res: r });
  if (pack.over && pack.zapatero) sayMoment({ k: "match", zapatero: true });
  open("ovEnd");
}

/* a hand of bones, small, for the count */
function miniHand(cv, hand) {
  var dpr = window.devicePixelRatio || 1;
  /* the sheet is still hidden when this runs, so its width is worked out
     from the window rather than measured: name, bones, points on one line */
  var sheetW = Math.min(560, window.innerWidth - 28) - 36;
  var avail = Math.max(120, sheetW - 74 - 58 - 16), gap = 4;
  var bw = Math.min(54, hand.length ? (avail + gap) / hand.length - gap : 54), bh = Math.min(28, bw * 0.52 + 2);
  var w = Math.max(1, hand.length * (bw + gap));
  cv.width = Math.round(w * dpr); cv.height = Math.round(30 * dpr);
  cv.style.width = w + "px"; cv.style.height = "30px"; cv.style.flex = "0 0 auto";
  var tmp = new window.Gfx2D(cv);
  tmp.skin = P.skin; tmp.dpr = dpr; tmp.w = w; tmp.h = 30;
  tmp.g.scale(dpr, dpr);
  for (var i = 0; i < hand.length; i++) {
    tmp.bone(i * (bw + gap) + bw / 2, 14, bw, bh - 2, 0, R.A(hand[i]), R.B(hand[i]), {});
  }
}
function countUp(el, to, sign) {
  if (!el) return;
  var t0 = performance.now(), dur = Math.min(1400, 300 + to * 18);
  (function step(now) {
    var k = Math.min(1, (now - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
    el.textContent = to === 0 ? "0" : sign + v;
    if (k < 1) { requestAnimationFrame(step); if (v % 3 === 0) Snd.tick(); }
  })(t0);
}

press($("endNext"), function () {
  shut("ovEnd");
  /* a joined phone never deals: the table does. (It used to try, and
     dealt itself a private hand against three machines.) */
  if (G.mode === "guest") return;
  if (!G.match) return;
  if (G.match.over) newMatch(); else nextHand(false);
});
press($("endLesson"), function () {
  shut("ovEnd");
  showLessons();
});

/* ---------- the record ---------- */
var pendingBadges = [];
function record(e, quiet) {
  var out = Car.record(P.career, e);
  save();
  if (out.badges.length) {
    pendingBadges = pendingBadges.concat(out.badges);
    if (!quiet) out.badges.forEach(function (b) { toast("🏅 " + b.name + " — " + b.note); });
  }
  return out;
}

/* ---------- the score ----------
   A finished rated match goes to rating.js with what it needs — the
   pareja it was against, the result, the accuracy of your real choices,
   how many hints you took, how long the match was — and a new score
   comes back. The score is read from storage first, so a second tab
   cannot write over a match this one finished. */
function rate(result) {
  if (!G.mm || !G.mm.rated) return null;
  P.rating = Rt.load(function (k) { return localStorage.getItem(k); });
  var acc = Rt.gameAccuracy(G.mm.moves);
  var u = Rt.update(P.rating, { level: G.mm.level, result: result, at: Date.now(), accuracy: acc,
                                assisted: { hints: G.mm.hints, leans: G.mm.leans || 0 }, target: G.match ? G.match.rules.target : 100 });
  P.rating = u.state;
  saveRating();
  G.mm.rated = false;            /* a match is counted once */
  u.level = Rt.levelById(G.mm.level);
  return u;
}
function ratingBlock(u) {
  if (!u || !u.rated) return "";
  var L = u.level, st = P.rating.stars[L.id] || [0, 0, 0];
  var html = "<div class='rankCard' style='width:100%;margin-top:12px'>" +
    "<div class='rt'><span class='rn'>" + esc(Rt.display(P.rating)) + "</span>" +
    "<span class='delta " + (u.delta >= 0 ? "up" : "down") + "'>" + (u.delta >= 0 ? "+" : "−") + Math.abs(u.delta) + "</span>" +
    "<span class='rx'>vs " + esc(L.label) + " · " + L.elo + "</span></div>" +
    "<div class='bigStars'>";
  for (var i = 0; i < 3; i++) {
    var fresh = u.newStars.indexOf(i) >= 0;
    html += "<i" + (st[i] && !fresh ? " class='on'" : "") + (fresh ? " data-new='1'" : "") + ">★</i>";
  }
  html += "</div><div class='rnote'>★ win · ★ win without a hint · ★ and play " + Rt.STAR_ACC + "% accurate</div>";
  var lines = [];
  if (u.accuracy !== null) {
    lines.push("You played <b>" + u.accuracy.toFixed(0) + "%</b> accurate — like about <b>" + u.perf + "</b> today.");
  } else {
    lines.push("Too few real choices this match to measure your accuracy.");
  }
  if (u.weight < 0.999) lines.push("Counted as " + Math.round(u.weight * 100) + "% of a match (hints, or a short match).");
  if (u.wasProvisional && u.provisional) lines.push("Your score is still finding its level — a few more matches.");
  html += "<ul class='xpList'>" + lines.map(function (l, k) {
    return "<li style='animation-delay:" + (0.2 + k * 0.15).toFixed(2) + "s'><span>" + l + "</span></li>";
  }).join("") + "</ul></div>";
  if (u.milestone) {
    var m = u.milestone;
    html += "<div class='rankUp'>" + esc(m.emoji) + " " + (m.kind === "settled" ? "Your score has settled: " + esc(m.name)
      : m.kind === "title" ? "¡Subiste! You are now " + esc(m.name) : esc(m.name) + " — " + m.rating) +
      "<small>" + esc(Rt.title(m.rating).blurb) + "</small></div>";
    setTimeout(function () { Snd.rank(); confetti(180); }, 600);
  }
  if (u.levelUp && u.next) {
    var nx = Rt.levelById(u.next);
    html += "<div class='row'><button class='btn wide' id='endUp'>You've outgrown them — try " + esc(nx.label) + "</button></div>";
    setTimeout(function () {
      var b = $("endUp");
      if (b) press(b, function () { shut("ovEnd"); newMatch(nx.id); });
    }, 0);
  }
  return html;
}

/* ---------- the ladder ----------
   Eight parejas, each with its measured rating and three stars to earn —
   the chess room's coaches, at a domino table. Tap one to sit down
   against it. */
function ladderHTML(compact) {
  var sug = Rt.suggestLevel(P.rating), html = "<div class='ladder" + (compact ? " compact" : "") + "'>";
  Rt.LEVELS.forEach(function (L) {
    var st = P.rating.stars[L.id] || [0, 0, 0], vs = P.rating.vs[L.id];
    html += "<button class='rung" + (L.id === sug ? " next" : "") + (st[0] + st[1] + st[2] === 3 ? " done" : "") +
      (L.id === P.level ? " cur" : "") + "' data-rung='" + L.id + "'>" +
      "<span class='re'>" + L.emoji + "</span><span class='rnm'>" + esc(L.name) + "</span>" +
      "<span class='rel'>" + L.elo + "</span>" +
      "<span class='rst'>" + [0, 1, 2].map(function (i) { return "<i" + (st[i] ? " class='on'" : "") + ">★</i>"; }).join("") + "</span>" +
      (compact ? "" : "<span class='rbl'>" + esc(L.blurb) + (vs ? " <b>" + vs[0] + "–" + vs[1] + "</b>" : "") + "</span>") +
      "</button>";
  });
  return html + "</div>";
}
function wireLadder(box, onPick) {
  Array.prototype.forEach.call(box.querySelectorAll("[data-rung]"), function (b) {
    press(b, function () { onPick(b.getAttribute("data-rung")); });
  });
}
function ratingHead() {
  var sm = Rt.summary(P.rating), t = sm.title;
  var html = "<div class='rt'><span class='rn'>" + esc(t.emoji) + " " + esc(sm.display) + "</span>" +
    "<span class='rx'>" + esc(t.name) + "</span></div>" +
    "<div class='rnote'>" + (sm.games ? sm.wins + " of " + sm.games + " rated matches won" +
      (sm.streak.kind === "win" && sm.streak.n > 1 ? " · " + sm.streak.n + " in a row" : "") +
      " · " + sm.stars + "/" + sm.maxStars + " ★"
      : "Every solo match is rated against the pareja you face.") + "</div>";
  if (t.next) {
    var span = t.next.floor - t.floor, into = Math.max(0, sm.rating - t.floor);
    html += "<div class='bar'><i data-w='" + Math.round(Math.min(1, into / span) * 100) + "%' style='width:" +
      Math.round(Math.min(1, into / span) * 100) + "%'></i></div><div class='rnote'>Next: " + esc(t.next.emoji + " " + t.next.name) + " at " + t.next.floor + "</div>";
  }
  return html;
}
/* the score's line, drawn small */
function chart(cv, hist) {
  var dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 300, h = 70;
  cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + "px";
  var g = cv.getContext("2d"); g.scale(dpr, dpr);
  var pts = [Rt.START_R].concat(hist.map(function (e) { return e.r; }));
  if (pts.length < 2) return;
  var lo = Math.min.apply(null, pts) - 20, hi = Math.max.apply(null, pts) + 20;
  g.strokeStyle = "rgba(255,215,122,.9)"; g.lineWidth = 2; g.beginPath();
  pts.forEach(function (p, i) {
    var x = 4 + i / (pts.length - 1) * (w - 8), y = h - 4 - (p - lo) / (hi - lo) * (h - 8);
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  });
  g.stroke();
}
function showCareer() {
  var c = P.career, sm = Rt.summary(P.rating);
  var pct = function (a, b) { return b ? Math.round(a / b * 100) + "%" : "—"; };
  var html = "<div class='rankCard' style='width:100%'>" + ratingHead() + "<canvas id='rChart' style='width:100%;display:block;margin-top:6px'></canvas></div>" +
    "<div class='stats'>" +
    stat(sm.wins + "–" + sm.losses, "rated matches") +
    stat(sm.best === null ? "—" : sm.best, "best score") +
    stat(sm.recentAccuracy === null ? "—" : sm.recentAccuracy + "%", "recent accuracy") +
    stat(pct(c.handWins, c.hands), "hands won") +
    stat(c.dominos, "dominós") + stat(c.capicuas, "capicúas") +
    "</div><h3 style='margin-top:14px;font-size:1rem'>The ladder</h3>" +
    "<p class='note' style='margin-top:0'>Each pareja's rating is measured — 600 seat-swapped matches against its neighbours. Your partner is always the same pareja as the one you face. Tap one to play it.</p>" +
    ladderHTML(false) +
    "<h3 style='margin-top:14px;font-size:1rem'>Logros</h3><div class='badges'>";
  Car.BADGES.forEach(function (b) {
    html += "<div class='badge" + (c.badges[b.id] ? "" : " off") + "'><b>" + (c.badges[b.id] ? "🏅 " : "") + esc(b.name) + "</b><small>" + esc(b.note) + "</small></div>";
  });
  html += "</div><h3 style='margin-top:14px;font-size:1rem'>How the score works</h3><p class='note' style='margin-top:0'>" +
    "It's Glicko, the system chess sites use, with one change for a table of four: you and your partner are taken at the average of your two ratings, so a match moves your number about half as far as a chess game would — half your side's play wasn't yours. " +
    "Hints are always allowed; each one makes the match count a little less, in both directions. A match left behind while it is already well lost counts as the loss it was. " +
    "Accuracy is how much of your chance each play kept, checked by playing the hand out from every bone you could have played.</p>";
  $("careerBody").innerHTML = html;
  wireLadder($("careerBody"), function (id) { shut("ovCareer"); goRung(id); });
  open("ovCareer");
  setTimeout(function () { var cv = $("rChart"); if (cv) chart(cv, sm.history); }, 30);
}
function stat(v, l) { return "<div class='stat'><b>" + esc(v) + "</b><small>" + esc(l) + "</small></div>"; }
/* sit down against a rung, from wherever the player is */
function goRung(id) {
  if ($("splash").style.display !== "none") { P.level = id; save(); startFresh("solo"); return; }
  if (G.mode !== "solo") { toast("The ladder is for solo matches — the table with friends keeps its own game."); return; }
  freshMatch(id, "Sitting down with " + Rt.levelById(id).label + ".");
}
function splashRank() {
  var el = $("splashRank");
  if (!el) return;
  el.innerHTML = "<div class='meRow'><button class='faceBtn' id='sFace' title='Your face'>" +
    Fc.svg(Fc.forName(P.name || "Jugador", P.face), "happy", 46, { id: "sf", bg: "#2a1c14" }) + "</button><div class='meRank'>" +
    ratingHead() + "</div></div>" + ladderHTML(true);
  wireLadder(el, goRung);
  press($("sFace"), function () { showFace(); });
  var sug = Rt.levelById(P.level) || Rt.levelById(Rt.suggestLevel(P.rating));
  $("goSolo").innerHTML = "Play " + esc(sug.label) + " <small style='opacity:.75;font-weight:500'>· " + sug.elo + "</small>";
  setTimeout(function () {
    var cur = el.querySelector(".rung.cur") || el.querySelector(".rung.next");
    if (cur && cur.scrollIntoView) { var lad = cur.parentNode; lad.scrollLeft = cur.offsetLeft - lad.clientWidth / 2 + cur.clientWidth / 2; }
  }, 50);
}

/* ---------- confetti, for the moments that earn it ---------- */
var bits = [];
function confetti(n) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var cv = $("confetti"); if (!cv) return;
  /* the papel picado's own colours, cut up */
  var w = cv.width, cols = (Cn && Cn.PAPER) ? Cn.PAPER.concat(["#fff6e4"]) : ["#ffd77a", "#f0a83c", "#3ecf8e", "#e06a52", "#8fb0ff", "#fff6e4"];
  for (var i = 0; i < n; i++) {
    bits.push({ x: Math.random() * w, y: -20 - Math.random() * cv.height * 0.4, vx: (Math.random() - 0.5) * 120,
                vy: 120 + Math.random() * 260, r: Math.random() * 6.3, vr: (Math.random() - 0.5) * 12,
                s: (4 + Math.random() * 6) * (window.devicePixelRatio || 1), c: cols[i % cols.length], life: 0 });
  }
}
function confettiStep(dt) {
  var cv = $("confetti");
  if (!cv || (!bits.length && !cv.dirty)) return;
  var g = cv.getContext("2d");
  g.clearRect(0, 0, cv.width, cv.height);
  cv.dirty = bits.length > 0;
  var dpr = window.devicePixelRatio || 1;
  for (var i = bits.length - 1; i >= 0; i--) {
    var b = bits[i];
    b.life += dt; b.vy += 200 * dt; b.x += b.vx * dt * dpr; b.y += b.vy * dt * dpr; b.r += b.vr * dt;
    if (b.y > cv.height + 20 || b.life > 6) { bits.splice(i, 1); continue; }
    g.save(); g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c;
    g.fillRect(-b.s / 2, -b.s / 4, b.s, b.s / 2); g.restore();
  }
}

/* ---------- Don Chuy ---------- */
/* Moments that repeat (a partner's salida, an opponent hung) are said at
   most once a hand each, so the table never turns into a running
   commentary. */
var saidThisHand = {};
function sayMoment(e) {
  if (!P.coach || !G.view) return;
  var m = C.moment(e, P.seen, G.names, G.view);
  if (!m) return;
  var hk = (G.st ? G.st.seed : (G.view && G.view.line.length ? G.view.line[0].tile : 0)) + ":" + m.id;
  if (!m.once && saidThisHand[hk]) return;
  saidThisHand[hk] = 1;
  if (m.once) { P.seen[m.id] = 1; save(); }
  chuy(m.text, "", 9000);
}
var chuyT = 0;
/* While a tip is waiting to be read, the next one waits its turn behind
   it rather than wiping it off the panel — a welcome that is replaced by
   "your turn" before anybody has read it was the first thing a new
   player saw. A hint the player asked for jumps the queue. */
var tipQ = [];
function chuy(say, why, ms, force) {
  if (P.coachHold && coachUp() && !force) { tipQ.push([say, why, ms]); return; }
  $("chuySay").textContent = say;
  $("chuyWhy").textContent = why || "";
  $("chuy").classList.remove("off");
  $("chuyClose").textContent = P.coachHold ? "Got it ✓" : "✕";
  clearTimeout(chuyT);
  /* a remark goes away on its own unless the player would rather read
     at their own speed; a hint you asked for stays put either way */
  if (ms && !P.coachHold) chuyT = setTimeout(function () { $("chuy").classList.add("off"); }, ms + (why ? 3000 : 0));
}
function coachUp() { return !$("chuy").classList.contains("off"); }
/* the first two hands are for learning: while a tip is up and waiting
   to be read, the table waits too. Nobody at a real table plays on
   while the newcomer is still being told the rules. */
function learning() { return P.hands < 2 && G.mode === "solo" && !G.hot; }
press($("chuyClose"), function () {
  $("chuy").classList.add("off");
  if (tipQ.length) { var nx = tipQ.shift(); chuy(nx[0], nx[1], nx[2]); return; }
  /* the table was waiting on this: carry on */
  if (G.st && !G.st.over && !isHuman(G.st.turn) && G.thinking < 0) { clearTimeout(turnT); turnT = setTimeout(scheduleTurn, 500); }
});

function giveHint() {
  if (!G.view) return;
  if (G.view.turn !== G.mySeat) { chuy("Not your turn yet — watch what they play.", "", 3000); return; }
  /* hints stay free; a rated match helped through counts for a little less */
  if (G.mm && G.mm.rated) G.mm.hints++;
  var a = AI.analyse(G.view, { level: "maestro" });
  var h = C.hint(G.view, a, { names: G.names });
  chuy(h.title, h.lines.join(" "), 0, true);
  if (h.move) { G.sel = h.move.tile; G.hint = h.move.end; }
  syncAll();
}
press($("btnHint"), giveHint);

/* when the lifted bone fits both ends, two plain buttons say which —
   in numbers, because after a fold or two "left" stops meaning left */
press($("pickL"), function () { if (G.sel !== null) tryPlay(G.sel, "L"); });
press($("pickR"), function () { if (G.sel !== null) tryPlay(G.sel, "R"); });

/* ---------- the counting panel ---------- */
press($("btnCount"), function () { showCount(); });
function showCount() {
  if (!G.view) return;
  var rt = C.readTable(G.view, G.names);
  var html = "<div class='census'>";
  for (var i = 0; i < rt.census.length; i++) {
    var c = rt.census[i];
    html += "<div class='cs" + (c.live === 0 ? " none" : "") + "'><b>" + c.live + "</b>" +
      "<small>" + esc(c.name) + "</small><small>you " + c.mine + "</small></div>";
  }
  html += "</div><p class='note'>The big number is how many bones carrying that suit you have not seen yet — in three hands between them.</p>";
  if (rt.voids.length) {
    html += "<ul class='reads'>";
    for (var k = 0; k < rt.voids.length; k++) {
      html += "<li class='" + (rt.voids[k].mate ? "mate" : "") + "'>" + esc(rt.voids[k].text) + "</li>";
    }
    html += "</ul>";
  } else {
    html += "<p class='note'>" + esc(rt.note) + "</p>";
  }
  $("countBody").innerHTML = html;
  open("ovCount");
}

/* ---------- the tray ---------- */
press($("btnPlay"), function () {
  if (!G.view) return;
  if (G.view.turn !== G.mySeat) { toast("It's " + nameOf(G.view.turn) + "'s turn."); return; }
  var mv = AI.movesFor(G.view);
  if (!mv.length) {
    if (G.mode === "guest") Net.send({ k: "pass" }); else doPass(G.mySeat);
    return;
  }
  if (G.sel !== null) {
    var ends = [];
    for (var i = 0; i < mv.length; i++) if (mv[i].tile === G.sel) ends.push(mv[i].end);
    /* the end the hint chose, if it chose one for this bone */
    if (ends.length) { tryPlay(G.sel, G.hint && ends.indexOf(G.hint) >= 0 ? G.hint : ends[0]); return; }
  }
  toast("Tap a glowing bone to play it.");
});
press($("btnMenu"), function () { showMenu(); });

function syncAll() {
  var v = G.view;
  if (!v) return;
  /* the plates, one per other chair, placed where that chair sits */
  for (var rel = 1; rel <= 3; rel++) plate(rel, v);

  /* the running commentary: who is deciding, and what they just did */
  var ln = $("lastPlay");
  if (G.thinking >= 0) {
    ln.textContent = nameOf(G.thinking) + " is thinking…";
    ln.className = "thinking";
  } else if (G.lastNote) {
    ln.textContent = G.lastNote.text;
    ln.className = R.team(G.lastNote.seat) === R.team(G.mySeat) ? "us" : "them";
  } else { ln.textContent = ""; ln.className = ""; }

  /* the score */
  var us2 = R.team(G.mySeat);
  var sc = G.match ? G.match.scores : [0, 0];
  bumpScore($("scoreUs"), "Nosotros", sc[us2]);
  bumpScore($("scoreThem"), "Ellos", sc[1 - us2]);
  $("toWhat").textContent = "a " + (G.match && G.match.rules ? G.match.rules.target : (G.meta ? G.meta.target : 100));
  $("scoreUs").classList.toggle("lead", sc[us2] > sc[1 - us2]);
  $("scoreThem").classList.toggle("lead", sc[1 - us2] > sc[us2]);

  /* the big button says what it will do */
  var mine = v.turn === G.mySeat;
  var mv = mine ? AI.movesFor(v) : [];
  var b = $("btnPlay");
  b.classList.toggle("pulse", mine);
  b.disabled = false;
  var selEnds = (mine && G.sel !== null) ? endsOf(mv, G.sel) : [];
  if (v.turn < 0) b.textContent = "Waiting for " + nameOf(0) + " to deal…";
  else if (!mine) b.textContent = G.thinking >= 0 ? nameOf(G.thinking) + " is thinking…" : nameOf(v.turn) + "'s turn";
  else if (!mv.length) b.textContent = "Paso — I can't play";
  else if (G.sel !== null) b.textContent = selEnds.length === 2 ? "Tap an end for the " + C.boneName(G.sel) : "Lay the " + C.boneName(G.sel) + " down";
  else b.textContent = "Your turn — pick up a bone";
  b.classList.toggle("primary", mine);
  $("btnHint").disabled = !mine;

  /* the end picker, for a lifted bone that fits both ends — with the
     room's lean starred, so either can be chosen and one is advised */
  var lifted = mine && G.sel !== null && !G.drag && selEnds.length >= 1, two = lifted && selEnds.length === 2;
  $("endPick").classList.toggle("hide", !lifted);
  if (lifted) {
    var rec = two ? (G.hint || G.lean) : selEnds[0];
    $("pickL").classList.toggle("hide", selEnds.indexOf("L") < 0);
    $("pickR").classList.toggle("hide", selEnds.indexOf("R") < 0);
    $("pickL").innerHTML = (two ? "◀ on the <b>" : "Lay it on the <b>") + v.left + "</b>" + (two && rec === "L" ? " ★" : "");
    $("pickR").innerHTML = (two ? "on the <b>" : "Lay it on the <b>") + v.right + "</b>" + (two ? " ▶" : "") + (two && rec === "R" ? " ★" : "");
    $("pickL").classList.toggle("rec", two && rec === "L");
    $("pickR").classList.toggle("rec", two && rec === "R");
  }
  $("stage").classList.toggle("myTurn", mine);
  if (Snd.music && Snd.music.quiet) Snd.music.quiet(mine && !!mv.length);
  mePlate(v, mine);
  measureHud();
}

/* ---------- faces ----------
   Every seat has a face: the one its name draws, or the one that came
   with the name over the link, or — for this player — the one they
   picked. A face has a mood for a moment at a time; between moments it
   is thinking when it is deciding, grinning when it is down to its last
   bone, and otherwise simply there. */
function faceFor(seat) {
  /* the face this phone's owner picked belongs to the chair they sit in:
     seat 0 at their own table, whatever chair they were given at a
     friend's; a partner sharing the phone gets the face their name draws */
  var own = G.mode === "guest" ? G.mySeat : 0;
  if (seat === own) return Fc.forName(myName(), P.face);
  return Fc.forName(nameOf(seat), G.faces[seat]);
}
function mood(seat, m, ms) {
  G.moods[seat] = { m: m, until: performance.now() + (ms || 1500) };
  syncAll();
  clearTimeout(G.moods[seat].t);
  G.moods[seat].t = setTimeout(syncAll, (ms || 1500) + 30);
}
function moodOf(seat, v) {
  var m = G.moods[seat];
  if (m && m.until > performance.now()) return m.m;
  if (seat === G.thinking) return "think";
  if (v && v.counts && v.counts[seat] === 1 && v.line.length) return "grin";
  return "calm";
}
function faceSvg(seat, m, px, id) {
  return Fc.svg(faceFor(seat), m, px, { id: id, bg: "#2a1c14" });
}
function mePlate(v, mine) {
  var el = $("me");
  if (!el) return;
  var m = moodOf(G.mySeat, v);
  var html = faceSvg(G.mySeat, m, 40, "me") + "<span class='nm'>" + esc(nameOf(G.mySeat)) + "</span>";
  if (el.getAttribute("data-h") !== html) { el.innerHTML = html; el.setAttribute("data-h", html); }
  el.classList.toggle("turn", !!mine);
}
function endsOf(mv, tile) {
  var e = [];
  for (var i = 0; i < mv.length; i++) if (mv[i].tile === tile) e.push(mv[i].end);
  return e;
}
function bumpScore(el, label, n) {
  var was = el.getAttribute("data-n");
  el.innerHTML = label + " <b>" + n + "</b>";
  if (was !== null && +was !== n) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }
  el.setAttribute("data-n", n);
}

/* ---------- the plates ----------
   Built once and then only updated, so a bubble mid-animation is not
   torn down by the next sync. */
var ROLE = { 1: "right ▸", 2: "partner", 3: "◂ left" };
function plate(rel, v) {
  var el = $("plate" + rel);
  if (!el) return;
  var s = (G.mySeat + rel) & 3;
  if (!el.firstChild) {
    el.innerHTML = "<div class='av'></div><div class='pi'><div class='nm'></div><div class='role'></div><div class='mini'></div></div>" +
      "<b class='cnt'></b><span class='tag'></span><div class='bubble'></div>";
  }
  var us = R.team(s) === R.team(G.mySeat);
  var human = G.mode === "guest" ? !!(G.humans && G.humans[s]) : (isHuman(s) && (G.mode !== "solo" || !!G.hot));
  el.className = "plate " + (us ? "us" : "them") + (s === v.turn ? " turn" : "") +
    (s === G.thinking ? " thinking" : "") + (v.counts[s] <= 2 && v.counts[s] > 0 && v.line.length ? " low" : "");
  var nm = nameOf(s);
  var av = el.querySelector(".av"), fh = faceSvg(s, moodOf(s, v), 36, "p" + rel);
  if (av.getAttribute("data-h") !== fh) { av.innerHTML = fh; av.setAttribute("data-h", fh); }
  el.querySelector(".nm").textContent = nm;
  /* who they are to you is said in words, and a person at the table —
     a phone of their own, or sharing yours — is marked as one */
  var who = rel === 2 ? (human ? "your partner" : "partner") : ROLE[rel];
  el.querySelector(".role").textContent = (v.counts[s] <= 2 && v.counts[s] > 0 && v.line.length)
    ? (v.counts[s] === 1 ? "last bone!" : "2 left!") : ((human ? (G.hot ? "🤝 " : "📱 ") : "") + who);
  el.querySelector(".tag").textContent = "";
  var mini = el.querySelector(".mini"), n = v.counts[s];
  if (mini.childNodes.length !== 7) { mini.innerHTML = ""; for (var k = 0; k < 7; k++) mini.appendChild(document.createElement("i")); }
  for (var j = 0; j < 7; j++) mini.childNodes[j].className = j < n ? "" : "out";
  var cnt = el.querySelector(".cnt");
  if (cnt.textContent !== String(n)) { cnt.textContent = n; cnt.classList.remove("tick"); void cnt.offsetWidth; cnt.classList.add("tick"); }
}
/* something a seat says, in a bubble under its plate (or above your hand) */
function bubble(seat, text, cls, ms) {
  var el = seat === G.mySeat ? $("meBubble") : (function () {
    var p = $("plate" + ((seat - G.mySeat + 4) & 3));
    return p ? p.querySelector(".bubble") : null;
  })();
  if (!el) return;
  el.textContent = text;
  el.className = "bubble on" + (cls ? " " + cls : "");
  clearTimeout(el._t);
  el._t = setTimeout(function () { el.classList.remove("on"); }, ms || 1500);
}
/* a word from somebody at the table, now and then — never from you */
function chatter(seat, lines, delay) {
  if (seat === G.mySeat) return;
  if (G.mode !== "solo" && isHumanAnywhere(seat)) return;
  setTimeout(function () {
    bubble(seat, lines[Math.floor(Math.random() * lines.length)], "", 1600);
  }, (delay || 0) + 900);
}
function isHumanAnywhere(seat) {
  if (G.mode === "guest") return !!(G.humans && G.humans[seat]);
  return isHuman(seat);
}
function nameOf(s) { return G.names[s] || ("Seat " + s); }

/* ---------- the menu ---------- */
function showMenu() {
  $("menuState").textContent = G.match
    ? ("To " + G.match.rules.target + " · hand " + (G.match.handNo + 1) + " · " +
       Rt.levelById(P.level).label + " · " + Rt.levelById(P.level).elo + (G.mm && G.mm.rated ? " · rated" : "") +
       (G.hot ? " · " + esc(G.names[0]) + " & " + esc(G.names[2]) + " on this phone" : ""))
    : "No match yet.";
  $("mView").textContent = P.view3d ? "Switch to 2D" : "Switch to 3D";
  $("mSound").textContent = P.sound ? "🔊 Sound on" : "🔇 Sound off";
  $("mCoach").textContent = P.coach ? "Coach & grades on" : "Coach & grades off";
  $("mFiesta").textContent = P.fiesta ? "🎉 Fiesta on" : "Fiesta off";
  $("mMusic").textContent = P.music ? "🎺 Music on" : "Music off";
  $("mHold").textContent = P.coachHold ? "Tips wait for me" : "Tips fade on their own";
  $("mUpdate").classList.toggle("hide", !swWaiting);
  $("menuNote").textContent = gfx && gfx.kind === "3d"
    ? "Drawn in 3D. The bones in your hand stay flat and crisp on purpose."
    : "Drawn flat. Every phone can do this one.";
  open("ovMenu");
}
press($("mFiesta"), function () {
  P.fiesta = !P.fiesta; save();
  document.documentElement.classList.toggle("noFiesta", !P.fiesta);
  measureHud();
  showMenu();
});
press($("mFace"), function () { shut("ovMenu"); showFace(); });
press($("mHold"), function () { P.coachHold = !P.coachHold; save(); if (!P.coachHold) $("chuy").classList.add("off"); showMenu(); });
press($("mMusic"), function () {
  P.music = !P.music; save();
  if (P.music && P.sound) { Snd.unlock(); Snd.music.start(); } else Snd.music.stop();
  showMenu();
});
/* the trio stops when the room is put away, and picks up when it is back */
document.addEventListener("visibilitychange", function () {
  if (document.hidden) Snd.music.stop(true);
  else if (P.music && P.sound && $("splash").classList.contains("gone")) Snd.music.start();
});
press($("mUpdate"), function () { shut("ovMenu"); takeUpdate(); });

/* ---------- your face ----------
   A picker that is mostly a button: shuffle until you like one, then
   nudge the bits you want. Nothing to type, nothing to upload. */
var faceDraft = null;
function showFace() {
  faceDraft = Fc.clean(Fc.forName(myName(), P.face));
  drawFace();
  open("ovFace");
}
var TRAIT_LABELS = { skin: "Skin", hair: "Hair", hairCol: "Colour", beard: "Bigote", hat: "Hat", glasses: "Glasses", shirt: "Shirt" };
function drawFace() {
  var html = "<div class='facePick'><div class='faceBig'>" + Fc.svg(faceDraft, "happy", 112, { id: "big", bg: "#2a1c14" }) + "</div>" +
    "<div class='faceSide'><div class='fld' style='margin:0 0 8px'><label><b>Your name</b></label>" +
    "<input type='text' id='fName' maxlength='14' value='" + esc(myName()) + "' autocomplete='nickname'></div>" +
    "<button class='btn primary' id='fShuffle'>🎲 Another face</button></div></div>" +
    "<div class='traits'>";
  Fc.TRAITS.forEach(function (t) {
    html += "<button class='btn' data-trait='" + t + "'>" + esc(TRAIT_LABELS[t]) + " ›</button>";
  });
  html += "</div><div class='row' style='margin-top:12px'><button class='btn primary wide' id='fKeep'>That's me</button>" +
    "<button class='btn' id='fName0'>Use my name's face</button></div>";
  $("faceBody").innerHTML = html;
  press($("fShuffle"), function () { faceDraft = Fc.random(); Snd.tick(); drawFace(); });
  Array.prototype.forEach.call($("faceBody").querySelectorAll("[data-trait]"), function (b) {
    press(b, function () { faceDraft = Fc.mutate(faceDraft, b.getAttribute("data-trait")); Snd.tick(); drawFace(); });
  });
  press($("fKeep"), function () {
    var nm = $("fName").value.trim();
    if (nm) { P.name = Net.cleanName(nm); G.names[G.mySeat] = P.name; }
    P.face = Fc.encode(faceDraft); Net.face = P.face; save();
    shut("ovFace"); syncAll(); splashRank();
    if (G.mode !== "solo") toast("Friends see your new face next time you sit down.");
  });
  press($("fName0"), function () { P.face = ""; Net.face = ""; save(); faceDraft = Fc.clean(Fc.forName($("fName").value || myName(), "")); drawFace(); });
}
press($("me"), function () { showFace(); });
press($("mNew"), function () {
  shut("ovMenu");
  if (G.mode === "guest") { toast(nameOf(0) + "'s phone deals — ask them."); return; }
  freshMatch(null);
});
press($("mLook"), function () { shut("ovMenu"); showLook(); });
press($("mRules"), function () { shut("ovMenu"); showRules(); });
press($("mLearn"), function () { shut("ovMenu"); showLessons(); });
press($("mParty"), function () { shut("ovMenu"); showParty(); });
press($("mCareer"), function () { shut("ovMenu"); showCareer(); });
press($("mSound"), function () {
  P.sound = !P.sound; Snd.on = P.sound; save();
  if (P.sound) { Snd.unlock(); Snd.clack(0.7); if (P.music) Snd.music.start(); } else Snd.music.stop();
  showMenu();
});
press($("mCoach"), function () {
  P.coach = !P.coach; P.grade = P.coach; save();
  if (!P.coach) $("chuy").classList.add("off");
  showMenu();
});
press($("mView"), function () {
  P.view3d = !P.view3d; save();
  makeRenderers();
  shut("ovMenu");
  toast(P.view3d ? "Three dimensions." : "Flat on the table.");
});

/* ---------- how it's played ---------- */
function showLessons() {
  var html = "";
  for (var i = 0; i < C.LESSONS.length; i++) {
    html += "<div class='opt' style='margin-bottom:8px'><b>" + esc(C.LESSONS[i].title) + "</b>" +
      "<small>" + esc(C.LESSONS[i].body) + "</small></div>";
  }
  $("lessons").innerHTML = html;
  open("ovLearn");
}

/* ---------- house rules ---------- */
var RULE_FORM = [
  { k: "target", label: "Play to", opts: [[50, "50 — quick"], [100, "100 — the usual"], [200, "200 — a long night"]] },
  { k: "capicua", label: "Capicúa pays", opts: [[0, "nothing"], [25, "25 — the usual"], [50, "50"]] },
  { k: "countAll", label: "The winner counts", opts: [[false, "the other side's bones"], [true, "everyone's, partner included"]] },
  { k: "trancaTie", label: "A tied shut game", opts: [["closer", "goes to whoever shut it"], ["nobody", "goes to nobody"]] },
  { k: "level", label: "Across the table", opts: Rt.LEVELS.map(function (L) { return [L.id, L.emoji + " " + L.name + " · " + L.elo]; }) },
  { k: "pace", label: "The table moves", opts: [["slow", "Unhurried"], ["relaxed", "Relaxed"], ["brisk", "Brisk"], ["quick", "Quick"]] }
];
function showRules() {
  var html = "";
  for (var i = 0; i < RULE_FORM.length; i++) {
    var f = RULE_FORM[i];
    /* level and pace are preferences, not house rules — they live on P
       itself rather than in P.rules, and reading them out of P.rules
       leaves the row with nothing lit up */
    var cur = f.k === "level" ? P.level : f.k === "pace" ? P.pace : P.rules[f.k];
    html += "<div class='fld'><label><b>" + esc(f.label) + "</b></label><div class='opts'>";
    for (var j = 0; j < f.opts.length; j++) {
      var o = f.opts[j];
      html += "<button class='opt" + (String(o[0]) === String(cur) ? " on" : "") +
        "' data-rk='" + esc(f.k) + "' data-rv='" + esc(o[0]) + "'><b>" + esc(o[1]) + "</b></button>";
    }
    html += "</div></div>";
  }
  html += "<p class='note'>" + esc(Rt.levelById(P.level).blurb) + " · " + esc(pace().note) + "</p>";
  $("rulesForm").innerHTML = html;
  var btns = $("rulesForm").querySelectorAll("[data-rk]");
  for (var b = 0; b < btns.length; b++) press(btns[b], onRulePick);
  open("ovRules");
}
function onRulePick(e) {
  var el = e.currentTarget || e.target;
  var k = el.getAttribute("data-rk"), raw = el.getAttribute("data-rv");
  if (k === "level") P.level = Rt.levelById(raw) ? raw : P.level;
  else if (k === "pace") P.pace = PACES[raw] ? raw : "relaxed";
  else if (k === "countAll") P.rules.countAll = (raw === "true");
  else if (k === "trancaTie") P.rules.trancaTie = raw;
  else P.rules[k] = parseInt(raw, 10);
  P.rules = R.houseRules(P.rules);
  save();
  showRules();
}
press($("rulesApply"), function () {
  shut("ovRules");
  if (G.mode === "guest") { toast("Saved — the table's phone sets the rules for this game."); return; }
  freshMatch(null, "Fresh match, new rules.");
});

/* ---------- the colours ---------- */
var EDIT = [
  { g: "table", k: "felt", label: "Table" },
  { g: "table", k: "rim", label: "Rim" },
  { g: "table", k: "edge", label: "Grain" },
  { g: "table", k: "line", label: "Pattern" },
  { g: "bones", k: "face", label: "Bone" },
  { g: "bones", k: "pip", label: "Pips" },
  { g: "bones", k: "back", label: "Backs" },
  { g: "marks", k: "playable", label: "Playable" },
  { g: "marks", k: "ghost", label: "Slots" },
  { g: "room", k: "bg", label: "Room" }
];
function showLook() {
  drawGallery();
  drawEditor();
  $("lookOut").innerHTML = "";
  open("ovLook");
}
function drawGallery() {
  var list = Sk.gallery(), html = "";
  for (var i = 0; i < list.length; i++) {
    html += "<button class='tile" + (list[i].name === P.skin.name ? " on" : "") +
      "' data-sk='" + i + "'><canvas width='236' height='124'></canvas><span>" +
      esc(list[i].name) + "</span></button>";
  }
  $("gallery").innerHTML = html;
  var tiles = $("gallery").querySelectorAll("[data-sk]");
  for (var k = 0; k < tiles.length; k++) {
    thumb(tiles[k].querySelector("canvas"), list[k]);
    (function (sk) {
      press(tiles[k], function () {
        P.skin = Sk.clean(sk); save();
        gfx.setSkin(P.skin); over.setSkin(P.skin);
        drawGallery(); drawEditor();
      });
    })(list[k]);
  }
}
/* a preview drawn with the real bone painter, so a thumbnail cannot
   promise a look the table will not deliver */
function thumb(cv, skin) {
  var g = cv.getContext("2d");
  var tmp = new window.Gfx2D(cv);
  tmp.skin = Sk.clean(skin);
  tmp.dpr = 1; tmp.w = cv.width; tmp.h = cv.height;
  g.fillStyle = skin.table.felt; g.fillRect(0, 0, cv.width, cv.height);
  tmp.bone(78, 62, 76, 38, 0, 6, 3, {});
  tmp.bone(158, 62, 38, 76, 0, 5, 5, { lift: 0.6 });
}
function drawEditor() {
  var html = "<div class='fld'><label><b>Colours</b></label><div class='swatches'>";
  for (var i = 0; i < EDIT.length; i++) {
    var e = EDIT[i];
    html += "<label class='sw'><input type='color' data-cg='" + e.g + "' data-ck='" + e.k +
      "' value='" + esc(P.skin[e.g][e.k]) + "'>" + esc(e.label) + "</label>";
  }
  html += "</div></div>";

  html += slider("Grain", "table", "grain", P.skin.table.grain);
  html += slider("Gloss", "table", "gloss", P.skin.table.gloss);
  html += slider("Shine", "bones", "shine", P.skin.bones.shine);
  html += slider("Bevel", "bones", "rim", P.skin.bones.rim);

  html += "<div class='fld'><label><b>Bones are cut from</b></label><div class='opts'>";
  Sk.MATERIAL_ORDER.forEach(function (m) {
    var mm = Sk.MATERIALS[m];
    html += "<button class='opt" + (P.skin.bones.material === m ? " on" : "") + "' data-mat='" + m +
      "'><b>" + esc(mm.label) + "</b><small>" + esc(mm.note) + "</small></button>";
  });
  html += "</div></div><div class='fld'><label><b>The table is</b></label><div class='opts'>";
  Sk.PATTERN_ORDER.forEach(function (p) {
    var pp = Sk.PATTERNS[p];
    html += "<button class='opt" + (P.skin.table.pattern === p ? " on" : "") + "' data-pat='" + p +
      "'><b>" + esc(pp.label) + "</b><small>" + esc(pp.note) + "</small></button>";
  });
  html += "</div></div>";
  $("editor").innerHTML = html;

  wire("[data-cg]", "input", function (el) {
    P.skin[el.getAttribute("data-cg")][el.getAttribute("data-ck")] = el.value;
    applySkin();
  });
  wire("[data-sg]", "input", function (el) {
    P.skin[el.getAttribute("data-sg")][el.getAttribute("data-sk2")] = parseInt(el.value, 10) / 100;
    var v = el.parentNode.parentNode.querySelector(".val");
    if (v) v.textContent = el.value + "%";
    applySkin();
  });
  var mats = $("editor").querySelectorAll("[data-mat]");
  for (var a = 0; a < mats.length; a++) {
    (function (el) {
      press(el, function () { P.skin.bones.material = el.getAttribute("data-mat"); applySkin(); drawEditor(); });
    })(mats[a]);
  }
  var pats = $("editor").querySelectorAll("[data-pat]");
  for (var b = 0; b < pats.length; b++) {
    (function (el) {
      press(el, function () { P.skin.table.pattern = el.getAttribute("data-pat"); applySkin(); drawEditor(); });
    })(pats[b]);
  }
}
function slider(label, g, k, v) {
  return "<div class='fld'><label><b>" + esc(label) + "</b><span class='val'>" +
    Math.round(v * 100) + "%</span></label>" +
    "<input type='range' min='0' max='100' value='" + Math.round(v * 100) +
    "' data-sg='" + g + "' data-sk2='" + k + "'></div>";
}
function wire(sel, ev, fn) {
  var els = $("editor").querySelectorAll(sel);
  for (var i = 0; i < els.length; i++) {
    (function (el) { el.addEventListener(ev, function () { fn(el); }); })(els[i]);
  }
}
function applySkin() {
  P.skin = Sk.clean(P.skin);
  gfx.setSkin(P.skin); over.setSkin(P.skin);
  save();
}
press($("lookShare"), function () {
  var code = Sk.encode(P.skin);
  var url = location.origin + location.pathname + "#table=" + code;
  $("lookOut").innerHTML = "<p class='note'>Send this to anyone — it opens the room wearing your table.</p>" +
    "<div class='code mono'>" + esc(url) + "</div>";
  if (navigator.share) navigator.share({ title: "My domino table", text: code }).catch(function () {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Copied."); }, function () {});
});
press($("lookPaste"), function () {
  $("lookOut").innerHTML = "<div class='fld'><label><b>Paste a table code</b></label>" +
    "<input type='text' id='skinIn' placeholder='DOM1.…'></div>";
  var inp = $("skinIn");
  inp.focus();
  inp.addEventListener("input", function () {
    var got = Sk.decode(inp.value);
    if (got) {
      P.skin = got; applySkin(); drawGallery(); drawEditor();
      $("lookOut").innerHTML = "<p class='note ok'>Got it — " + esc(got.name) + ", by " + esc(got.maker) + ".</p>";
    }
  });
});
press($("lookSave"), function () {
  var nm = "My table " + (Sk.loadMine().length + 1);
  P.skin.name = nm; P.skin.maker = P.name || "Me";
  Sk.remember(P.skin);
  drawGallery();
  toast("Kept as “" + nm + "”.");
});
press($("lookReset"), function () {
  P.skin = Sk.clean(Sk.PRESETS[0]);
  applySkin(); drawGallery(); drawEditor();
});

/* ---------- play with friends ----------
   One phone is the table: it deals, keeps the score and plays the empty
   chairs. Everyone else sits down at it with four letters — typed, or
   read off a QR code by pointing a camera at it, which is fewer letters
   still. The first friend to sit down sits *across* from the table, as
   its partner: two phones is the commonest table there is, and two
   friends want to be a pareja against the house.

   Empty chairs are played by the house until somebody takes them, so a
   table of two works exactly as well as a table of four, and nobody has
   to wait for anybody to start. */
function showParty() {
  var body = $("partyBody");
  if (Net.role === "host") { showRoom(Net.code); open("ovParty"); return; }
  if (Net.role === "guest" && G.mode === "guest" && G.view) {
    body.innerHTML = "<p class='lead'>You're sitting at <b>" + esc(nameOf(0)) + "</b>'s table" +
      (Net.code ? " (" + esc(Net.code) + ")" : "") + ", in the chair " +
      (G.mySeat === 2 ? "across from them — you're partners." : "beside them.") + "</p>" +
      "<div class='row'><button class='btn' id='pLeave'>Leave the table</button></div>";
    press($("pLeave"), function () { Net.close(); Room.forget(); goSolo("You left the table."); shut("ovParty"); });
    open("ovParty");
    return;
  }
  var back = Room.recall();
  body.innerHTML =
    "<p class='lead'>Two phones or four. One phone is the table; the others sit down at it with four letters. " +
    "Your first friend sits across from you, as your partner. Empty chairs are played by the house.</p>" +
    "<div class='fld'><label><b>Your name</b> <span class='val'>so they know it's you</span></label>" +
    "<div class='nameRow'><button class='faceBtn' id='pFace' title='Your face'>" + faceSvg(G.mySeat, "happy", 44, "pf") + "</button>" +
    "<input type='text' id='pName' maxlength='14' value='" + esc(myName()) + "' placeholder='Your name' autocomplete='nickname'></div></div>" +
    (back ? "<div class='row'><button class='btn wide' id='pBack'>↩ Back to <b>" + esc(back.code) + "</b>" +
      (back.title ? " <small style='opacity:.8'>· " + esc(back.title) + "</small>" : "") + "</button></div>" : "") +
    "<div class='door'>" +
    "<button class='btn primary' id='pHost'><span class='k'>📡</span>Host<small>I'll show a code</small></button>" +
    "<button class='btn' id='pJoin'><span class='k'>🔑</span>Join<small>I have a code</small></button>" +
    "</div>" +
    "<div class='row'><button class='btn wide' id='pSame'><span class='k'>🤝</span>One phone, two of us<small style='font-weight:500;opacity:.85'> · partners, passing it back and forth</small></button></div>";
  var takeName = function () { var v = $("pName").value.trim(); if (v) P.name = Net.cleanName(v); myName(); save(); };
  press($("pFace"), function () { takeName(); shut("ovParty"); showFace(); });
  press($("pHost"), function () { takeName(); hostTable(); });
  press($("pJoin"), function () { takeName(); joinTable(); });
  press($("pSame"), function () { takeName(); showSamePhone(); });
  if (back) press($("pBack"), function () {
    takeName();
    Room.resume();
    /* the table itself comes back under the same four letters; a chair
       simply knocks on them again and is shown back to its own bones */
    if (back.role === "host") hostTable(true); else { joinTable(); joinByCode(back.code); }
  });
  open("ovParty");
}

/* one phone, two names: you and your partner, who takes the chair across */
function showSamePhone() {
  var body = $("partyBody");
  body.innerHTML =
    "<p class='lead'>Two of you, one phone, partners against the house. The table is covered while the phone changes hands, so nobody sees the other's bones.</p>" +
    "<div class='fld'><label><b>You</b></label><div class='nameRow'>" + faceSvg(0, "happy", 40, "s0") +
    "<input type='text' id='sName0' maxlength='14' value='" + esc(myName()) + "' autocomplete='off'></div></div>" +
    "<div class='fld'><label><b>Your partner</b> <span class='val'>sits across from you</span></label><div class='nameRow'><span id='sFace1'>" +
    Fc.svg(Fc.forName("compa", ""), "happy", 40, { id: "s1", bg: "#2a1c14" }) + "</span>" +
    "<input type='text' id='sName1' maxlength='14' placeholder='Their name' autocomplete='off'></div></div>" +
    "<div class='row'><button class='btn primary wide' id='sDeal'>Deal us in</button></div>" +
    "<p class='note'>Not rated — the ladder measures one person against the house. Everything else is the same table.</p>";
  var n1 = $("sName1");
  n1.addEventListener("input", function () {
    $("sFace1").innerHTML = Fc.svg(Fc.forName(n1.value.trim() || "compa", ""), "happy", 40, { id: "s1", bg: "#2a1c14" });
  });
  setTimeout(function () { try { n1.focus(); } catch (e) {} }, 200);
  press($("sDeal"), function () {
    var a = Net.cleanName($("sName0").value || myName()), b = Net.cleanName(n1.value || "Compa");
    if (a.toLowerCase() === b.toLowerCase()) b = b + " 2";
    P.name = a; save();
    shut("ovParty");
    hotSeat(a, b);
    banner(a + " & " + b, "partners — pass the phone across the table", 1800);
  });
}

/* The extra a host sends along with each chair's view: the score, the
   names, who is a person, and what just happened. A joined phone used to
   be sent the bones and nothing else — so it showed 0–0 all match, never
   saw anybody pass, and had no idea whose table it was at. */
function hostExtra(extra) {
  var o = extra || {};
  var humans = {};
  for (var s = 0; s < 4; s++) humans[s] = isHuman(s);
  o.meta = {
    scores: G.match ? G.match.scores.slice() : [0, 0],
    target: G.match ? G.match.rules.target : 100,
    handNo: G.match ? G.match.handNo : 0,
    history: G.match ? G.match.history.slice(-30) : [],
    names: G.names, humans: humans, thinking: G.thinking
  };
  return o;
}

function hostTable(again) {
  G.mode = "host"; G.mySeat = 0;
  G.names = { 0: myName() };
  for (var s = 1; s < 4; s++) G.names[s] = botName(s, G.names);
  showRoom(null);
  var fallback = null;
  Net.startHosting(myName()).then(function (code) {
    fallback = code;
    return Net.roomOpen({ name: myName() + "’s table" });
  }).then(function (r) {
    /* four letters if the mailbox is there; the QR handshake if it isn't,
       which is what happens offline and on file:// */
    if (r) showRoom(r.code, again); else showInvite(fallback);
  }).catch(function () { showInvite(fallback); });
  Net.onRoster = function (roster) {
    var humansNow = {};
    for (var i = 0; i < roster.length; i++) if (roster[i].name && roster[i].here) humansNow[roster[i].seat] = roster[i].name;
    humansNow[0] = myName();
    for (var j = 0; j < roster.length; j++) {
      var st = roster[j].seat;
      if (st === 0) continue;
      G.names[st] = humansNow[st] || roster[j].name || botName(st, humansNow);
      G.faces[st] = roster[j].face || "";
    }
    syncAll();
    renderLobby();
  };
  /* Somebody sitting down and somebody coming back look the same from
     here, and should: deal that chair its own view and carry on. The
     seat was held for them by name (see net.js), so the bones are theirs. */
  Net.onLink = function (seat, nm) {
    banner(nm + " sat down", seat === 2 ? "across from you — your partner" : (seat === 1 ? "on your right" : "on your left"), 1800);
    Snd.good();
    renderLobby();
    syncNetChip();
    if (G.st) Net.dealViews(G.st, hostExtra({ turn: G.st.turn }));
    syncAll();
    /* if it is their turn and the house was about to play it, it isn't now */
    if (G.st && G.st.turn === seat) scheduleTurn();
  };
  Net.onDrop = function (seat) {
    if (seat > 0) toast(nameOf(seat) + " dropped — the house plays that chair until they're back.");
    renderLobby();
    syncAll();
    syncNetChip();
    scheduleTurn();
  };
  Net.onMessage = function (msg, from) {
    if (msg.k === "mv") {
      if (G.st && G.st.turn === from) doPlay(from, { tile: msg.tile, end: msg.end });
    } else if (msg.k === "pass") {
      if (G.st && G.st.turn === from) doPass(from);
    }
  };
  if (!G.match) newMatch();
  syncAll();
}

/* ---------- four letters ----------
   The table's own screen: the code, big; a QR code of the same four
   letters for anyone who would rather point a camera than type; and who
   is sitting where. Then one button that deals everybody in. */
function showRoom(code, again) {
  var body = $("partyBody");
  body.innerHTML =
    "<p class='lead' id='roomHow'>" + (again
      ? "Same four letters as before — the chairs find their own way back."
      : "On their phone: open this page → <b>Play with friends</b> → <b>Join</b>, and type:") + "</p>" +
    "<div class='codeBig" + (code ? "" : " pending") + "' id='roomCode'>" + esc(code || "····") + "</div>" +
    "<div class='codeWait' id='roomWait'>" + (code ? "…or point their camera at this:" : "opening the table…") + "</div>" +
    (code ? "<canvas id='qr4'></canvas>" : "") +
    "<div id='lobby'></div>" +
    "<div class='row'><button class='btn primary wide' id='pDeal'>Deal us in</button>" +
    "<button class='btn' id='pShare'>Send link</button></div>" +
    "<p class='note'>Start whenever you like — anyone not here yet is played by the house, and can sit down mid-hand. " +
    "<a href='#' id='pQR' style='color:var(--soft)'>No signal for codes? Use the long-code way.</a></p>";
  renderLobby();
  syncNetChip();
  press($("pDeal"), function () {
    shut("ovParty");
    newMatch();
    toast("Fresh match — " + seatedWords() + ".");
  });
  if (!code) return;
  Net.drawQR($("qr4"), Net.url(code), "#1c1208", "#ffffff");
  press($("pShare"), function () {
    var url = Net.url(code);
    if (navigator.share) navigator.share({ title: "Sit down at my domino table", text: "Four letters: " + code, url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Link copied."); }, function () {});
  });
  press($("pQR"), function () { Net.mintInvite().then(showInvite); });
}
function seatedWords() {
  var n = 0;
  for (var s = 1; s < 4; s++) if (isHuman(s)) n++;
  return n ? (n + 1) + " of you at the table" : "the house is keeping your seats warm";
}

/* the chair's own screen: type four letters, or tap a table you can see */
var roomListT = 0, roomJoining = false;
function joinByRoom() {
  $("partyBody").innerHTML =
    "<p class='lead'>Type the four letters on the table's screen.</p>" +
    "<input class='codeIn' id='jRoom' maxlength='4' inputmode='latin' autocapitalize='characters' autocomplete='off' spellcheck='false' placeholder='····' aria-label='Their four-letter code'>" +
    "<div class='codeWait' id='jWait'>four letters and you're in</div>" +
    "<div class='roomList' id='jList'></div>" +
    "<div class='fld'><label><b>Your name</b></label><input type='text' id='jName' maxlength='14' value='" + esc(myName()) + "'></div>" +
    "<div class='row'><button class='btn' id='jQR'>Long-code way instead</button></div>";
  press($("jQR"), function () { stopRoomList(); joinByPaste(null); });
  $("jRoom").addEventListener("input", function () {
    var v = Room.tidy(this.value);
    this.value = v;
    if (v.length === 4) joinByCode(v);
  });
  refreshRoomList();
  startRoomList();
  setTimeout(function () { try { $("jRoom").focus(); } catch (e) {} }, 250);
}
function jNote(t) { var el = $("jWait"); if (el) el.textContent = t; }
function startRoomList() { stopRoomList(); roomListT = setInterval(refreshRoomList, 3500); }
function stopRoomList() { if (roomListT) { clearInterval(roomListT); roomListT = 0; } }
function refreshRoomList() {
  Net.roomList().then(function (rooms) {
    var box = $("jList");
    if (!box) { stopRoomList(); return; }
    if (rooms === null) { noMailbox(); return; }
    if (!rooms.length) {
      box.innerHTML = "<div class='roomEmpty'>No open tables nearby yet — when a friend taps <b>Host</b>, theirs shows up here too.</div>";
      return;
    }
    box.innerHTML = rooms.map(function (r) {
      return "<button class='roomRow' data-code='" + esc(r.code) + "'>" +
        "<span class='rrCode'>" + esc(r.code) + "</span>" +
        "<span class='rrTx'><b>" + esc(r.name || "A table") + "</b><i>" + esc(r.host || "somebody") +
        " · " + (r.players || 1) + " of " + (r.seats || 4) + " seated</i></span>" +
        "<span class='rrGo'>sit down ▸</span></button>";
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".roomRow"), function (b) {
      press(b, function () { joinByCode(b.dataset.code); });
    });
  });
}
function noMailbox() {
  stopRoomList();
  toast("No four-letter codes here — the long-code way still works.");
  joinByPaste(null);
}
function joinByCode(code, retry) {
  code = Room.tidy(code);
  if (!Room.looksLikeCode(code) || roomJoining) return;
  if (Room.impossible(code)) { jNote("codes never use I or O — they'd read as 1 and 0. Check it again."); return; }
  var nameBox = $("jName");
  if (nameBox && nameBox.value.trim()) { P.name = Net.cleanName(nameBox.value); save(); }
  roomJoining = true;
  stopRoomList();
  if ($("jList")) $("jList").innerHTML = "";
  jNote("knocking on " + code + "…");
  Net.roomJoin(code, myName()).then(function (r) {
    roomJoining = false;
    if (!r) { noMailbox(); return; }
    if (r.error) {
      /* "full" is nearly always a spare pigeonhole still being minted —
         one patient retry beats making somebody type it again */
      if (/full/i.test(r.error) && !retry) { jNote("that table is pulling up a chair…"); setTimeout(function () { joinByCode(code, true); }, 1600); return; }
      jNote(r.error);
      startRoomList();
      return;
    }
    jNote("found " + (r.name || code) + " — taking a seat…");
  }, function () { roomJoining = false; jNote("that didn't take — try the code again"); startRoomList(); });
}

/* ---------- the link's pulse, at the table ---------- */
function syncNetChip() {
  var el = $("netChip");
  if (!el) return;
  if (G.mode !== "host" && G.mode !== "guest") { el.className = "hide"; return; }
  var h = Net.health();
  el.className = h.state;
  $("netChipTx").textContent = h.words + (Net.code ? " · " + Net.code : "");
}

function showInvite(code) {
  if (!code) { $("partyBody").innerHTML = "<p class='lead'>The table is full.</p>"; return; }
  var url = Net.url(code);
  $("partyBody").innerHTML =
    "<p class='lead'>Hold this up. They point a camera at it — no app, no account, nothing to type.</p>" +
    "<canvas id='qr'></canvas>" +
    "<div id='lobby'></div>" +
    "<div class='row'><button class='btn' id='pShare'>Send the link</button>" +
    "<button class='btn' id='pReply'>They have a code for me</button></div>" +
    "<div class='row'><button class='btn primary wide' id='pDeal'>Deal us in</button></div>" +
    "<p class='note'>Everyone who is not here yet is played by the house, so you can start now and let them join as they arrive.</p>";
  Net.drawQR($("qr"), url, "#1c1208", "#ffffff");
  renderLobby();
  press($("pDeal"), function () { shut("ovParty"); newMatch(); });
  press($("pShare"), function () {
    if (navigator.share) navigator.share({ title: "Sit down at my domino table", url: url }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast("Link copied."); }, function () {});
  });
  press($("pReply"), function () {
    $("lobby").innerHTML = "<div class='fld'><label><b>Paste what their phone shows</b></label>" +
      "<input type='text' id='replyIn' placeholder='DTAB…'></div>";
    var inp = $("replyIn");
    inp.focus();
    inp.addEventListener("input", function () {
      Net.acceptReply(inp.value).then(function (ok) {
        if (ok) { inp.value = ""; toast("Linking…"); Net.mintInvite().then(showInvite); }
      });
    });
  });
}
/* who is sitting where — the chairs in turn order, with who is a person */
function renderLobby() {
  var el = $("lobby");
  if (!el) return;
  var order = [[2, "across · your partner"], [1, "on your right"], [3, "on your left"]];
  var html = "<div class='seatList'>";
  for (var i = 0; i < order.length; i++) {
    var s = order[i][0], r = Net.roster[s], here = !!(r && r.here && !r.bot);
    html += "<div class='seatRow" + (here ? " here" : "") + (s === 2 ? " us" : "") + "'><span class='sd'></span>" +
      (here ? Fc.svg(Fc.forName(r.name, r.face), "happy", 26, { id: "lb" + s, bg: "#2a1c14" }) : "") +
      "<b>" + esc(here ? r.name : (r && r.name ? r.name + " (away)" : "the house")) + "</b>" +
      "<span class='sr'>" + order[i][1] + "</span></div>";
  }
  el.innerHTML = html + "</div>";
}

/* One door, two kinds of key. Four letters is the way in; a whole
   pasted handshake still works and always will, because it is what is
   left when there is no mailbox to mint four letters from. */
function joinTable(prefill) {
  guestHandlers();
  if (prefill && !Room.isCode(prefill)) { joinByPaste(prefill); return; }
  joinByRoom();
  if (prefill) {
    var box = $("jRoom");
    if (box) box.value = Room.tidy(prefill);
    joinByCode(prefill);
  }
}
function joinByPaste(prefill) {
  guestHandlers();
  $("partyBody").innerHTML =
    "<p class='lead'>Point your camera at the code on their phone, or paste it here.</p>" +
    "<div class='fld'><label><b>Your name</b></label><input type='text' id='jName' maxlength='14' value='" + esc(myName()) + "'></div>" +
    "<div class='fld'><label><b>Their code</b></label><input type='text' id='jCode' placeholder='DTAB…' value='" + esc(prefill || "") + "'></div>" +
    "<div id='jOut'></div>";
  var go = function () {
    var code = $("jCode").value;
    if (!code || code.length < 20) return;
    if ($("jName").value.trim()) { P.name = Net.cleanName($("jName").value); save(); }
    Net.join(code, myName()).then(function (res) {
      if (!res) { $("jOut").innerHTML = "<p class='note warn'>That code didn't work. Ask for a fresh one — nothing is broken.</p>"; return; }
      $("jOut").innerHTML = "<p class='lead'>Now show <b>them</b> this. One more code and you're in.</p>" +
        "<canvas id='qr'></canvas><div class='code mono'>" + esc(res.reply) + "</div>";
      Net.drawQR($("qr"), res.reply, "#1c1208", "#ffffff");
      if (navigator.clipboard) navigator.clipboard.writeText(res.reply).catch(function () {});
    });
  };
  $("jCode").addEventListener("input", go);
  if (prefill) go();
}

/* A phone that is about to sit down at somebody else's table stops its
   own. It used to carry on underneath: the solo match started behind the
   splash kept three machines playing on this phone, and their moves
   scrolled through the commentary of the real game. */
function stopLocal(clearView) {
  clearTimeout(turnT);
  G.thinking = -1; G.sel = null; G.hint = null; G.anim = null; G.drag = null; G.press = null; G.hot = null;
  shut("ovPass");
  if (clearView !== false) { G.st = null; G.match = null; G.view = null; G.lastNote = null; }
}
function goSolo(why) {
  G.mode = "solo"; G.mySeat = 0; G.hot = null;
  G.names = { 0: myName() };
  for (var s = 1; s < 4; s++) G.names[s] = botName(s, G.names);
  syncNetChip();
  if (why) toast(why);
  newMatch();
}

/* Everything a chair needs to know, wherever it came in from. Split out
   of joinTable so the four-letter door and the paste door install exactly
   the same handlers — a difference between them would be a bug nobody
   would find until somebody's phone locked. */
function guestHandlers() {
  Net.onLink = function (seat) {
    /* only now does this phone stop being its own table: until a chair is
       actually given, closing the door leaves the solo game where it was */
    if (G.mode !== "guest") { stopLocal(true); G.mode = "guest"; }
    G.mySeat = seat;
    /* until the host deals, an empty table and a word about whose it is —
       not the last frame of whatever this phone was playing before */
    if (!G.view) {
      G.view = { line: [], hand: [], counts: [0, 0, 0, 0], turn: -1, left: -1, right: -1, passes: 0, seat: seat };
      G.lastNote = { seat: 0, text: "At " + nameOf(0) + "'s table — waiting for the deal" };
    }
    stopRoomList();
    shut("ovParty");
    banner("You're in", seat === 2 ? "Partners with " + nameOf(0) + " — sitting across" : "Seat " + (seat + 1) + " at " + nameOf(0) + "'s table", 1800);
    Snd.good();
    Room.remember({ role: "guest", code: Net.code, name: P.name, seat: seat });
    syncNetChip();
  };
  /* the link came back by itself: no banner, no fuss — the host re-deals
     this chair's view within the beat and the hand carries on */
  Net.onRejoin = function () {
    toast("Back at the table.");
    syncNetChip();
  };
  Net.onHealth = function (state) {
    syncNetChip();
    if (state === "healing") toast("Lost the table for a moment — finding it again…");
  };
  Net.onRoster = function (roster) {
    for (var i = 0; i < roster.length; i++) {
      G.names[roster[i].seat] = roster[i].name || ("Seat " + (roster[i].seat + 1));
      G.faces[roster[i].seat] = roster[i].face || "";
    }
    syncAll();
  };
  /* only reached when there is nothing to be done automatically: a
     paste/QR chair has no four letters to knock on again */
  Net.onDrop = function () {
    banner("The table closed", "Playing on your own now", 2600);
    goSolo();
  };
  Net.onMessage = function (msg) {
    if (G.mode !== "guest") return;
    if (msg.k === "view") {
      takeMeta(msg.meta);
      var fresh = !G.view || msg.start;
      G.view = msg.view;
      if (msg.start) {
        shut("ovEnd");
        G.sel = null; G.hint = null; G.lastIdx = -1; G.anim = null; G.lastNote = null;
        if (!msg.shuffling) G.hs = freshHandStats();
        if (msg.shuffling) { Snd.shuffle(); banner("Mano " + ((G.meta ? G.meta.handNo : 0) + 1), "lavando las fichas", 1300, true); }
      }
      if (msg.ev) happen(msg.ev);
      G.busy = false;
      if (fresh && !msg.shuffling && G.view.turn === G.mySeat) yourTurnOnce();
      syncAll();
    } else if (msg.k === "beat") {
      G.thinking = msg.thinking;
      if (msg.turn === G.mySeat && msg.thinking < 0) yourTurnOnce();
      syncAll();
    } else if (msg.k === "end") {
      if (msg.names) for (var s in msg.names) if (+s !== G.mySeat) G.names[s] = msg.names[s];
      if (msg.end) {
        takeMeta({ scores: msg.end.scores, history: msg.end.history, target: msg.end.target });
        finale(msg.end);
      }
    }
  };
}
/* the guest's turn chime, once per turn however many messages say so */
var turnSaid = "";
function yourTurnOnce() {
  if (!G.view) return;
  var k = (G.meta ? G.meta.handNo : 0) + ":" + G.view.line.length + ":" + G.view.passes;
  if (turnSaid === k) return;
  turnSaid = k;
  yourTurn();
}
function takeMeta(m) {
  if (!m) return;
  G.meta = G.meta || {};
  for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) G.meta[k] = m[k];
  if (m.names) for (var s in m.names) if (+s !== G.mySeat) G.names[s] = m.names[s];
  if (m.humans) G.humans = m.humans;
  if (m.thinking !== undefined) G.thinking = m.thinking;
  /* enough of a match for the score rail and the end sheet to read */
  G.match = { scores: G.meta.scores || [0, 0], history: G.meta.history || [], handNo: G.meta.handNo || 0,
              rules: { target: G.meta.target || 100 }, over: false };
}

/* ---------- the splash ---------- */
press($("goSolo"), function () { startFresh("solo"); });
press($("goParty"), function () { begin("party"); showParty(); });
press($("goLearn"), function () { showLessons(); });
press($("goLook"), function () { startFresh("solo"); showLook(); });

function begin(mode) {
  $("splash").classList.add("gone");
  setTimeout(function () { $("splash").style.display = "none"; }, 520);
  resize();
  if (P.music && P.sound) Snd.music.start();
  if (mode === "resume") { G.mode = "solo"; syncAll(); return; }
  G.mySeat = 0; G.hot = null;
  G.names = { 0: P.name || "You" };
  for (var s = 1; s < 4; s++) G.names[s] = botName(s, G.names);
  /* "party" waits for the door: no match is dealt behind the sheet
     unless the player closes it without choosing, in which case they
     simply have a solo game in front of them */
  if (mode === "party") {
    G.mode = "solo";
    whenShut("ovParty", function () { if (!G.match && G.mode === "solo") newMatch(); });
    return;
  }
  G.mode = mode;
  if (!G.match) newMatch(); else syncAll();
}

/* ---------- where you left off, on the door ----------
   Two kinds of unfinished business can be waiting when the room opens:
   a solo match written down after its last play, and a table with
   friends whose four letters are still good. Both get a button on the
   splash, above everything else, because "pick up where I was" is the
   commonest reason to open the room twice. */
function splashResume() {
  var el = $("splashResume");
  if (!el) return;
  var saved = loadMatch(), back = Room.recall(), html = "";
  if (saved) {
    var us = R.team(saved.hot ? (saved.mySeat || 0) : 0);
    html += "<button class='btn primary wide' id='goResume'>▶ Resume — mano " + (saved.match.handNo + 1) +
      " · " + saved.match.scores[us] + "–" + saved.match.scores[1 - us] +
      (saved.hot ? " · " + esc(saved.names[0]) + " &amp; " + esc(saved.names[2]) : (saved.mm && saved.mm.rated ? " · rated" : "")) + "</button>";
  }
  if (back) {
    html += "<button class='btn wide' id='goBack'>↩ " + (back.role === "host" ? "Re-open my table" : "Back to " + esc(back.title || "the table")) +
      " <b>" + esc(back.code) + "</b></button>";
  }
  el.innerHTML = html;
  el.classList.toggle("hide", !html);
  if (saved) press($("goResume"), function () { resumeMatch(saved); });
  if (back) press($("goBack"), function () {
    begin("party");
    Room.resume();
    if (back.role === "host") { hostTable(true); open("ovParty"); }
    else { open("ovParty"); joinTable(); joinByCode(back.code); }
  });
}
/* starting fresh over a saved rated match that was already lost is the
   loss it was — said first, the way it is mid-session */
function startFresh(mode) {
  var saved = loadMatch();
  if (saved && saved.mm && saved.mm.rated && !saved.hot) {
    var res = Rt.abandonResult({ hands: saved.match.handNo, us: saved.match.scores[0], them: saved.match.scores[1], target: saved.match.rules.target });
    if (res === 0) {
      ask("Your saved match counts as a loss", "It was well behind. Starting a new one resigns it; Resume keeps it.",
        [["Resign and start fresh", function () { G.mm = saved.mm; G.match = saved.match; rate(0); G.mm = null; G.match = null; clearMatch(); begin(mode); }],
         ["Keep it", null]]);
      return;
    }
  }
  clearMatch();
  begin(mode);
}
function whenShut(id, fn) {
  var el = $(id), t = setInterval(function () {
    if (el.classList.contains("hide")) { clearInterval(t); fn(); }
  }, 300);
}

/* a few bones tumbling on the splash, drawn with the real painter */
(function splashArt() {
  var cv = $("splashCv");
  if (!cv) return;
  var tmp = new window.Gfx2D(cv);
  tmp.skin = Sk.clean(Sk.PRESETS[0]);
  tmp.dpr = 1; tmp.w = cv.width; tmp.h = cv.height;
  var g = cv.getContext("2d");
  g.clearRect(0, 0, cv.width, cv.height);
  var set = [[6, 6, 96, 110, -8], [6, 3, 208, 96, 5], [3, 5, 320, 112, -3], [5, 5, 430, 100, 9]];
  for (var i = 0; i < set.length; i++) {
    var s = set[i];
    tmp.bone(s[2], s[3], s[0] === s[1] ? 62 : 118, s[0] === s[1] ? 118 : 62, s[4], s[0], s[1], { lift: 0.7 });
  }
})();

/* ---------- boot ---------- */
load();
makeRenderers();
splashRank();
splashResume();
/* the room: bulbs and papel picado over the table, and over the door */
if (Cn) {
  Cn.hang($("stage"), { z: 1 });
  Cn.hang($("splash"), { z: 0, scale: 1.15 });
}

/* a link can arrive carrying a table to wear or a chair to sit in */
(function fromLink() {
  var h = location.hash || "";
  var mt = h.match(/table=([A-Za-z0-9_.\-]+)/);
  if (mt) {
    var got = Sk.decode(mt[1]);
    if (got) { P.skin = got; save(); gfx.setSkin(P.skin); over.setSkin(P.skin); }
  }
  var mj = h.match(/join=([A-Za-z0-9_.\-]+)/);
  if (mj) {
    /* straight to the chair: no match is dealt on this phone, and the
       name box is filled in for them, so a scanned QR code is one tap
       (or none) from sitting down */
    begin("party");
    open("ovParty");
    setTimeout(function () { joinTable(mj[1]); }, 60);
    try { history.replaceState(null, "", location.pathname); } catch (e) {}
  }
})();

window.addEventListener("keydown", function (e) {
  if (e.target && /input|textarea/i.test(e.target.tagName)) return;
  if (e.key === "h") giveHint();
  if (e.key === "c") showCount();
});

/* ---------- offline, and quietly announced updates ----------
   A new version waits rather than swapping itself in: a match runs
   twenty minutes and reloading mid-hand would lose it. */
var swWaiting = null, swReg = null;
function takeUpdate() {
  if (!swWaiting) { location.reload(); return; }
  /* the new worker takes over, and the page follows it */
  try { swWaiting.postMessage("skipWaiting"); } catch (e) { location.reload(); }
  setTimeout(function () { location.reload(); }, 400);
}
if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      swReg = reg;
      if (reg.waiting && navigator.serviceWorker.controller) swWaiting = reg.waiting;
      reg.addEventListener("updatefound", function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", function () {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            swWaiting = sw;
            toast("A new version is ready — Menu → Update, or it loads next time.");
          }
        });
      });
    }).catch(function () { /* offline play is a bonus, never a requirement */ });
  });
}

/* the room's own handles, for the smoke tests and for anyone curious */
window.__dt = function () {
  /* `tryPlay` and `doPass` are here for `tools/room-check.js`, which
     needs to keep a hand moving while it times the machines' beats —
     it is the player's turn a quarter of the time and the room is quite
     right to sit and wait, but a stalled window measures nothing. */
  return { G: G, P: P, gfx: gfx, over: over, scene: scene, Net: Net, tryPlay: tryPlay, doPass: doPass,
           Room: Room, joinByCode: joinByCode, health: Net.health(), PACES: PACES,
           happen: happen, showCareer: showCareer, record: record, leanFor: leanFor, mood: mood, showFace: showFace,
           makeRenderers: makeRenderers, hotSeat: hotSeat, loadMatch: loadMatch, saveMatch: saveMatch,
           finale: finale, thinkFor: thinkFor, learning: learning, coachUp: coachUp, showGrade: showGrade };
};
})();
