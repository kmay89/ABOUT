/* app.js — the calculator. It knows nothing about chili.

   Everything it does is driven by recipe.js: scale one number (how much
   beef), then render. The three pieces worth reading are:

     1. the unit engine, which picks the unit a cook would actually say
        out loud — "1⅓ cups", not "315.3 ml", and "1 medium onion",
        not "150 g" — in either system;

     2. canPlan(), which shares whole cans out across the four beans by
        largest remainder, so half a pot never asks for a third of a can
        of black beans and the total still comes out right;

     3. Cook mode, which is the whole reason this page exists: one step
        at a time, in type you can read from across the kitchen, with
        two enormous buttons and nothing that has to be dragged, held,
        double-tapped or done before a timer runs out.                */
(function () {
"use strict";

var R = window.CHILI;
var $ = function (id) { return document.getElementById(id); };

/* ---------------------------------------------------------------- *
 *  numbers                                                          *
 * ---------------------------------------------------------------- */

var ML_TSP = 4.92892, ML_TBSP = 14.7868, ML_CUP = 236.588, ML_QT = 946.353;
var G_OZ = 28.3495, G_LB = 453.592;

var GLYPH = {
  "1/2": "½", "1/3": "⅓", "2/3": "⅔", "1/4": "¼",
  "3/4": "¾", "1/8": "⅛", "3/8": "⅜", "5/8": "⅝",
  "7/8": "⅞", "1/6": "⅙", "5/6": "⅚"
};

/* The nearest fraction a cook would say, out of the denominators that
   exist on real measuring spoons. Halves beat thirds beat quarters at
   equal error, because that is the order people reach for them.     */
function frac(x, dens) {
  dens = dens || [2, 3, 4, 8];
  if (x < 0) x = 0;
  var whole = Math.floor(x + 1e-9), r = x - whole, best = null;
  for (var i = 0; i < dens.length; i++) {
    var d = dens[i], n = Math.round(r * d), err = Math.abs(n / d - r);
    if (!best || err < best.err - 1e-9) best = { n: n, d: d, err: err };
  }
  var n = best.n, d = best.d;
  if (n >= d) { whole += 1; n = 0; }
  if (n) {
    var k = gcd(n, d); n /= k; d /= k;
    var g = GLYPH[n + "/" + d];
    return (whole ? whole : "") + (g || (whole ? " " : "") + n + "/" + d);
  }
  return String(whole);
}
function gcd(a, b) { return b ? gcd(b, a % b) : a; }
/* the value frac() is going to show — so "1.01 cups" is pluralised by
   what the cook reads ("1 cup"), not by the arithmetic behind it */
function snap(x, dens) {
  dens = dens || [2, 3, 4, 8];
  var whole = Math.floor(x + 1e-9), r = x - whole, best = null;
  for (var i = 0; i < dens.length; i++) {
    var d = dens[i], n = Math.round(r * d), err = Math.abs(n / d - r);
    if (!best || err < best.err - 1e-9) best = { n: n, d: d, err: err };
  }
  return whole + best.n / best.d;
}
function roundTo(x, s) { return Math.round(x / s) * s; }
function trim(x) { return String(Math.round(x * 100) / 100); }
function plural(text, n) { return n > 1.0001 ? text + "s" : text; }

/* Is this number one a cook would say in cups? "¼ cup" yes, "⅜ cup"
   no — that one gets said in tablespoons. This is the whole difference
   between a recipe you can read and a unit converter.                */
var SAYABLE = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
function sayableCups(c) {
  if (c >= 0.85) return true;
  for (var i = 0; i < SAYABLE.length; i++) if (Math.abs(c - SAYABLE[i]) <= 0.025) return true;
  return false;
}

/* mass, in the unit that suits the size of it. Pounds only when the
   number lands near a quarter-pound — 415 g is "14½ oz", not "1 lb". */
function mass(g, sys) {
  if (sys === "metric") {
    if (g >= 1000) return trim(roundTo(g / 1000, 0.05)) + " kg";
    if (g >= 100) return String(roundTo(g, 5)) + " g";
    return String(Math.max(1, Math.round(g))) + " g";
  }
  var lb = g / G_LB, q = Math.round(lb * 4) / 4;
  if (g >= 900 || (q >= 0.25 && Math.abs(lb - q) <= lb * 0.04)) return frac(lb, [4, 2]) + " lb";
  return frac(g / G_OZ, [2, 4]) + " oz";
}

/* volume, likewise — quarts only once cups stop being sayable */
function volume(ml, sys) {
  if (sys === "metric") {
    if (ml >= 1000) return trim(roundTo(ml / 1000, 0.05)) + " L";
    if (ml >= 100) return String(roundTo(ml, 10)) + " ml";
    return String(roundTo(ml, 5)) + " ml";
  }
  if (ml >= ML_QT * 1.75) { var q = snap(ml / ML_QT, [4, 2]); return frac(q, [4, 2]) + " " + plural("quart", q); }
  var c = ml / ML_CUP;
  /* past half a cup it's always cups — eighths are on the measuring cup.
     Below that, cups only when the number is one you'd say out loud. */
  if (ml >= 118 || (ml >= 55 && sayableCups(c))) {
    var cs = snap(c, [4, 3, 2, 8]);
    return frac(cs, [4, 3, 2, 8]) + " " + plural("cup", cs);
  }
  if (ml >= ML_TBSP * 0.75) return frac(ml / ML_TBSP, [3, 2, 4]) + " Tbsp";
  return frac(ml / ML_TSP, [8, 4, 3, 2]) + " tsp";
}

/* Spoons stay spoons in both systems — nobody weighs cumin. A spice
   only gets said in cups once it's both big enough and a round enough
   number to say that way; otherwise it stays in tablespoons, however
   many of them there are.                                            */
function spice(tsp) {
  var c = tsp / 48, tb = tsp / 3;
  if (tsp >= 12 && sayableCups(c)) {
    var cs = snap(c, [4, 3, 2]);
    return frac(cs, [4, 3, 2]) + " " + plural("cup", cs) + " (" + frac(cs * 16, [2]) + " Tbsp)";
  }
  /* tablespoons only when they come out whole or half — 3½ teaspoons of
     salt is a thing you can measure; 1⅙ tablespoons is not */
  if (tsp >= 9 || (tsp >= 3 && Math.abs(tb - Math.round(tb * 2) / 2) < 0.02))
    return frac(tb, [2, 4, 3]) + " Tbsp";
  return frac(tsp, tsp <= 0.5 ? [8, 4, 3, 2] : [4, 3, 2]) + " tsp";
}
function spiceMl(tsp) {
  var ml = tsp * ML_TSP;
  return (ml < 10 ? trim(roundTo(ml, 0.5)) : String(roundTo(ml, 5))) + " ml";
}

/* ---------------------------------------------------------------- *
 *  scaling                                                          *
 * ---------------------------------------------------------------- */

var state = {
  grams: G_LB,        /* how much beef — the one dial everything hangs off */
  sys: "us",
  wholeCans: true,
  big: false,
  voice: false,
  view: "all",
  step: 0,
  ticked: {}
};

function mult() { return state.grams / R.base.grams; }

/* Whole cans, shared out honestly.

   The four beans are 2 : 2 : 1 : 1 by the original recipe. Scaled to a
   one-pound pot that is 0.67 : 0.67 : 0.33 : 0.33 cans, which is a
   silly thing to ask anybody to open. So: round the family's total to
   whole cans, hand every line its floor, then give the leftovers to
   whoever was closest to earning one (largest remainder — the same
   apportionment used to hand out seats in a legislature). One pound
   comes out 1 dark + 1 light; two pounds comes out one of each of the
   four; three pounds lands exactly on the original 2/2/1/1.         */
function canPlan() {
  var m = mult(), plan = {}, fams = {};
  R.items.forEach(function (it) {
    if (it.measure !== "can") return;
    plan[it.id] = it.per * m;
    if (it.apportion) (fams[it.apportion] = fams[it.apportion] || []).push(it);
  });
  if (!state.wholeCans) return plan;

  Object.keys(fams).forEach(function (key) {
    var list = fams[key], exact = list.map(function (it) { return it.per * m; });
    var total = exact.reduce(function (s, v) { return s + v; }, 0);
    var want = Math.max(1, Math.round(total));
    var floors = exact.map(function (v) { return Math.floor(v + 1e-9); });
    var give = want - floors.reduce(function (s, v) { return s + v; }, 0);
    var order = exact.map(function (v, i) { return { i: i, r: v - Math.floor(v + 1e-9) }; })
      .sort(function (a, b) { return b.r - a.r || a.i - b.i; });
    for (var k = 0; give > 0; k++, give--) floors[order[k % order.length].i]++;
    list.forEach(function (it, i) { plan[it.id] = floors[i]; });
  });

  /* cans that stand alone (the tomatoes) go to the nearest half — half
     a can is a real thing you can measure and put a lid on. */
  R.items.forEach(function (it) {
    if (it.measure === "can" && !it.apportion) plan[it.id] = Math.max(0.5, roundTo(it.per * m, 0.5));
  });
  return plan;
}

/* What one ingredient reads as right now: a headline in the chosen
   system, and the same amount again in the other one underneath. */
function amountOf(it, plan) {
  var m = mult(), sys = state.sys, other = sys === "us" ? "metric" : "us";
  var out = { main: "", alt: "", extra: "" };

  if (it.measure === "mass") {
    var g = it.per * m;
    if (it.each) {
      var n = snap(g / it.each.g, [2, 4, 3]);
      out.main = frac(n, [2, 4, 3]) + " " + (n > 1.0001 ? it.each.many : it.each.one);
      out.alt = mass(g, sys) + " · " + mass(g, other);
    } else {
      out.main = mass(g, sys);
      out.alt = mass(g, other);
    }
  } else if (it.measure === "volume") {
    var ml = it.per * m;
    out.main = volume(ml, sys);
    out.alt = volume(ml, other);
  } else if (it.measure === "spice") {
    var tsp = it.per * m;
    out.main = spice(tsp);
    /* the second line is only worth printing if it says something the
       first one didn't: millilitres, or the spoon count behind a cup */
    out.alt = (sys === "us" && !/tsp$/.test(out.main)) ? frac(tsp, [2, 4]) + " tsp" : spiceMl(tsp);
  } else if (it.measure === "can") {
    var can = R.cans[it.can], cans = plan[it.id];
    if (cans <= 0) { out.main = "none at this size"; out.alt = "it rounds away — turn off whole cans to use part of one"; return out; }
    out.main = frac(cans, [2, 4, 3]) + " " + plural("can", cans);
    out.alt = can.oz + " oz / " + can.g + " g " + plural("can", 2) +
      (it.drain ? " · ≈ " + mass(cans * can.usableG, sys) + " drained" : "");
  }
  return out;
}

function item(id) {
  for (var i = 0; i < R.items.length; i++) if (R.items[i].id === id) return R.items[i];
  return null;
}
function shortName(it) { return it.short || it.name.toLowerCase(); }

/* An amount as you'd say it mid-sentence: "1 medium yellow onion" already
   names the thing, so don't name it twice. */
function phrase(it, plan) {
  var a = amountOf(it, plan);
  return it.each ? a.main : a.main + " " + shortName(it);
}

/* ---------------------------------------------------------------- *
 *  the dial                                                         *
 * ---------------------------------------------------------------- */

var PRESETS = {
  us: [{ g: G_LB, label: "1 lb" }, { g: G_LB * 2, label: "2 lb" },
       { g: G_LB * 3, label: "3 lb", tag: "the original" }, { g: G_LB * 5, label: "5 lb" }],
  metric: [{ g: 500, label: "500 g" }, { g: 1000, label: "1 kg" },
           { g: 1500, label: "1.5 kg", tag: "the original" }, { g: 2500, label: "2.5 kg" }]
};
function stepSize() { return state.sys === "us" ? G_LB / 2 : 250; }
function clampBeef(g) {
  var lo = state.sys === "us" ? G_LB / 2 : 250, hi = state.sys === "us" ? G_LB * 12 : 5500;
  return Math.min(hi, Math.max(lo, g));
}
function nudge(dir) {
  var s = stepSize();
  /* snap to the grid of the current system so the readout stays round */
  state.grams = clampBeef(roundTo(state.grams + dir * s, s));
  save(); render();
}

function beefLabel() { return mass(state.grams, state.sys); }
function servings() {
  var ml = R.yield.mlPerLb * mult();
  return { ml: ml, bowls: Math.max(1, Math.round(ml / R.yield.bowlMl)), kids: Math.max(1, Math.round(ml / R.yield.kidBowlMl)) };
}
function potLine() {
  var need = R.yield.mlPerLb * mult() * R.pot.headroom;
  return state.sys === "us"
    ? "a pot of at least " + Math.ceil(need / ML_QT) + " quarts"
    : "a pot of at least " + Math.ceil(need / 1000) + " litres";
}

/* ---------------------------------------------------------------- *
 *  rendering                                                        *
 * ---------------------------------------------------------------- */

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

var EFFORT = {
  sit:  { label: "Can be done sitting", cls: "e-sit" },
  hot:  { label: "Hot pan", cls: "e-hot" },
  lift: { label: "Heavy — share this one", cls: "e-lift" },
  wait: { label: "Mostly waiting", cls: "e-wait" }
};

function renderDial() {
  $("beefAmount").textContent = beefLabel();
  var s = servings();
  $("yieldLine").textContent =
    "≈ " + volume(s.ml, state.sys) + " — about " + s.bowls + " big " + plural("bowl", s.bowls) +
    " or " + s.kids + " kid " + plural("bowl", s.kids) + ". You want " + potLine() + ".";

  var pre = PRESETS[state.sys].map(function (p) {
    var on = Math.abs(p.g - state.grams) < 1;
    return '<button class="preset' + (on ? " on" : "") + '" data-g="' + p.g + '" aria-pressed="' + on + '">' +
      esc(p.label) + (p.tag ? '<small>' + esc(p.tag) + "</small>" : "") + "</button>";
  }).join("");
  $("presets").innerHTML = pre;

  setToggle("unitUS", state.sys === "us");
  setToggle("unitMetric", state.sys === "metric");
  setToggle("canToggle", state.wholeCans);
  setToggle("bigToggle", state.big);
  setToggle("voiceToggle", state.voice);
}
function setToggle(id, on) {
  var el = $(id);
  if (!el) return;
  el.setAttribute("aria-pressed", on ? "true" : "false");
  el.classList.toggle("on", !!on);
}

function renderShopping() {
  var plan = canPlan(), rounded = [];
  var html = R.groups.map(function (g) {
    var rows = R.items.filter(function (it) { return it.group === g.id; }).map(function (it) {
      var a = amountOf(it, plan);
      if (it.measure === "can" && state.wholeCans && plan[it.id] <= 0) rounded.push(it.name);
      var on = !!state.ticked["i:" + it.id];
      return '<li class="ing' + (on ? " got" : "") + '">' +
        '<button class="tick" data-tick="i:' + it.id + '" aria-pressed="' + on + '"' +
          ' aria-label="Got ' + esc(it.name) + '"><span aria-hidden="true">✓</span></button>' +
        '<div class="ing-body">' +
          '<span class="ing-name">' + esc(it.name) +
            (it.optional ? ' <em class="opt">optional</em>' : "") + "</span>" +
          (it.note ? '<span class="ing-note">' + esc(it.note) + "</span>" : "") +
        "</div>" +
        '<div class="amt"><b>' + esc(a.main) + "</b>" +
          (a.alt ? "<small>" + esc(a.alt) + "</small>" : "") + "</div>" +
        "</li>";
    }).join("");
    return '<section class="group"><h3>' + esc(g.name) + "</h3>" +
      (g.hint ? '<p class="hint">' + esc(g.hint) + "</p>" : "") +
      '<ul class="ings">' + rows + "</ul></section>";
  }).join("");

  $("shoppingBody").innerHTML = html;
  $("roundNote").hidden = !rounded.length;
  if (rounded.length) {
    $("roundNote").textContent = "At this size " + rounded.join(" and ") +
      " round away to nothing. Turn off “whole cans” to use part of a can instead — " +
      "or leave it: the beans still add up.";
  }
}

/* the amount chips that ride along inside a step */
function usesHtml(step, plan) {
  if (!step.uses) return "";
  var chips = step.uses.map(function (id) {
    var it = item(id);
    if (!it) return "";
    if (it.measure === "can" && state.wholeCans && plan[id] <= 0) return "";
    var a = amountOf(it, plan);
    return "<li><b>" + esc(a.main) + "</b>" + (it.each ? "" : " " + esc(shortName(it))) + "</li>";
  }).join("");
  return chips ? '<ul class="uses">' + chips + "</ul>" : "";
}

function stepHtml(step, i, plan, big) {
  var tags = (step.effort || []).map(function (e) {
    var t = EFFORT[e];
    return t ? '<span class="tag ' + t.cls + '">' + esc(t.label) + "</span>" : "";
  }).join("");
  var done = !!state.ticked["s:" + step.id];
  var note = step.bigPotNote && mult() >= 2.5 ? '<p class="why big-pot">' + esc(step.bigPotNote) + "</p>" : "";
  return '<li class="step' + (done ? " done" : "") + (big ? " huge" : "") + '" data-step="' + step.id + '">' +
    '<div class="step-head"><span class="n">' + (i + 1) + "</span>" +
      "<h3>" + esc(step.title) + "</h3></div>" +
    (tags ? '<div class="tags">' + tags + "</div>" : "") +
    usesHtml(step, plan) +
    '<ul class="go">' + step.go.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>" +
    (step.why ? '<p class="why">' + esc(step.why) + "</p>" : "") + note +
    (step.timer ? timerHtml(step) : "") +
    '<div class="step-foot">' +
      '<button class="tick wide" data-tick="s:' + step.id + '" aria-pressed="' + done + '">' +
        '<span aria-hidden="true">✓</span> ' + (done ? "Done" : "Mark done") + "</button>" +
      '<button class="ghost" data-read="' + step.id + '">🔊 Read it to me</button>' +
    "</div></li>";
}

function renderSteps() {
  var plan = canPlan();
  $("stepList").innerHTML = R.steps.map(function (s, i) { return stepHtml(s, i, plan, false); }).join("");
}

function renderTaste() {
  var m = mult();
  var rows = R.taste.map(function (t) {
    var dose = "";
    if (t.item) {
      var it = item(t.item);
      var amt = t.per * m;
      dose = (it.measure === "spice" ? spice(amt)
        : it.measure === "volume" ? volume(amt, state.sys)
        : mass(amt, state.sys)) + " of " + shortName(it);
    }
    return '<li class="fix' + (t.karl ? " karl" : "") + '">' +
      '<button class="fix-head" aria-expanded="false" data-fix="' + t.id + '">' +
        '<span class="when">' + esc(t.when) + "</span>" +
        '<span class="then">' + esc(t.fix) + (dose ? " — " + esc(dose) : "") + "</span>" +
      "</button>" +
      '<div class="fix-how" id="fix-' + t.id + '" hidden><p>' + esc(t.how) + "</p></div></li>";
  }).join("");
  $("tasteList").innerHTML = rows;
}

function renderNotes() {
  $("notesBody").innerHTML = R.notes.map(function (n) {
    return "<section><h3>" + esc(n.title) + "</h3><p>" + esc(n.body) + "</p></section>";
  }).join("");
}

/* ---------------------------------------------------------------- *
 *  cook mode — one step, big, two buttons                           *
 * ---------------------------------------------------------------- */

function renderCook() {
  var plan = canPlan(), i = Math.min(state.step, R.steps.length - 1), s = R.steps[i];
  $("cookBody").innerHTML = '<ol class="steps solo" start="' + (i + 1) + '">' + stepHtml(s, i, plan, true) + "</ol>";
  $("cookCount").textContent = "Step " + (i + 1) + " of " + R.steps.length;
  $("cookDots").innerHTML = R.steps.map(function (st, k) {
    return '<button class="dot' + (k === i ? " now" : "") + (state.ticked["s:" + st.id] ? " done" : "") +
      '" data-goto="' + k + '" aria-label="Step ' + (k + 1) + ": " + esc(st.title) + '"' +
      (k === i ? ' aria-current="step"' : "") + "></button>";
  }).join("");
  $("cookBack").disabled = i === 0;
  $("cookNext").disabled = i === R.steps.length - 1;
  var sv = servings();
  $("cookScale").textContent = "Making " + beefLabel() + " of beef — about " + sv.bowls + " " + plural("bowl", sv.bowls);
  if (state.voice) speakStep(s);
}

function goStep(i) {
  state.step = Math.min(R.steps.length - 1, Math.max(0, i));
  save(); renderCook();
  /* put the new step at the top of the screen and hand it the focus, so
     a screen reader reads it and nobody has to go looking for it */
  window.scrollTo(0, Math.max(0, $("panelCook").getBoundingClientRect().top + window.pageYOffset - 12));
  var h = $("cookBody").querySelector("h3");
  if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
}

/* ---------------------------------------------------------------- *
 *  reading it out loud                                              *
 * ---------------------------------------------------------------- */

function speakStep(step) {
  var plan = canPlan(), parts = ["Step " + (R.steps.indexOf(step) + 1) + ". " + step.title + "."];
  (step.uses || []).forEach(function (id) {
    var it = item(id);
    if (!it || (it.measure === "can" && state.wholeCans && plan[id] <= 0)) return;
    parts.push(phrase(it, plan) + ".");
  });
  step.go.forEach(function (l) { parts.push(l); });
  speak(parts.join(" "));
}
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(text.replace(/≈/g, "about ").replace(/×/g, " times "));
    u.rate = 0.92; u.pitch = 1;
    speechSynthesis.speak(u);
  } catch (e) { /* a browser without a voice is not an error worth showing */ }
}

