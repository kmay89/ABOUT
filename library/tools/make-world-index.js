/* make-world-index.js — writes library/world/index.json.

   The page preloads every region file in library/world/, and this is
   how it knows what is there: a JSON list of filenames, regenerated on
   every deploy (see the build command in netlify.toml). Drop a new
   r.<x>.<z>.mca into the folder and it is in the next deploy's world —
   no list to maintain by hand, nothing else to touch.

   Also runs fine locally; a committed index.json keeps `python3 -m
   http.server` working without ever running this.                     */
"use strict";
var fs = require("fs"), path = require("path");

var dir = path.join(__dirname, "..", "world");
var names = [];
try {
  names = fs.readdirSync(dir).filter(function (n) {
    return /^r\.-?\d+\.-?\d+\.mca$/.test(n);
  }).sort();
} catch (e) { /* no folder yet: an empty list is the honest answer */ }

fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "index.json"), JSON.stringify(names) + "\n");
console.log("world index: " + names.length + " region file(s)" +
  (names.length ? " — " + names.join(", ") : ""));
