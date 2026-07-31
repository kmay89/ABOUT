/* table.js — the front door, once, for every game that has more than one chair.

   The domino table proved the ritual: the host reads out four letters and
   everybody else types them. What it did *not* prove is that the ritual is
   cheap to add to a new game — because in the domino room the door is spread
   through app.js, tangled up with bones and parejas. Five more games meant
   either five more copies of that tangle or one honest extraction.

   This is the extraction. It owns:

     · the sheet — name box, "be the board", "sit down at one", the code in
       big letters, the lobby, the QR/paste fallback when there is no mailbox
     · the wiring — Net's callbacks funnelled into one small set of hooks the
       game implements, so a game never touches Net directly
     · the seating — who is in which chair, what an empty chair is called,
       and the fact that an empty chair is played by the house
     · the pulse — the link chip in the corner, from Net.health()

   What it deliberately does *not* own is the game. It never looks at a move,
   a card or a board. The host holds the truth; guests send intents and draw
   what they are told. Two hooks are the whole contract:

     Table.viewFor(seat) → what that chair is allowed to see
     Table.on.message(msg, fromSeat) → an intent arrived

   viewFor is the important one, and it is the same idea the domino room
   proved with a permutation test: a card game must never put four hands on
   four phones. A game with nothing to hide returns the whole state and pays
   nothing for the generality.

   Byte-identical in every folder that uses it; tools/room-parity.js keeps the
   copies honest.                                                            */
