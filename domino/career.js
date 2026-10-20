/* career.js — what the table remembers about you.

   A rank, the points that earn it, a few numbers worth keeping, and a
   short list of things worth having done once. Pure: it is handed what
   happened and returns what changed, so `tools/career-check.js` can play
   a thousand matches through it in node without a page in sight.

   The ladder is a cantina's, not a video game's. You start at the next
   table watching (*mirón*), and the top is the person whose name the
   regulars say when they explain the house rules to a stranger.

   Points come mostly from *playing well* rather than from playing a lot.
   Winning a match is worth most, and more against stronger opponents;
   but a sharp play — the one Don Chuy would have made himself — earns a
   little on its own, so a hand lost by a thin margin while playing well
   still moves you forward. A lost match is never worth nothing: the
   table is meant to be somewhere you want to come back to.           */
(function (root) {
"use strict";

var RANKS = [
  { id: "miron",    name: "Mirón",     xp: 0,    note: "Watching from the next table." },
  { id: "novato",   name: "Novato",    xp: 150,   note: "Knows which end is which." },
  { id: "aprendiz", name: "Aprendiz",  xp: 900,   note: "Counts the bones, sometimes." },
  { id: "jugador",  name: "Jugador",   xp: 2500,  note: "Hears every paso." },
  { id: "pareja",   name: "Buena pareja", xp: 5500, note: "Plays for two." },
  { id: "tahur",    name: "Tahúr",     xp: 10000, note: "Hangs people on purpose." },
  { id: "maestro",  name: "Maestro",   xp: 18000, note: "The table goes quiet when you sit down." },
  { id: "leyenda",  name: "Leyenda de la cantina", xp: 30000, note: "They tell stories about your capicúas." }
];

/* how much a win is worth against each tier of opponent */
var LEVEL_MULT = { novato: 0.6, compadre: 1, maestro: 1.4, cabron: 1.8 };

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
  { id: "maestro",     name: "Contra maestros", note: "Win a match against Maestro opponents." },
  { id: "cabron",      name: "Sin miedo",      note: "Win a match against Cabrón opponents." },
  { id: "friends",     name: "En la misma mesa", note: "Finish a hand with friends on other phones." }
];

function fresh() {
  return {
    v: 1, xp: 0,
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

function rankOf(xp) {
  var r = 0;
  for (var i = 0; i < RANKS.length; i++) if (xp >= RANKS[i].xp) r = i;
  var cur = RANKS[r], next = RANKS[r + 1] || null;
  return {
    i: r, rank: cur, next: next,
    into: xp - cur.xp,
    span: next ? next.xp - cur.xp : 0,
    frac: next ? Math.min(1, (xp - cur.xp) / (next.xp - cur.xp)) : 1
  };
}

/* Something happened at the table. Returns the lines to show — what was
   earned and why — plus any badge newly earned and whether the rank
   changed. `c` is updated in place.

   Events:
     {k:"sharp"}                      a graded play judged sharp
     {k:"graded"}                     a graded play, any verdict
     {k:"hang"}                       an opponent passed right after you
     {k:"feed"}                       your partner played the end you left
     {k:"hand", won, mine, how, capicua, points, sharp, friends}
     {k:"match", won, level, zapatero}                                  */
function record(c, e) {
  var before = rankOf(c.xp).i, gain = [], got = [];
  function add(n, why) { n = Math.round(n); if (n > 0) { c.xp += n; gain.push({ xp: n, why: why }); } }
  function badge(id) { if (!c.badges[id]) { c.badges[id] = 1; got.push(byId(id)); } }

  if (e.k === "graded") c.graded++;
  else if (e.k === "sharp") { c.sharp++; add(2, "sharp play"); }
  else if (e.k === "hang") { c.hangs++; add(3, "hung an opponent"); badge("hang"); }
  else if (e.k === "feed") { c.feeds++; add(3, "fed your partner"); badge("feed"); }
  else if (e.k === "hand") {
    c.hands++;
    if (e.friends) badge("friends");
    if (e.won) {
      c.handWins++;
      add(12 + Math.min(20, (e.points || 0) / 4), "won the hand");
      badge("firstHand");
      if (e.how === "domino" && e.mine) { c.dominos++; add(10, "went out yourself"); badge("domino"); }
      if (e.how === "tranca") { c.trancas++; add(6, "won it on weight"); badge("tranca"); }
      if (e.capicua && e.mine) { c.capicuas++; add(25, "capicúa"); badge("capicua"); }
    } else {
      add(1, "played the hand out");
    }
    if ((e.sharp || 0) >= 5) badge("sharp5");
  } else if (e.k === "match") {
    c.matches++;
    var mult = LEVEL_MULT[e.level] || 1;
    if (e.won) {
      c.matchWins++; c.streak++; if (c.streak > c.best) c.best = c.streak;
      add(80 * mult, "won the match");
      badge("match");
      if (e.zapatero) { c.zapateros++; add(50, "zapatero"); badge("zapatero"); }
      if (c.streak >= 3) badge("streak3");
      if (e.level === "maestro" || e.level === "cabron") badge("maestro");
      if (e.level === "cabron") badge("cabron");
    } else {
      c.streak = 0;
      add(10 * mult, "finished the match");
    }
  }
  var after = rankOf(c.xp);
  return { gain: gain, badges: got, rankUp: after.i > before ? after.rank : null, rank: after };
}
function byId(id) { for (var i = 0; i < BADGES.length; i++) if (BADGES[i].id === id) return BADGES[i]; return null; }

/* the opponents the table would suggest, given how you are doing */
function suggestLevel(c) {
  var r = rankOf(c.xp).i;
  return r <= 1 ? "novato" : r <= 3 ? "compadre" : r <= 5 ? "maestro" : "cabron";
}

var Career = {
  RANKS: RANKS, BADGES: BADGES, LEVEL_MULT: LEVEL_MULT,
  fresh: fresh, clean: clean, rankOf: rankOf, record: record, suggestLevel: suggestLevel
};
if (typeof module !== "undefined" && module.exports) module.exports = Career;
else root.Career = Career;
})(typeof self !== "undefined" ? self : this);
