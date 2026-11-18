/* tales.js — the story of chess, told by the grove.

   Every coach on the ladder has a tale from the real history of the
   game, and the tale suits the coach: Acorn, who loves its knights,
   tells where chess was born and how old the knight's jump is; Clover,
   the lucky traveller, tells how chess walked west along the trade roads
   and where the word "checkmate" comes from; Cactus, who never backs
   down, tells how the queen got her power and the game got bold; Pine,
   who counts everything, tells about the thinking machines. Put
   together, in the order they happened, the eight tales are a timeline
   of chess from India fifteen hundred years ago to the phone in your
   hand.

   A tale opens after your first game against its coach, whatever the
   result: it is a story you are told for sitting down to play, never a
   prize for winning. Each one is three short pages and a "did you
   know?", short enough to read to a child at bedtime.

   The facts are hedged where history is ("about", "around"): nobody can
   date the first game of chess, and a story for children should not
   pretend otherwise.

   Pure, so chess/tools/tales-check.js can read every page in node.   */
(function (root) {
"use strict";

var KEY = "chessroom_tales";

/* year: where the tale sits on the timeline (approximate, for order
   only; `when` is what the reader sees). art: the picture on the page. */
var TALES = [
  { id: "acorn", year: 600, when: "India, about 1,500 years ago", art: "🐘🐴", title: "Where chess was born",
    hello: "Ooh, can I tell you a story? It's about my favourite piece!",
    pages: [
      "Long ago in India, people played a game called chaturanga. The name means “four parts”, like the four parts of an army.",
      "Elephants, horses, chariots and foot soldiers marched across the board. The foot soldiers became our pawns, and the horses became our knights!",
      "The knight still jumps in the same L shape it did back then. So my favourite move is one of the oldest moves in the whole game."
    ],
    fact: "Chess is so old that nobody knows exactly who invented it. It grew a little at a time, passed from player to player." },
  { id: "clover", year: 750, when: "Persia, about 1,300 years ago", art: "🐫👑", title: "The long road west",
    hello: "Lucky you! I know a story about a very long journey.",
    pages: [
      "Chess travelled from India to Persia, where it was called shatranj. Travellers and traders carried it from town to town.",
      "In Persian, “shah” means king. When the king was trapped, players said “shah mat”. That's where our word checkmate comes from!",
      "From Persia, chess spread across the Arab world and on into Europe. Every place it reached gave it new names, new pieces and new rules."
    ],
    fact: "Chess puzzles, little positions made up just for fun, were already popular more than a thousand years ago." },
  { id: "club", year: 1150, when: "Scotland, found in 1831", art: "♜🛡️", title: "The hidden chessmen",
    hello: "I noticed something once. Something very old. Shall I tell you?",
    pages: [
      "In 1831, on the Isle of Lewis in Scotland, someone found a hoard of little chess pieces, carved from walrus ivory about 850 years ago.",
      "They are called the Lewis chessmen. The kings and queens look worried, and some of the rooks are warriors biting the tops of their shields!",
      "Nobody is quite sure who hid them there, or why. They were probably carved in Norway, then carefully tucked away and forgotten."
    ],
    fact: "You can still visit the Lewis chessmen today, in museums in London and in Edinburgh." },
  { id: "bamboo", year: 1470, when: "Europe, about 550 years ago", art: "🐘⛪", title: "The elephant who became a bishop",
    hello: "Sit with me a moment. This story is about patience.",
    pages: [
      "The bishop used to be an elephant! In the old game it was called the alfil, and it could only hop two squares along a diagonal.",
      "It was a slow, careful piece, a little like me. Then, about 550 years ago in Europe, it learned to glide all the way along its diagonal.",
      "In English it's a bishop, in German a runner, and in French a jester. But in Spanish it is still the alfil: the elephant."
    ],
    fact: "A bishop stays on one colour all game, so it can never reach half the board. Two bishops together can reach every square." },
  { id: "cactus", year: 1490, when: "Spain, around 1490", art: "👑⚡", title: "The queen gets her power",
    hello: "Pull up a chair. This is the best story there is. It's got CHARGING in it.",
    pages: [
      "For hundreds of years the queen was one of the weakest pieces on the board. She could only step one square, corner to corner.",
      "Then, around 1490, players in Spain gave her the power to move like a rook and a bishop together. Some called it “mad queen” chess!",
      "Games got faster, bolder and far more exciting. Charge! Check! Capture! That's my kind of chess, partner."
    ],
    fact: "One of the first printed chess books, by Luis Ramírez de Lucena, came out in Spain around 1497, and it showed the new, powerful queen." },
  { id: "sprout", year: 1749, when: "France, 1749", art: "🎻♟️", title: "The soul of chess",
    hello: "I've got a story about pawns. It's my favourite story!",
    pages: [
      "In 1749, a French musician and chess master called Philidor wrote a famous book about how to play.",
      "He wrote that pawns are the soul of chess. Lots of players thought pawns were just in the way, but Philidor showed they could shape the whole game.",
      "Little pawns marching together decide where everyone else can go. See? I always said pawns were important!"
    ],
    fact: "Philidor also wrote operas. He could play chess blindfolded, without looking at the board, and people came to watch him do it." },
  { id: "mentor", year: 1886, when: "America, 1886", art: "🏆🌍", title: "Champions and grandmasters",
    hello: "Come, sit. Let me tell you about the people who came before you.",
    pages: [
      "In 1886, Wilhelm Steinitz and Johannes Zukertort played the first match for the title of World Chess Champion. Steinitz became the first champion.",
      "Since 1950, the strongest players can earn the title of grandmaster. Today there are about two thousand of them in the whole world.",
      "Some became grandmasters at just twelve years old. And every one of them started out like you: learning how the pieces move."
    ],
    fact: "Every grandmaster has lost thousands of games. Losing is how they learned. That's worth remembering, my friend." },
  { id: "pine", year: 1950, when: "From 1950 to today", art: "🤖💻", title: "The thinking machines",
    hello: "Data retrieved. I have a story about machines that count. Like me.",
    pages: [
      "Around 1950, Alan Turing wrote one of the first chess programs. No computer could run it yet, so he worked out every move by hand, on paper.",
      "In 1997, a computer called Deep Blue beat the world champion, Garry Kasparov, in a match. It could look at about 200 million positions every second.",
      "Today a chess program on a phone can play better than any person. But people still love playing people. That is the fun of it."
    ],
    fact: "Strong chess programs are called engines. Every coach in this room is one too, choosing to play gently so you can learn." }
];

var BY = {};
TALES.forEach(function (t) { BY[t.id] = t; });
function get(id) { return BY[id] || null; }
/* in the order they happened: the timeline */
function timeline() { return TALES.slice().sort(function (a, b) { return a.year - b.year; }); }

/* ---- what you have been told ----
   got:  coach -> when the tale opened (ms)
   read: coach -> 1 once you have read it to the end */
function fresh() { return { v: 1, got: {}, read: {} }; }
function clean(s) {
  var out = fresh();
  if (!s || typeof s !== "object" || s.v !== 1) return out;
  if (s.got && typeof s.got === "object") Object.keys(s.got).forEach(function (k) { if (BY[k]) out.got[k] = +s.got[k] > 0 ? Math.round(+s.got[k]) : 1; });
  if (s.read && typeof s.read === "object") Object.keys(s.read).forEach(function (k) { if (BY[k] && out.got[k] && s.read[k]) out.read[k] = 1; });
  return out;
}
function load(get) { try { return clean(JSON.parse(get(KEY) || "null")); } catch (e) { return fresh(); } }
function save(st, set) { try { set(KEY, JSON.stringify(st)); } catch (e) {} }
/* a game against this coach has been played: its tale opens (once).
   Returns true the first time, so the room can say so */
function open(st, id, now) {
  if (!BY[id] || st.got[id]) return false;
  st.got[id] = now || 1;
  return true;
}
function has(st, id) { return !!st.got[id]; }
function markRead(st, id) { if (st.got[id]) st.read[id] = 1; }
function unread(st, id) { return !!st.got[id] && !st.read[id]; }
function count(st) { return Object.keys(st.got).length; }

var Tales = { KEY: KEY, TALES: TALES, get: get, timeline: timeline, fresh: fresh, clean: clean, load: load, save: save,
              open: open, has: has, markRead: markRead, unread: unread, count: count };
if (typeof module !== "undefined" && module.exports) module.exports = Tales;
else root.Tales = Tales;
})(typeof self !== "undefined" ? self : this);