(function (root) {
"use strict";

var CFG = {
  game: "table",
  seats: 2,
  label: "board",              /* the word this game uses for a room       */
  roomName: "A board",         /* what the room is called on the list      */
  lead: "",                    /* the sentence above the two big buttons   */
  hostWord: "Be the board",
  joinWord: "Sit down at one",
  bots: [],                    /* names for the chairs the house plays     */
  sheet: "partyBody",          /* where the door draws itself              */
  chip: "netChip",
  seatWord: function (n) { return n === 1 ? "1 seated" : n + " seated"; }
};

var T = {
  role: "off",                 /* off | host | guest                       */
  seat: 0,
  names: {},                   /* seat → display name                      */
  on: {},                      /* message, roster, link, drop, rejoin, health */
  viewFor: null,
  me: "",                      /* my own name, remembered between visits   */
  toast: function () {}
};

/* ---------- small helpers, so the door needs nothing from the game ------- */
function $(id) { return document.getElementById(id); }
function esc(s) {
  return String(s === undefined || s === null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function press(el, fn) {
  if (!el) return;
  el.addEventListener("click", function (e) { e.preventDefault(); fn(e); });
}
function sheet() { return $(CFG.sheet); }

/* ---------- who am I ---------- */
T.configure = function (o) {
  o = o || {};
  for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) CFG[k] = o[k];
  Room.configure({ game: CFG.game, seats: CFG.seats, label: CFG.label });
  T.me = load();
  return T;
};

var NAMEKEY = "table:name";
function load() {
  try { return Net.cleanName(localStorage.getItem(NAMEKEY) || ""); } catch (e) { return "Player"; }
}
function keep(n) {
  T.me = Net.cleanName(n);
  try { localStorage.setItem(NAMEKEY, T.me); } catch (e) {}
}

/* the name of whoever is in a chair — a person if somebody is sitting in it,
   otherwise the house player who is holding it for them */
T.nameOf = function (seat) {
  if (T.names[seat]) return T.names[seat];
  return CFG.bots[seat] || CFG.bots[seat % (CFG.bots.length || 1)] || ("Seat " + (seat + 1));
};
T.isHuman = function (seat) {
  if (T.role === "off") return seat === 0;
  if (seat === 0) return true;
  for (var i = 0; i < Net.peers.length; i++) if (Net.peers[i].seat === seat) return true;
  return false;
};
T.linked = function () { return T.role === "host" || T.role === "guest"; };

/* ---------- the sheet ----------
   Three screens, and which one you see is decided entirely by where you
   already are: not linked, hosting, or looking for somebody to host. */
T.open = function () {
  var body = sheet();
  if (!body) return;
  if (T.role !== "off") return;                     /* already at a table   */
  var back = Room.recall();
  body.innerHTML =
    "<p class='lead'>" + (CFG.lead ||
      ("One phone is the " + esc(CFG.label) + " — it deals and it keeps the score. " +
       "Everybody else sits down at it by typing four letters.")) + "</p>" +
    "<div class='fld'><label><b>Your name</b></label>" +
    "<input type='text' id='tName' maxlength='14' value='" + esc(T.me) + "' placeholder='Player'></div>" +
    (back ? "<div class='row'><button class='btn wide' id='tBack'>↩ Back to <b>" + esc(back.code) + "</b></button></div>" : "") +
    "<div class='row'><button class='btn primary wide' id='tHost'>" + esc(CFG.hostWord) + "</button>" +
    "<button class='btn' id='tJoin'>" + esc(CFG.joinWord) + "</button></div>";
  press($("tHost"), function () { keep($("tName").value); T.host(); });
  press($("tJoin"), function () { keep($("tName").value); T.join(); });
  if (back) press($("tBack"), function () {
    keep($("tName").value);
    Room.resume();
    if (back.role === "host") T.host(true);
    else { T.join(); byCode(back.code); }
  });
};

/* ---------- hosting ---------- */
T.host = function (again) {
  T.role = "host"; T.seat = 0;
  T.names = {}; T.names[0] = T.me || "You";
  hostHooks();
  showRoom(null, again);
  var fallback = null;
  Net.startHosting(T.me || "Host").then(function (code) {
    fallback = code;
    return Net.roomOpen({ name: T.me ? (T.me + "’s " + CFG.label) : CFG.roomName });
  }).then(function (r) {
    /* four letters when the mailbox is reachable; the QR handshake when it
       is not, which is what happens offline and on file:// */
    if (r) showRoom(r.code, again); else showInvite(fallback);
  }).catch(function () { showInvite(fallback); });
  if (T.on.hosting) T.on.hosting();
};

function hostHooks() {
  Net.onRoster = function (roster) {
    T.names = {};
    for (var i = 0; i < roster.length; i++) if (roster[i].name) T.names[roster[i].seat] = roster[i].name;
    T.names[0] = T.me || "You";
    lobby();
    if (T.on.roster) T.on.roster(roster);
  };
  /* Somebody sitting down and somebody coming back look identical from here,
     and should: the chair was held by name, so deal it its view and carry on. */
  Net.onLink = function (seat, nm) {
    T.toast(nm + " sat down.");
    lobby(); chip();
    T.deal();
    if (T.on.link) T.on.link(seat, nm);
  };
  Net.onDrop = function (seat) {
    if (seat > 0) T.toast(T.nameOf(seat) + " dropped — the house plays that chair until they're back.");
    delete T.names[seat];
    lobby(); chip();
    if (T.on.drop) T.on.drop(seat);
  };
  Net.onMessage = function (msg, from) {
    if (T.on.message) T.on.message(msg, from);
  };
}

/* the table's own screen: the code, big, and who has sat down so far */
function showRoom(code, again) {
  var body = sheet();
  if (!body) return;
  body.innerHTML =
    "<p class='lead'>" + (again
      ? "Same four letters as before — nothing to re-read. The chairs find their own way back."
      : "Read these out. On their phone: <b>Play together</b> → <b>" + esc(CFG.joinWord) + "</b>.") + "</p>" +
    "<div class='codeBig" + (code ? "" : " pending") + "' id='tCode'>" + esc(code || "····") + "</div>" +
    "<div class='codeWait' id='tWait'>" + (code ? "waiting for them to type it…" : "opening the " + esc(CFG.label) + "…") + "</div>" +
    "<div id='tLobby'></div>" +
    "<div class='row'><button class='btn' id='tShare'>Send the code</button>" +
    "<button class='btn' id='tQR'>Codes &amp; QR instead</button></div>" +
    "<p class='note'>Every chair nobody has taken is played by the house, so you can start now and let them sit down as they arrive.</p>";
  lobby(); chip();
  if (!code) return;
  press($("tShare"), function () { share(Net.url(code), "Four letters: " + code); });
  press($("tQR"), function () { Net.mintInvite().then(showInvite); });
}

function share(url, text) {
  if (navigator.share) navigator.share({ title: "Come and play", text: text, url: url }).catch(function () {});
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { T.toast("Link copied."); }, function () {});
}

/* the fallback that needs no server at all: hold the phone up */
function showInvite(code) {
  var body = sheet();
  if (!body) return;
  if (!code) { body.innerHTML = "<p class='lead'>Every chair is taken.</p>"; return; }
  var url = Net.url(code);
  body.innerHTML =
    "<p class='lead'>Hold this up. They point a camera at it — no app, no account, nothing to type.</p>" +
    "<canvas id='tQRc'></canvas>" +
    "<div id='tLobby'></div>" +
    "<div class='row'><button class='btn' id='tShare'>Send the link</button>" +
    "<button class='btn' id='tReply'>They have a code for me</button></div>";
  Net.drawQR($("tQRc"), url, "#14100c", "#ffffff");
  lobby();
  press($("tShare"), function () { share(url, "Come and play"); });
  press($("tReply"), function () {
    $("tLobby").innerHTML = "<div class='fld'><label><b>Paste what their phone shows</b></label>" +
      "<input type='text' id='tReplyIn' placeholder='…'></div>";
    var inp = $("tReplyIn");
    inp.focus();
    inp.addEventListener("input", function () {
      Net.acceptReply(inp.value).then(function (ok) {
        if (ok) { inp.value = ""; T.toast("Linking…"); Net.mintInvite().then(showInvite); }
      });
    });
  });
}

function lobby() {
  var el = $("tLobby");
  if (!el) return;
  var parts = [], i;
  for (i = 0; i < CFG.seats; i++) {
    parts.push("<b>" + esc(T.names[i] || "the house") + "</b>");
  }
  el.innerHTML = "<p class='note'>At the " + esc(CFG.label) + ": " + parts.join(" · ") + "</p>";
}
T.lobby = lobby;

/* ---------- joining ---------- */
var listT = 0, joining = false;
T.join = function (prefill) {
  guestHooks();
  if (prefill && !Room.isCode(prefill)) { byPaste(prefill); return; }
  byRoom();
  if (prefill) {
    var box = $("tRoom");
    if (box) { box.value = Room.tidy(prefill); byCode(prefill); }
  }
};

function byRoom() {
  var body = sheet();
  if (!body) return;
  body.innerHTML =
    "<p class='lead'>Type the four letters they read out.</p>" +
    "<div class='fld'><label><b>Your name</b></label><input type='text' id='tJName' maxlength='14' value='" + esc(T.me) + "'></div>" +
    "<input class='codeIn' id='tRoom' maxlength='4' inputmode='latin' autocapitalize='characters' autocomplete='off' spellcheck='false' placeholder='····' aria-label='Their four-letter code'>" +
    "<div class='codeWait' id='tJWait'>four letters and you're in</div>" +
    "<div class='roomList' id='tList'></div>" +
    "<div class='row'><button class='btn' id='tJQR'>Codes &amp; QR instead</button></div>";
  press($("tJQR"), function () { stopList(); byPaste(null); });
  $("tRoom").addEventListener("input", function () {
    var v = Room.tidy(this.value);
    this.value = v;
    if (v.length === 4) byCode(v);
  });
  refreshList();
  startList();
  setTimeout(function () { try { $("tRoom").focus(); } catch (e) {} }, 250);
}
function note(t) { var el = $("tJWait"); if (el) el.textContent = t; }
function startList() { stopList(); listT = setInterval(refreshList, 3500); }
function stopList() { if (listT) { clearInterval(listT); listT = 0; } }
function refreshList() {
  Net.roomList().then(function (rooms) {
    var box = $("tList");
    if (!box) { stopList(); return; }
    if (rooms === null) { noMailbox(); return; }
    if (!rooms.length) {
      box.innerHTML = "<div class='roomEmpty'>Nothing waiting yet — when somebody taps <b>" +
        esc(CFG.hostWord) + "</b>, theirs shows up here.</div>";
      return;
    }
    box.innerHTML = rooms.map(function (r) {
      return "<button class='roomRow' data-code='" + esc(r.code) + "'>" +
        "<span class='rrCode'>" + esc(r.code) + "</span>" +
        "<span class='rrTx'><b>" + esc(r.name || CFG.roomName) + "</b><i>" + esc(r.host || "somebody") +
        " · " + CFG.seatWord(r.players || 1) + " of " + (r.seats || CFG.seats) + "</i></span>" +
        "<span class='rrGo'>sit down ▸</span></button>";
    }).join("");
    Array.prototype.forEach.call(box.querySelectorAll(".roomRow"), function (b) {
      press(b, function () { byCode(b.dataset.code); });
    });
  });
}
function noMailbox() {
  stopList();
  T.toast("No four-letter codes here — the camera and paste way still works.");
  byPaste(null);
}
function byCode(code, retry) {
  code = Room.tidy(code);
  if (!Room.looksLikeCode(code) || joining) return;
  if (Room.impossible(code)) { note("codes never use I or O — they'd read as 1 and 0. Check it again."); return; }
  var box = $("tJName");
  if (box) keep(box.value);
  joining = true;
  stopList();
  if ($("tList")) $("tList").innerHTML = "";
  note("knocking on " + code + "…");
  Net.roomJoin(code, T.me).then(function (r) {
    joining = false;
    if (!r) { noMailbox(); return; }
    if (r.error) {
      /* "full" is nearly always a spare pigeonhole still being minted — one
         patient retry beats making somebody type it again */
      if (/full/i.test(r.error) && !retry) {
        note("they're pulling up a chair…");
        setTimeout(function () { byCode(code, true); }, 1600);
        return;
      }
      note(r.error);
      startList();
      return;
    }
    note("found " + (r.name || code) + " — taking a seat…");
  }, function () { joining = false; note("that didn't take — try the code again"); startList(); });
}
T.byCode = byCode;

/* the handshake that needs no mailbox: their code in, my code back */
function byPaste(prefill) {
  var body = sheet();
  if (!body) return;
  body.innerHTML =
    "<p class='lead'>Point your camera at the code on their screen and open the link — or paste it here.</p>" +
    "<div class='fld'><label><b>Your name</b></label><input type='text' id='tJName' maxlength='14' value='" + esc(T.me) + "'></div>" +
    "<div class='fld'><label><b>Their code</b></label><input type='text' id='tPaste' placeholder='paste it here'></div>" +
    "<div id='tPasteOut'></div>";
  var inp = $("tPaste");
  if (prefill) inp.value = prefill;
  var go = function () {
    var code = inp.value.trim();
    if (code.length < 20) return;
    keep($("tJName").value);
    Net.join(code, T.me).then(function (res) {
      if (!res) { $("tPasteOut").innerHTML = "<p class='note warn'>That isn't one of ours.</p>"; return; }
      $("tPasteOut").innerHTML =
        "<p class='lead'>Now hold <i>this</i> up to them, or send it back.</p>" +
        "<canvas id='tQRc'></canvas>" +
        "<div class='row'><button class='btn wide' id='tCopy'>Copy my code</button></div>";
      Net.drawQR($("tQRc"), res.reply, "#14100c", "#ffffff");
      press($("tCopy"), function () {
        if (navigator.clipboard) navigator.clipboard.writeText(res.reply).then(function () { T.toast("Copied — send it to them."); }, function () {});
      });
    });
  };
  inp.addEventListener("input", go);
  if (prefill) go();
}

function guestHooks() {
  Net.onLink = function (seat, nm) {
    T.role = "guest"; T.seat = seat;
    T.toast("You're in seat " + (seat + 1) + ".");
    chip();
    Room.remember({ role: "guest", code: Net.code, name: T.me, seat: seat });
    if (T.on.seated) T.on.seated(seat, nm);
  };
  Net.onRoster = function (roster) {
    T.names = {};
    for (var i = 0; i < roster.length; i++) if (roster[i].name) T.names[roster[i].seat] = roster[i].name;
    lobby();
    if (T.on.roster) T.on.roster(roster);
  };
  Net.onRejoin = function () { T.toast("Back at the " + CFG.label + "."); chip(); if (T.on.rejoin) T.on.rejoin(); };
  Net.onHealth = function (state) { chip(); if (T.on.health) T.on.health(state); };
  Net.onDrop = function () { chip(); if (T.on.drop) T.on.drop(-1); };
  Net.onMessage = function (msg) { if (T.on.message) T.on.message(msg, 0); };
}

/* ---------- talking ----------
   Guests send intents up; the host sends each chair its own view down. */
T.send = function (obj) { return Net.send(obj); };
T.broadcast = function (obj) { return Net.broadcast(obj); };
T.sendSeat = function (seat, obj) { return Net.sendSeat(seat, obj); };

/* The one that matters, and the reason viewFor exists at all. Each chair is
   sent what that chair is entitled to see and nothing else, so a card game
   never puts four hands on four phones — not visible in the interface, and
   not sitting in the message log either. A game with nothing to hide returns
   the whole state and pays nothing. */
T.deal = function (extra) {
  if (T.role !== "host" || !T.viewFor) return 0;
  var n = 0;
  for (var i = 0; i < Net.peers.length; i++) {
    var p = Net.peers[i];
    var msg = { k: "view", view: T.viewFor(p.seat) };
    if (extra) for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) msg[key] = extra[key];
    if (Net.sendSeat(p.seat, msg)) n++;
  }
  return n;
};
T.started = function () { Net.roomStarted(); };
T.leave = function () {
  Net.close();
  Room.forget();
  T.role = "off"; T.seat = 0; T.names = {};
  chip();
};

/* ---------- the pulse ---------- */
function chip() {
  var el = $(CFG.chip);
  if (!el) return;
  if (T.role === "off") { el.className = "hide"; return; }
  var h = Net.health();
  el.className = h.state;
  var tx = el.querySelector(".tx");
  if (tx) tx.textContent = h.words + (Net.code ? " · " + Net.code : "");
}
T.chip = chip;
setInterval(function () { if (T.role !== "off") chip(); }, 2000);

/* ---------- an invite that arrived as a link ---------- */
T.hashInvite = function () {
  var m = /[#&]join=([^&]+)/.exec(location.hash || "");
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
};

if (typeof module !== "undefined" && module.exports) module.exports = T;
else root.Table = T;
})(typeof self !== "undefined" ? self : this);
