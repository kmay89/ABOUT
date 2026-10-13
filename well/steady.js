/* steady.js — Steady: a quiet twenty minutes, and the minute after it.

   Steady is the one mode built around a body of research, and the whole
   file is shaped by what that research does and does not support (brief
   §5, and the explainer's "Why this might help — and what it can't do").
   In short: some studies paired a brief, supported reminder with about
   twenty minutes of a falling-blocks game played by turning the pieces in
   the mind's eye, with the landing guide hidden and the sound off. This
   game has never been tested, the reminder part was only ever done with
   people trained to help, and so Steady takes the *game-side* conditions
   — a soft twenty-minute timer, an optional Mind's eye with no landing
   light, an easy way to play in silence — and nothing else. The only door
   from here to the research is the "Why this game?" link.

   ## What this file refuses to build

   No recall prompt and no memory step, ever, in any wording. No mood or
   distress check-in. No diary. No record of why anybody plays, and no
   record of anybody opening the explainer or the help lines — those
   sheets simply open. Nothing during play speaks: the cards here appear
   only between sessions. And no claim about bodies or minds anywhere: the
   breathing minute says "Breathe in" and "Breathe out" and stops there.

   ## The shape of a session

     entry card   length, pace, landing light, sound, world. Everything is
                  already chosen, so Begin is the only thing to press.
     tip          once, the first time: picturing a piece turning and
                  landing before you move it, offered as a game skill.
     the timer    soft. tick() says "timeup" once; the app lets the piece
                  in hand finish and lock, gravity eases to a stop, and then
                  the card appears. It never interrupts a piece.
     end card     "That's twenty minutes. Nicely done." Breathe for a
                  minute (the default), Keep playing, or Finish. Keep
                  playing means the card stays away for at least twenty
                  more minutes.
     breathe      a minute following a circle. Skippable at any moment.
     noticing     five short cards, five things you can see down to one
                  you can taste, at your own pace. It never asks about the
                  past or about feelings.
     close        "Thank you for spending this time at the well." and,
                  small, who to talk to if things feel heavy.

   The same Breathe, noticing and help sheets open from the pause sheet
   mid-session; from there they lead back to the pause sheet rather than
   on to the close.

   ## Owning its sheets

   The shells (#ovSteady #ovBreathe #ovGround #ovClose #ovHelp) belong to
   index.html; this file owns what goes inside them, and builds a shell
   itself if one is missing, so a page that forgot one still works. A sheet
   opened from another sheet is moved to the end of <body> so it stacks on
   top without anybody juggling z-indexes. Its look is one block of CSS,
   Steady.CSS, injected once unless the page already carries a
   <style id="steadyStyle">.                                               */
(function (root) {
"use strict";

var Steady = {};

/* ---------- the entry card's choices (brief §5.3, §5.4) ----------
   Each option says in one line what it does, so the card can show the
   line for whichever is chosen and nothing has to be guessed. */
var LENGTHS = [
  { v: 10, name: "10", line: "Ten minutes, then a soft chime." },
  { v: 15, name: "15", line: "Fifteen minutes, then a soft chime." },
  { v: 20, name: "20", line: "Twenty minutes, then a soft chime." },
  { v: 25, name: "25", line: "Twenty-five minutes, then a soft chime." },
  { v: 0,  name: "Off", line: "No timer. Finish from the pause menu any time." }
];
var PACES = [
  { v: "still", name: "Still", line: "Nothing falls until you drop it." },
  { v: "slow",  name: "Slow",  line: "A row each second, the same throughout." },
  { v: "even",  name: "Even",  line: "A little quicker, and just as steady." }
];
var TIP = "Try this: before you move a piece, picture it turning and landing in your mind's eye. Then place it.";
var LANDING = [
  { v: true,  name: "On",         line: "A soft light shows where the piece will land." },
  { v: false, name: "Mind's eye", line: "No light. Picture it turning and landing." }
];
var SOUNDS = [
  { v: "soft",    name: "Soft music",   line: "Gentle music, and a soft note for each move." },
  { v: "effects", name: "Effects only", line: "No music, just the soft notes of each move." },
  { v: "quiet",   name: "Quiet",        line: "Silence. Every sound is off." }
];

/* "Longer out" is the default: four seconds in, six out, six times — a
   minute. "Even" is four and four, eight times. */
var BREATHS = {
  longer: { inn: 4000, out: 6000, n: 6, name: "Longer out", line: "In for four, out for six." },
  even:   { inn: 4000, out: 4000, n: 8, name: "Even",       line: "In for four, out for four." }
};
var LEAD_IN = 1600;           /* the circle appears before the first in-breath */

var NOTICE = [
  ["5", "Notice five things you can see."],
  ["4", "Four things you can feel."],
  ["3", "Three things you can hear."],
  ["2", "Two things you can smell."],
  ["1", "One thing you can taste."]
];

var KEEP_GAP = 20 * 60000;    /* Keep playing: the card stays away at least this long */
var DEFAULT_WORLD = "snowfall";

/* ---------- the worlds, for the picker and the light ---------- */
var WORLD_FALLBACK = ["dawn", "tide", "rain", "bamboo", "aurora", "moonpool", "lanterns", "snowfall", "bells", "starfield"];
function worldList() {
  var W = root.Worlds;
  if (W && W.list && W.list.length) return W.list;
  /* worlds.js missing: plain tiles rather than no picker at all */
  var out = [];
  for (var i = 0; i < WORLD_FALLBACK.length; i++) {
    var id = WORLD_FALLBACK[i];
    out.push({ id: id, name: id.charAt(0).toUpperCase() + id.slice(1), line: "",
               sky: { top: "#10141f", horizon: "#2a3142" }, key: "#eef2ff", rim: "#a9b8e8" });
  }
  return out;
}
function worldById(id) {
  var list = worldList();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  for (i = 0; i < list.length; i++) if (list[i].id === DEFAULT_WORLD) return list[i];
  return list[0];
}
function rgb(hex) {
  var h = String(hex || "#ffffff").replace("#", "");
  if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
  var n = parseInt(h, 16);
  if (isNaN(n)) n = 0xffffff;
  return ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255);
}
function rgba(hex, a) { return "rgba(" + rgb(hex) + "," + a + ")"; }

/* ---------- words for minutes: "That's twenty minutes." ---------- */
var ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
            "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
var TENS = ["", "", "twenty", "thirty", "forty", "fifty"];
function minutesWords(n) {
  n = Math.max(1, Math.round(n));
  if (n === 1) return "a minute";
  if (n === 60) return "an hour";
  if (n === 90) return "an hour and a half";
  if (n < 20) return ONES[n] + " minutes";
  if (n < 60) return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "") + " minutes";
  return n + " minutes";
}
Steady.minutesWords = minutesWords;

/* What the app should set Music's buses to for a session's sound choice.
   "Quiet" is every bus at zero, master included, so nothing at all can
   sound — the studies that played this way played in silence. */
