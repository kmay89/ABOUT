/* room-parity.js — dev-only. The shared front door has to actually be shared.

   room.js is copied into each game folder rather than loaded from one place,
   because every game here is a self-contained folder that can be moved,
   mirrored or opened from a file:// path on its own. That is a deliberate
   trade, and it has one failure mode: somebody fixes a bug in the chess copy
   and the domino table keeps the bug.

   So: the copies must be byte-identical, and each game must actually load it
   and say who it is. Run this before shipping.

   Run: node tools/room-parity.js                                            */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const GAMES = ["chess", "domino"];
let fails = 0;
function ok(what, cond, detail) {
  if (cond) console.log("  ✓ " + what);
  else { fails++; console.log("  ✗ " + what + (detail ? " — " + detail : "")); }
}

const canon = fs.readFileSync(path.join(ROOT, GAMES[0], "room.js"));
console.log("\n──  one door, copied honestly");
for (const g of GAMES) {
  const p = path.join(ROOT, g, "room.js");
  ok(g + "/room.js exists", fs.existsSync(p));
  if (!fs.existsSync(p)) continue;
  ok(g + "/room.js matches " + GAMES[0] + "/room.js byte for byte",
    fs.readFileSync(p).equals(canon));

  const html = fs.readFileSync(path.join(ROOT, g, "index.html"), "utf8");
  ok(g + " loads room.js before net.js",
    html.indexOf('src="room.js"') >= 0 &&
    html.indexOf('src="room.js"') < html.indexOf('src="net.js"'));

  const app = fs.readFileSync(path.join(ROOT, g, "app.js"), "utf8");
  ok(g + " tells the door who it is",
    new RegExp('Room\\.configure\\([^)]*game:\\s*"' + g + '"').test(app));

  const sw = fs.readFileSync(path.join(ROOT, g, "sw.js"), "utf8");
  ok(g + " caches room.js for offline", sw.indexOf("room.js") >= 0);
}

/* the mailbox has to know about every game that knocks on it */
const fn = fs.readFileSync(path.join(ROOT, "netlify", "functions", "room.js"), "utf8");
const listed = (fn.match(/const GAMES = \[([^\]]*)\]/) || [])[1] || "";
for (const g of GAMES) {
  ok("the mailbox answers to '" + g + "'", listed.indexOf("'" + g + "'") >= 0, listed);
}

console.log("");
if (fails) { console.log("FAILED: " + fails + " problem" + (fails === 1 ? "" : "s")); process.exit(1); }
console.log("the copies are honest");
