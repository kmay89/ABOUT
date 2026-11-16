/* version-check.js — dev-only. Is this a release a player will be told about, and get whole?

   Run it before pushing a change to the game:

     node sunlight/tools/version-check.js

   It fails if
     · version.js does not hold exactly one version, of the form 1.2.3;
     · the worker (sw.js) does not take its name from version.js, or carries a
       number of its own;
     · the worker does not keep a copy of every script, stylesheet and typeface
       the page loads (with no signal the game would be half there);
     · the bar on the loading screen has the wrong count of scripts
       (data-n on #boot in index.html);
     · anything under sunlight/ differs from origin/main and the version is not
       higher than main's. That is a release nobody would hear about: the
       loading screen takes an update when the version changes. (Skipped, with
       a note, where there is no git or no origin/main to compare with.)

   Node only, nothing to install. */
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DIR = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(DIR, f), "utf8");
let bad = 0;
const ok = (c, msg, more) => { console.log((c ? "  ✓ " : "  ✗ ") + msg + (more ? "  (" + more + ")" : "")); if (!c) bad++; };
const parse = (text) => { const all = [...text.matchAll(/SUNLIGHT_VERSION\s*=\s*"([^"]*)"/g)].map((m) => m[1]); return all.length === 1 ? all[0] : null; };
const newer = (a, b) => { const x = a.split(".").map(Number), y = b.split(".").map(Number); for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; };

const ver = parse(read("version.js"));
ok(!!ver && /^\d+\.\d+\.\d+$/.test(ver), "version.js names one release", ver || "none, or more than one");

const sw = read("sw.js"), swCode = sw.replace(/\/\*[\s\S]*?\*\//g, "");
ok(/importScripts\("\.\/version\.js"\)/.test(swCode) && /VERSION\s*=\s*"sunlight-"\s*\+\s*self\.SUNLIGHT_VERSION/.test(swCode), "the worker takes its name from version.js");
ok(!/sunlight-v?\d/.test(swCode), "and has no number of its own");

const html = read("index.html"), css = read("look.css");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
const faces = [...new Set([...css.matchAll(/url\((fonts\/[^)]+)\)/g)].map((m) => m[1].replace(/["']/g, "")))];
const kept = (f) => swCode.includes('"./' + f + '"');
const lost = scripts.concat(sheets, faces).filter((f) => !kept(f));
ok(lost.length === 0, "the worker keeps every script, stylesheet and typeface the page loads (" + (scripts.length + sheets.length + faces.length) + ")", lost.join(", "));
const gone = scripts.concat(sheets, faces).filter((f) => !fs.existsSync(path.join(DIR, f)));
ok(gone.length === 0, "and every one of them is a file that is there", gone.join(", "));

const after = scripts.length - scripts.indexOf("boot.js") - 1 + (html.match(/<script>(?![^<]*sessionStorage)/g) || []).length;
const n = +(/id="boot"[^>]*data-n="(\d+)"/.exec(html) || [])[1];
ok(scripts.indexOf("version.js") === 0 && scripts.indexOf("boot.js") === 1, "version.js and boot.js are the first two scripts on the page");
ok(n === after, "the loading bar counts the scripts that follow boot.js", "data-n " + n + ", there are " + after);

let main = null, differs = null;
try {
  const git = (args) => execFileSync("git", args, { cwd: DIR, stdio: ["ignore", "pipe", "ignore"] }).toString();
  git(["rev-parse", "--verify", "origin/main"]);
  try { execFileSync("git", ["diff", "--quiet", "origin/main", "--", "."], { cwd: DIR, stdio: "ignore" }); differs = false; } catch (e) { differs = true; }
  try { main = parse(git(["show", "origin/main:sunlight/version.js"])); } catch (e) { main = ""; }
} catch (e) { console.log("  · no git, or no origin/main: not compared with what is live"); }
if (differs === false) console.log("  · the same as origin/main: nothing to release");
if (differs === true) ok(!main || (ver && newer(ver, main)), "the game differs from origin/main, and its version is higher", main ? ver + " against main's " + main : ver + "; main has no version yet");

console.log(bad ? "\n" + bad + " thing" + (bad > 1 ? "s" : "") + " to put right before this goes out" : "\nready: " + ver);
process.exit(bad ? 1 : 0);
