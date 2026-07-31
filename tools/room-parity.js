/* room-parity.js — dev-only. The shared front door has to actually be shared.

   room.js is copied into each game folder rather than loaded from one place,
   because every game here is a self-contained folder that can be moved,
   mirrored or opened from a file:// path on its own. That is a deliberate
   trade, and it has one failure mode: somebody fixes a bug in the chess copy
   and the domino table keeps the bug.

   Three files are shared this way now, not one:

     room.js   the mailbox client, the heartbeat and the healing loop
     table.js  the door's whole interface — the name box, the code in big
               letters, the lobby, the QR fallback and the seating
     cards.js  a deck and a four-seat table, shared by hearts, euchre and viuda
     words.js  the party-game word lists, shared by the two party rooms

   Each is checked the same way: byte-identical everywhere it appears, loaded
   in the right order, and the game must say who it is. And the mailbox has to
   know about every game that will knock on it — a namespace missing from that
   list fails as "unknown game" at the worst possible moment, which is the
   first time four people try to sit down.

   Run: node tools/room-parity.js                                            */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

/* every folder that opens a room, and how many chairs it has */
const ROOMS = [
  { game: "chess",    seats: 2, kit: ["room"] },
  { game: "domino",   seats: 4, kit: ["room"] },
  { game: "checkers", seats: 2, kit: ["room", "table"] },
  { game: "othello",  seats: 2, kit: ["room", "table"] },
  { game: "halma",    seats: 6, kit: ["room", "table"] },
  { game: "stratego", seats: 2, kit: ["room", "table"] },
  { game: "yahtzee",  seats: 6, kit: ["room", "table"] },
  { game: "viuda",    seats: 6, kit: ["room", "table", "cards"] },
  { game: "hearts",   seats: 4, kit: ["room", "table", "cards"] },
  { game: "euchre",   seats: 4, kit: ["room", "table", "cards"] }
];
/* the rooms nobody else joins — no net, no door, but still a service worker
   and an icon set to keep honest */
const SOLO = ["sudoku", "library", "solitaire", "minesweeper", "breaker",
              "catchphrase", "guesstures"];
/* The party games have no door — they are one phone passed round a room — but
   they do share a file, and a word list that has drifted between the two is
   exactly the sort of thing nobody notices until somebody reads the same card
   in both games. */
const SHARED_SOLO = [{ file: "words", games: ["catchphrase", "guesstures"] }];

const CACHES = new Map();
let fails = 0;
function ok(what, cond, detail) {
  if (cond) console.log("  ✓ " + what);
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}

/* ---------- the shared files, byte for byte ---------- */
console.log("\n──  one door, copied honestly");
const KIT = ["room", "table", "cards"].map((file) => ({ file, games: ROOMS.filter((r) => r.kit.includes(file)).map((r) => r.game) }))
  .concat(SHARED_SOLO);
for (const { file, games } of KIT) {
  const owners = games.map((game) => ({ game }));
  if (!owners.length) continue;
  const canonPath = path.join(ROOT, owners[0].game, file + ".js");
  if (!fs.existsSync(canonPath)) { ok(file + ".js exists somewhere", false); continue; }
  const canon = fs.readFileSync(canonPath);
  for (const r of owners) {
    const p = path.join(ROOT, r.game, file + ".js");
    if (!fs.existsSync(p)) { ok(r.game + "/" + file + ".js exists", false); continue; }
    ok(r.game + "/" + file + ".js matches " + owners[0].game + "'s, byte for byte",
       fs.readFileSync(p).equals(canon));
  }
}

