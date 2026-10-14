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
   line for whichever is chosen and nothing has to be guessed. A length's
   line is only the length: the line under it says when the chime will
   come, on the device's own clock, so the chime is named once. */
var LENGTHS = [
  { v: 10, name: "10", line: "Ten minutes." },
  { v: 15, name: "15", line: "Fifteen minutes." },
  { v: 20, name: "20", line: "Twenty minutes." },
  { v: 25, name: "25", line: "Twenty-five minutes." },
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
   Steady's cards are made of the room's kit — the glass sheet, the
   segmented choices, the pearl button, the world picker, the list rows
   (index.html carries them) — and use nothing but its tokens, so every
   colour here is the light of a world: --wk the key light (the pearl, the
   breathing circle, the glow at the top of a card), --wr the rim, --wsky0
   and --wsky1 the sky. The app tints those to the world being played, and
   the entry card tints them to the world being picked, so the card you
   read before twenty minutes in Snowfall is already lit like Snowfall.

   What is left for this file is layout and type. The statements — "That's
   twenty minutes. Nicely done.", the thank-you, the five things to notice,
   Breathe in and out — are set in the room's serif, large, because they
   are read slowly at the end of a session, not skimmed. Everything moves
   in opacity only when motion is reduced (html.rm, or the system's own
   setting), and nothing at all moves faster than a breath would.

   The phone shape (the kit's bottom sheet) and the wider shapes differ
   only in width and in the grabber; the media queries below are the
   kit's own breakpoints, so a Steady card is never the odd one out. */
var PHONE = "(max-width:599px), (pointer:coarse) and (max-width:699px)";
var WIDE = "(min-width:600px) and (pointer:fine), (min-width:700px)";
var DESK = "(min-width:900px) and (pointer:fine)";
Steady.CSS = [
  /* the sheet: the kit's glass at Steady's width. A card with a title
     bar (.st-hd: the entry, the tip, the help lines) uses the kit's own
     bar — the sheet-sized serif title with its ✕ beside it, exactly as
     every other sheet in the room — so only the statements below are set
     large. A statement card has no bar and gets its top room here. */
  ".sheet.st{position:relative;padding-top:24px}",
  ".sheet.st.st-hd{padding-top:0}",
  "@media " + WIDE + "{.st-ov>.sheet.st{width:min(520px,100%)}}",
  "@media " + PHONE + "{.st-ov>.sheet.st{padding-top:0}.sheet.st:not(.st-hd)>.grab{margin-bottom:12px}}",
  ".sheet.st .st-x{position:absolute;top:10px;right:10px;z-index:4;float:none;padding:0;font-size:1rem}",
  ".st h2.st-big,.st h2.st-thanks{font:400 1.75rem/2.125rem var(--serif);letter-spacing:-.005em;color:var(--ink);text-wrap:balance}",
  ".st h2:focus,.st .st-btitle:focus{outline:none}",
  ".sheet.st .lead{font:400 1rem/1.5 var(--sans);color:var(--ink-2);margin:0 0 4px;text-wrap:pretty}",
  "@media " + DESK + "{.st h2.st-big,.st h2.st-thanks{font-size:2rem;line-height:2.375rem}}",

  /* the entry card: the choices scroll in the middle; Begin never leaves.
     Where there is more to scroll to, the choices fade into the glass at
     that edge — a cue that needs no scrollbar (a Mac hides them) and
     never draws a line across a control the way a hairline did. */
  ".st-ov>.sheet.st.st-entry{display:flex;flex-direction:column;overflow:hidden}",
  ".st-entry>.shead{flex:none}",
  ".st-body{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;margin:0 -20px;padding:0 20px 16px}",
  ".st-body.fade-b{-webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 32px),transparent);mask-image:linear-gradient(180deg,#000 calc(100% - 32px),transparent)}",
  ".st-body.fade-t{-webkit-mask-image:linear-gradient(180deg,transparent,#000 20px);mask-image:linear-gradient(180deg,transparent,#000 20px)}",
  ".st-body.fade-t.fade-b{-webkit-mask-image:linear-gradient(180deg,transparent,#000 20px,#000 calc(100% - 32px),transparent);" +
    "mask-image:linear-gradient(180deg,transparent,#000 20px,#000 calc(100% - 32px),transparent)}",
  ".st-body>.lead{margin:0}",
  ".st-foot{flex:none;position:relative;padding:12px 20px 0;margin:0 -20px}",
  ".st-field{margin-top:20px}",
  ".st-label{font:500 .75rem/1rem var(--sans);letter-spacing:.02em;color:var(--ink-2);margin:0 4px 8px}",
  /* wide enough (a desk, an iPad, a phone on its side): the four choices
     two by two, so the worlds — the loveliest part of the card — are in
     view without a scroll. The length takes the narrower column, its
     five choices being the shortest words; large text keeps one column. */
  "@media (min-width:700px){.st-ov>.sheet.st.st-entry{width:min(640px,100%)}" +
    ".st-grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,6fr);column-gap:24px;align-items:start}" +
    ".st-grid .seg>button{min-width:0}" +
    /* every world's name fits on one line at this width */
    "html:not(.ts-big) .st-field .wp-n{min-height:0}}",
  /* a laptop's screen: the card may stand as tall as the window allows,
     so at 1280 by 800 everything, Begin included, is in view at once */
  "@media (min-width:700px) and (min-height:521px){.st-ov>.sheet.st.st-entry{max-height:min(calc(100vh - 32px),800px)}}",
  "html.ts-big .st-grid{display:block}",
  /* no word left alone on a line where the browser can help it */
  ".st-ov .seg-line{text-wrap:pretty}",
  ".st-field .seg>button{min-height:44px}",
  ".st-when{display:flex;align-items:center;gap:6px;font:400 .8125rem/1.125rem var(--sans);color:var(--ink-2);margin:6px 4px 0}",
  ".st-when .ic{width:16px;height:16px}",
  ".st-field .wpick{margin-top:2px}",
  ".st-field .wp-sw{position:relative;overflow:hidden}",
  ".st-field .wp-sw i{position:absolute;left:50%;bottom:7px;width:6px;height:6px;margin-left:-3px;border-radius:50%;opacity:0;transition:opacity .2s}",
  ".st-field .wp[aria-pressed=\"true\"] .wp-sw i{opacity:1}",
  ".st-field .wp-n{display:block;min-height:2em;padding:0 1px;overflow-wrap:break-word}",
  /* large text: three worlds to a row, so no name breaks inside a word */
  "html.ts-big .st-field .wpick{grid-template-columns:repeat(3,minmax(0,1fr))}",
  ".st-go .btn,.st-foot .st-begin{width:100%}",
  ".st-links{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:0 4px;margin:6px -8px 0}",
  ".st-links .btn.quiet{display:inline-block;font:500 .9375rem/1.2 var(--sans);flex:0 1 auto;max-width:100%;padding:12px 12px;white-space:normal;text-align:center}",
  ".st-links .btn.quiet .ic{width:16px;height:16px;margin:0 -4px 0 2px;vertical-align:-3px}",

  /* the tip, the once */
  ".st-art{display:block;width:200px;height:190px;margin:4px auto 10px}",
  ".st-art .w{fill:none;stroke:var(--ink-2);stroke-width:1.5;stroke-linejoin:round;stroke-linecap:round;opacity:.7}",
  ".st-art .s{fill:var(--fill-2);stroke:var(--ink-3);stroke-width:1.5;stroke-opacity:.55}",
  ".st-art .p{fill:rgb(var(--wk) / .88)}",
  ".st-art .d{fill:rgb(var(--wk) / .06);stroke:rgb(var(--wk));stroke-width:1.5;stroke-dasharray:3.5 2.5}",
  ".st-art .a{fill:none;stroke:rgb(var(--wk) / .7);stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}",
  ".st-art .t{stroke:rgb(var(--wk) / .45);stroke-width:1.5;stroke-dasharray:2 4;stroke-linecap:round}",
  ".st-tip{font:400 1.25rem/1.55 var(--serif);color:var(--ink);margin:6px auto 4px;max-width:30em;text-align:center;text-wrap:pretty}",
  ".st-small{font:400 .8125rem/1.125rem var(--sans);color:var(--ink-2);text-align:center;margin:14px 0 0}",
  ".st-ctl{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;list-style:none;margin:16px 0 0;padding:0}",
  ".st-ctl .chip{color:var(--ink)}",
  ".st-go{margin-top:20px}",

  /* a card with one statement: the time-up card, the thank-you */
  ".st-center{text-align:center;padding:8px 0 0}",
  ".st-glow{width:72px;height:72px;margin:20px auto 20px;border-radius:50%;",
  "  background:radial-gradient(circle, rgb(var(--wk) / .95) 0%, rgb(var(--wk) / .55) 30%, rgb(var(--wr) / .18) 58%, rgb(var(--wr) / 0) 71%)}",
  ".st-glow.small{width:56px;height:56px;margin-top:16px}",
  ".st h2.st-big,.st h2.st-thanks{margin:0 auto 28px;max-width:15em}",
  ".st-stack{display:flex;flex-direction:column;gap:10px}",
  ".st-stack .btn{flex:none;width:100%}",
  ".st-quietlink{display:flex;margin:12px auto 0}",
  ".st-quietlink.btn.quiet{font:400 .875rem/1.25rem var(--sans);text-align:center}",

  /* Breathe: a whole screen, the world's sky behind one circle of its light */
  "html .ov.st-ov.st-full{padding:0;align-items:stretch;justify-content:stretch;",
  "  background:radial-gradient(60% 46% at 50% 40%, rgb(var(--wsky1) / .5) 0%, rgb(var(--wsky1) / 0) 100%),",
  "    linear-gradient(180deg, rgb(var(--wsky0) / .9) 0%, rgb(var(--wsky0) / .94) 46%, rgb(5 6 10 / .97) 76%)}",
  /* over another sheet (the pause sheet a moment before the app puts it
     away), the minute is a screen of its own: nothing shows through */
  "html .ov.st-ov.st-full.st-stacked{background-color:var(--room)}",
  ".st-ov.st-full>.sheet.st{width:100%;max-width:none;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:none;",
  "  display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;overflow:hidden;",
  "  padding:calc(18px + var(--safe-top)) 20px calc(20px + var(--safe-bot));animation:ovIn .6s var(--e-out)}",
  ".st-btitle{font:400 .9375rem/1.25rem var(--sans);color:var(--ink-2);min-height:44px;display:flex;align-items:center}",
  ".st-bmid{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;min-height:0;width:100%}",
  ".st-orbbox{position:relative;width:min(64vw,42vh,330px);height:min(64vw,42vh,330px);flex:none}",
  ".st-ring{position:absolute;inset:0;border-radius:50%;border:1px solid var(--hair-2)}",
  ".st-orb{position:absolute;inset:0;border-radius:50%;will-change:transform,opacity;transform:scale(.42) translateZ(0);",
  "  background:radial-gradient(circle, rgb(var(--wk) / .9), rgb(var(--wk) / 0) 70%)}",
  /* the breathing word is a statement, so it takes title-1 (§A3) rather than a size of its own */
  ".st-word{margin-top:32px;font:400 1.75rem/2.125rem var(--serif);letter-spacing:.005em;color:var(--ink);min-height:1.4em;transition:opacity .45s}",
  "@media (min-width:900px) and (pointer:fine){.st-word{font-size:2rem;line-height:2.375rem}}",
  ".st-dots{display:flex;gap:10px;margin-top:18px;min-height:10px;align-items:center}",
  ".st-dot{width:6px;height:6px;border-radius:50%;background:var(--fill-3);transition:background-color .6s,box-shadow .6s}",
  ".st-dot.lit{background:rgb(var(--wk))}",
  ".st-dot.now{box-shadow:0 0 0 2px rgb(var(--wk) / .45)}",
  ".st-bfoot{width:min(440px,100%);display:flex;flex-direction:column;gap:10px;margin-top:20px}",
  ".st-bfoot .seg-line{text-align:center;margin:0 0 4px}",
  ".st-bfoot .btn{flex:none;width:100%}",
  /* on a desk there is no thumb to reach the bottom of the screen, so the
     choices sit a short way under the circle, all of it one group in the
     middle, and Skip is a button's width rather than a bar across it */
  "@media " + DESK + "{" +
    ".st-ov.st-full>.sheet.st{justify-content:center}" +
    ".st-ov.st-full .st-btitle{position:absolute;top:calc(18px + var(--safe-top));left:0;right:0;justify-content:center}" +
    ".st-ov.st-full .st-bmid{flex:none}" +
    ".st-bfoot{width:min(360px,100%);margin-top:48px}" +
    ".st-bfoot .st-skip{align-self:center;width:auto;min-width:160px}" +
  "}",

  /* noticing: five, four, three, two, one */
  ".st-gtitle{text-align:center;margin:4px 44px 0}",
  ".st-num{font:400 3.5rem/1 var(--serif);letter-spacing:-.02em;font-variant-numeric:lining-nums tabular-nums;text-align:center;margin:18px 0 14px;",
  "  color:rgb(var(--wk));text-shadow:0 0 28px rgb(var(--wk) / .35)}",
  ".st-sense{font:400 1.75rem/2.125rem var(--serif);text-align:center;min-height:4.25rem;margin:0 0 12px;color:var(--ink);text-wrap:balance}",
  "@media " + DESK + "{.st-num{font-size:4.5rem}.st-sense{font-size:2rem;line-height:2.375rem;min-height:4.75rem}}",
  ".st-fade{transition:opacity .35s}",
  ".st-gdots{display:flex;justify-content:center;gap:10px;margin:4px 0 22px}",

  /* a card opened over another sheet (Help lines over the pause sheet or
     the thank-you) is solid glass, so the words beneath never show through */
  ".st-ov.st-stacked:not(.st-full)>.sheet.st{background:linear-gradient(180deg, rgb(var(--wsky1) / .28), rgb(var(--wsky1) / 0) 180px), rgb(var(--glass))}",
  /* help lines: the list itself is learn.js's, in the kit's rows */
  ".st-help{margin-top:16px}",
  ".st-help + .st-stack{margin-top:20px}",

  /* the pause sheet's extras (an app that still hands over one box gets
     them as a list of their own, with Finish under it) */
  ".st-pauseExtras .list{margin-top:4px}",
  ".st-pauseExtras .st-fin{display:flex;margin-top:10px}",
  ".st-pauseExtras .st-fin .btn{flex:1 1 auto}",
  /* Finish beside the app's Leave: the foot shares its width out after
     each button's padding, so the two take the same padding and come out
     the same width */
  "#menuFoot.steady>.btn{padding-left:12px;padding-right:12px}",

  /* a phone on its side: the statement cards tighten and set their choices
     in a row, and the breathing minute puts its circle beside its words, so
     nothing has to scroll and nothing overlaps */
  "@media (max-height:520px){" +
    ".st-glow{width:44px;height:44px;margin:4px auto 10px}.st-glow.small{width:40px;height:40px;margin-top:4px}" +
    ".st h2.st-big,.st h2.st-thanks{margin-bottom:16px}" +
    ".st-stack{flex-direction:row;flex-wrap:wrap}.st-stack .btn{flex:1 1 auto;width:auto;white-space:nowrap}" +
    ".st-num{font-size:2.75rem;margin:6px 0 8px}.st-sense{min-height:0;margin-bottom:8px}.st-gdots{margin-bottom:12px}" +
    ".st-art{width:150px;height:142px}" +
    ".st-ov.st-full>.sheet.st{flex-direction:row;justify-content:center;align-items:center;gap:6vw;padding-top:calc(44px + var(--safe-top))}" +
    ".st-ov.st-full .st-btitle{position:absolute;top:calc(6px + var(--safe-top));left:0;right:0;justify-content:center}" +
    ".st-ov.st-full .st-bmid{flex:0 1 auto}" +
    ".st-orbbox{width:min(54vh,40vw,260px);height:min(54vh,40vw,260px)}" +
    ".st-word{margin-top:14px}" +
    ".st-bfoot{width:min(360px,44vw);margin-top:0}" +
  "}",
  /* very short screens (a laptop at 300-400% zoom): the options area would
     shrink to a sliver above Begin, so the whole card scrolls as one page */
  "@media (max-height:300px){.st-ov>.sheet.st.st-entry{overflow-y:auto}.st-entry .st-body{flex:none;overflow:visible}}",
  /* forced colours: the world tiles are colour swatches, so they keep their
     own colours, and the chosen one its ring and its dot */
  "@media (forced-colors:active){.st-field .wp-sw{forced-color-adjust:none}.st-dot.lit{forced-color-adjust:none;background:CanvasText}}",
  /* reduced motion: opacity only, and quickly */
  "html.rm .st-ov *,html.rm .st-ov{transition-duration:.15s!important;animation:none!important}",
  "html.rm .st-ov.st-full>.sheet.st{animation:ovIn .15s linear!important}",
  "@media (prefers-reduced-motion:reduce){.st-ov *{transition-duration:.15s!important}.st-ov.st-full>.sheet.st{animation:ovIn .15s linear}}"
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
   onKeepPlaying(), onBreathe(phase, swell), onWhy(section), onMoment(ev),
   tint(worldId|null), onMoves(), firstStepsDone()}).
   onFinish's reason is "timer" (Finish once the time was up) or "pause"
   (Finish from the pause sheet). onMoment hands the app a moment that
   happened here rather than in the engine, already in the event shape
   records.js observes: {t:"breathed"} when the breathing minute runs to
   its end, {t:"stop"} for Finish once the time is up.

   tint lights the room's chrome in a world while the entry card is up, so
   the card previews the world being picked; tint(null) hands the light
   back to whatever world the room is in. onMoves opens the moves, for a
   player who hasn't been shown them yet — firstStepsDone() says whether
   they have; without it, the link simply isn't offered. */
Steady.create = function (o) {
  o = o || {};
  var prefs = o.prefs || null, music = o.music || null, learn = o.learn || null;
  var sess = null;          /* {length, pace, landing, sound, world, due, fired, ended, last} */
  var flow = "pause";       /* where Breathe and noticing were opened from: "end" | "pause" */
  var B = null;             /* the breathing minute, while it runs */
  var pattern = "longer";
  var esc = {};             /* overlay id -> what Escape does there */
  var titles = {};          /* overlay id -> its title, for a pointer-opened sheet's focus */
  var returnFocus = null;
  var tinted = false;       /* the entry card has lit the room in its world */
  var whenTimer = 0;        /* keeps "A soft chime at about 9:42" true while the card is up */
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
  /* the room's own word on motion (html.rm, which the app sets from the
     Motion setting), then the setting itself, then the system's */
  function reduced() {
    try { if (document.documentElement.classList.contains("rm")) return true; } catch (e) { /* no page yet */ }
    try { if (prefs && prefs.motion && prefs.motion() !== "full") return true; } catch (e2) { /* fall through */ }
    return !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  /* the last input was a key: the default button takes the focus (and the
     ring); after a tap or a click the sheet's title does, so a screen
     reader starts at the top and no ring appears under a finger */
  function keyboard() {
    try { return document.documentElement.classList.contains("kbd"); } catch (e) { return false; }
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
  /* one icon from the room's sprite (index.html), never a font glyph */
  function icon(name, cls) {
    return "<svg class=\"ic" + (cls ? " " + cls : "") + "\" aria-hidden=\"true\" focusable=\"false\"><use href=\"#i-" + name + "\"></use></svg>";
  }
  /* light the room in a world while the entry card is up; null gives the
     light back to the room's own world */
  function tintTo(id) {
    if (typeof o.tint !== "function") return;
    tinted = id !== null;
    safe(o.tint, id);
  }
  function untint() { if (tinted) tintTo(null); }
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
  /* full: Breathe's whole screen. decide: a card that asks for a choice
     (the time-up card, the thank-you), which the room never lets a stray
     downward swipe dismiss. Every other card is an ordinary sheet, with
     the grabber on top that says it can be swiped away on a phone. */
  function shell(id, full, decide) {
    var ov = document.getElementById(id);
    if (!ov) {
      ov = el("div", "ov hide");
      ov.id = id;
      document.body.appendChild(ov);
    }
    ov.classList.add("st-ov");
    ov.classList.toggle("st-full", !!full);
    ov.classList.toggle("decide", !!decide);
    ov.classList.remove("swap");
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    if (!ov.getAttribute("data-st")) {
      ov.setAttribute("data-st", "1");
      ov.addEventListener("keydown", onKey);
      if (id === "ovSteady") watchEntry(ov);
    }
    var sheet = ov.querySelector(".sheet");
    if (!sheet) { sheet = el("div", "sheet"); ov.appendChild(sheet); }
    /* a fresh card every time: nothing from the last one drawn in this
       sheet (the entry card's scrolling layout, its hairline) */
    sheet.className = "sheet st";
    while (sheet.firstChild) sheet.removeChild(sheet.firstChild);
    if (!full) {
      var grab = el("div", "grab");
      grab.setAttribute("aria-hidden", "true");
      sheet.appendChild(grab);
    }
    ov.style.background = "";
    esc[id] = null;
    titles[id] = null;
    if (id === "ovSteady" && whenTimer) { clearInterval(whenTimer); whenTimer = 0; }
    return sheet;
  }
  /* However the entry card goes away — Begin, the ✕, Escape, a swipe, or
     the app closing every sheet to start something else — the room's light
     goes back to the room's own world, and the chime clock stops. The
     observer only notices; tint(null) means "whatever world the room is in
     now", so it is right even after the app has moved on to a new one. */
  function watchEntry(ov) {
    if (typeof MutationObserver !== "function") return;
    try {
      new MutationObserver(function () {
        if (!ov.classList.contains("hide")) return;
        if (whenTimer) { clearInterval(whenTimer); whenTimer = 0; }
        untint();
      }).observe(ov, { attributes: true, attributeFilter: ["class"] });
    } catch (e) { /* the explicit paths below still untint */ }
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
    var under = false, all = document.querySelectorAll(".ov");
    for (var i = 0; i < all.length; i++) if (all[i] !== ov && !all[i].classList.contains("hide")) under = true;
    ov.classList.toggle("st-stacked", under);
    ov.classList.remove("hide");
    var sheet = ov.querySelector(".sheet");
    if (sheet) sheet.scrollTop = 0;
    if (was && !silent) sound("open");
    /* keys: the default button, ringed; a tap or a click: the title */
    if (!keyboard() && titles[id] && document.body.contains(titles[id])) focus = titles[id];
    focusOn(focus);
    /* on a screen so short that the card scrolls as a whole (see the CSS),
       the button given focus is brought into view rather than left focused
       below the fold */
    if (focus && sheet && sheet.scrollHeight > sheet.clientHeight + 1 && root.innerHeight && root.innerHeight <= 300) {
      try { focus.scrollIntoView({ block: "nearest" }); } catch (e) { /* an old engine */ }
    }
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
    var b = button("", null, fn);
    b.className = "ibtn close st-x";
    b.innerHTML = icon("close");
    b.setAttribute("aria-label", label);
    var ov = sheet.parentNode;
    while (ov && !(ov.classList && ov.classList.contains("ov"))) ov = ov.parentNode;
    if (ov && ov.id) b.setAttribute("data-close", ov.id);
    sheet.appendChild(b);
    return b;
  }
  /* the card's title: what names the dialog, and where a tap-opened
     card puts the focus */
  function titleOf(id, node) {
    node.id = id + "Title";
    node.setAttribute("tabindex", "-1");
    document.getElementById(id).setAttribute("aria-labelledby", node.id);
    titles[id] = node;
    return node;
  }
  function heading(sheet, id, text, cls) {
    var h = el("h2", cls || "", text);
    sheet.appendChild(h);
    return titleOf(id, h);
  }
  /* the kit's title bar (index.html .shead): the card's name at the size
     every sheet's name is, and its ✕ in the same row, so a Steady card
     reads as one of the room's sheets rather than a poster of its own.
     The bar is also the handle a phone pulls the sheet down by. */
  function titleBar(sheet, id, text, closeLabel, onClose) {
    sheet.classList.add("st-hd");
    var bar = el("div", "shead");
    sheet.appendChild(bar);
    var h = el("h2", "", text);
    bar.appendChild(h);
    titleOf(id, h);
    closeButton(bar, closeLabel, onClose).className = "ibtn close";
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

  /* a small light in the world's key and rim, for the top of a card */
  function glow(small) {
    var g = el("div", "st-glow" + (small ? " small" : ""));
    g.setAttribute("aria-hidden", "true");
    return g;
  }

  /* ================================================================
     the entry card
     ================================================================ */
  /* One choice: its name, the options as the room's segmented control, and
     the line that says what the chosen option does. Pressed buttons rather
     than radios, because each is a plain "this one" with nothing to move
     between by arrow keys that a Tab wouldn't reach as well. */
  function segField(parent, label, list, value, onPick) {
    var f = el("div", "st-field");
    var lab = el("div", "st-label", label);
    lab.id = "st" + label.replace(/[^A-Za-z]/g, "") + "Label";
    f.setAttribute("role", "group");
    f.setAttribute("aria-labelledby", lab.id);
    var seg = el("div", "seg"), line = el("p", "seg-line");
    line.setAttribute("aria-live", "polite");
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

  /* The ten worlds, each a little window of its sky with its key light low
     on the horizon, and its name under it. Picking one lights the room in
     it at once (o.tint), so the pearl Begin below is already that world's
     light; the chosen world's own line sits under the picker. */
  function worldField(parent, value, onPick) {
    var f = el("div", "st-field"), lab = el("div", "st-label", "World");
    lab.id = "stWorldLabel";
    f.setAttribute("role", "group");
    f.setAttribute("aria-labelledby", lab.id);
    var grid = el("div", "wpick"), list = worldList(), tiles = [], line = el("p", "seg-line");
    line.setAttribute("aria-live", "polite");
    function set(id) {
      for (var i = 0; i < list.length; i++) {
        tiles[i].setAttribute("aria-pressed", list[i].id === id ? "true" : "false");
        if (list[i].id === id) line.textContent = list[i].line || "";
      }
    }
    for (var i = 0; i < list.length; i++) {
      (function (w) {
        var t = button("", null, function () { set(w.id); sound("toggle"); onPick(w.id); });
        t.className = "wp";
        if (w.line) t.title = w.line;
        var sky = w.sky || {}, sw = el("span", "wp-sw"), dot = el("i");
        sw.setAttribute("aria-hidden", "true");
        sw.style.background =
          "radial-gradient(70% 60% at 50% 108%, " + rgba(w.key, 0.5) + ", " + rgba(w.key, 0) + " 100%)," +
          "linear-gradient(180deg, " + (sky.top || "#111") + ", " + (sky.horizon || "#333") + ")";
        /* the chosen world also carries a small light, so it isn't marked
           by its ring alone */
        dot.style.background = w.key;
        dot.style.boxShadow = "0 0 8px " + rgba(w.key, 0.9);
        sw.appendChild(dot);
        t.appendChild(sw);
        t.appendChild(el("span", "wp-n", w.name));
        tiles.push(t);
        grid.appendChild(t);
      })(list[i]);
    }
    set(value);
    f.appendChild(lab); f.appendChild(grid); f.appendChild(line);
    parent.appendChild(f);
  }

  /* "A soft chime at about 9:42." — the session's end as a time on the
     device's own clock, so twenty minutes means something you can plan
     around. Nothing for no timer; a browser that can't tell the time
     still says there will be a chime. */
  function whenText(len) {
    if (!len) return "";
    try {
      return "A soft chime at about " +
        new Date(Date.now() + len * 60000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ".";
    } catch (e) { return "Then a soft chime."; }
  }
  /* has this player been shown the moves? Without the app's answer, the
     link to them isn't offered at all */
  function movesShown() {
    if (typeof o.firstStepsDone !== "function") return true;
    try { return !!o.firstStepsDone(); } catch (e) { return true; }
  }

  function openEntry() {
    stopBreath(false);
    hideAll("ovSteady");
    var c = chosen();
    var sheet = shell("ovSteady");
    sheet.classList.add("st-entry");
    titleBar(sheet, "ovSteady", "Steady", "Close", function () { hide("ovSteady"); untint(); });
    /* the card is lit in the world it is about to open on */
    tintTo(c.world);

    /* On a short screen only the choices scroll; Begin never leaves the
       card, because everything is already chosen and Begin is the one
       thing anybody has to press. The four choices sit in one box, which
       a wide card lays out two by two; the worlds run full width under it. */
    var body = el("div", "st-body");
    body.appendChild(el("p", "lead", "A quiet twenty minutes. Slow, even, nothing sudden."));
    var grid = el("div", "st-grid");
    body.appendChild(grid);
    var when = el("p", "st-when");
    function paintWhen() {
      var t = whenText(c.length);
      when.classList.toggle("hide", !t);
      if (t) when.innerHTML = icon("clock") + "<span>" + t + "</span>";
    }
    var lenField = segField(grid, "Length (minutes)", LENGTHS, c.length, function (v) { c.length = v; paintWhen(); });
    lenField.appendChild(when);
    paintWhen();
    /* the clock moves on while the card is open; the time it promises
       moves with it, quietly, a minute at a time */
    whenTimer = setInterval(function () {
      if (!isOpen("ovSteady") || !when.parentNode) { clearInterval(whenTimer); whenTimer = 0; return; }
      if (when.textContent !== whenText(c.length)) paintWhen();
    }, 15000);
    segField(grid, "Pace", PACES, c.pace, function (v) { c.pace = v; });
    segField(grid, "Landing light", LANDING, c.landing, function (v) { c.landing = v; });
    segField(grid, "Sound", SOUNDS, c.sound, function (v) { c.sound = v; });
    worldField(body, c.world, function (v) { c.world = v; tintTo(v); });
    sheet.appendChild(body);

    var foot = el("div", "st-foot");
    var begin = button("Begin", "primary", function () { start(c); });
    begin.classList.add("st-begin");
    foot.appendChild(begin);
    var links = el("div", "st-links");
    links.appendChild(button("Why this game?", "quiet", function () { why(); }));
    if (!movesShown()) {
      var mv = button("", "quiet", function () { safe(o.onMoves); });
      mv.innerHTML = "<span>New to the moves? See them first</span>" + icon("chevron");
      links.appendChild(mv);
    }
    foot.appendChild(links);
    sheet.appendChild(foot);

    esc.ovSteady = function () { hide("ovSteady"); untint(); };
    show("ovSteady", begin);
    overflowHint(sheet, body);
    /* a choice can change how tall the card is (no timer, no chime line;
       a world's line on two rows), and so where the fades belong */
    body.addEventListener("click", function () { setTimeout(function () { if (sheet.parentNode) fadeEdges(body); }, 0); });
  }

  /* the choices fade at whichever edge has more beyond it (the CSS), so
     a desk with no scrollbar in sight still says there is more below.
     A class is touched only when it changes. */
  function fadeEdges(body) {
    var down = body.scrollHeight - body.clientHeight - body.scrollTop > 2, up = body.scrollTop > 2;
    if (body.classList.contains("fade-b") !== down) body.classList.toggle("fade-b", down);
    if (body.classList.contains("fade-t") !== up) body.classList.toggle("fade-t", up);
  }
  function overflowHint(sheet, body) {
    body.addEventListener("scroll", function () { if (sheet.parentNode) fadeEdges(body); });
    fadeEdges(body);
    if (!overflowHint.bound) {
      overflowHint.bound = true;
      root.addEventListener("resize", function () {
        var b = document.querySelector("#ovSteady .st-entry .st-body");
        if (b) fadeEdges(b);
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
    /* the tip comes once. (An app from before the moves were taught on
       the well also brought a first session on glass here to learn the
       gestures; that app says nothing about first steps.) */
    var legacy = typeof o.firstStepsDone !== "function";
    if (!seen.steadyTip || (legacy && touchHands() && !seen.touchCards)) openTip(c);
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
    /* the light goes back to the room, and the run that starts lights it
       in its own world straight after, in the same moment */
    untint();
    hide("ovSteady");
    sess = newSession(c, 0);
    flow = "pause";
    safe(o.onBegin, { length: c.length, pace: c.pace, landing: c.landing, sound: c.sound, world: c.world });
  }

  /* ---------- the tip, once ---------- */
  function tipArt() {
    /* A slice of the well: two rows of stack with a T-shaped slot in them.
       First an imagined piece — dashed, because it is only pictured —
       turns over and settles into the slot; then the real piece follows
       it down the same way. Eight slow seconds a loop. Under reduced
       motion it is a still diagram of the same idea: the piece, a turn,
       and where it will land. The lines are the room's ink and the piece
       is the world's key light, both by class, so the drawing is lit like
       the card around it. */
    var cell = 20, ox = 20, oy = 6, x, y, i;
    var slot = [[1, 5], [2, 5], [3, 5], [2, 6]];
    function rect(cx, cy, cls) {
      return "<rect class=\"" + cls + "\" x=\"" + (ox + cx * cell + 1.5) + "\" y=\"" + (oy + cy * cell + 1.5) + "\" width=\"" + (cell - 3) +
        "\" height=\"" + (cell - 3) + "\" rx=\"4\"/>";
    }
    function piece(cls) {
      var out = "";
      for (i = 0; i < 4; i++) out += rect(slot[i][0], slot[i][1], cls);
      return out;
    }
    var cx = ox + 2.5 * cell, cy = oy + 5.5 * cell;   /* the T turns about the middle of its bar */
    var s = "<svg class=\"st-art\" viewBox=\"0 0 160 152\" aria-hidden=\"true\" focusable=\"false\">";
    /* the walls and floor of the well */
    s += "<path class=\"w\" d=\"M" + (ox - 4) + " " + oy + "V" + (oy + 7 * cell + 4) + "H" + (ox + 6 * cell + 4) + "V" + oy + "\"/>";
    for (y = 5; y <= 6; y++) for (x = 0; x < 6; x++) {
      if ((y === 5 && x >= 1 && x <= 3) || (y === 6 && x === 2)) continue;
      s += rect(x, y, "s");
    }
    if (reduced()) {
      /* the piece as it arrives (pointing up), a turn, and its landing */
      s += "<g transform=\"translate(0 -80) rotate(180 " + cx + " " + cy + ")\">" + piece("p") + "</g>";
      s += "<path class=\"a\" d=\"M" + (ox + 4.6 * cell) + " " + (oy + 0.6 * cell) + "a 13 13 0 1 1 -4 22\"/>" +
        "<path class=\"a\" d=\"M" + (ox + 4.6 * cell - 9) + " " + (oy + 0.6 * cell + 21) + "l5 1.6 -1.4 5\"/>";
      s += "<path class=\"t\" d=\"M" + cx + " " + (oy + 2.4 * cell) + "V" + (oy + 4.6 * cell) + "\"/>";
      s += piece("d");
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
      "<g>" + move("0;.6;.74;1") + "<g transform=\"rotate(180 " + cx + " " + cy + ")\">" + turn("0;.48;.6;1") + piece("p") + "</g></g></g>";
    s += "<g opacity=\"0\"><animate attributeName=\"opacity\" values=\"0;0;1;1;.7;0;0\" keyTimes=\"0;.05;.1;.46;.7;.76;1\" " + D + "/>" +
      "<g>" + move("0;.3;.44;1") + "<g transform=\"rotate(180 " + cx + " " + cy + ")\">" + turn("0;.12;.28;1") + piece("d") + "</g></g></g>";
    return s + "</svg>";
  }

  function openTip(c) {
    var seen = pref("seen", {}) || {}, next = {};
    for (var k in seen) if (Object.prototype.hasOwnProperty.call(seen, k)) next[k] = seen[k];
    /* Steady shows no words during play, and the moves are taught on the
       well itself only in the other modes. So a first session on glass, by
       someone who hasn't been shown the moves, gets the four gestures here,
       between sessions, in one line. */
    var legacy = typeof o.firstStepsDone !== "function";
    var teach = touchHands() && (legacy ? !seen.touchCards : !movesShown());
    next.steadyTip = true;
    if (teach && legacy) next.touchCards = true;
    setPref("seen", next);

    var sheet = shell("ovSteady");
    /* the room's ✕ always closes its sheet (app.js answers every one), so
       this one does too; the choices are already saved for next time */
    titleBar(sheet, "ovSteady", "A game skill to try", "Close", function () { hide("ovSteady"); untint(); });
    var art = el("div");
    art.innerHTML = tipArt();
    sheet.appendChild(art.firstChild);
    sheet.appendChild(el("p", "st-tip", TIP));
    sheet.appendChild(el("p", "st-small", "It's only a suggestion. Play however feels right."));
    if (teach) {
      var ctl = el("ul", "st-ctl");
      ctl.setAttribute("aria-label", "How to play");
      var how = ["Drag to move", "Tap to turn", "Flick down to drop", "Flick up to keep"];
      for (var h = 0; h < how.length; h++) ctl.appendChild(el("li", "chip", how[h]));
      sheet.appendChild(ctl);
    }
    var goWrap = el("div", "st-go");
    var b = button("Begin", "primary", function () { go(c); });
    goWrap.appendChild(b);
    sheet.appendChild(goWrap);
    esc.ovSteady = function () { hide("ovSteady"); untint(); };
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
    var mins = sess && sess.last ? sess.last / 60000 : (sess ? sess.length : 20);
    /* a card that asks for a choice: a stray swipe never dismisses it */
    var sheet = shell("ovSteady", false, true);
    var box = el("div", "st-center");
    box.appendChild(glow());
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
    /* the world's sky behind one circle of its key light (the CSS reads
       both from the room's tint, which is the session's world); the
       halted well shows through faintly above, and the words and buttons
       sit on near-black */
    var sheet = shell("ovBreathe", true);
    var title = titleOf("ovBreathe", el("div", "st-btitle", "A minute of breathing"));
    sheet.appendChild(title);

    var mid = el("div", "st-bmid");
    var box = el("div", "st-orbbox");
    box.setAttribute("aria-hidden", "true");
    /* the faint ring is the full breath, so the eye knows where the circle
       is going */
    var ring = el("div", "st-ring"), orb = el("div", "st-orb");
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
    var seg = el("div", "seg"), line = el("p", "seg-line"), pb = {};
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
    var skip = button("Skip", "st-skip", skipBreath);
    foot.appendChild(skip);
    sheet.appendChild(foot);

    B = { on: true, t: 0, last: 0, k: 0, c0: 0, cyc: BREATHS[pattern], raf: 0, mt: -1e9, word: "",
          orb: orb, wordEl: word, dots: dots, foot: foot, still: reduced(), lastIn: null };
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
      d.appendChild(el("span", "st-dot" + (i < B.k ? " lit" : i === B.k && B.t > LEAD_IN ? " now" : "")));
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
    var i = 0;
    var sheet = shell("ovGround");
    closeButton(sheet, "Stop here", stopHere);
    var title = titleOf("ovGround", el("div", "st-label st-gtitle", "Noticing"));
    sheet.appendChild(title);
    var num = el("div", "st-num st-fade"), sense = el("p", "st-sense st-fade");
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
        for (var d = 0; d < NOTICE.length; d++) gdots.appendChild(el("span", "st-dot" + (d <= i ? " lit" : "")));
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
    /* a card that asks for a choice, however small: Done, or who to talk to */
    var sheet = shell("ovClose", false, true);
    var box = el("div", "st-center");
    box.appendChild(glow(true));
    heading(box, "ovClose", "Thank you for spending this time at the well.", "st-thanks");
    sheet.appendChild(box);
    var stack = el("div", "st-stack");
    var done = button("Done", "primary", function () { hide("ovClose"); });
    stack.appendChild(done);
    sheet.appendChild(stack);
    /* small and quiet, under everything else: there if it is wanted */
    var help = button("If things feel heavy, here's who to talk to", "quiet st-quietlink", function () { openHelp(); });
    sheet.appendChild(help);
    esc.ovClose = function () { hide("ovClose"); };
    show("ovClose", done);
  }

  function openHelp() {
    var sheet = shell("ovHelp");
    titleBar(sheet, "ovHelp", "Help lines", "Close", function () { hide("ovHelp"); });
    var close = sheet.querySelector(".shead .close");
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

  /* ---------- the pause sheet's extras ----------
     pauseExtras(listEl, footEl): three rows at the top of the pause
     sheet's list — Breathe, Why this game?, Help lines — and Finish in its
     foot, beside the app's own Leave. Finish and Leave sit side by side and
     mean different things, so each says which in a few small words.

     The ids stay as they were, so the pause sheet can come back with the
     focus where it was. Called again, it replaces what it put there. An
     app that hands over a single box instead (the shape before the list)
     gets the same rows as a list of their own, with Finish under it. */
  function row(id, label, ic, fn) {
    var b = button("", null, fn);
    b.className = "li";
    b.id = id;
    b.setAttribute("data-stx", "1");
    b.innerHTML = "<span class=\"li-ic\">" + icon(ic) + "</span><span class=\"li-t\"></span>" + icon("chevron", "chev");
    b.querySelector(".li-t").textContent = label;
    return b;
  }
  function pauseExtras(listEl, footEl) {
    if (!listEl) return null;
    var old = document.querySelectorAll("[data-stx]");
    for (var i = 0; i < old.length; i++) if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    var rows = [
      row("stxBreathe", "Breathe", "breath", function () { openBreathe("pause"); }),
      row("stxWhy", "Why this game?", "learn", function () { why(); }),
      row("stxHelp", "Help lines", "about", function () { openHelp(); })
    ];
    var bf = button("Finish", "two", function () { finish("pause", false); });
    bf.id = "stxFinish";
    bf.setAttribute("data-stx", "1");
    bf.appendChild(el("span", "bsub", "end the session"));
    if (footEl) {
      var first = listEl.firstChild;
      for (i = 0; i < rows.length; i++) listEl.insertBefore(rows[i], first);
      footEl.appendChild(bf);
      return listEl;
    }
    var box = el("div", "st-pauseExtras"), list = el("div", "list icons"), fin = el("div", "st-fin");
    box.setAttribute("data-stx", "1");
    for (i = 0; i < rows.length; i++) list.appendChild(rows[i]);
    fin.appendChild(bf);
    box.appendChild(list); box.appendChild(fin);
    listEl.appendChild(box);
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
