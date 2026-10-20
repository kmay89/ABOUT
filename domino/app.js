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
    Snd = window.Sound, Car = window.Career;

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
  /* browsers keep audio asleep until a touch; any touch will do */
  Snd.unlock();
  var c = e.target.getAttribute && e.target.getAttribute("data-close");
  if (c) shut(c);
  /* tapping the dark outside a sheet closes it too */
  if (e.target.classList && e.target.classList.contains("ov")) e.target.classList.add("hide");
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
  name: "", skin: null, view3d: true, level: "compadre",
  pace: "relaxed",
  rules: { target: 100, capicua: 25, countAll: false, trancaTie: "closer", firstSalida: "mula" },
  seen: {}, coach: true, sound: true, grade: true,
  career: null,
  id: ""                /* this phone, so a chair it drops is given back to it */
};
function load() {
  try {
    var raw = JSON.parse(localStorage.getItem(SAVE) || "null");
    if (raw && raw.v === 1) {
      P.name = Net.cleanName(raw.name || "");
      P.view3d = raw.view3d !== false;
      P.level = AI.LEVELS[raw.level] ? raw.level : "compadre";
      P.pace = PACES[raw.pace] ? raw.pace : "relaxed";
      P.coach = raw.coach !== false;
      P.sound = raw.sound !== false;
      P.grade = raw.grade !== false;
      P.seen = raw.seen || {};
      P.career = Car.clean(raw.career);
      if (typeof raw.id === "string" && /^[a-z0-9]{6,16}$/.test(raw.id)) P.id = raw.id;
      if (raw.rules) P.rules = R.houseRules(raw.rules);
      if (raw.skin) P.skin = Sk.clean(raw.skin);
    }
  } catch (e) { /* a corrupt save is quietly retired rather than fatal */ }
  if (!P.skin) P.skin = Sk.clean(Sk.PRESETS[0]);
  if (!P.name) P.name = "";
  if (!P.career) P.career = Car.fresh();
  if (!P.id) P.id = (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12);
  Snd.on = P.sound;
  Net.id = P.id;
}
function save() {
  try {
    localStorage.setItem(SAVE, JSON.stringify({
      v: 1, name: P.name, skin: P.skin, view3d: P.view3d, level: P.level, pace: P.pace,
      rules: P.rules, seen: P.seen, coach: P.coach, sound: P.sound, grade: P.grade,
      career: P.career, id: P.id
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
function freshHandStats() { return { sharp: 0, graded: 0, feeds: 0, hangs: 0 }; }

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
      var ends = playable[G.sel];
      for (var k = 0; k < ends.length; k++) {
        var e = t.ends[ends[k]];
        ghosts.push({ end: ends[k], x: e.x + L.DX[e.h] * (isDbl(G.sel) ? 0.5 : 1),
                      y: e.y + L.DY[e.h] * (isDbl(G.sel) ? 0.5 : 1), h: e.h });
      }
    }
  }
  /* the other three hands are on the plates now, not on the canvas */
  return {
    view: v, table: t, hand: v ? v.hand : [],
    playable: playable, selected: G.sel, ghosts: ghosts,
    lastIdx: G.lastIdx, lastAge: G.lastAt ? performance.now() - G.lastAt : 0, anim: G.anim,
    yourTurn: mine, topPad: hudBottom(), botPad: handTop()
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
      G.lastAt = performance.now();
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
$("stage").addEventListener("pointerdown", function (e) {
  if (!G.view || G.busy) return;
  /* the buttons that float on the stage handle themselves */
  if (e.target && e.target.closest && e.target.closest("#endPick")) return;
  var p = stagePoint(e);
  /* the hand always belongs to the overlay, in both renderers, so the
     tap target is identical whichever one is drawing the table */
  var h = over.hit(p.x, p.y);
  if (h.kind === "hand") { pickBone(G.view.hand[h.i]); return; }
  if (G.view.turn !== G.mySeat) return;

  var end = null;
  if (gfx.kind === "3d") {
    var got = gfx.hitTable(p.x, p.y, scene());
    if (got) end = got.end;
  } else {
    var g2 = gfx.hit(p.x, p.y);
    if (g2.kind === "end") end = g2.end;
  }
  if (end && G.sel !== null) tryPlay(G.sel, end);
  else if (G.sel !== null) { G.sel = null; G.hint = null; syncAll(); }
});

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
  /* one place it can go: put it there. Two: lift it and let them
     choose. Making somebody confirm a decision with only one possible
     answer is the commonest way to make a game feel slow. */
  if (ends.length === 1) { tryPlay(tile, ends[0]); return; }
  G.sel = (G.sel === tile) ? null : tile;
  if (G.sel === null) G.hint = null;
  Snd.tick();
  syncAll();
}

function tryPlay(tile, end) {
  G.sel = null; G.hint = null;
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

/* ---------- grading your plays ---------- */
var gradeT = 0;
function judge(mv) {
  if (!G.view || !P.grade) return;
  var v = G.view;
  if (AI.movesFor(v).length < 2) return;
  var a;
  try { a = AI.analyse(v, { level: "maestro" }); } catch (e) { return; }
  var gr = C.grade(v, a, mv, { names: G.names });
  if (!gr) return;
  if (!G.hs) G.hs = freshHandStats();
  G.hs.graded++;
  record({ k: "graded" });
  if (gr.id === "sharp") { G.hs.sharp++; record({ k: "sharp" }); }
  var el = $("grade");
  el.className = gr.id;
  el.textContent = gr.icon + " " + gr.label + (gr.id === "sharp" && G.hs.sharp > 1 ? " ×" + G.hs.sharp : "");
  void el.offsetWidth;
  el.classList.add("on");
  clearTimeout(gradeT);
  gradeT = setTimeout(function () { el.classList.remove("on"); }, 1700);
  if (gr.id === "sharp") Snd.good();
  /* a costly play is worth a sentence, but not every time — a coach who
     comments on everything is a coach you stop reading */
  if (gr.id === "miss" && P.coach && gr.say) {
    chuy(gr.say, gr.why);
  }
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
    if (ev.seat !== me) bubble(ev.seat, C.boneName(ev.tile), "", 1500);
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
    note(ev.seat, nameOf(ev.seat) + " · ¡paso!");
    sayMoment({ k: "pass", seat: ev.seat, you: me, ends: ev.ends });
    if (ev.by >= 0 && ev.by !== ev.seat) {
      var hungOpp = R.isOpponent(ev.by, ev.seat);
      sayMoment({ k: "hung", seat: ev.seat, by: ev.by, you: me });
      if (ev.by === me && hungOpp) {
        if (!G.hs) G.hs = freshHandStats();
        if (G.hs.hangs < 3) { G.hs.hangs++; record({ k: "hang" }); }
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
  G.anim = {
    idx: idx, t: 0, dur: pace().anim,
    fromX: b.x + from[0], fromY: b.y + from[1],
    fromRot: b.rot + (rel % 2 ? 90 : 0) + (rel === 0 ? 0 : (rel === 1 ? -25 : 25)),
    hard: hard ? 1 : 0.6, mine: seat === G.mySeat
  };
}

function afterMove(ev) {
  refreshView();
  syncAll();
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
  slow:    { id: "slow",    label: "Unhurried", note: "Time to think about every play.", think: 1700, spread: 1000, settle: 1500, anim: 0.78 },
  relaxed: { id: "relaxed", label: "Relaxed", note: "A beat to see each play land.", think: 1150, spread: 800, settle: 1050, anim: 0.62 },
  brisk:   { id: "brisk",   label: "Brisk",   note: "The usual pace of a table in a hurry.", think: 650, spread: 450, settle: 600, anim: 0.46 },
  quick:   { id: "quick",   label: "Quick",   note: "For when you just want the hand over.", think: 220, spread: 160, settle: 160, anim: 0.32 }
};
function pace() { return PACES[P.pace] || PACES.relaxed; }

var turnT = 0;
function scheduleTurn() {
  clearTimeout(turnT);
  var st = G.st;
  if (!st || st.over) return;
  var seat = st.turn;
  G.thinking = -1;

  if (isHuman(seat)) {
    if (!R.canPlay(st, seat)) {
      /* a human who cannot play still has to say it out loud — but
         making them tap a button they have no choice about is theatre,
         so it is said for them after a beat (long enough to see why) */
      if (seat === G.mySeat) note(seat, "Nothing fits — you knock: paso.");
      turnT = setTimeout(function () { doPass(seat); }, pace().think + 500);
    } else if (seat === G.mySeat) {
      yourTurn();
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
    var a = AI.analyse(v, { level: P.level });
    if (a.move) doPlay(seat, a.move); else doPass(seat);
  }, p.think + Math.random() * p.spread);
}
/* it has come round to you: say so, quietly, three ways */
function yourTurn() {
  Snd.turn();
  Snd.buzz(18);
  if (G.view) sayMoment({ k: "yourTurn", you: G.mySeat, line: G.view.line.length });
}
function isHuman(seat) {
  if (G.mode === "solo") return seat === 0;
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

/* ---------- a hand begins ---------- */
function newMatch() {
  /* the hand is dealt: the table stops advertising itself but keeps its
     four letters, because that is the address latecomers — and anyone
     whose phone locked — come back to */
  if (G.mode === "host") Net.roomStarted();
  G.match = R.newMatch({ seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0, rules: P.rules });
  G.handNo = 0;
  nextHand(true);
}
function nextHand(first) {
  clearTimeout(turnT);
  G.sel = null; G.hint = null; G.anim = null; G.lastIdx = -1; G.lastNote = null; G.thinking = -1;
  G.hs = freshHandStats();
  G.st = R.dealHand(G.match);
  refreshView();
  G.busy = true;
  Snd.shuffle();
  if (G.mode === "host") Net.dealViews(G.st, hostExtra({ start: true, shuffling: true }));
  syncAll();
  shuffleTitle(first, function () {
    G.busy = false;
    if (G.mode === "host") Net.dealViews(G.st, hostExtra({ start: true }));
    syncAll();
    var opener = G.st.turn;
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
  if (r.how === "domino") {
    bubble(r.winner, r.capicua ? "¡Capicúa!" : "¡Dominó!", "big", 1800);
    banner(r.capicua ? "¡Capicúa!" : "¡Dominó!", r.winner === G.mySeat ? "You went out" : nameOf(r.winner) + " went out", 1500, true);
  } else {
    banner("¡Tranca!", "Nobody can move — count the bones", 1500, true);
  }
  if (r.team >= 0) { if (won) Snd.win(); else Snd.lose(); }
  if (won) confetti(r.capicua || pack.over ? 160 : 70);
  setTimeout(function () { showEnd(pack); }, 1500);
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
      "<span class='who'>" + esc(s === G.mySeat ? "You" : nameOf(s)) + "</span>" +
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
    rows += "<p class='note'>Your plays this hand: <b>" + G.hs.sharp + "</b> sharp of " + G.hs.graded + " with a real choice" +
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
  var xpHtml = "";
  if (pack.key && G.endKey !== pack.key) {
    G.endKey = pack.key;
    var res = [];
    res.push(record({ k: "hand", won: won, mine: r.winner === G.mySeat, how: r.how, capicua: r.capicua,
                      points: r.points, sharp: G.hs ? G.hs.sharp : 0, friends: G.mode !== "solo" }, true));
    if (pack.over) {
      var lvlForXp = G.mode === "solo" ? P.level : (G.mode === "host" ? P.level : "compadre");
      res.push(record({ k: "match", won: pack.champion === us, level: lvlForXp, zapatero: pack.zapatero && pack.champion === us }, true));
    }
    xpHtml = xpBlock(res);
  }
  $("endXP").innerHTML = xpHtml;
  var bar = $("endXP").querySelector(".bar i");
  if (bar) setTimeout(function () { bar.style.width = bar.getAttribute("data-w"); }, 60);

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
  if (out.rankUp && !quiet) rankUp(out.rankUp);
  return out;
}
function rankUp(rank) {
  Snd.rank();
  confetti(200);
  banner("¡" + rank.name + "!", "You moved up — " + rank.note, 2600, true);
}
function xpBlock(res) {
  var lines = [], badges = [], up = null, rank = null;
  res.forEach(function (o) {
    lines = lines.concat(o.gain); badges = badges.concat(o.badges);
    if (o.rankUp) up = o.rankUp; rank = o.rank;
  });
  rank = Car.rankOf(P.career.xp);
  var html = "<div class='rankCard' style='width:100%;margin-top:12px'>" + rankHead(rank);
  if (lines.length) {
    html += "<ul class='xpList'>";
    lines.forEach(function (l, i) {
      html += "<li style='animation-delay:" + (0.15 + i * 0.12).toFixed(2) + "s'><span>" + esc(l.why) + "</span><b>+" + l.xp + "</b></li>";
    });
    html += "</ul>";
  }
  html += "</div>";
  if (up) {
    html += "<div class='rankUp'>¡Subiste! You are now " + esc(up.name) + "<small>" + esc(up.note) + "</small></div>";
    setTimeout(function () { rankUp(up); }, 500);
  }
  badges.forEach(function (b) {
    html += "<div class='badge new' style='margin-top:8px'><b>🏅 " + esc(b.name) + "</b><small>" + esc(b.note) + "</small></div>";
  });
  return html;
}
function rankHead(rk) {
  return "<div class='rt'><span class='rn'>" + esc(rk.rank.name) + "</span>" +
    "<span class='rx'>" + P.career.xp + (rk.next ? " / " + rk.next.xp + " xp" : " xp") + "</span></div>" +
    "<div class='rnote'>" + esc(rk.next ? "Next: " + rk.next.name : rk.rank.note) + "</div>" +
    "<div class='bar'><i data-w='" + Math.round(rk.frac * 100) + "%' style='width:" + Math.round(rk.frac * 100) + "%'></i></div>";
}
function showCareer() {
  var c = P.career, rk = Car.rankOf(c.xp);
  var pct = function (a, b) { return b ? Math.round(a / b * 100) + "%" : "—"; };
  var html = "<div class='rankCard' style='width:100%'>" + rankHead(rk) + "</div>" +
    "<div class='stats'>" +
    stat(c.matchWins + "/" + c.matches, "matches won") +
    stat(pct(c.handWins, c.hands), "hands won") +
    stat(pct(c.sharp, c.graded), "sharp plays") +
    stat(c.dominos, "dominós") + stat(c.capicuas, "capicúas") + stat(c.best, "best streak") +
    "</div><h3 style='margin-top:14px;font-size:1rem'>Logros</h3><div class='badges'>";
  Car.BADGES.forEach(function (b) {
    html += "<div class='badge" + (c.badges[b.id] ? "" : " off") + "'><b>" + (c.badges[b.id] ? "🏅 " : "") + esc(b.name) + "</b><small>" + esc(b.note) + "</small></div>";
  });
  html += "</div><h3 style='margin-top:14px;font-size:1rem'>The ladder</h3><div class='badges'>";
  Car.RANKS.forEach(function (r, i) {
    html += "<div class='badge" + (i <= rk.i ? "" : " off") + (i === rk.i ? " new" : "") + "'><b>" + esc(r.name) + "</b><small>" + r.xp + " xp · " + esc(r.note) + "</small></div>";
  });
  var sug = Car.suggestLevel(c);
  html += "</div><p class='note'>Opponents now: <b>" + esc(AI.level(P.level).label) + "</b>." +
    (sug !== P.level ? " At your rank the table would suggest <b>" + esc(AI.level(sug).label) + "</b> — change it in House rules." : "") +
    " Wins pay more against stronger players.</p>";
  $("careerBody").innerHTML = html;
  open("ovCareer");
}
function stat(v, l) { return "<div class='stat'><b>" + esc(v) + "</b><small>" + esc(l) + "</small></div>"; }
function splashRank() {
  var el = $("splashRank");
  if (!el) return;
  var c = P.career, rk = Car.rankOf(c.xp);
  el.innerHTML = rankHead(rk) + (c.matches ? "<div class='rnote' style='margin-top:4px'>" + c.matchWins + " of " + c.matches + " matches won" + (c.streak > 1 ? " · on a streak of " + c.streak : "") + "</div>" : "");
}

/* ---------- confetti, for the moments that earn it ---------- */
var bits = [];
function confetti(n) {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var cv = $("confetti"); if (!cv) return;
  var w = cv.width, cols = ["#ffd77a", "#f0a83c", "#3ecf8e", "#e06a52", "#8fb0ff", "#fff6e4"];
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
function chuy(say, why, ms) {
  $("chuySay").textContent = say;
  $("chuyWhy").textContent = why || "";
  $("chuy").classList.remove("off");
  clearTimeout(chuyT);
  /* a remark goes away on its own; a hint you asked for stays put */
  if (ms) chuyT = setTimeout(function () { $("chuy").classList.add("off"); }, ms + (why ? 3000 : 0));
}
press($("chuyClose"), function () { $("chuy").classList.add("off"); });

function giveHint() {
  if (!G.view) return;
  if (G.view.turn !== G.mySeat) { chuy("Not your turn yet — watch what they play.", "", 3000); return; }
  var a = AI.analyse(G.view, { level: "maestro" });
  var h = C.hint(G.view, a, { names: G.names });
  chuy(h.title, h.lines.join(" "));
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
  if (!mine) b.textContent = G.thinking >= 0 ? nameOf(G.thinking) + " is thinking…" : nameOf(v.turn) + "'s turn";
  else if (!mv.length) b.textContent = "Paso — I can't play";
  else if (G.sel !== null) b.textContent = "Play the " + C.boneName(G.sel);
  else b.textContent = "Your turn — tap a bone";
  b.classList.toggle("primary", mine);
  $("btnHint").disabled = !mine;

  /* the end picker, for a lifted bone that fits both ends */
  var two = mine && G.sel !== null && endsOf(mv, G.sel).length === 2;
  $("endPick").classList.toggle("hide", !two);
  if (two) {
    $("pickL").innerHTML = "◀ on the <b>" + v.left + "</b>" + (G.hint === "L" ? " ★" : "");
    $("pickR").innerHTML = "on the <b>" + v.right + "</b> ▶" + (G.hint === "R" ? " ★" : "");
  }
  $("stage").classList.toggle("myTurn", mine);
  measureHud();
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
      "<span class='tag'></span><div class='bubble'></div>";
  }
  var us = R.team(s) === R.team(G.mySeat);
  var human = G.mode === "guest" ? !!(G.humans && G.humans[s]) : (isHuman(s) && G.mode !== "solo");
  el.className = "plate " + (us ? "us" : "them") + (s === v.turn ? " turn" : "") +
    (s === G.thinking ? " thinking" : "") + (v.counts[s] <= 2 && v.counts[s] > 0 && v.line.length ? " low" : "");
  var nm = nameOf(s);
  el.querySelector(".av").textContent = (nm || "?").charAt(0).toUpperCase();
  el.querySelector(".nm").textContent = nm;
  el.querySelector(".role").textContent = (v.counts[s] <= 2 && v.counts[s] > 0 && v.line.length) ? (v.counts[s] === 1 ? "last bone!" : "2 left!") : ROLE[rel];
  el.querySelector(".tag").textContent = human ? "📱" : "";
  var mini = el.querySelector(".mini"), n = v.counts[s];
  if (mini.childNodes.length !== 7) { mini.innerHTML = ""; for (var k = 0; k < 7; k++) mini.appendChild(document.createElement("i")); }
  for (var j = 0; j < 7; j++) mini.childNodes[j].className = j < n ? "" : "out";
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
       AI.level(P.level).label + " opponents")
    : "No match yet.";
  $("mView").textContent = P.view3d ? "Switch to 2D" : "Switch to 3D";
  $("mSound").textContent = P.sound ? "🔊 Sound on" : "🔇 Sound off";
  $("mCoach").textContent = P.coach ? "Coach & grades on" : "Coach & grades off";
  $("menuNote").textContent = gfx && gfx.kind === "3d"
    ? "Drawn in 3D. The bones in your hand stay flat and crisp on purpose."
    : "Drawn flat. Every phone can do this one.";
  open("ovMenu");
}
press($("mNew"), function () {
  shut("ovMenu");
  if (G.mode === "guest") { toast(nameOf(0) + "'s phone deals — ask them."); return; }
  newMatch();
});
press($("mLook"), function () { shut("ovMenu"); showLook(); });
press($("mRules"), function () { shut("ovMenu"); showRules(); });
press($("mLearn"), function () { shut("ovMenu"); showLessons(); });
press($("mParty"), function () { shut("ovMenu"); showParty(); });
press($("mCareer"), function () { shut("ovMenu"); showCareer(); });
press($("mSound"), function () {
  P.sound = !P.sound; Snd.on = P.sound; save();
  if (P.sound) { Snd.unlock(); Snd.clack(0.7); }
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
  { k: "level", label: "The others play", opts: [["novato", "Novato"], ["compadre", "Compadre"], ["maestro", "Maestro"], ["cabron", "Cabrón"]] },
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
  html += "<p class='note'>" + esc(AI.level(P.level).note) + " · " + esc(pace().note) + "</p>";
  $("rulesForm").innerHTML = html;
  var btns = $("rulesForm").querySelectorAll("[data-rk]");
  for (var b = 0; b < btns.length; b++) press(btns[b], onRulePick);
  open("ovRules");
}
function onRulePick(e) {
  var el = e.currentTarget || e.target;
  var k = el.getAttribute("data-rk"), raw = el.getAttribute("data-rv");
  if (k === "level") P.level = raw;
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
  newMatch(); toast("Fresh match, new rules.");
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
    "<input type='text' id='pName' maxlength='14' value='" + esc(myName()) + "' placeholder='Your name' autocomplete='nickname'></div>" +
    (back ? "<div class='row'><button class='btn wide' id='pBack'>↩ Back to <b>" + esc(back.code) + "</b></button></div>" : "") +
    "<div class='door'>" +
    "<button class='btn primary' id='pHost'><span class='k'>📡</span>Host<small>I'll show a code</small></button>" +
    "<button class='btn' id='pJoin'><span class='k'>🔑</span>Join<small>I have a code</small></button>" +
    "</div>";
  var takeName = function () { var v = $("pName").value.trim(); if (v) P.name = Net.cleanName(v); myName(); save(); };
  press($("pHost"), function () { takeName(); hostTable(); });
  press($("pJoin"), function () { takeName(); joinTable(); });
  if (back) press($("pBack"), function () {
    takeName();
    Room.resume();
    /* the table itself comes back under the same four letters; a chair
       simply knocks on them again and is shown back to its own bones */
    if (back.role === "host") hostTable(true); else { joinTable(); joinByCode(back.code); }
  });
  open("ovParty");
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
    }
    syncAll();
    renderLobby();
  };
  /* Somebody sitting down and somebody coming back look the same from
     here, and should: deal that chair its own view and carry on. The
     seat was held for them by name (see net.js), so the bones are theirs. */
  Net.onLink = function (seat, nm) {
    toast(nm + " sat down " + (seat === 2 ? "across from you — your partner." : (seat === 1 ? "on your right." : "on your left.")));
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
  G.thinking = -1; G.sel = null; G.hint = null; G.anim = null;
  if (clearView !== false) { G.st = null; G.match = null; G.view = null; G.lastNote = null; }
}
function goSolo(why) {
  G.mode = "solo"; G.mySeat = 0;
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
press($("goSolo"), function () { begin("solo"); });
press($("goParty"), function () { begin("party"); showParty(); });
press($("goLearn"), function () { showLessons(); });
press($("goLook"), function () { begin("solo"); showLook(); });

function begin(mode) {
  $("splash").classList.add("gone");
  setTimeout(function () { $("splash").style.display = "none"; }, 520);
  G.mySeat = 0;
  G.names = { 0: P.name || "You" };
  for (var s = 1; s < 4; s++) G.names[s] = botName(s, G.names);
  resize();
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
if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").then(function (reg) {
      reg.addEventListener("updatefound", function () {
        var sw = reg.installing;
        if (!sw) return;
        sw.addEventListener("statechange", function () {
          if (sw.state === "installed" && navigator.serviceWorker.controller) {
            toast("A new version is ready — it'll load next time.");
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
  return { G: G, P: P, gfx: gfx, scene: scene, Net: Net, tryPlay: tryPlay, doPass: doPass,
           Room: Room, joinByCode: joinByCode, health: Net.health(), PACES: PACES,
           happen: happen, showCareer: showCareer, record: record };
};
})();