/* ---------- each room loads it and says who it is ---------- */
console.log("\n──  every room says its own name");
for (const r of ROOMS) {
  const dir = path.join(ROOT, r.game);
  if (!fs.existsSync(dir)) { ok(r.game + "/ exists", false); continue; }
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  ok(r.game + " loads room.js before net.js",
     html.indexOf('src="room.js"') >= 0 &&
     html.indexOf('src="room.js"') < html.indexOf('src="net.js"'));

  /* the domino and chess rooms configure the door themselves; the newer ones
     go through table.js, which configures it for them */
  const app = fs.readFileSync(path.join(dir, "app.js"), "utf8");
  const named = new RegExp('(Room|Table)\\.configure\\([^)]*game:\\s*"' + r.game + '"').test(app);
  ok(r.game + " tells the door who it is", named);

  /* The newer rooms all run the domino table's star topology, where the
     chair count is one constant. The chess room predates it and has its own
     two-player net.js, so it is checked for having a door rather than for
     having that constant. */
  const net = fs.readFileSync(path.join(dir, "net.js"), "utf8");
  if (r.kit.includes("table")) {
    const seats = (net.match(/var SEATS = (\d+);/) || [])[1];
    ok(r.game + " has " + r.seats + " chairs in net.js", String(r.seats) === seats, "found " + seats);
  }

  const sw = fs.readFileSync(path.join(dir, "sw.js"), "utf8");
  ok(r.game + " caches room.js for offline", sw.indexOf("room.js") >= 0);
}

/* ---------- the mailbox has to answer to all of them ---------- */
console.log("\n──  the mailbox knows the names");
const fn = fs.readFileSync(path.join(ROOT, "netlify", "functions", "room.js"), "utf8");
const listed = (fn.match(/const GAMES = \[([\s\S]*?)\]/) || [])[1] || "";
for (const r of ROOMS) {
  ok("the mailbox answers to '" + r.game + "'", listed.indexOf("'" + r.game + "'") >= 0);
}

/* ---------- every room, shared or solo, is installable ---------- */
console.log("\n──  every room is a room you can keep");
for (const game of ROOMS.map((r) => r.game).concat(SOLO)) {
  const dir = path.join(ROOT, game);
  if (!fs.existsSync(dir)) { ok(game + "/ exists", false); continue; }
  const sw = path.join(dir, "sw.js");
  ok(game + " has a service worker", fs.existsSync(sw));
  if (fs.existsSync(sw)) {
    const src = fs.readFileSync(sw, "utf8");
    const v = (src.match(/VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] || "";
    /* What matters is not the naming convention — the older rooms date-stamp
       theirs and that is fine — but that no two rooms share a cache name.
       Two rooms in one cache is one room serving the other's scripts. */
    if (v) {
      ok(game + "'s cache name is its own", !CACHES.has(v), "also used by " + CACHES.get(v));
      CACHES.set(v, game);
    } else {
      ok(game + " names its cache at all", false);
    }
  }
  ok(game + " has a manifest", fs.existsSync(path.join(dir, "manifest.webmanifest")));
  for (const icon of ["icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png"]) {
    ok(game + " has icons/" + icon, fs.existsSync(path.join(dir, "icons", icon)));
  }
  /* the shell has to list the files the page actually loads, or the room
     opens online and is blank on a bus */
  if (fs.existsSync(sw) && fs.existsSync(path.join(dir, "index.html"))) {
    const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
    const shell = fs.readFileSync(sw, "utf8");
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
    /* both quote styles: the older rooms are written in single quotes */
    const inShell = (f) => shell.indexOf('"./' + f + '"') >= 0 || shell.indexOf("'./" + f + "'") >= 0;
    const missing = scripts.filter((s) => !inShell(s));
    ok(game + "'s offline shell lists every script the page loads",
       missing.length === 0, missing.join(", "));
    const css = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    const cssMissing = css.filter((s) => !inShell(s));
    ok(game + "'s offline shell lists its stylesheet", cssMissing.length === 0, cssMissing.join(", "));
  }
}

/* ---------- and the site knows they exist ---------- */
console.log("\n──  the site links to them");
const home = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const map = fs.readFileSync(path.join(ROOT, "sitemap.xml"), "utf8");
const hub = fs.readFileSync(path.join(ROOT, "games", "index.html"), "utf8");
for (const game of ROOMS.map((r) => r.game).concat(SOLO)) {
  ok(game + " is in the sitemap", map.indexOf("/" + game + "/") >= 0);
  ok(game + " is on the games page", hub.indexOf('href="/' + game + '/"') >= 0);
}
ok("the home page links to the games page", home.indexOf('href="/games/"') >= 0);

console.log("");
if (fails) { console.log("FAILED: " + fails + " problem" + (fails === 1 ? "" : "s")); process.exit(1); }
console.log("the copies are honest");