/* ---------------------------------------------------------------- *
 *  the simmer timer — optional, never blocking                      *
 * ---------------------------------------------------------------- */

var timer = { id: 0, left: 0, total: 0, running: false, step: "" };

function timerHtml(step) {
  var mine = timer.step === step.id && timer.total;
  var left = mine ? timer.left : step.timer * 60;
  return '<div class="timer" data-timer="' + step.id + '">' +
    '<span class="clock' + (mine && timer.running ? " ticking" : "") + '">' + clock(left) + "</span>" +
    '<button class="ghost" data-tstart="' + step.id + '">' + (mine && timer.running ? "Pause" : "Start the timer") + "</button>" +
    (mine ? '<button class="ghost" data-treset="' + step.id + '">Reset</button>' : "") +
    '<span class="timer-note">Optional. Nothing here is on a clock.</span></div>';
}
function clock(sec) {
  sec = Math.max(0, Math.round(sec));
  var m = Math.floor(sec / 60), s = sec % 60;
  return m + ":" + (s < 10 ? "0" : "") + s;
}
function toggleTimer(id) {
  var step = R.steps.filter(function (s) { return s.id === id; })[0];
  if (!step) return;
  if (timer.step !== id) { timer.step = id; timer.total = step.timer * 60; timer.left = timer.total; timer.running = false; }
  timer.running = !timer.running;
  clearInterval(timer.id);
  if (timer.running) {
    timer.id = setInterval(function () {
      timer.left -= 1;
      if (timer.left <= 0) { timer.left = 0; timer.running = false; clearInterval(timer.id); chime(); }
      paintClock();
    }, 1000);
  }
  paintClock();
}
function resetTimer(id) {
  var step = R.steps.filter(function (s) { return s.id === id; })[0];
  clearInterval(timer.id);
  timer.running = false; timer.left = step ? step.timer * 60 : 0; timer.total = timer.left;
  paintClock();
}
function paintClock() {
  [].forEach.call(document.querySelectorAll('[data-timer="' + timer.step + '"]'), function (box) {
    var c = box.querySelector(".clock");
    c.textContent = clock(timer.left);
    c.classList.toggle("ticking", timer.running);
    c.classList.toggle("rang", timer.left === 0 && timer.total > 0);
    var b = box.querySelector("[data-tstart]");
    if (b) b.textContent = timer.running ? "Pause" : (timer.left === 0 ? "Start again" : "Start the timer");
  });
}
function chime() {
  try {
    var A = window.AudioContext || window.webkitAudioContext;
    if (!A) return;
    var ctx = new A();
    [880, 1174.7, 1318.5].forEach(function (f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + i * 0.18 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.7);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + i * 0.18); o.stop(ctx.currentTime + i * 0.18 + 0.75);
    });
    setTimeout(function () { ctx.close(); }, 2000);
  } catch (e) { /* silence is an acceptable timer */ }
  if (state.voice) speak("Time's up. Taste it.");
}

