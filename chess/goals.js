/* goals.js — the next step, in one line.

   A club coach at the door says one sentence: "you know what you should
   do next?" Not a list, not a chore with a counter on it — the nearest
   true thing. That is what this picks, from the state the room already
   keeps: the star a rung within reach still holds back, the few games
   until your rating settles, the ideas the Academy has due, the title
   twenty points away, a feat you have not done yet. Every one of them
   is something you would want anyway; none of them is invented to be
   met, and none of them is a number that only goes up.

   The rules, the law the lobby obeys:
   - Derived, never assigned. The goal is read off your state each time
     the lobby is drawn, by a fixed order of plain rules (RULES below).
     Ignore it and nothing happens; there is no timer and no streak of
     goals to keep.
   - Said once. When a goal you were shown comes true, the end card says
     "✓ Done" once; the lobby simply shows the next one. The lobby points,
     it never celebrates.
   - It changes the subject rather than nag. A goal shown on five
     different days without moving steps aside for the next one, until
     something about it changes.

   The rules, in order (the first that applies wins):
     first   — no rated games yet: the first one sets your starting point
     due3    — three or more ideas due in the Academy (spacing waits for nobody)
     settle  — still provisional: about how many games until it settles
     star    — the highest rung within reach (elo ≤ yours + 300) with a
               star still to earn, and which star
     due     — one or two ideas due
     title   — settled, and the next title is 60 points away or less
     feat    — a feat you have not done yet that fits your title
     lesson  — the next lesson on the Academy's path
     play    — a game against the coach that is a fair fight for you
   The last always applies, so there is always a next step.

   Pure: the page builds the context, node checks the choices
   (chess/tools/goals-check.js). The one store is
   localStorage["chessroom_goal"] = { v: 1, key, text, day, days, skip: [keys], said }
   — what was shown (and in what words), on how many days, what has
   stepped aside, and the last step already said to be done. */
