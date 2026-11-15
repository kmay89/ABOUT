/* make-icons.js — dev-only. Paints the app icons with the game's own
   icon code (icons.js) in the pre-installed Chromium, and writes the PNGs.
   Run from the repo root: node sunlight/tools/make-icons.js            */
"use strict";
const path = require("path"), fs = require("fs");
const { chromium } = require("playwright");
const DIR = path.join(__dirname, "..");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto("file://" + path.join(DIR, "index.html"));
  const out = await p.evaluate(() => {
    function paint(S, pad) {
      const c = document.createElement("canvas"); c.width = c.height = S; const x = c.getContext("2d");
      const g = x.createRadialGradient(S / 2, S * 0.55, S * 0.05, S / 2, S / 2, S * 0.75); g.addColorStop(0, "#2a1e0c"); g.addColorStop(1, "#070605");
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      /* foxfire along a beam */
      for (let k = 0; k < 18; k++) { x.strokeStyle = "rgba(170,240,130," + (0.25 + (k % 3) * 0.12) + ")"; x.lineWidth = S / 240; x.beginPath(); let px = (k * 97) % S, py = S * (0.16 + (k % 2) * 0.05); x.moveTo(px, py); for (let s = 0; s < 8; s++) { px += S / 40; py += Math.sin(k + s * 1.7) * S / 60; x.lineTo(px, py); } x.stroke(); }
      x.save(); const inner = S * (1 - pad * 2); x.translate(S * pad, S * pad + S * 0.06); x.scale(inner / 96, inner / 96); BS.icons.eye(x, 96); x.restore();
      return c.toDataURL("image/png");
    }
    return { a192: paint(192, 0.12), a512: paint(512, 0.12), m512: paint(512, 0.22), apple: paint(180, 0.14) };
  });
  const w = (n, d) => fs.writeFileSync(path.join(DIR, "icons", n), Buffer.from(d.split(",")[1], "base64"));
  w("icon-192.png", out.a192); w("icon-512.png", out.a512); w("icon-maskable-512.png", out.m512); w("apple-touch-icon.png", out.apple);
  await b.close();
  console.log("icons written");
})();