/* ---------------------------------------------------------------- *
 *  the shopping list, as plain text                                 *
 * ---------------------------------------------------------------- */

function listText() {
  var plan = canPlan(), lines = [R.title + " — " + beefLabel() + " of beef", ""];
  R.groups.forEach(function (g) {
    lines.push(g.name.toUpperCase());
    R.items.filter(function (it) { return it.group === g.id; }).forEach(function (it) {
      if (it.measure === "can" && state.wholeCans && plan[it.id] <= 0) return;
      var a = amountOf(it, plan);
      lines.push("  " + a.main + "  " + it.name + (it.optional ? " (optional)" : ""));
    });
    lines.push("");
  });
  lines.push("kmay89.com/chili");
  return lines.join("\n");
}

/* ---------------------------------------------------------------- *
 *  state: saved locally, and mirrored into the address bar          *
 * ---------------------------------------------------------------- */

var KEY = "chili.v1";
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  var q = "#beef=" + Math.round(state.grams) + "&u=" + state.sys + (state.wholeCans ? "" : "&cans=part");
  try { history.replaceState(null, "", location.pathname + q); } catch (e) {}
}
function load() {
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var v = JSON.parse(raw);
      Object.keys(state).forEach(function (k) { if (v[k] !== undefined) state[k] = v[k]; });
    }
  } catch (e) {}
  var h = location.hash.replace(/^#/, "");
  if (h) {
    h.split("&").forEach(function (pair) {
      var kv = pair.split("="), k = kv[0], v = kv[1];
      if (k === "beef" && +v) state.grams = +v;
      if (k === "lb" && +v) state.grams = +v * G_LB;
      if (k === "u" && (v === "us" || v === "metric")) state.sys = v;
      if (k === "cans") state.wholeCans = v !== "part";
    });
  }
  state.grams = clampBeef(state.grams);
}

