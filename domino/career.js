/* career.js — what the table remembers about you, besides the score.

   The score itself — the number, the ladder of parejas, the stars — is
   rating.js, measured the way the chess room measures its coaches. This
   is everything else worth keeping: how many hands, how many dominós and
   capicúas, the longest run of matches won, and a short list of things
   worth having done once (logros). Pure: it is handed what happened and
   returns what changed, so tools/career-check.js can play a thousand
   matches through it in node without a page in sight.

   (It used to keep points that climbed a ladder of titles of its own.
   Two ladders that disagree are worse than one, so the titles moved to
   the rating, where they mean a measured strength.)                    */
(function (root) {
"use strict";

var BADGES = [
  { id: "firstHand",   name: "Primera mano",   note: "Win a hand." },
  { id: "domino",      name: "¡Dominó!",       note: "Go out yourself." },
  { id: "capicua",     name: "Capicúa",        note: "Go out on a bone that fit either end." },
  { id: "tranca",      name: "Trancador",      note: "Win a shut game on weight." },
  { id: "match",       name: "Primer partido", note: "Win a match." },
  { id: "zapatero",    name: "Zapatero",       note: "Win a match without them scoring once." },
  { id: "hang",        name: "Ahorcado",       note: "Make an opponent pass right after your play." },
  { id: "feed",        name: "Dar agua",       note: "Leave your partner an end and watch them play it." },
  { id: "sharp5",      name: "Ojo de águila",  note: "Five sharp plays in one hand." },
  { id: "streak3",     name: "Racha",          note: "Win three matches in a row." },
  { id: "maestro",     name: "Contra los viejos", note: "Win a match against Los Viejos or Los Cabrones." },
  { id: "cabron",      name: "Sin miedo",      note: "Win a match against Los Cabrones." },
  { id: "friends",     name: "En la misma mesa", note: "Finish a hand with friends on other phones." }
];

function fresh() {
  return {
    v: 2,
    matches: 0, matchWins: 0, hands: 0, handWins: 0,
    dominos: 0, capicuas: 0, trancas: 0, zapateros: 0,
    streak: 0, best: 0, sharp: 0, graded: 0, hangs: 0, feeds: 0,
    badges: {}
  };
}
/* anything off disk is checked field by field — a hand-edited save
   gets the numbers it can prove and nothing else */
function clean(raw) {
  var c = fresh();
  if (!raw || typeof raw !== "object") return c;
  for (var k in c) {
    if (!Object.prototype.hasOwnProperty.call(c, k) || k === "badges" || k === "v") continue;
    var n = +raw[k];
    if (isFinite(n) && n >= 0) c[k] = Math.min(1e7, Math.floor(n));
  }
  if (raw.badges && typeof raw.badges === "object") {
    for (var i = 0; i < BADGES.length; i++) if (raw.badges[BADGES[i].id]) c.badges[BADGES[i].id] = 1;
  }
  return c;
}

/* Something happened at the table. Returns any badge newly earned; `c`
   is updated in place.

   Events:
     {k:"sharp"} {k:"graded"} {k:"hang"} {k:"feed"}
     {k:"hand", won, mine, how, capicua, sharp, friends}
     {k:"match", won, level, zapatero}                                  */
var STRONG = { viejos: 1, cabrones: 1 };
function record(c, e) {
  var got = [];
  function badge(id) { if (!c.badges[id]) { c.badges[id] = 1; got.push(byId(id)); } }
  if (e.k === "graded") c.graded++;
  else if (e.k === "sharp") c.sharp++;
  else if (e.k === "hang") { c.hangs++; badge("hang"); }
  else if (e.k === "feed") { c.feeds++; badge("feed"); }
  else if (e.k === "hand") {
    c.hands++;
    if (e.friends) badge("friends");
    if (e.won) {
      c.handWins++;
      badge("firstHand");
      if (e.how === "domino" && e.mine) { c.dominos++; badge("domino"); }
      if (e.how === "tranca") { c.trancas++; badge("tranca"); }
      if (e.capicua && e.mine) { c.capicuas++; badge("capicua"); }
    }
    if ((e.sharp || 0) >= 5) badge("sharp5");
  } else if (e.k === "match") {
    c.matches++;
    if (e.won) {
      c.matchWins++; c.streak++; if (c.streak > c.best) c.best = c.streak;
      badge("match");
      if (e.zapatero) { c.zapateros++; badge("zapatero"); }
      if (c.streak >= 3) badge("streak3");
      if (STRONG[e.level]) badge("maestro");
      if (e.level === "cabrones") badge("cabron");
    } else {
      c.streak = 0;
    }
  }
  return { badges: got };
}
function byId(id) { for (var i = 0; i < BADGES.length; i++) if (BADGES[i].id === id) return BADGES[i]; return null; }

var Career = { BADGES: BADGES, fresh: fresh, clean: clean, record: record };
if (typeof module !== "undefined" && module.exports) module.exports = Career;
else root.Career = Career;
})(typeof self !== "undefined" ? self : this);
