/* book.js — the openings, told gently.
   A flat table of famous opening lines in SAN, each with a name and a
   one-sentence idea a beginner can hold onto — and, for every single
   move of every line, its own short reason. An opening story that only
   explains some of its moves teaches that the others are magic; the
   point of the tour is that none of them are.

   The matcher finds the deepest line that matches the game so the app
   can say "you're in the Italian Game" and suggest the next book move
   with its reason.

   Every line is validated against the engine by chess/tools/book-check.js
   — a typo'd move can't ship, a move without a reason can't ship, and a
   reason that names a threat, a pin or a mate has to be shown true on
   the board. No library, no external database. */
(function (root) {
"use strict";

/* seq:  the moves in SAN, space-separated (validated by tools/book-check.js)
   name: what the world calls it (checked against the ECO table where
         the ECO table has a name for exactly that position)
   idea: the one thing to understand about it, in plain words
   why:  built below from REASONS — one reason per move, aligned with seq */
var LINES = [
  /* ----- 1.e4 e5: the classical open games ----- */
  { seq: "e4", name: "King's Pawn Opening",
    idea: "The most popular first move in history: it stakes a claim in the centre and opens roads for the queen and bishop." },
  { seq: "e4 e5", name: "Open Game",
    idea: "Both sides claim the centre. Fair, open, and the best classroom in chess." },
  { seq: "e4 e5 Nf3", name: "King's Knight Opening",
    idea: "Develops a piece and attacks the e5 pawn in the same breath — the model second move." },
  { seq: "e4 e5 Nf3 Nc6", name: "King's Knight Opening: Normal Variation",
    idea: "Black defends e5 by developing — answering a threat with a useful move is the heart of good openings." },
  { seq: "e4 e5 Nf3 Nc6 Bc4", name: "Italian Game",
    idea: "Five hundred years old and still lovely: the bishop eyes f7, the one square only the king defends." },
  { seq: "e4 e5 Nf3 Nc6 Bc4 Bc5", name: "Italian Game: Giuoco Piano",
    idea: "'The quiet game.' Both bishops take their best diagonals; development is even and honest." },
  { seq: "e4 e5 Nf3 Nc6 Bc4 Bc5 c3", name: "Italian Game: Classical Variation",
    idea: "c3 quietly prepares d4 — building a big pawn centre one move at a time." },
  { seq: "e4 e5 Nf3 Nc6 Bc4 Nf6", name: "Italian Game: Two Knights Defence",
    idea: "Black counterattacks e4 immediately rather than defending — sharper than it looks." },
  { seq: "e4 e5 Nf3 Nc6 Bb5", name: "Ruy López (Spanish Game)",
    idea: "The royal main road of chess: the bishop pressures the knight that guards e5, asking questions for the next thirty moves." },
  { seq: "e4 e5 Nf3 Nc6 Bb5 a6", name: "Ruy López: Morphy Defence",
    idea: "a6 politely asks the bishop a question: take the knight, or step back and keep the tension?" },
  { seq: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7", name: "Ruy López: Closed",
    idea: "Both sides finish developing before the storm. Black leaves the e4 pawn alone and keeps the centre closed — which is where the name comes from." },
  { seq: "e4 e5 Nf3 Nc6 d4", name: "Scotch Game",
    idea: "Opens the centre right now instead of building slowly — trades quiet pressure for open lines." },
  { seq: "e4 e5 Nc3", name: "Vienna Game",
    idea: "A patient cousin of the King's Knight: guard e4 first, keep the f-pawn free to advance later." },
  { seq: "e4 e5 f4", name: "King's Gambit",
    idea: "The romantic era in one move: white offers a pawn to rip open the f-file and attack. Risky, thrilling, instructive." },
  { seq: "e4 e5 Nf3 Nf6", name: "Petrov's Defence",
    idea: "Black ignores the threat and counterattacks symmetrically. Solid, a little quiet, very hard to crack." },

  /* the trap every beginner must meet once — and learn to calmly refuse */
  { seq: "e4 e5 Qh5", name: "Scholar's Mate attempt",
    idea: "The four-move-mate try: the queen and, next, the bishop both aim at f7. If Black stays calm — guard e5, block with ...g6 when the bishop arrives, then develop, often with an attack on the queen — White's early queen becomes a target." },
  { seq: "e4 e5 Qh5 Nc6", name: "Scholar's Mate: the calm defence",
    idea: "Defend, develop, don't panic. Nc6 guards e5; if Bc4 comes next, ...g6 shuts the queen off from f7 and attacks her at the same time." },

  /* ----- answers to 1.e4 with counterattack ----- */
  { seq: "e4 c5", name: "Sicilian Defence",
    idea: "The world's favourite fight: black refuses the mirror and stakes the centre from the side. Unbalanced on purpose." },
  { seq: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", name: "Sicilian: Najdorf",
    idea: "One of the sharpest famous lines in chess. a6 looks tiny; it takes b5 away from white's pieces and prepares ...e5 or ...b5." },
  { seq: "e4 c6", name: "Caro-Kann Defence",
    idea: "Solid as oak: c6 prepares d5 so the light-squared bishop can get out before the pawn chain locks it in." },
  { seq: "e4 e6", name: "French Defence",
    idea: "Black lets white have the centre for a moment, then strikes back at it with d5. Sturdy, with one famous problem: the c8 bishop." },
  { seq: "e4 d5", name: "Scandinavian Defence",
    idea: "The most direct answer in chess: challenge e4 on move one. Simple plans, honest positions — a fine first defence." },
  { seq: "e4 d6", name: "Pirc Defence",
    idea: "Black lets white build a big centre, then chips at it with pieces from a fianchetto. Patience required." },

  /* ----- 1.d4 ----- */
  { seq: "d4", name: "Queen's Pawn Opening",
    idea: "The other great first move: the same central claim, already defended by the queen." },
  { seq: "d4 d5", name: "Closed Game",
    idea: "Symmetry again, but slower burning: the centre tends to lock, and plans matter more than tricks." },
  { seq: "d4 d5 c4", name: "Queen's Gambit",
    idea: "Not really a gambit: white offers the c-pawn to lure black's d-pawn off the centre. Taking it is fine; keeping it is not." },
  { seq: "d4 d5 c4 e6", name: "Queen's Gambit Declined",
    idea: "The classical choice: hold d5, finish developing, ask nothing and give nothing. Careers have been built on it." },
  { seq: "d4 d5 c4 c6", name: "Slav Defence",
    idea: "Declines the gambit while keeping the c8 bishop's diagonal open — fixing the QGD's one regret." },
  { seq: "d4 d5 c4 dxc4", name: "Queen's Gambit Accepted",
    idea: "Taking is honest — but don't try to keep the pawn. Give it back for fast development and equality." },
  { seq: "d4 Nf6", name: "Indian Defence",
    idea: "Black develops first and decides about the centre later — the modern way." },
  { seq: "d4 Nf6 c4 e6 Nc3 Bb4", name: "Nimzo-Indian Defence",
    idea: "The pin on c3 fights for e4 without ever putting a pawn there. One of the deepest ideas ever found on a chessboard." },
  { seq: "d4 Nf6 c4 g6 Nc3 Bg7", name: "King's Indian Defence",
    idea: "Black hands white the centre, castles snugly behind the fianchetto — then storms back with ...e5 and a kingside avalanche." },
  { seq: "d4 d5 Nf3 Nf6 Bf4", name: "London System",
    idea: "The same sturdy setup against nearly anything: bishop out before the pawn chain closes, then build. Beloved by busy people." },
  { seq: "d4 f5", name: "Dutch Defence",
    idea: "Black grabs kingside space on move one and aims everything at white's king. Bold, loosening, fun." },

  /* ----- flank openings ----- */
  { seq: "c4", name: "English Opening",
    idea: "The centre, approached sideways: c4 controls d5 without offering a target." },
  { seq: "Nf3", name: "Zukertort Opening",
    idea: "Develop first, decide later. The knight watches the centre while white keeps every plan available — if Black answers 1...d5, c4 turns it into the Réti." },
  { seq: "Nf3 d5 c4", name: "Réti Opening",
    idea: "White invites black to hold a centre that white will undermine from both wings." }
];

/* One short reason for every move, keyed by the moves up to and
   including it. A move that several lines share has one reason, told
   the same way in all of them. Written for someone in their first
   month: name the idea (the centre, development, a threat, a pin, the
   king's safety), in a sentence or two, and nothing that isn't true on
   the board — book-check.js holds every threat, pin and mate named here
   to that. <b> and <i> render; nothing else does. */
var REASONS = {
  "e4": "Grabs a share of the centre and opens lines for the queen and the f1 bishop.",
  "e4 e5": "Meets the claim symmetrically: Black takes an equal share of the centre and opens lines for its own queen and bishop.",
  "e4 e5 Nf3": "Develops toward the centre and attacks the e5 pawn, which nothing defends yet — two jobs, one move.",
  "e4 e5 Nf3 Nc6": "Defends e5 with a developing move instead of a passive one.",
  "e4 e5 Nf3 Nc6 Bc4": "Aims the bishop at f7 — the one square in Black's camp that only the king defends.",
  "e4 e5 Nf3 Nc6 Bc4 Bc5": "Mirrors the idea: the bishop takes the diagonal toward f2, the square only White's king defends.",
  "e4 e5 Nf3 Nc6 Bc4 Bc5 c3": "Prepares d4: a pawn will support a pawn, and the centre grows.",
  "e4 e5 Nf3 Nc6 Bc4 Nf6": "Counterattacks the e4 pawn, which nothing defends, instead of sitting back — a punch traded for a punch.",
  "e4 e5 Nf3 Nc6 Bb5": "Puts pressure on the knight on c6 — the piece that defends e5 — instead of aiming at f7.",
  "e4 e5 Nf3 Nc6 Bb5 a6": "Puts the question to the bishop: take the knight, or step back?",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4": "Steps back but keeps the pressure: from a4 the bishop still looks at the knight on c6.",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6": "Develops with an attack on the e4 pawn, which nothing defends.",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O": "The king tucks into safety first. The e4 pawn is left loose on purpose: if Black takes it, Re1 soon wins a pawn back.",
  "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7": "Develops quietly and gets ready to castle, leaving e4 alone — that choice is what makes this the <i>Closed</i> Ruy López.",
  "e4 e5 Nf3 Nc6 d4": "Breaks the centre open at once: the d-pawn strikes at e5 before Black has finished developing.",
  "e4 e5 Nc3": "Develops and guards e4, keeping the f-pawn free — f4 can follow, like a King's Gambit with a knight already out.",
  "e4 e5 f4": "Offers a pawn to drag Black's e-pawn away from the centre and open the f-file toward the black king.",
  "e4 e5 Nf3 Nf6": "Counterattacks e4 instead of defending e5. If White takes on e5, Black first kicks the knight with ...d6, then takes back on e4.",
  "e4 e5 Qh5": "Attacks the e5 pawn, which nothing defends — Qxe5 would even be check — and eyes f7. With Bc4 next, Qxf7 would be mate; but a queen out this early is a target.",
  "e4 e5 Qh5 Nc6": "Defends e5 and develops. If Bc4 follows, ...g6 blocks the queen's line to f7 and attacks her at the same time.",
  "e4 c5": "Fights for d4 from the wing — Black wants an unbalanced game with winning chances, not symmetry.",
  "e4 c5 Nf3": "Develops and prepares d4, the pawn break that opens the centre.",
  "e4 c5 Nf3 d6": "Takes e5 away from White's pieces and opens a diagonal for the c8 bishop.",
  "e4 c5 Nf3 d6 d4": "Opens the centre: White gives a centre pawn for Black's c-pawn to get open lines and quick development.",
  "e4 c5 Nf3 d6 d4 cxd4": "Takes, trading a wing pawn for a centre pawn: once White takes back, Black has two centre pawns to White's one.",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4": "Takes back with the knight, which lands on a strong central square.",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6": "Develops with an attack on the e4 pawn, which nothing defends, so White has to spend a move on it.",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3": "Defends e4 and develops another piece in the same move.",
  "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6": "Takes b5 away from White's knight and bishop, and gets ready for ...e5 or ...b5.",
  "e4 c6": "Prepares ...d5 to challenge the centre — and unlike the French, the c8 bishop won't be shut in.",
  "e4 e6": "Prepares ...d5 — Black will challenge the centre with a supported pawn instead of a piece.",
  "e4 d5": "Strikes at e4 straight away. After exd5 the queen often takes back, accepting an early queen for a simple, open game.",
  "e4 d6": "Quietly controls e5 and lets White build a big centre, planning to chip at it with pieces from the side.",
  "d4": "Claims the centre like e4 — but this pawn arrives already protected by the queen.",
  "d4 d5": "Meets the pawn head-on. Neither centre pawn can move forward now, so the centre tends to stay closed.",
  "d4 d5 c4": "Offers a wing pawn to buy the centre — if Black takes, White can play e4 and own the middle.",
  "d4 d5 c4 e6": "Declines politely: d5 stays supported, and the f8 bishop can come out.",
  "d4 d5 c4 c6": "Supports d5 with the c-pawn, so the c8 bishop keeps its diagonal open.",
  "d4 d5 c4 dxc4": "Accepts the offer. The plan is not to guard this pawn — it's to develop fast while White wins it back.",
  "d4 Nf6": "Controls e4 with a piece before committing any centre pawn — flexibility first.",
  "d4 Nf6 c4": "Takes more of the centre: the c-pawn controls d5, a square Black would like for a pawn.",
  "d4 Nf6 c4 e6": "Opens the f8 bishop's diagonal and keeps both ...d5 and ...Bb4 in reserve.",
  "d4 Nf6 c4 e6 Nc3": "Develops and prepares e4 — the central square the knight on f6 is guarding.",
  "d4 Nf6 c4 e6 Nc3 Bb4": "Pins the knight on c3 to the king: while the pin lasts it can't move, so it can't take back on e4 — the square both sides are fighting for.",
  "d4 Nf6 c4 g6": "Prepares a fianchetto: the bishop will sit on g7, aimed down the long diagonal at the centre.",
  "d4 Nf6 c4 g6 Nc3": "Develops and backs up e4, so White can build a big pawn centre.",
  "d4 Nf6 c4 g6 Nc3 Bg7": "The fianchetto: from g7 the bishop looks down the long diagonal, and castling comes next.",
  "d4 d5 Nf3": "Develops and keeps an eye on e5 — the usual start of the London setup.",
  "d4 d5 Nf3 Nf6": "Mirrors White: develops and stops e4.",
  "d4 d5 Nf3 Nf6 Bf4": "The point of the London: this bishop gets out <i>before</i> e3 would shut it in.",
  "d4 f5": "Grabs control of e4 with a pawn from the side and points at the kingside — bold, and a little loosening for Black's own king.",
  "c4": "Fights for d5 from the flank — the centre can be claimed later, on better terms.",
  "Nf3": "Develops, controls e5 and d4, and commits to nothing yet.",
  "Nf3 d5": "Puts a pawn on d5, a central square the knight on f3 doesn't reach.",
  "Nf3 d5 c4": "Attacks the d5 pawn from the side — the Réti idea: undermine Black's centre instead of occupying it."
};

function split(seq) { return seq.split(" "); }

/* every line gets its reasons, move by move */
(function attachReasons() {
  for (var i = 0; i < LINES.length; i++) {
    var ms = split(LINES[i].seq), why = [];
    for (var j = 0; j < ms.length; j++) {
      var r = REASONS[ms.slice(0, j + 1).join(" ")];
      why.push(r || null);                    /* book-check.js fails on any null */
    }
    LINES[i].why = why;
  }
})();

/* the timeless principles, surfaced one at a time while the opening is young */
var PRINCIPLES = [
  "Try to control the centre — pieces standing there reach the whole board.",
  "Develop knights and bishops before moving the same piece twice.",
  "Castle early. An open king loses games that were otherwise won.",
  "Don't bring the queen out too soon — she becomes a target, and dodging costs moves.",
  "Connect your rooks: when nothing stands between them, development is done.",
  "A pawn move can never be taken back — every one loosens something.",
  "Answer a threat with a move that also does something useful, if you can."
];

/* deepest line whose moves are a prefix of the played SANs */
function match(sans) {
  var best = null, i, ms;
  for (i = 0; i < LINES.length; i++) {
    ms = split(LINES[i].seq);
    if (ms.length > sans.length) continue;
    var ok = true;
    for (var j = 0; j < ms.length; j++) if (ms[j] !== sans[j]) { ok = false; break; }
    if (ok && (!best || ms.length > split(best.seq).length)) best = LINES[i];
  }
  return best;
}

/* book continuations: every distinct next move from lines that extend the
   played sequence, with the deepest/most specific line's name and reason */
function suggest(sans) {
  var out = [], seen = {}, i;
  for (i = 0; i < LINES.length; i++) {
    var ms = split(LINES[i].seq);
    if (ms.length <= sans.length) continue;
    var ok = true;
    for (var j = 0; j < sans.length; j++) if (ms[j] !== sans[j]) { ok = false; break; }
    if (!ok) continue;
    var next = ms[sans.length];
    var why = (LINES[i].why && LINES[i].why[sans.length]) || null;
    if (seen[next] === undefined) {
      seen[next] = out.length;
      out.push({ san: next, name: LINES[i].name, idea: LINES[i].idea, why: why });
    } else if (why && !out[seen[next]].why) {
      out[seen[next]].why = why;
      out[seen[next]].name = LINES[i].name;
    }
  }
  return out;
}

function principle(n) { return PRINCIPLES[n % PRINCIPLES.length]; }

var Book = { LINES: LINES, REASONS: REASONS, PRINCIPLES: PRINCIPLES,
             match: match, suggest: suggest, principle: principle };
if (typeof module !== "undefined" && module.exports) module.exports = Book;
else root.Book = Book;
})(typeof self !== "undefined" ? self : this);