Steady.levels = function (sound, prefs) {
  function p(k, d) {
    try { var v = prefs && prefs.get ? prefs.get(k) : undefined; return typeof v === "number" ? v : d; } catch (e) { return d; }
  }
  var L = { master: p("master", 0.8), music: p("music", 0.7), sfx: p("sfx", 0.8), ambience: p("ambience", 0.6) };
  if (sound === "effects") { L.music = 0; L.ambience = 0; }
  else if (sound === "quiet") { L.master = 0; L.music = 0; L.sfx = 0; L.ambience = 0; }
  return L;
};

/* ---------- the look ----------
   Built on look.css: its .ov, .sheet, .btn and colour tokens, with only
   what Steady needs on top. Generous spacing and large type, because
   these cards are read at the end of twenty quiet minutes, not skimmed. */
Steady.CSS = [
  ".st-ov .sheet.st{width:min(520px,100%);max-height:100%;padding:22px 22px 20px;border-radius:22px;position:relative}",
  ".st h2{font-size:1.5rem;font-weight:700;letter-spacing:-.01em;margin:0 0 .2em;padding-right:34px}",
  ".st .lead{font-size:1rem;margin:0 0 4px}",
  ".st .close{position:absolute;top:12px;right:12px;float:none;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center}",
  ".st-field{margin-top:13px}",
  ".st-label{display:flex;align-items:baseline;gap:8px;font-size:.74rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--soft);margin:0 0 6px}",
  ".st-label b{margin-left:auto;font-size:.9rem;font-weight:600;letter-spacing:0;text-transform:none;color:var(--ink)}",
  ".st-seg{display:flex;gap:6px}",
  ".st-seg>button{flex:1 1 0;min-width:0;min-height:44px;padding:6px 4px;border-radius:13px;background:var(--card2);border:1px solid var(--line);font-weight:650;font-size:.95rem;line-height:1.15;color:var(--soft);transition:border-color .2s,box-shadow .2s,color .2s,background-color .2s}",
  ".st-seg>button[aria-pressed=\"true\"]{color:var(--ink);border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent);background-image:linear-gradient(rgba(255,255,255,.06),rgba(255,255,255,.06))}",
  ".st-line{font-size:.86rem;color:var(--soft);margin-top:6px;line-height:1.4;min-height:1.4em}",
  ".st-worlds{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}",
  ".st-world{position:relative;height:48px;border-radius:12px;border:1px solid rgba(255,255,255,.09);overflow:hidden;transition:box-shadow .2s,transform .2s}",
  ".st-world[aria-pressed=\"true\"]{box-shadow:0 0 0 2px var(--card),0 0 0 4px var(--accent)}",
  ".st-world i{position:absolute;left:50%;bottom:7px;width:6px;height:6px;margin-left:-3px;border-radius:50%;opacity:0;transition:opacity .2s}",
  ".st-world[aria-pressed=\"true\"] i{opacity:1}",
  ".st-link{display:flex;align-items:center;justify-content:center;min-height:44px;padding:0 6px;margin:2px auto 0;color:var(--glow);font-size:.98rem;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}",
  ".st-go{margin-top:14px}",
  ".st-go .btn{width:100%;min-height:56px;font-size:1.08rem}",
  ".st-small{font-size:.84rem;color:var(--soft);text-align:center;margin:12px 0 0;line-height:1.45}",
  ".st button:focus-visible,.st a:focus-visible{outline:2px solid var(--glow);outline-offset:3px}",
  ".st-center{text-align:center;padding:12px 2px 2px}",
  ".st-glow{width:72px;height:72px;margin:8px auto 18px;border-radius:50%}",
  ".st h2.st-big{font-size:1.6rem;line-height:1.32;font-weight:600;letter-spacing:-.01em;margin:0 auto 24px;max-width:16em;padding:0;text-wrap:balance}",
  ".st-stack{display:flex;flex-direction:column;gap:10px}",
  ".st-stack .btn{flex:none;width:100%;min-height:54px;font-size:1.04rem}",
  ".st-tip{font-size:1.18rem;line-height:1.5;margin:6px 0 4px;text-wrap:pretty}",
  ".st-art{display:block;width:200px;height:190px;margin:10px auto 12px}",
  ".st-ov.st-full{padding:0;align-items:stretch}",
  ".st-ov.st-full .sheet.st{width:100%;max-width:none;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:none;",
  "  display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;",
  "  padding:calc(18px + var(--safe-top)) 20px calc(20px + var(--safe-bot))}",
  ".st-btitle{font-size:.86rem;letter-spacing:.08em;text-transform:uppercase;color:var(--soft);min-height:44px;display:flex;align-items:center}",
  ".st-bmid{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:0;width:100%}",
  ".st-orbbox{position:relative;width:min(64vw,42vh,330px);height:min(64vw,42vh,330px);flex:none}",
  ".st-ring{position:absolute;inset:0;border-radius:50%}",
  ".st-orb{position:absolute;inset:0;border-radius:50%;will-change:transform,opacity;transform:scale(.42) translateZ(0)}",
  ".st-word{margin-top:30px;font-size:clamp(1.45rem,5.6vw,2.05rem);font-weight:500;letter-spacing:.01em;min-height:1.4em;transition:opacity .45s}",
  ".st-dots{display:flex;gap:10px;margin-top:16px;min-height:10px}",
  ".st-dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.16);transition:background-color .6s,box-shadow .6s}",
  ".st-bfoot{width:min(440px,100%);display:flex;flex-direction:column;gap:10px;margin-top:18px}",
  ".st-bfoot .st-line{text-align:center;margin:0}",
  ".st-bfoot .btn{flex:none;width:100%;min-height:52px;font-size:1.02rem}",
  ".st-num{font-size:4.4rem;font-weight:300;line-height:1;text-align:center;margin:10px 0 14px;font-variant-numeric:tabular-nums}",
  ".st-sense{font-size:1.5rem;line-height:1.35;text-align:center;min-height:2.7em;margin:0 0 10px;font-weight:500;text-wrap:balance}",
  ".st-fade{transition:opacity .35s}",
  ".st-gdots{display:flex;justify-content:center;gap:9px;margin:4px 0 20px}",
  ".st h2.st-thanks{font-size:1.6rem;line-height:1.35;font-weight:500;letter-spacing:-.005em;margin:0 auto 6px;max-width:15em;padding:0;text-wrap:balance}",
  ".st-help{margin-top:6px}",
  ".st-help a{color:var(--glow)}",
  ".st-pauseExtras{margin-top:4px}",
  ".st-pauseExtras .row .btn{flex:1 1 45%}",
  ".st-ctl{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;list-style:none;margin:14px 0 0;padding:0}",
  ".st-ctl li{font-size:.86rem;line-height:1.2;color:var(--ink);background:var(--card2);border:1px solid var(--line);border-radius:999px;padding:6px 11px}",
  /* the entry card: choices in the middle, Begin always in reach below */
  ".st-ov .sheet.st.st-entry{display:flex;flex-direction:column;overflow:hidden}",
  ".st-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;margin:0 -8px;padding:0 8px 6px}",
  ".st-foot{flex:none;position:relative}",
  ".st-entry.over .st-foot:before{content:\"\";position:absolute;left:-22px;right:-22px;top:-18px;height:18px;background:linear-gradient(rgba(0,0,0,0),rgba(0,0,0,.28));pointer-events:none}",
  "@media (min-width:700px){.st-world{height:60px}.st-ov .sheet.st{padding:26px 28px 24px}}",
  "@media (max-height:820px){.st-ov .sheet.st{padding-top:18px;padding-bottom:14px}.st-field{margin-top:10px}.st-seg>button{min-height:42px}.st-line{margin-top:4px}.st-world{height:44px}.st-go{margin-top:14px}}",
  "@media (max-width:380px){.st-seg>button{font-size:.88rem;padding:6px 2px}}",
  "@media (max-height:700px){.st-art{width:160px;height:152px}.st h2{font-size:1.35rem}.st .lead{font-size:.92rem}.st-seg>button{min-height:40px}.st-line{font-size:.82rem}.st-world{height:36px}.st-go .btn{min-height:50px}}",
  "@media (prefers-reduced-motion:reduce){.st-ov,.st-ov *{transition:none!important;animation:none!important}}"
].join("\n");

