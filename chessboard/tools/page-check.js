/* page-check.js — dev-only. Loads /chessboard/ in headless Chromium against an
   in-process static server and checks that the page holds together:

   - kit.bin parses and both 3D stages come up, with no console errors;
   - every chapter of the story can be reached with the scrubber;
   - the print plan, the parts list and the latch explorer render;
   - the latch model gives the numbers the design notes promise
     (peak close ≈ 329 g, peak hold ≈ 633 g, 0.08 mm preload when shut);
   - every download link points at a file that exists.

   Run:  node chessboard/tools/page-check.js [screenshot-dir]
*/
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const SHOTS = process.argv[2] || null;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".bin": "application/octet-stream",
  ".zip": "application/zip", ".3mf": "model/3mf", ".json": "application/json" };

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? "  ok " : "FAIL "} ${msg}`); if (!cond) failures++; };

// ---- downloads exist
const html = fs.readFileSync(path.join(ROOT, "chessboard/index.html"), "utf8");
const hrefs = [...html.matchAll(/href="(files\/[^"]+)"/g)].map((m) => m[1]);
ok(hrefs.length >= 6, `${hrefs.length} download links`);
for (const h of new Set(hrefs)) ok(fs.existsSync(path.join(ROOT, "chessboard", h)), `download exists: ${h}`);
const imgs = [...html.matchAll(/(?:src|data-src)="(img\/[^"]+)"/g)].map((m) => m[1]);
for (const s of new Set(imgs)) ok(fs.existsSync(path.join(ROOT, "chessboard", s)), `image exists: ${s}`);

const CHROME = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium",
  "/usr/bin/chromium", "/usr/bin/chromium-browser"].find((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } });
let pw;
try { pw = require("playwright"); } catch { pw = null; }
if (!pw) { console.log("no playwright here — skipping the browser half."); process.exit(failures ? 1 : 0); }

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  const body = fs.readFileSync(f);
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] || "application/octet-stream", "content-length": body.length });
  res.end(body);
});

(async () => {
  await new Promise((r) => server.listen(0, r));
  const port = server.address().port;
  const browser = await pw.chromium.launch({ ...(CHROME ? { executablePath: CHROME } : {}),
    args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const errors = [];
  for (const vp of [{ name: "desktop", width: 1360, height: 900 }, { name: "phone", width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1 });
    page.on("console", (m) => { if (m.type() === "error") errors.push(`${vp.name}: ${m.text()}`); });
    page.on("pageerror", (e) => errors.push(`${vp.name}: ${e.message}`));
    await page.goto(`http://localhost:${port}/chessboard/`, { waitUntil: "load" });
    await page.waitForFunction(() => document.querySelector("#storyLoading")?.classList.contains("done"), null, { timeout: 60000 });
    ok(true, `${vp.name}: model loaded`);
    const noScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
    const wide = noScroll ? [] : await page.evaluate(() => [...document.querySelectorAll("body *")]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".tableWrap"))
      .slice(0, 6).map((e) => `${e.tagName.toLowerCase()}.${e.className} → ${Math.round(e.getBoundingClientRect().right)}`));
    ok(noScroll, `${vp.name}: no sideways scroll${wide.length ? " (" + wide.join(", ") + ")" : ""}`);
    ok(await page.$$eval("#plates .plate", (e) => e.length) === 5, `${vp.name}: five plates`);
    ok(await page.$$eval("#partList button", (e) => e.length) === 6, `${vp.name}: six parts`);
    ok(await page.$$eval("#chapters button", (e) => e.length) === 6, `${vp.name}: six chapters`);

    if (vp.name === "desktop") {
      // the latch, driven through its own slider
      const at = async (s, dir = "close") => page.evaluate(([s, dir]) => {
        document.querySelector(`[data-dir="${dir}"]`).click();
        const r = document.querySelector("#latchS"); r.value = String(s); r.dispatchEvent(new Event("input"));
        return { d: document.querySelector("#roD").textContent, f: document.querySelector("#roF").textContent };
      }, [s, dir]);
      let peak = 0, hold = 0;
      for (let s = 2.0; s >= 0; s -= 0.01) {
        peak = Math.max(peak, parseInt((await at(s, "close")).f, 10));
      }
      for (let s = 0; s <= 1.0; s += 0.01) hold = Math.max(hold, parseInt((await at(s, "open")).f, 10));
      ok(Math.abs(peak - 329) <= 12, `latch peak close ${peak} g (design notes: 329)`);
      ok(Math.abs(hold - 633) <= 20, `latch peak hold ${hold} g (design notes: 633)`);
      ok((await at(0, "close")).d === "0.08 mm", "latch preload 0.08 mm when shut");
    }

    const shot = async (name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${vp.name}-${name}.png`) }); };
    // pause, then visit each chapter with the scrubber
    await page.click("#playBtn");
    await page.locator("#stage").scrollIntoViewIfNeeded();
    for (const [name, t] of [["closed", 0.4], ["open", 3.8], ["unpack", 6.2], ["flip", 9.1], ["setup", 14.2], ["play", 20.5]]) {
      await page.evaluate((v) => { const s = document.querySelector("#scrub"); s.value = String(Math.round(v / 20.6 * 1000)); s.dispatchEvent(new Event("input")); }, t);
      await page.waitForTimeout(400);
      await shot(`story-${name}`);
    }
    if (SHOTS) {
      await page.screenshot({ path: path.join(SHOTS, `${vp.name}-full.png`), fullPage: true });
      for (const id of ["fit", "lid", "tray", "marble", "tiles"]) {
        await page.locator("#parts").scrollIntoViewIfNeeded();
        await page.click(`#partList [data-id="${id}"]`);
        await page.click("#spinBtn").catch(() => {});
        await page.waitForTimeout(400);
        await page.locator(".partsGrid").screenshot({ path: path.join(SHOTS, `${vp.name}-part-${id}.png`) });
      }
      await page.click(`#partList [data-id="lid"]`);
      await page.click("#faceBtn");
      await page.waitForTimeout(400);
      await page.locator(".partsGrid").screenshot({ path: path.join(SHOTS, `${vp.name}-part-lid-face.png`) });
      await page.locator("#latch").scrollIntoViewIfNeeded();
      await page.locator(".latchGrid").screenshot({ path: path.join(SHOTS, `${vp.name}-latch.png`) });
    }
    await page.close();
  }
  ok(errors.length === 0, `no console errors${errors.length ? ":\n    " + errors.join("\n    ") : ""}`);
  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} failed` : "\nall good");
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