/* global module, require */
(function (root) {
"use strict";

var Rating = root.Rating;
if (!Rating && typeof require === "function") { try { Rating = require("./rating.js"); } catch (e) { Rating = null; } }

var VERSION = 1, KEY = "chessroom_goal", ROTATE_DAYS = 5, REACH = 300, TITLE_NEAR = 60;
var RULES = ["first", "due3", "settle", "star", "due", "title", "feat", "lesson", "play"];
var STAR_WORDS = [
  ["Beat {c}", " for its first star"],
  ["Beat {c} without a hint or take-back", " — its second star"],
  ["Beat {c} without help at 80%+ accuracy", " — its third star"]
];

function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
function levelLabel(L) { return L.emoji + " " + L.name; }

/* how many more games until the score settles: the deviation shrinks
   by the same amount whatever the result, so a run of games against
   the suggested coach on a copy of the state says it exactly (help
   taken would slow it; this assumes a clean game, and says "about") */
function gamesToSettle(state) {
  if (!Rating) return 0;
  var s = Rating.clean(state), n = 0, at = s.lastAt || 0;
  while (s.rd > Rating.PROVISIONAL_RD && n < 12) {
    var u = Rating.update(s, { level: Rating.suggestLevel(s), result: 0.5, at: at });
    if (!u.rated) break;
    s = u.state; n++;
  }
  return n;
}

/* ctx: { rating (the stored state), ladder: { rungs }, learn: { due },
          lesson: { id, title } | null, feat: { id, name, how } | null } */
function candidate(rule, ctx) {
  var levels = Rating ? Rating.LEVELS : [];
  var sm = Rating ? Rating.summary(ctx.rating) : { games: 0, rating: 800, provisional: true, title: { next: null }, suggested: "sprout" };
  var due = ctx.learn && ctx.learn.due | 0;
  var sug = null;
  levels.forEach(function (L) { if (L.id === sm.suggested) sug = L; });
  var rungs = ctx.ladder && ctx.ladder.rungs || {};
  switch (rule) {
    case "first":
      if (sm.games) return null;
      return { kind: "first", key: "first", icon: "♟", text: "Your <b>first game</b> sets your starting point",
               action: { type: "play", level: sug ? sug.id : null } };
    case "due3":
      if (due < 3) return null;
      return { kind: "due", key: "due", icon: "🎓", text: "<b>" + due + " ideas are due</b> in the Academy — ten minutes",
               action: { type: "practise" } };
    case "settle":
      if (!sm.games || !sm.provisional) return null;
      var n = gamesToSettle(ctx.rating);
      if (!n) return null;
      return { kind: "settle", key: "settle", icon: "⚖️",
               text: n === 1 ? "<b>One more game</b> and your rating settles" : "About <b>" + n + " games</b> and your rating settles",
               action: { type: "play", level: sug ? sug.id : null } };
    case "star":
      var pick = null, k = -1;
      for (var i = levels.length - 1; i >= 0 && !pick; i--) {
        var L = levels[i];
        if (L.elo > sm.rating + REACH) continue;
        var st = rungs[L.id] && rungs[L.id].stars || [0, 0, 0];
        for (var j = 0; j < 3; j++) if (!st[j]) { pick = L; k = j; break; }
      }
      if (!pick) return null;
      return { kind: "star", key: "star:" + pick.id + ":" + k, icon: "★", level: pick.id, star: k,
               text: "<b>" + esc(STAR_WORDS[k][0].replace("{c}", levelLabel(pick))) + "</b>" + esc(STAR_WORDS[k][1]),
               action: { type: "play", level: pick.id } };
    case "due":
      if (due < 1) return null;
      return { kind: "due", key: "due", icon: "🎓", text: "<b>" + (due === 1 ? "An idea is" : due + " ideas are") + " due</b> in the Academy",
               action: { type: "practise" } };
    case "title":
      var t = sm.title;
      if (!sm.games || sm.provisional || !t.next || t.next.floor - sm.rating > TITLE_NEAR) return null;
      var gap = Math.max(1, t.next.floor - sm.rating);
      return { kind: "title", key: "title:" + t.next.floor, icon: t.next.emoji, floor: t.next.floor,
               text: "<b>" + gap + " points</b> to " + esc(t.next.emoji + " " + t.next.name),
               action: { type: "play", level: sug ? sug.id : null } };
    case "feat":
      var f = ctx.feat;
      if (!f) return null;
      return { kind: "feat", key: "feat:" + f.id, icon: "🏅", feat: f.id,
               text: "Not yet: <b>" + esc(f.name.charAt(0).toLowerCase() + f.name.slice(1)) + "</b>",
               action: { type: "play", level: sug ? sug.id : null, side: f.id === "as-black" ? "b" : null } };
    case "lesson":
      var ls = ctx.lesson;
      if (!ls) return null;
      return { kind: "lesson", key: "lesson:" + ls.id, icon: "🎓", lesson: ls.id,
               text: "Next in the Academy: <b>" + esc(ls.title) + "</b>",
               action: { type: "lesson", id: ls.id } };
    default:
      if (!sug) return null;
      return { kind: "play", key: "play", icon: "▶", text: "A game against <b>" + esc(levelLabel(sug)) + "</b> — a fair fight",
               action: { type: "play", level: sug.id } };
  }
}
function keys(ctx) {
  var out = [];
  RULES.forEach(function (r) { var g = candidate(r, ctx || {}); if (g) out.push(g.key); });
  return out;
}
function pick(ctx, skip) {
  skip = skip || [];
  for (var i = 0; i < RULES.length; i++) {
    var g = candidate(RULES[i], ctx || {});
    if (!g) continue;
    g.id = RULES[i];
    if (g.kind !== "play" && skip.indexOf(g.key) >= 0) continue;
    return g;
  }
  return null;
}

/* has the step this goal named been taken? Asked of the goal the
   player was shown, against the state after a game or a lesson. */
function done(goal, ctx) {
  if (!goal || !ctx) return false;
  var key = String(goal.key || ""), parts = key.split(":");
  var sm = Rating ? Rating.summary(ctx.rating) : null;
  var rungs = ctx.ladder && ctx.ladder.rungs || {};
  switch (parts[0]) {
    case "first": return !!(sm && sm.games);
    case "settle": return !!(sm && sm.games && !sm.provisional);
    case "star":
      var st = rungs[parts[1]] && rungs[parts[1]].stars;
      return !!(st && st[+parts[2]]);
    case "title": return !!(sm && !sm.provisional && sm.rating >= +parts[1]);
    case "feat": return !!(ctx.featsDone && ctx.featsDone[parts[1]]);
    case "lesson": return !!(ctx.solved && ctx.solved[parts[1]]);
    default: return false;     /* "due" and "play" are rhythms, not steps */
  }
}
/* the step the lobby last showed, if it has just been taken and not yet
   said: hands back { state, text } with the saying remembered, or null.
   This is what keeps "✓ Done" to once. */
function settle(state, ctx) {
  var s = clean(state);
  if (!s.key || s.said === s.key || !done({ key: s.key }, ctx)) return null;
  s.said = s.key;
  return { state: s, text: doneText({ key: s.key, text: s.text }) };
}
/* the words for a step taken, for the end card — or none, where the
   card already says it in its own words: a settled rating and a new
   title are the number's milestone, a feat is its own line, and a
   lesson has no end card. Saying a thing twice is how it stops meaning
   anything. */
function doneText(goal) {
  var kind = String(goal && goal.key || "").split(":")[0];
  if (kind === "first") return "✓ Your first game is in — the room has your starting point";
  if (kind !== "star") return null;
  var t = String(goal.text || "").replace(/<[^>]*>/g, "");
  return "✓ Done: " + t.charAt(0).toLowerCase() + t.slice(1);
}

/* ---------- the little memory ---------- */
function fresh() { return { v: VERSION, key: "", text: "", day: "", days: 0, skip: [], said: "" }; }
function plainText(html) { return String(html || "").replace(/<[^>]*>/g, "").replace(/[<>]/g, "").slice(0, 120); }
function clean(o) {
  var s = fresh();
  if (!o || typeof o !== "object" || o.v !== VERSION) return s;
  s.key = typeof o.key === "string" ? o.key.slice(0, 40) : "";
  s.text = typeof o.text === "string" ? plainText(o.text) : "";
  s.said = typeof o.said === "string" ? o.said.slice(0, 40) : "";
  s.day = typeof o.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.day) ? o.day : "";
  s.days = typeof o.days === "number" && isFinite(o.days) ? Math.max(0, Math.min(999, Math.floor(o.days))) : 0;
  if (Array.isArray(o.skip)) o.skip.forEach(function (k) { if (typeof k === "string" && k.length <= 40 && s.skip.indexOf(k) < 0 && s.skip.length < 12) s.skip.push(k); });
  return s;
}
function load(getItem) {
  var raw = null;
  try { raw = getItem(KEY); } catch (e) { return fresh(); }
  if (typeof raw !== "string" || raw.length > 4000) return fresh();
  try { return clean(JSON.parse(raw)); } catch (e) { return fresh(); }
}
function save(state, setItem) {
  try { return setItem(KEY, JSON.stringify(clean(state))) !== false; } catch (e) { return false; }
}
/* choose what to show today, and remember it. A goal is skipped once it
   has been shown on ROTATE_DAYS different days without changing; a
   skipped goal comes back as soon as its key changes (the next star,
   the next title) or the others run out. */
function choose(state, ctx, day) {
  var s = clean(state);
  /* a skipped step that no rule names any more has moved on (the star
     was won, the next one is a new key), so it is forgotten */
  var live = keys(ctx);
  s.skip = s.skip.filter(function (k) { return live.indexOf(k) >= 0; });
  var g = pick(ctx, s.skip);
  if (!g) return { goal: null, state: s };
  if (g.key !== s.key) { s.key = g.key; s.text = plainText(g.text); s.day = day; s.days = 1; }
  else if (s.day !== day) {
    s.day = day; s.days++;
    if (s.days > ROTATE_DAYS && g.kind !== "play") {
      s.skip.push(g.key);
      var g2 = pick(ctx, s.skip);
      if (g2 && g2.key !== g.key) { g = g2; s.key = g.key; s.text = plainText(g.text); s.days = 1; }
    }
  }
  return { goal: g, state: s };
}

var Goals = {
  VERSION: VERSION, KEY: KEY, RULES: RULES, ROTATE_DAYS: ROTATE_DAYS, REACH: REACH,
  pick: pick, done: done, doneText: doneText, settle: settle, gamesToSettle: gamesToSettle,
  fresh: fresh, clean: clean, load: load, save: save, choose: choose
};

if (typeof module !== "undefined" && module.exports) module.exports = Goals;
else root.Goals = Goals;
})(typeof self !== "undefined" ? self : this);