function injectCSS() {
  if (typeof document === "undefined" || document.getElementById("steadyStyle")) return;
  var s = document.createElement("style");
  s.id = "steadyStyle";
  s.textContent = Steady.CSS;
  (document.head || document.documentElement).appendChild(s);
}

/* ================================================================
   a session
   ================================================================ */
/* Steady.create({prefs, music, learn, onBegin(opts), onFinish(reason),
   onKeepPlaying(), onBreathe(phase, swell), onWhy(section), onMoment(ev)}).
   onFinish's reason is "timer" (Finish once the time was up) or "pause"
   (Finish from the pause sheet). onMoment hands the app a moment that
   happened here rather than in the engine, already in the event shape
   records.js observes: {t:"breathed"} when the breathing minute runs to
   its end, {t:"stop"} for Finish once the time is up. */
Steady.create = function (o) {
  o = o || {};
  var prefs = o.prefs || null, music = o.music || null, learn = o.learn || null;
  var sess = null;          /* {length, pace, landing, sound, world, due, fired, ended, last} */
  var flow = "pause";       /* where Breathe and noticing were opened from: "end" | "pause" */
  var B = null;             /* the breathing minute, while it runs */
  var pattern = "longer";
  var esc = {};             /* overlay id -> what Escape does there */
  var returnFocus = null;
  var IDS = ["ovSteady", "ovBreathe", "ovGround", "ovClose", "ovHelp"];

  injectCSS();

  /* ---------- small, careful helpers ---------- */
  function pref(k, d) {
    try { var v = prefs && prefs.get ? prefs.get(k) : undefined; return v === undefined || v === null ? d : v; }
    catch (e) { return d; }
  }
  function setPref(k, v) { try { if (prefs && prefs.set) prefs.set(k, v); } catch (e) { /* a refused setting is not worth a stuck card */ } }
  function sound(kind) { try { if (music && music.ui) music.ui(kind); } catch (e) { /* silence is fine */ } }
  /* An app callback that throws must not strand the player between two
     cards, so it is caught — and thrown again a tick later, so the bug
     still shows in the console. */
  function safe(fn, a, b) {
    if (typeof fn !== "function") return;
    try { fn(a, b); } catch (e) { setTimeout(function () { throw e; }, 0); }
  }
  function reduced() {
    try { if (prefs && prefs.motion && prefs.motion() !== "full") return true; } catch (e) { /* fall through */ }
    return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function button(label, cls, fn) {
    var b = el("button", cls === null ? "" : "btn" + (cls ? " " + cls : ""), label);
    b.type = "button";
    b.addEventListener("click", function (e) { e.preventDefault(); fn(e); });
    return b;
  }
  function pick(list, v, d) {
    for (var i = 0; i < list.length; i++) if (list[i].v === v) return v;
    return d;
  }

  /* the choices as they stand in Prefs, each checked against its list */
  function chosen() {
    var len = pref("steadyLength", 20);
    if (len === "off") len = 0;
    var w = pref("steadyWorld", DEFAULT_WORLD);
    return {
      length: pick(LENGTHS, len, 20),
      pace: pick(PACES, pref("steadyPace", "slow"), "slow"),
      landing: pick(LANDING, pref("steadyLanding", true), true),
      sound: pick(SOUNDS, pref("steadySound", "soft"), "soft"),
      world: worldById(w).id
    };
  }
  function newSession(c, elapsed) {
    var s = { length: c.length, pace: c.pace, landing: c.landing, sound: c.sound, world: c.world,
              due: c.length * 60000, fired: false, ended: false, last: elapsed || 0 };
    /* A session resumed from a save may already be past its time; the
       card then waits a full gap rather than greeting you on arrival. */
    if (s.length && elapsed && elapsed >= s.due) s.due = elapsed + Math.max(KEEP_GAP, s.length * 60000);
    return s;
  }

  /* ---------- shells and stacking ---------- */
  function shell(id, full) {
    var ov = document.getElementById(id);
    if (!ov) {
      ov = el("div", "ov hide");
      ov.id = id;
      document.body.appendChild(ov);
    }
    ov.classList.add("st-ov");
    if (full) ov.classList.add("st-full"); else ov.classList.remove("st-full");
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    if (!ov.getAttribute("data-st")) {
      ov.setAttribute("data-st", "1");
      ov.addEventListener("keydown", onKey);
    }
    var sheet = ov.querySelector(".sheet");
    if (!sheet) { sheet = el("div", "sheet"); ov.appendChild(sheet); }
    /* a fresh card every time: nothing from the last one drawn in this
       sheet (the entry card's scrolling layout, its overflow shadow) */
    sheet.className = "sheet st";
    while (sheet.firstChild) sheet.removeChild(sheet.firstChild);
    ov.style.background = "";
    esc[id] = null;
    return sheet;
  }
  function isOpen(id) {
    var ov = document.getElementById(id);
    return !!(ov && !ov.classList.contains("hide"));
  }
  function anyOpen() {
    for (var i = 0; i < IDS.length; i++) if (isOpen(IDS[i])) return true;
    return false;
  }
  function focusOn(node) {
    if (!node) return;
    try { node.focus({ preventScroll: true }); } catch (e) { try { node.focus(); } catch (e2) { /* nothing to focus */ } }
  }
  function show(id, focus, silent) {
    var ov = document.getElementById(id);
    if (!ov) return;
    if (!anyOpen()) returnFocus = document.activeElement;
    /* last in <body> is on top: a sheet opened over the pause sheet, or
       over the run card, sits above it with no z-index arithmetic */
    if (ov.parentNode !== document.body || ov !== document.body.lastElementChild) document.body.appendChild(ov);
    var was = ov.classList.contains("hide");
    ov.classList.remove("hide");
    var sheet = ov.querySelector(".sheet");
    if (sheet) sheet.scrollTop = 0;
    if (was && !silent) sound("open");
    focusOn(focus);
  }
  function hide(id) {
    var ov = document.getElementById(id);
    if (!ov || ov.classList.contains("hide")) return;
    ov.classList.add("hide");
    if (!anyOpen() && returnFocus && document.body.contains(returnFocus)) focusOn(returnFocus);
  }
  function hideAll(except) {
    for (var i = 0; i < IDS.length; i++) if (IDS[i] !== except) hide(IDS[i]);
  }
  /* Every ✕ in the room answers to [data-close] naming its sheet (the
     room's contract, and what tools/open-check.js presses), so Steady's
     carry it too, even though each card is drawn afresh. The app's own
     handler runs after this one and only ever hides the same sheet. */
  function closeButton(sheet, label, fn) {
    var b = button("\u2715", null, fn);
    b.className = "close";
    b.setAttribute("aria-label", label);
    var ov = sheet.parentNode;
    if (ov && ov.id) b.setAttribute("data-close", ov.id);
    sheet.appendChild(b);
    return b;
  }
  function heading(sheet, id, text, cls) {
    var h = el("h2", cls || "", text);
    h.id = id + "Title";
    sheet.appendChild(h);
    document.getElementById(id).setAttribute("aria-labelledby", h.id);
    return h;
  }

  function onKey(e) {
    var ov = e.currentTarget, id = ov.id;
    if (e.key === "Escape" || e.key === "Esc") {
      /* Escape belongs to this sheet while it is up, not to the game's pause key */
      e.preventDefault();
      e.stopPropagation();
      if (esc[id]) esc[id]();
      return;
    }
    if (e.key === "Tab") {
      /* keep Tab inside the sheet, so focus never wanders behind it */
      var f = ov.querySelectorAll("button, a[href], [tabindex]:not([tabindex=\"-1\"])"), list = [];
      for (var i = 0; i < f.length; i++) if (!f[i].disabled && f[i].offsetParent !== null) list.push(f[i]);
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); focusOn(last); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); focusOn(first); }
    }
  }

  /* a small light in the world's colours, for the top of a card */
  function glow(world, px) {
    var g = el("div", "st-glow");
    g.setAttribute("aria-hidden", "true");
    if (px) { g.style.width = px + "px"; g.style.height = px + "px"; }
    g.style.background = "radial-gradient(circle, " + rgba(world.key, 0.95) + " 0%, " + rgba(world.key, 0.55) +
      " 30%, " + rgba(world.rim, 0.18) + " 58%, " + rgba(world.rim, 0) + " 71%)";
    return g;
  }
  function currentWorld() { return worldById(sess ? sess.world : pref("steadyWorld", DEFAULT_WORLD)); }

  /* ================================================================
     the entry card
     ================================================================ */
  function segField(parent, label, list, value, onPick) {
    var f = el("div", "st-field");
    var lab = el("div", "st-label", label);
    lab.id = "st" + label.replace(/[^A-Za-z]/g, "") + "Label";
    f.setAttribute("role", "group");
    f.setAttribute("aria-labelledby", lab.id);
    var seg = el("div", "st-seg"), line = el("div", "st-line");
    var buttons = [];
    function set(v) {
      for (var i = 0; i < list.length; i++) {
        buttons[i].setAttribute("aria-pressed", list[i].v === v ? "true" : "false");
        if (list[i].v === v) line.textContent = list[i].line;
      }
    }
    for (var i = 0; i < list.length; i++) {
      (function (opt) {
        var b = button(opt.name, null, function () {
          set(opt.v);
          sound("toggle");
          onPick(opt.v);
        });
        buttons.push(b);
        seg.appendChild(b);
      })(list[i]);
    }
    set(value);
    f.appendChild(lab); f.appendChild(seg); f.appendChild(line);
    parent.appendChild(f);
    return f;
  }

  function worldField(parent, value, onPick) {
    var f = el("div", "st-field"), lab = el("div", "st-label", "World"), name = el("b");
    lab.id = "stWorldLabel";
    lab.appendChild(name);
    f.setAttribute("role", "group");
    f.setAttribute("aria-labelledby", lab.id);
    /* the chosen world's name sits in the label row and its description
       on each tile's tooltip, so the card stays one screen tall */
    var grid = el("div", "st-worlds"), list = worldList(), tiles = [];
    function set(id) {
      for (var i = 0; i < list.length; i++) {
        tiles[i].setAttribute("aria-pressed", list[i].id === id ? "true" : "false");
        if (list[i].id === id) name.textContent = list[i].name;
      }
    }
    for (var i = 0; i < list.length; i++) {
      (function (w) {
        var t = button("", null, function () { set(w.id); sound("toggle"); onPick(w.id); });
        t.className = "st-world";
        t.setAttribute("aria-label", w.name);
        t.title = w.name + (w.line ? ": " + w.line : "");
        var sky = w.sky || {};
        /* the world's sky, its key light low on the horizon, and the rim
           light as a thin line along the bottom */
        t.style.background =
          "radial-gradient(70% 60% at 50% 105%, " + rgba(w.key, 0.62) + ", " + rgba(w.key, 0) + " 100%)," +
          "linear-gradient(0deg, " + rgba(w.rim, 0.55) + " 0, " + rgba(w.rim, 0.55) + " 2px, rgba(0,0,0,0) 2px)," +
          "linear-gradient(180deg, " + (sky.top || "#111") + ", " + (sky.horizon || "#333") + ")";
        var dot = el("i");
        dot.style.background = w.key;
        dot.style.boxShadow = "0 0 8px " + rgba(w.key, 0.9);
        t.appendChild(dot);
        tiles.push(t);
        grid.appendChild(t);
      })(list[i]);
    }
    set(value);
    f.appendChild(lab); f.appendChild(grid);
    parent.appendChild(f);
  }

  function openEntry() {
    stopBreath(false);
    hideAll("ovSteady");
    var c = chosen();
    var sheet = shell("ovSteady");
    sheet.classList.add("st-entry");
    closeButton(sheet, "Close", function () { hide("ovSteady"); });
    heading(sheet, "ovSteady", "Steady");
    sheet.appendChild(el("p", "lead", "A quiet twenty minutes. Slow, even, nothing sudden."));

    /* On a short screen only the choices scroll; Begin never leaves the
       card, because everything is already chosen and Begin is the one
       thing anybody has to press. */
    var body = el("div", "st-body");
    segField(body, "Length (minutes)", LENGTHS, c.length, function (v) { c.length = v; });
    segField(body, "Pace", PACES, c.pace, function (v) { c.pace = v; });
    segField(body, "Landing light", LANDING, c.landing, function (v) { c.landing = v; });
    segField(body, "Sound", SOUNDS, c.sound, function (v) { c.sound = v; });
    worldField(body, c.world, function (v) { c.world = v; });
    sheet.appendChild(body);

    var foot = el("div", "st-foot"), go = el("div", "st-go");
    var begin = button("Begin", "primary", function () { start(c); });
    go.appendChild(begin);
    foot.appendChild(go);
    var whyLink = button("Why this game?", null, function () { why(); });
    whyLink.className = "st-link";
    foot.appendChild(whyLink);
    sheet.appendChild(foot);

    esc.ovSteady = function () { hide("ovSteady"); };
    show("ovSteady", begin);
    overflowHint(sheet, body);
  }

  /* a soft shadow over Begin while there is more to scroll to above it */
  function overflowHint(sheet, body) {
    function check() {
      if (!sheet.parentNode) return;
      var more = body.scrollHeight - body.clientHeight - body.scrollTop > 2;
      sheet.classList.toggle("over", more);
    }
    body.addEventListener("scroll", check);
    check();
    if (!overflowHint.bound) {
      overflowHint.bound = true;
      root.addEventListener("resize", function () {
        var s = document.querySelector("#ovSteady .st-entry"), b = s && s.querySelector(".st-body");
        if (s && b) s.classList.toggle("over", b.scrollHeight - b.clientHeight - b.scrollTop > 2);
      });
    }
  }

  function start(c) {
    /* a tap on Begin is a user gesture: the one moment audio may wake */
    try { if (music && music.unlock) music.unlock(); } catch (e) { /* the app will try again */ }
    setPref("steadyLength", c.length);
    setPref("steadyPace", c.pace);
    setPref("steadyLanding", c.landing);
    setPref("steadySound", c.sound);
    setPref("steadyWorld", c.world);
    var seen = pref("seen", {}) || {};
    if (!seen.steadyTip || (touchHands() && !seen.touchCards)) openTip(c);
    else go(c);
  }
  /* is this a touch screen in use? The app knows which hands were used
     last; without it, a coarse pointer or a touch screen with no fine one */
  function touchHands() {
    try { if (typeof o.device === "function") return o.device() === "touch"; } catch (e) { /* guess below */ }
    var mm = function (q) { try { return !!(root.matchMedia && root.matchMedia(q).matches); } catch (e) { return false; } };
    var touch = ("ontouchstart" in root) || ((root.navigator || {}).maxTouchPoints > 0);
    return mm("(pointer: coarse)") || (touch && !mm("(pointer: fine)"));
  }

  function go(c) {
    hide("ovSteady");
    sess = newSession(c, 0);
    flow = "pause";
    safe(o.onBegin, { length: c.length, pace: c.pace, landing: c.landing, sound: c.sound, world: c.world });
  }

  /* ---------- the tip, once ---------- */
  function tipArt(world) {
    /* A slice of the well: two rows of stack with a T-shaped slot in them.
       First an imagined piece — dashed, because it is only pictured —
       turns over and settles into the slot; then the real piece follows
       it down the same way. Eight slow seconds a loop. Under reduced
       motion it is a still diagram of the same idea: the piece, a turn,
       and where it will land. */
    var k = world.key, cell = 20, ox = 20, oy = 6, x, y, i;
    var slot = [[1, 5], [2, 5], [3, 5], [2, 6]];
    function rect(cx, cy, attrs) {
      return "<rect x=\"" + (ox + cx * cell + 1.5) + "\" y=\"" + (oy + cy * cell + 1.5) + "\" width=\"" + (cell - 3) +
        "\" height=\"" + (cell - 3) + "\" rx=\"4\" " + attrs + "/>";
    }
    function piece(attrs) {
      var out = "";
      for (i = 0; i < 4; i++) out += rect(slot[i][0], slot[i][1], attrs);
      return out;
    }
    var solid = "fill=\"" + rgba(k, 0.86) + "\"";
    var dashed = "fill=\"" + rgba(k, 0.06) + "\" stroke=\"" + k + "\" stroke-width=\"1.5\" stroke-dasharray=\"3.5 2.5\"";
    var cx = ox + 2.5 * cell, cy = oy + 5.5 * cell;   /* the T turns about the middle of its bar */
    var s = "<svg class=\"st-art\" viewBox=\"0 0 160 152\" aria-hidden=\"true\">";
    /* the walls and floor of the well */
    s += "<path d=\"M" + (ox - 4) + " " + oy + "V" + (oy + 7 * cell + 4) + "H" + (ox + 6 * cell + 4) + "V" + oy +
      "\" fill=\"none\" stroke=\"rgba(255,255,255,.16)\" stroke-width=\"2\" stroke-linejoin=\"round\"/>";
    for (y = 5; y <= 6; y++) for (x = 0; x < 6; x++) {
      if ((y === 5 && x >= 1 && x <= 3) || (y === 6 && x === 2)) continue;
      s += rect(x, y, "fill=\"rgba(255,255,255,.13)\"");
    }
    if (reduced()) {
      /* the piece as it arrives (pointing up), a turn, and its landing */
      s += "<g transform=\"translate(0 -80) rotate(180 " + cx + " " + cy + ")\">" + piece(solid) + "</g>";
      s += "<path d=\"M" + (ox + 4.6 * cell) + " " + (oy + 0.6 * cell) + "a 13 13 0 1 1 -4 22\" fill=\"none\" stroke=\"" +
        rgba(k, 0.7) + "\" stroke-width=\"1.5\" stroke-linecap=\"round\"/>" +
        "<path d=\"M" + (ox + 4.6 * cell - 9) + " " + (oy + 0.6 * cell + 21) + "l5 1.6 -1.4 5\" fill=\"none\" stroke=\"" +
        rgba(k, 0.7) + "\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/>";
      s += "<path d=\"M" + cx + " " + (oy + 2.4 * cell) + "V" + (oy + 4.6 * cell) + "\" stroke=\"" + rgba(k, 0.45) +
        "\" stroke-width=\"1.5\" stroke-dasharray=\"2 4\" stroke-linecap=\"round\"/>";
      s += piece(dashed);
      return s + "</svg>";
    }
    var D = "dur=\"8s\" repeatCount=\"indefinite\"";
    var EASE = ".45 0 .25 1", HOLD = "0 0 1 1";
    function move(keys) {
      return "<animateTransform attributeName=\"transform\" type=\"translate\" values=\"0 -80;0 -80;0 0;0 0\" keyTimes=\"" + keys +
        "\" calcMode=\"spline\" keySplines=\"" + HOLD + ";" + EASE + ";" + HOLD + "\" " + D + "/>";
    }
    function turn(keys) {
      return "<animateTransform attributeName=\"transform\" type=\"rotate\" values=\"180 " + cx + " " + cy + ";180 " + cx + " " + cy +
        ";0 " + cx + " " + cy + ";0 " + cx + " " + cy + "\" keyTimes=\"" + keys + "\" calcMode=\"spline\" keySplines=\"" +
        HOLD + ";" + EASE + ";" + HOLD + "\" " + D + "/>";
    }
    /* the real piece waits at the top while the imagined one goes first */
    s += "<g opacity=\"0\"><animate attributeName=\"opacity\" values=\"0;.95;.95;0\" keyTimes=\"0;.05;.9;1\" " + D + "/>" +
      "<g>" + move("0;.6;.74;1") + "<g transform=\"rotate(180 " + cx + " " + cy + ")\">" + turn("0;.48;.6;1") + piece(solid) + "</g></g></g>";
    s += "<g opacity=\"0\"><animate attributeName=\"opacity\" values=\"0;0;1;1;.7;0;0\" keyTimes=\"0;.05;.1;.46;.7;.76;1\" " + D + "/>" +
      "<g>" + move("0;.3;.44;1") + "<g transform=\"rotate(180 " + cx + " " + cy + ")\">" + turn("0;.12;.28;1") + piece(dashed) + "</g></g></g>";
    return s + "</svg>";
  }

  function openTip(c) {
    var seen = pref("seen", {}) || {}, next = {};
    for (var k in seen) if (Object.prototype.hasOwnProperty.call(seen, k)) next[k] = seen[k];
    /* Steady shows no words during play, so a first session on glass
       learns the four gestures here, between sessions, in one line — and
       they are then taught, so no other mode repeats them as cards */
    var teach = touchHands() && !seen.touchCards;
    next.steadyTip = true;
    if (teach) next.touchCards = true;
    setPref("seen", next);

    var sheet = shell("ovSteady");
    /* the room's ✕ always closes its sheet (app.js answers every one), so
       this one does too; the choices are already saved for next time */
    closeButton(sheet, "Close", function () { hide("ovSteady"); });
    heading(sheet, "ovSteady", "A game skill to try");
    var art = el("div");
    art.innerHTML = tipArt(worldById(c.world));
    sheet.appendChild(art.firstChild);
    sheet.appendChild(el("p", "st-tip", TIP));
    sheet.appendChild(el("p", "st-small", "It's only a suggestion. Play however feels right."));
    if (teach) {
      var ctl = el("ul", "st-ctl");
      ctl.setAttribute("aria-label", "How to play");
      var how = ["Drag to move", "Tap to turn", "Flick down to drop", "Flick up to keep"];
      for (var h = 0; h < how.length; h++) ctl.appendChild(el("li", null, how[h]));
      sheet.appendChild(ctl);
    }
    var goWrap = el("div", "st-go");
    var b = button("Begin", "primary", function () { go(c); });
    goWrap.appendChild(b);
    sheet.appendChild(goWrap);
    esc.ovSteady = function () { hide("ovSteady"); };
    show("ovSteady", b);
  }

  /* ================================================================
     the soft timer
     ================================================================ */
  function tick(elapsedMs) {
    elapsedMs = +elapsedMs || 0;
    /* no session in this page (a run resumed from a save), or the clock
       went backwards (a different run): adopt one from the settings */
    if (!sess || elapsedMs + 1000 < sess.last) sess = newSession(chosen(), elapsedMs);
    sess.last = elapsedMs;
    if (!sess.length || sess.fired) return null;
    if (elapsedMs >= sess.due) { sess.fired = true; return "timeup"; }
    return null;
  }

  function timeUp() {
    if (!sess) sess = newSession(chosen(), 0);
    sess.fired = true;
    sess.ended = true;
    flow = "end";
    if (sess.sound !== "quiet") sound("chime");
    renderEnd();
  }

  function renderEnd() {
    stopBreath(false);
    hideAll("ovSteady");
    var world = currentWorld();
    var mins = sess && sess.last ? sess.last / 60000 : (sess ? sess.length : 20);
    var sheet = shell("ovSteady");
    var box = el("div", "st-center");
    box.appendChild(glow(world));
    heading(box, "ovSteady", "That's " + minutesWords(mins) + ". Nicely done.", "st-big");
    sheet.appendChild(box);
    var stack = el("div", "st-stack");
    var breathe = button("Breathe for a minute", "primary", function () { openBreathe("end"); });
    stack.appendChild(breathe);
    stack.appendChild(button("Keep playing", "", keepPlaying));
    stack.appendChild(button("Finish", "", function () { finish("timer", true); }));
    sheet.appendChild(stack);
    /* three explicit choices and no way to dismiss it by accident */
    esc.ovSteady = function () { focusOn(breathe); };
    show("ovSteady", breathe, true);   /* the chime has already spoken */
  }

  function keepPlaying() {
    stopBreath(false);
    hideAll();
    if (sess) {
      sess.due = sess.last + Math.max(KEEP_GAP, sess.length * 60000);
      sess.fired = false;
      sess.ended = false;
    }
    flow = "pause";
    safe(o.onKeepPlaying);
  }

  function finish(reason, atTimer) {
    stopBreath(false);
    hideAll();
    /* choosing to stop when the time is up is the one Stone for stopping */
    if (atTimer) safe(o.onMoment, { t: "stop" });
    sess = null;
    flow = "pause";
    safe(o.onFinish, reason);
    openClose();
  }

  /* ================================================================
     Breathe
     ================================================================ */
  function openBreathe(from) {
    flow = from === "end" || from === "pause" ? from : (sess && sess.ended ? "end" : "pause");
    stopBreath(false);
    if (flow === "end") hide("ovSteady");
    hide("ovGround");
    var world = currentWorld(), sky = world.sky || {};
    var sheet = shell("ovBreathe", true);
    /* the world's horizon glows behind the circle; the halted well shows
       through faintly above, and the words and buttons sit on near-black */
    document.getElementById("ovBreathe").style.background =
      "radial-gradient(60% 46% at 50% 40%, " + rgba(sky.horizon || "#2a3142", 0.5) + " 0%, " + rgba(sky.horizon || "#2a3142", 0) + " 100%)," +
      "linear-gradient(180deg, " + rgba(sky.top || "#10141f", 0.88) + " 0%, " + rgba(sky.top || "#10141f", 0.93) + " 46%, rgba(5,6,10,.97) 76%)";

    var title = el("div", "st-btitle", "A minute of breathing");
    title.id = "ovBreatheTitle";
    document.getElementById("ovBreathe").setAttribute("aria-labelledby", title.id);
    sheet.appendChild(title);

    var mid = el("div", "st-bmid");
    var box = el("div", "st-orbbox");
    box.setAttribute("aria-hidden", "true");
    var ring = el("div", "st-ring"), orb = el("div", "st-orb");
    /* the faint ring is the full breath, so the eye knows where the circle
       is going; the circle itself is the world's key light, warmest at
       the centre and fading through its rim colour */
    ring.style.border = "1.5px solid " + rgba(world.rim, 0.3);
    ring.style.boxShadow = "inset 0 0 40px " + rgba(world.rim, 0.06);
    orb.style.background = "radial-gradient(circle at 50% 46%, " + rgba(world.key, 0.96) + " 0%, " +
      rgba(world.key, 0.62) + " 26%, " + rgba(world.rim, 0.26) + " 52%, " + rgba(world.rim, 0.08) + " 64%, " +
      rgba(world.rim, 0) + " 71%)";
    box.appendChild(ring); box.appendChild(orb);
    mid.appendChild(box);
    var word = el("div", "st-word", "Follow the circle");
    word.setAttribute("aria-live", "polite");
    mid.appendChild(word);
    var dots = el("div", "st-dots");
    dots.setAttribute("aria-hidden", "true");
    mid.appendChild(dots);
    sheet.appendChild(mid);

    var foot = el("div", "st-bfoot");
    var seg = el("div", "st-seg"), line = el("div", "st-line"), pb = {};
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Breathing pattern");
    ["longer", "even"].forEach(function (id) {
      var b = button(BREATHS[id].name, null, function () {
        pattern = id;
        setPattern();
        sound("toggle");
        if (B) drawDots();
      });
      pb[id] = b;
      seg.appendChild(b);
    });
    function setPattern() {
      pb.longer.setAttribute("aria-pressed", pattern === "longer" ? "true" : "false");
      pb.even.setAttribute("aria-pressed", pattern === "even" ? "true" : "false");
      line.textContent = BREATHS[pattern].line;
    }
    setPattern();
    foot.appendChild(seg);
    foot.appendChild(line);
    var skip = button("Skip", "", skipBreath);
    foot.appendChild(skip);
    sheet.appendChild(foot);

    B = { on: true, t: 0, last: 0, k: 0, c0: 0, cyc: BREATHS[pattern], raf: 0, mt: -1e9, word: "",
          orb: orb, wordEl: word, dots: dots, foot: foot, key: world.key, still: reduced(), lastIn: null };
    drawDots();
    paintOrb(0, 0);
    esc.ovBreathe = skipBreath;
    show("ovBreathe", skip);
    tellBreath(0, 0, true);
    B.raf = requestAnimationFrame(frame);
  }

  function drawDots() {
    if (!B) return;
    var n = BREATHS[pattern].n, d = B.dots;
    while (d.firstChild) d.removeChild(d.firstChild);
    for (var i = 0; i < n; i++) {
      var dot = el("span", "st-dot");
      if (i < B.k) dot.style.background = B.key;
      else if (i === B.k && B.t > LEAD_IN) dot.style.boxShadow = "0 0 0 2px " + rgba(B.key, 0.45);
      d.appendChild(dot);
    }
  }

  /* s: 0 = breath out, 1 = full. Scale under full motion; under reduced
     motion the circle stays put and only its light rises and falls. */
  function paintOrb(s, fade) {
    if (!B) return;
    if (B.still) {
      B.orb.style.transform = "scale(.86) translateZ(0)";
      B.orb.style.opacity = String((0.22 + 0.78 * s) * (fade === undefined ? 1 : fade));
    } else {
      B.orb.style.transform = "scale(" + (0.42 + 0.58 * s).toFixed(4) + ") translateZ(0)";
      B.orb.style.opacity = String(0.9 * (fade === undefined ? 1 : fade));
    }
  }
  function ease(x) { return 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, x))); }

  /* the pad swells with the breath; the well behind can breathe too */
  function tellBreath(phase, s, now) {
    if (!B) return;
    var t = B.t;
    if (now || t - B.mt >= 90) {
      B.mt = t;
      try { if (music && music.breath) music.breath(phase, s); } catch (e) { /* the circle carries on */ }
    }
    safe(o.onBreathe, phase, s);
  }

  function setWord(w) {
    if (!B || B.word === w) return;
    B.word = w;
    var node = B.wordEl;
    if (B.still) { node.textContent = w; return; }
    node.style.opacity = "0";
    setTimeout(function () { node.textContent = w; node.style.opacity = "1"; }, 220);
  }

  function frame(ts) {
    if (!B || !B.on) return;
    if (!isOpen("ovBreathe")) { stopBreath(false); return; }   /* closed from outside */
    /* a frame gap (a hidden tab, a long task) pauses the breath rather
       than skipping through it */
    var dt = B.last ? Math.min(100, ts - B.last) : 0;
    B.last = ts;
    B.t += dt;
    var tt = B.t - LEAD_IN;
    if (tt < 0) {
      paintOrb(0, B.t / LEAD_IN);
      tellBreath(0, 0, false);
    } else {
      var c = tt - B.c0, len = B.cyc.inn + B.cyc.out;
      while (c >= len) {
        B.k++;
        B.c0 += len;
        c -= len;
        /* a new pattern takes over at a breath's boundary, never mid-breath */
        B.cyc = BREATHS[pattern];
        len = B.cyc.inn + B.cyc.out;
        drawDots();
        if (B.k >= B.cyc.n) { completeBreath(); return; }
      }
      var inBreath = c < B.cyc.inn;
      var s = inBreath ? ease(c / B.cyc.inn) : 1 - ease((c - B.cyc.inn) / B.cyc.out);
      paintOrb(s);
      setWord(inBreath ? "Breathe in" : "Breathe out");
      if (B.lastIn !== inBreath) { B.lastIn = inBreath; drawDots(); tellBreath(c / len, s, true); }
      else tellBreath(c / len, s, false);
    }
    B.raf = requestAnimationFrame(frame);
  }

  function stopBreath(settle) {
    if (!B) return;
    B.on = false;
    if (B.raf) cancelAnimationFrame(B.raf);
    B.raf = 0;
    if (settle !== false) paintOrb(0);
    try { if (music && music.breath) music.breath(0, 0); } catch (e) { /* nothing to settle */ }
    safe(o.onBreathe, 0, 0);
    B = null;
  }

  function completeBreath() {
    var foot = B.foot, still = B.still;
    B.k = B.cyc.n;
    drawDots();
    paintOrb(0);
    setWord("Rest here as long as you like.");
    stopBreath(true);
    safe(o.onMoment, { t: "breathed" });
    /* what next depends on where the minute was opened from */
    while (foot.firstChild) foot.removeChild(foot.firstChild);
    var first;
    if (flow === "end") {
      first = button("Finish", "primary", function () { finish("timer", true); });
      foot.appendChild(first);
      foot.appendChild(button("Notice what's around you", "", function () { openGround("end"); }));
      foot.appendChild(button("Keep playing", "", keepPlaying));
      esc.ovBreathe = function () { renderEnd(); };
    } else {
      first = button("Done", "primary", function () { hide("ovBreathe"); });
      foot.appendChild(first);
      foot.appendChild(button("Notice what's around you", "", function () { openGround("pause"); }));
      esc.ovBreathe = function () { hide("ovBreathe"); };
    }
    if (!still) foot.style.opacity = "0";
    setTimeout(function () { foot.style.transition = "opacity .5s"; foot.style.opacity = "1"; }, 30);
    focusOn(first);
  }

  function skipBreath() {
    stopBreath(true);
    if (flow === "end") renderEnd();
    else hide("ovBreathe");
  }

  /* ================================================================
     noticing: five, four, three, two, one
     ================================================================ */
  function openGround(from) {
    flow = from === "end" || from === "pause" ? from : (sess && sess.ended ? "end" : "pause");
    stopBreath(false);
    hide("ovBreathe");
    if (flow === "end") hide("ovSteady");
    var world = currentWorld(), i = 0;
    var sheet = shell("ovGround");
    closeButton(sheet, "Stop here", stopHere);
    var title = el("div", "st-label", "Noticing");
    title.id = "ovGroundTitle";
    title.style.justifyContent = "center";
    title.style.margin = "8px 40px 0";
    sheet.appendChild(title);
    document.getElementById("ovGround").setAttribute("aria-labelledby", title.id);
    var num = el("div", "st-num st-fade"), sense = el("p", "st-sense st-fade");
    num.style.color = world.key;
    num.style.textShadow = "0 0 28px " + rgba(world.key, 0.35);
    num.setAttribute("aria-hidden", "true");
    sense.setAttribute("aria-live", "polite");
    var gdots = el("div", "st-gdots");
    gdots.setAttribute("aria-hidden", "true");
    var actions = el("div", "st-stack");
    sheet.appendChild(num); sheet.appendChild(sense); sheet.appendChild(gdots); sheet.appendChild(actions);

    function stopHere() {
      if (flow === "end") renderEnd();
      else hide("ovGround");
    }
    function paint(first) {
      var still = reduced();
      function fill() {
        num.textContent = NOTICE[i][0];
        sense.textContent = NOTICE[i][1];
        while (gdots.firstChild) gdots.removeChild(gdots.firstChild);
        for (var d = 0; d < NOTICE.length; d++) {
          var dot = el("span", "st-dot");
          if (d <= i) dot.style.background = world.key;
          gdots.appendChild(dot);
        }
        while (actions.firstChild) actions.removeChild(actions.firstChild);
        var main;
        if (i < NOTICE.length - 1) {
          main = button("Next", "primary", function () { i++; paint(false); });
          actions.appendChild(main);
        } else if (flow === "end") {
          main = button("Finish", "primary", function () { finish("timer", true); });
          actions.appendChild(main);
          actions.appendChild(button("Keep playing", "", keepPlaying));
        } else {
          main = button("Done", "primary", function () { hide("ovGround"); });
          actions.appendChild(main);
        }
        if (!first) focusOn(main);
        return main;
      }
      if (first || still) return fill();
      num.style.opacity = "0"; sense.style.opacity = "0";
      setTimeout(function () { fill(); num.style.opacity = "1"; sense.style.opacity = "1"; }, 240);
      return null;
    }
    var main = paint(true);
    esc.ovGround = stopHere;
    show("ovGround", main);
  }

  /* ================================================================
     close, and the help lines
     ================================================================ */
  function openClose() {
    var world = currentWorld();
    var sheet = shell("ovClose");
    var box = el("div", "st-center");
    box.appendChild(glow(world, 56));
    var h = el("h2", "st-thanks", "Thank you for spending this time at the well.");
    h.id = "ovCloseTitle";
    box.appendChild(h);
    document.getElementById("ovClose").setAttribute("aria-labelledby", h.id);
    sheet.appendChild(box);
    var stack = el("div", "st-stack");
    stack.style.marginTop = "22px";
    var done = button("Done", "primary", function () { hide("ovClose"); });
    stack.appendChild(done);
    sheet.appendChild(stack);
    /* small and quiet, under everything else: there if it is wanted */
    var help = button("If things feel heavy, here's who to talk to", null, function () { openHelp(); });
    help.className = "st-link";
    help.style.display = "flex";
    help.style.margin = "14px auto 0";
    help.style.fontSize = ".88rem";
    help.style.color = "var(--soft)";
    sheet.appendChild(help);
    esc.ovClose = function () { hide("ovClose"); };
    show("ovClose", done);
  }

  function openHelp() {
    var sheet = shell("ovHelp");
    var close = closeButton(sheet, "Close", function () { hide("ovHelp"); });
    heading(sheet, "ovHelp", "Help lines");
    sheet.appendChild(el("p", "lead", "If things feel heavy, here's who to talk to."));
    var body = el("div", "st-help");
    sheet.appendChild(body);
    var drawn = false;
    if (learn && typeof learn.renderHelp === "function") {
      try { learn.renderHelp(body); drawn = body.childNodes.length > 0; } catch (e) { drawn = false; }
    }
    if (!drawn) {
      /* learn.js holds the verified list; if it could not load, the one
         line that works everywhere is better than an empty sheet */
      while (body.firstChild) body.removeChild(body.firstChild);
      var p = el("p", "st-tip");
      p.appendChild(document.createTextNode("Find A Helpline lists free, verified helplines in many countries: "));
      var a = el("a", "", "findahelpline.com");
      a.href = "https://findahelpline.com/";
      a.target = "_blank";
      a.rel = "noopener";
      p.appendChild(a);
      body.appendChild(p);
      body.appendChild(el("p", "st-tip", "If you or someone else is in immediate danger, call your local emergency number."));
    }
    var stack = el("div", "st-stack");
    stack.style.marginTop = "18px";
    stack.appendChild(button("Done", "", function () { hide("ovHelp"); }));
    sheet.appendChild(stack);
    esc.ovHelp = function () { hide("ovHelp"); };
    show("ovHelp", close);
  }

  /* "Why this game?" — the one door from Steady to the research */
  function why() {
    if (typeof o.onWhy === "function") { safe(o.onWhy, "steady"); return; }
    try { root.dispatchEvent(new CustomEvent("well:learn", { detail: { section: "steady" } })); } catch (e) { /* no listener */ }
    var ov = document.getElementById("ovLearn"), body = ov ? ov.querySelector("#learnBody") : null;
    if (body && learn && typeof learn.render === "function") {
      try {
        learn.render(body, "steady", { device: ("ontouchstart" in root) ? "touch" : "keys", prefs: prefs });
        document.body.appendChild(ov);
        ov.classList.remove("hide");
      } catch (e) { /* the explainer stays one menu away */ }
    }
  }

  /* ---------- the pause sheet's extra row ---------- */
  function pauseExtras(host) {
    if (!host) return null;
    var old = host.querySelector(".st-pauseExtras");
    if (old) old.parentNode.removeChild(old);
    var box = el("div", "st-pauseExtras");
    var r1 = el("div", "row"), r2 = el("div", "row");
    /* ids, so the pause sheet can come back with the focus where it was */
    var bb = button("Breathe", "", function () { openBreathe("pause"); });
    bb.id = "stxBreathe";
    var bw = button("Why this game?", "", function () { why(); });
    bw.id = "stxWhy";
    var bh = button("Help lines", "", function () { openHelp(); });
    bh.id = "stxHelp";
    /* Finish and the pause sheet's Leave sit near each other and mean
       different things, so each says which in a few small words */
    var bf = button("Finish", "two", function () { finish("pause", false); });
    bf.id = "stxFinish";
    bf.appendChild(el("small", "bsub", "end the session"));
    r1.appendChild(bb); r1.appendChild(bw);
    r2.appendChild(bh); r2.appendChild(bf);
    box.appendChild(r1); box.appendChild(r2);
    host.appendChild(box);
    return box;
  }

  return {
    openEntry: openEntry,
    tick: tick,
    timeUp: timeUp,
    openBreathe: function (from) { openBreathe(from); },
    openGround: function (from) { openGround(from); },
    openClose: openClose,
    openHelp: openHelp,
    pauseExtras: pauseExtras,
    /* extras beyond the spec, for the app's convenience */
    close: function () { stopBreath(false); hideAll(); },
    session: function () {
      return sess ? { length: sess.length, pace: sess.pace, landing: sess.landing, sound: sess.sound,
                      world: sess.world, due: sess.due, ended: sess.ended } : null;
    }
  };
};

if (typeof module !== "undefined" && module.exports) module.exports = Steady;
else root.Steady = Steady;
})(typeof self !== "undefined" ? self : this);