/* ---------------------------------------------------------------- *
 *  wiring                                                           *
 * ---------------------------------------------------------------- */

function render() {
  document.body.classList.toggle("big", state.big);
  renderDial();
  renderShopping();
  renderSteps();
  renderTaste();
  if (state.view === "cook") renderCook();
  paintClock();
}

function setView(v) {
  state.view = v;
  $("panelAll").hidden = v !== "all";
  $("panelCook").hidden = v !== "cook";
  document.body.classList.toggle("cooking", v === "cook");
  $("tabAll").setAttribute("aria-selected", v === "all");
  $("tabCook").setAttribute("aria-selected", v === "cook");
  if (v === "cook") renderCook();
  save();
}

function init() {
  load();
  renderNotes();
  render();
  setView(state.view);

  $("less").addEventListener("click", function () { nudge(-1); });
  $("more").addEventListener("click", function () { nudge(1); });

  $("presets").addEventListener("click", function (e) {
    var b = e.target.closest("[data-g]");
    if (!b) return;
    state.grams = clampBeef(+b.getAttribute("data-g"));
    save(); render();
  });

  $("unitUS").addEventListener("click", function () { setSys("us"); });
  $("unitMetric").addEventListener("click", function () { setSys("metric"); });
  function setSys(s) {
    if (state.sys === s) return;
    state.sys = s;
    /* the pot does NOT change size when you change how it's written —
       flipping to metric must never quietly re-scale the recipe. The
       next press of + or − is what lands it back on a round number. */
    state.grams = clampBeef(state.grams);
    save(); render();
  }

  $("canToggle").addEventListener("click", function () { state.wholeCans = !state.wholeCans; save(); render(); });
  $("bigToggle").addEventListener("click", function () { state.big = !state.big; save(); render(); });
  $("voiceToggle").addEventListener("click", function () {
    state.voice = !state.voice;
    if (!state.voice && "speechSynthesis" in window) speechSynthesis.cancel();
    save(); render();
    if (state.voice) speak("Reading steps out loud is on.");
  });

  $("tabAll").addEventListener("click", function () { setView("all"); });
  $("tabCook").addEventListener("click", function () { setView("cook"); });
  $("cookBack").addEventListener("click", function () { goStep(state.step - 1); });
  $("cookNext").addEventListener("click", function () { goStep(state.step + 1); });
  $("cookChange").addEventListener("click", function () {
    setView("all");
    $("less").focus();
    $("less").scrollIntoView({ block: "center" });
  });
  $("cookDots").addEventListener("click", function (e) {
    var d = e.target.closest("[data-goto]");
    if (d) goStep(+d.getAttribute("data-goto"));
  });

  $("copyList").addEventListener("click", function () {
    var btn = this, text = listText();
    function ok() { btn.textContent = "Copied ✓"; setTimeout(function () { btn.textContent = "Copy the list"; }, 2000); }
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); ok(); } catch (e) {}
      document.body.removeChild(ta);
    }
  });
  $("printBtn").addEventListener("click", function () { window.print(); });

  /* one listener for every tick, fix, read and timer button on the page */
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-tick]");
    if (t) {
      var k = t.getAttribute("data-tick");
      state.ticked[k] = !state.ticked[k];
      save(); render();
      return;
    }
    var f = e.target.closest("[data-fix]");
    if (f) {
      var body = $("fix-" + f.getAttribute("data-fix"));
      var open = f.getAttribute("aria-expanded") === "true";
      f.setAttribute("aria-expanded", !open);
      body.hidden = open;
      return;
    }
    var r = e.target.closest("[data-read]");
    if (r) {
      var id = r.getAttribute("data-read");
      speakStep(R.steps.filter(function (s) { return s.id === id; })[0]);
      return;
    }
    var ts = e.target.closest("[data-tstart]");
    if (ts) { toggleTimer(ts.getAttribute("data-tstart")); return; }
    var tr = e.target.closest("[data-treset]");
    if (tr) { resetTimer(tr.getAttribute("data-treset")); }
  });

  /* arrows walk cook mode; nothing here needs a chord or a hold */
  document.addEventListener("keydown", function (e) {
    if (state.view !== "cook" || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "ArrowRight") { e.preventDefault(); goStep(state.step + 1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); goStep(state.step - 1); }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
