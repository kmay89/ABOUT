/* room-check.js — dev-only. Opens the actual room in an actual browser
   and plays it.

   Every other check in this folder tests a module in isolation, in
   node, where there is no canvas and no WebGL and nothing can be
   clicked. They are the checks that catch wrong *thinking*. This one
   catches the other kind: a typo in an id, a listener wired to a button
   that isn't there, a shader that will not compile, a settings pane
   that throws the moment it opens.

   It drives headless Chromium through the things a person does in the
   first two minutes — start a match, tap a bone, play it, ask for a
   hint, open the counting panel, change the colours, switch to 2D and
   back, open the join door — and fails on any console error at all.

   Needs `playwright-core`; the browser is already on the machine. If
   playwright is missing it says so and exits 0, so the check is a bonus
   rather than a barrier on a machine that hasn't got it.

   Run: node tools/room-check.js [--head] [--verbose]                  */
"use strict";

var path = require("path");
var http = require("http");
var fs = require("fs");

var VERBOSE = process.argv.indexOf("--verbose") >= 0;
var pass = 0, fail = 0, failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; if (VERBOSE) console.log("  ok  " + name); }
  else { fail++; failures.push(name); console.log("FAIL  " + name + (detail ? " — " + detail : "")); }
}

var pw;
try { pw = require("playwright-core"); }
catch (e) {
  console.log("playwright-core is not installed — skipping the browser check.");
  console.log("  npm i --no-save playwright-core");
  process.exit(0);
}

var CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
if (!fs.existsSync(CHROME)) {
  var alt = ["/opt/pw-browsers/chromium/chrome-linux/chrome", "/usr/bin/chromium", "/usr/bin/google-chrome"];
  CHROME = alt.filter(function (p) { return fs.existsSync(p); })[0] || null;
}
if (!CHROME) { console.log("no chromium on this machine — skipping the browser check."); process.exit(0); }

var ROOT = path.join(__dirname, "..");
var TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json",
              ".webmanifest": "application/manifest+json", ".png": "image/png", ".css": "text/css" };

function serve() {
  return new Promise(function (res) {
    var srv = http.createServer(function (req, rep) {
      var f = req.url.split("?")[0];
      if (f === "/") f = "/index.html";
      var p = path.join(ROOT, path.normalize(f).replace(/^(\.\.[/\\])+/, ""));
      fs.readFile(p, function (err, buf) {
        if (err) { rep.writeHead(404); rep.end("no"); return; }
        rep.writeHead(200, { "Content-Type": TYPES[path.extname(p)] || "application/octet-stream" });
        rep.end(buf);
      });
    });
    srv.listen(0, "127.0.0.1", function () { res(srv); });
  });
}

/* a canvas that is one flat colour has not drawn anything */
var VARIED = "(() => { const c = document.getElementById('table');" +
  "const g = c.getContext('webgl') || c.getContext('2d');" +
  "let px; if (g && g.readPixels) { px = new Uint8Array(c.width*c.height*4); g.readPixels(0,0,c.width,c.height,g.RGBA,g.UNSIGNED_BYTE,px); }" +
  "else { px = c.getContext('2d').getImageData(0,0,c.width,c.height).data; }" +
  "const seen = new Set(); for (let i=0;i<px.length;i+=4*97) seen.add(px[i]+','+px[i+1]+','+px[i+2]);" +
  "return seen.size; })()";

/* A hand can end at any moment of the check — the machines keep
   playing while it clicks about — and the end sheet then covers the
   menu. So before anything is clicked, a finished hand is dealt on and
   a question is answered, the way a player would. */
async function settle(page) {
  for (var i = 0; i < 3; i++) {
    if (await page.isVisible("#ovEnd")) { await page.click("#endNext"); await page.waitForTimeout(1700); continue; }
    if (await page.isVisible("#ovAsk")) { await page.click("#askRow .btn"); await page.waitForTimeout(300); continue; }
    break;
  }
}

/* ---------- carrying a bone to an end ----------
   A finger that lands on a bone and moves is carrying it; letting go
   over an end plays it there. Driven with the real mouse, through the
   real hit tests, in whichever renderer is on. */
async function dragOne(page, label) {
  var waited = 0;
  while (waited < 30000) {
    var mine = await page.evaluate("(()=>{const g=window.__dt().G;return g.view && g.view.turn === g.mySeat && !g.busy && window.AI.movesFor(g.view).length > 0;})()");
    if (mine) break;
    /* a turn with nothing to play is said for us; otherwise wait —
       and a hand that ended meanwhile is dealt on */
    await settle(page);
    await page.waitForTimeout(300); waited += 300;
  }
  if (waited >= 30000) { ok(label + ": a turn with a playable bone comes round", false, "waited " + waited + "ms"); return; }
  var spot = await page.evaluate(
    "(()=>{const d=window.__dt(),s=d.scene(),L=window.Layout;" +
    "const r=L.handRow(s.hand.length, d.over.w, d.over.h, {pad:10});" +
    "for(let i=0;i<s.hand.length;i++){ if(s.playable[s.hand[i]]) return {x:r[i].x+r[i].w/2,y:r[i].y+r[i].h/2,tile:s.hand[i]}; }" +
    "return null;})()");
  var box = await page.evaluate("(()=>{const r=document.getElementById('stage').getBoundingClientRect();return {x:r.left,y:r.top};})()");
  var before = await page.evaluate("window.__dt().G.view.hand.length");
  await page.mouse.move(box.x + spot.x, box.y + spot.y);
  await page.mouse.down();
  await page.mouse.move(box.x + spot.x + 4, box.y + spot.y - 40, { steps: 5 });
  await page.waitForTimeout(120);
  var dragging = await page.evaluate("(()=>{const g=window.__dt().G;return !!(g.drag && g.drag.tile === " + spot.tile + ");})()");
  ok(label + ": a bone that is moved is picked up, not tapped", dragging);
  /* where is a slot on the screen? */
  var slot = await page.evaluate(
    "(()=>{const d=window.__dt(),s=d.scene(); if(!s.ghosts.length) return null; const gh=s.ghosts[0];" +
    "if(d.gfx.kind==='3d'){ const p=d.gfx.screenOf(gh.x, gh.y, 0); return p ? {x:p.x,y:p.y,end:gh.end} : null; }" +
    "const sl=d.gfx.slots[0]; return sl ? {x:sl.x+sl.w/2, y:sl.y+sl.h/2, end:sl.end} : null; })()");
  ok(label + ": the open end it fits is marked on the table", !!slot);
  if (!slot) { await page.mouse.up(); return; }
  await page.mouse.move(box.x + slot.x, box.y + slot.y, { steps: 8 });
  await page.waitForTimeout(150);
  var over = await page.evaluate("(()=>{const g=window.__dt().G;return g.drag ? g.drag.over : null;})()");
  ok(label + ": carried over the slot, the slot says so", over === slot.end, "over " + over + " wanted " + slot.end);
  await page.mouse.up();
  await page.waitForTimeout(350);
  var after = await page.evaluate("window.__dt().G.view.hand.length");
  ok(label + ": letting go there plays it", after === before - 1, "hand " + before + "→" + after);
  var left = await page.evaluate("(()=>{const g=window.__dt().G;return !g.drag && g.sel === null;})()");
  ok(label + ": and nothing is left in the fingers", left);
}

/* ---------- the pips, read back off the screen ----------
   layout-check proves which half of every bone touches its neighbour.
   This reads the *picture*: for each half it samples the nine places a
   pip can be and counts the dark ones, in both renderers, and requires
   the count to be the number the layout says that half shows. A bone
   drawn back to front, a texture mapped the wrong way round, a renderer
   turning its pips twice — all would read wrong here and nowhere else. */
var KNOWN = "(()=>{const R=window.Rules,d=window.__dt();const t=(a,b)=>R.tileId(a,b);" +
  "d.G.view.line=[{tile:t(6,6),end:'S',flip:false,dbl:true,seat:1},{tile:t(4,6),end:'R',flip:false,dbl:false,seat:2}," +
  "{tile:t(3,6),end:'L',flip:false,dbl:false,seat:3},{tile:t(2,4),end:'R',flip:false,dbl:false,seat:0}," +
  "{tile:t(3,3),end:'L',flip:false,dbl:true,seat:1},{tile:t(1,2),end:'R',flip:false,dbl:false,seat:2}," +
  "{tile:t(0,3),end:'L',flip:false,dbl:false,seat:3}];" +
  "d.G.anim=null;d.G.lastIdx=-1;d.G.st=null;d.G.busy=true;d.G.sel=null;d.G.drag=null;return d.G.view.line.length;})()";
var READBACK = "(()=>{" +
  "const d=window.__dt(), s=d.scene(), L=window.Layout, g=d.gfx, cv=document.getElementById('table');" +
  "const W=cv.width, H=cv.height; let px, flip;" +
  "if (g.kind==='3d'){ const gl=cv.getContext('webgl'); px=new Uint8Array(W*H*4); gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,px); flip=true; }" +
  "else { px=cv.getContext('2d').getImageData(0,0,W,H).data; flip=false; }" +
  "const lum=(X,Y)=>{ X=Math.round(X); Y=Math.round(Y); if(X<0||Y<0||X>=W||Y>=H) return null; if(flip) Y=H-1-Y; const k=(Y*W+X)*4; return 0.299*px[k]+0.587*px[k+1]+0.114*px[k+2]; };" +
  "const dpr=g.dpr||1; let toScreen, unit, geo;" +
  /* where the pips are on each renderer's face: the round table maps the
     atlas onto the face *inside* the chamfer, so its halves and pips sit
     a little nearer the middle than the flat table's */
  "if (g.kind==='3d'){ const c=window.Gfx3D.CHAMFER, ix=1-c, iy=0.5-c; geo={hc:ix/2, sa:0.29*ix, sc:0.29*2*iy};" +
  "  toScreen=(x,y)=>{ const p=g.screenOf(x,y,window.Gfx3D.HZ); return p?{x:p.x*dpr,y:p.y*dpr}:null; }; }" +
  "else { const ed=g.edges(), top=s.topPad, bot=s.botPad; const fit=L.fit(s.table.bbox, g.w-ed.all*2, g.h-top-bot, 10); unit=fit.scale;" +
  "  geo={hc:0.5, sa:0.30, sc:0.30}; toScreen=(x,y)=>({x:(fit.ox+ed.all+x*unit)*dpr, y:(fit.oy+top+y*unit)*dpr}); }" +
  "const out=[];" +
  "for (const b0 of s.table.bones){ const jj=window.Gfx3D.jit(b0.tile, b0.h); const b={x:b0.x+jj.dx, y:b0.y+jj.dy, rot:b0.rot+jj.dr*57.3, tile:b0.tile, end:b0.end, inner:b0.inner, outer:b0.outer};" +
  "  const r=b.rot*Math.PI/180, C=Math.cos(r), S=Math.sin(r), f=L.faces(b);" +
  "  const halves=[[-geo.hc,f[0]],[geo.hc,f[1]]]; const got=[];" +
  "  for (const [hx,n] of halves){ const vals=[];" +
  "    for (let i=0;i<3;i++) for (let j=0;j<3;j++){ const lx=hx+(i-1)*geo.sa, ly=(j-1)*geo.sc;" +
  "      const x=b.x+lx*C-ly*S, y=b.y+lx*S+ly*C; const p=toScreen(x,y); const v=p?lum(p.x,p.y):null; if(v!==null) vals.push(v); }" +
  "    if (vals.length<9){ got.push(-1); continue; }" +
  "    const mx=Math.max(...vals), mn=Math.min(...vals); const dark=(mx-mn)<60?0:vals.filter(v=>v<(mx+mn)/2).length;" +
  "    got.push(dark); }" +
  "  out.push({tile:window.Rules.name(b.tile), end:b.end, want:[f[0],f[1]], got:got}); }" +
  "return out; })()";
async function readback(page, label) {
  var n = await page.evaluate(KNOWN);
  await page.waitForTimeout(1100);          /* the camera eases to the new line */
  var rb = await page.evaluate(READBACK);
  var bad = rb.filter(function (b) { return b.got[0] !== b.want[0] || b.got[1] !== b.want[1]; });
  ok(label + ": every half of every bone shows the number the rules say", bad.length === 0,
     bad.map(function (b) { return b.tile + " on " + b.end + " wants " + b.want.join("|") + " reads " + b.got.join("|"); }).join("; "));
  ok(label + ": all " + n + " bones were read", rb.length === n && rb.every(function (b) { return b.got[0] >= 0 && b.got[1] >= 0; }));
  /* the one that used to be wrong: the 6|4 on the right of the 6|6 */
  var six4 = rb[1];
  ok(label + ": the 6|4 shows its 6 to the mula and its 4 to the open end", !!six4 && six4.got[0] === 6 && six4.got[1] === 4,
     six4 ? six4.got.join("|") : "missing");
}

(async function main() {
  var srv = await serve();
  var port = srv.address().port;
  var base = "http://127.0.0.1:" + port + "/";

  var browser = await pw.chromium.launch({
    executablePath: CHROME,
    headless: process.argv.indexOf("--head") < 0,
    args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"]
  });
  var ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  var page = await ctx.newPage();

  var errors = [];
  page.on("console", function (m) { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", function (e) { errors.push("pageerror: " + e.message); });

  await page.goto(base, { waitUntil: "networkidle" });

  /* ---------- it boots ---------- */
  ok("the room loads without a console error", errors.length === 0, errors.slice(0, 3).join(" | "));
  ok("the splash is up", await page.isVisible("#splash"));
  var mods = await page.evaluate("[!!window.Rules,!!window.Layout,!!window.AI,!!window.Coach,!!window.Skins,!!window.Gfx2D,!!window.Gfx3D,!!window.Net].every(Boolean)");
  ok("every module is on the page", mods === true);

  /* ---------- a newcomer's table ----------
     A fresh profile is unhurried, is welcomed, and is not played past
     while a tip is up: the machines wait for "Got it". */
  var fresh = await page.evaluate("(()=>{const d=window.__dt(); return {pace:d.P.pace, hands:d.P.hands, hold:d.P.coachHold};})()");
  ok("a newcomer's table is unhurried", fresh.pace === "slow" && fresh.hands === 0 && fresh.hold, JSON.stringify(fresh));

  /* ---------- a match starts ---------- */
  await page.click("#goSolo");
  await page.waitForTimeout(1900);
  ok("the splash gets out of the way", !(await page.isVisible("#splash")));
  var welcome = await page.evaluate("(()=>{const c=document.getElementById('chuy'); return {up:!c.classList.contains('off'), txt:document.getElementById('chuySay').textContent, btn:document.getElementById('chuyClose').textContent};})()");
  ok("and a first-timer is welcomed", welcome.up && /Welcome/.test(welcome.txt), welcome.txt.slice(0, 50));
  ok("with a tip that waits to be read", /Got it/.test(welcome.btn), welcome.btn);
  var held = await page.evaluate(`(async () => {
    const d = window.__dt(); const t0 = performance.now(); let moved = 0; const line0 = d.G.view.line.length;
    while (performance.now() - t0 < 4500) { await new Promise(r => setTimeout(r, 100)); if (d.G.thinking >= 0 || d.G.view.line.length > line0) moved++; }
    return { moved, learning: d.learning(), up: d.coachUp(), turn: d.G.view.turn, mine: d.G.view.turn === d.G.mySeat };
  })()`);
  ok("the machines wait while it is up", held.mine || held.moved === 0, JSON.stringify(held));
  await page.click("#chuyClose");
  await page.waitForTimeout(300);
  var next = await page.evaluate("(()=>{const d=window.__dt(); return {up:d.coachUp(), txt:document.getElementById('chuySay').textContent};})()");
  ok("and Got it puts it away, showing the next tip if one waited", !/Welcome/.test(next.txt), next.txt.slice(0, 40));
  /* read the rest of the queue; then the check runs at a player's pace, tips fading */
  for (var tq = 0; tq < 4 && (await page.evaluate("window.__dt().coachUp()")); tq++) { await page.click("#chuyClose"); await page.waitForTimeout(150); }
  await page.evaluate("(()=>{const d=window.__dt(); d.P.pace='relaxed'; d.P.coachHold=false;})()");

  var colours = await page.evaluate(VARIED);
  ok("the table actually draws something", colours > 4, colours + " distinct samples");

  var renderer = await page.evaluate("window.__dt().gfx.kind");
  ok("it came up in 3D", renderer === "3d", "got " + renderer);


  var st = await page.evaluate("(()=>{const g=window.__dt().G;return {seat:g.mySeat,hand:g.view.hand.length,turn:g.view.turn,line:g.view.line.length};})()");
  ok("you have seven bones", st.hand === 7, "got " + st.hand);
  ok("and a seat at the table", st.seat === 0);

  /* the first hand of a match is opened by the 6|6 */
  var opener = await page.evaluate("(()=>{const g=window.__dt().G;return g.st.mustLeadMula;})()");
  ok("the first hand must be opened with the mula de seis", opener === true);

  /* ---------- playing ---------- */
  /* wait for our turn — the opener may be one of the others */
  /* wait for our turn — the opener may be one of the others — and for
     one with a bone to play: a turn with nothing that fits is said for
     us (paso) and comes round again */
  var waited = 0;
  while (waited < 30000) {
    var mine = await page.evaluate("(()=>{const g=window.__dt().G;return g.view.turn === g.mySeat && !g.busy && window.AI.movesFor(g.view).length > 0;})()");
    if (mine) break;
    await page.waitForTimeout(300); waited += 300;
  }
  ok("the turn comes round to you", waited < 30000, "waited " + waited + "ms");

  var before = await page.evaluate("window.__dt().G.view.hand.length");
  /* tap the first playable bone where it actually is on screen */
  var spot = await page.evaluate(
    "(()=>{const d=window.__dt(),s=d.scene(),L=window.Layout;" +
    "const r=L.handRow(s.hand.length, d.gfx.w, d.gfx.h, {pad:10});" +
    "for(let i=0;i<s.hand.length;i++){ if(s.playable[s.hand[i]]) return {x:r[i].x+r[i].w/2,y:r[i].y+r[i].h/2}; }" +
    "return null;})()");
  ok("at least one bone in hand can be played", !!spot);
  if (spot) {
    var box = await page.evaluate("(()=>{const r=document.getElementById('stage').getBoundingClientRect();return {x:r.left,y:r.top};})()");
    /* the tap is dispatched from inside the page at the bone's own
       rectangle, in the same breath as reading it, so a hand that
       changes between the look and the tap cannot fool the check */
    var tapped = await page.evaluate("(()=>{const d=window.__dt(),s=d.scene(),L=window.Layout,st=document.getElementById('stage'),r0=st.getBoundingClientRect();" +
      "const r=L.handRow(s.hand.length, d.over.w, d.over.h, {pad:10}); let i=-1; for(let k=0;k<s.hand.length;k++){ if(s.playable[s.hand[k]]){ i=k; break; } } if(i<0) return null;" +
      "const x=r0.left+r[i].x+r[i].w/2, y=r0.top+r[i].y+r[i].h/2; const ev=(t)=>new PointerEvent(t,{bubbles:true,clientX:x,clientY:y,pointerId:7,isPrimary:true});" +
      "st.dispatchEvent(ev('pointerdown')); st.dispatchEvent(ev('pointerup')); return {tile:s.hand[i], sel:d.G.sel}; })()");
    await page.waitForTimeout(400);
    var after = await page.evaluate("window.__dt().G.view.hand.length");
    /* two steps: the tap picks it up, and nothing is played yet */
    var lifted = await page.evaluate("(()=>{const g=window.__dt().G; return {sel:g.sel, hand:g.view.hand.length, pick:!document.getElementById('endPick').classList.contains('hide'), btn:document.getElementById('btnPlay').textContent};})()");
    ok("tapping a bone picks it up and plays nothing", !!tapped && lifted.sel === tapped.tile && after === before, "aimed " + (tapped && tapped.tile) + ", sel " + lifted.sel + ", hand " + before + "→" + after);
    ok("and the table offers where to lay it", lifted.pick && /Lay|Tap an end/.test(lifted.btn), lifted.btn);
    /* the second step: the spot on the table */
    var slot2 = await page.evaluate(
      "(()=>{const d=window.__dt(),s=d.scene(); if(!s.ghosts.length) return null; const gh=s.ghosts[0];" +
      "if(d.gfx.kind==='3d'){ const p=d.gfx.screenOf(gh.x, gh.y, 0); return p?{x:p.x,y:p.y}:null; } const sl=d.gfx.slots[0]; return sl?{x:sl.x+sl.w/2,y:sl.y+sl.h/2}:null; })()");
    ok("the spot is marked on the table", !!slot2);
    if (slot2) {
      await page.mouse.click(box.x + slot2.x, box.y + slot2.y);
      await page.waitForTimeout(400);
      var after2 = await page.evaluate("window.__dt().G.view.hand.length");
      ok("tapping the spot lays it down", after2 === before - 1, "hand " + before + "→" + after2);
      /* and the table says how it felt, once the bone has landed */
      var felt = await page.evaluate(`(async () => { const t0 = performance.now(); while (performance.now() - t0 < 4000) { const g = document.getElementById('grade'); if (g.classList.contains('on')) return g.textContent; await new Promise(r => setTimeout(r, 50)); } return null; })()`);
      var hadChoice = await page.evaluate("(()=>{const d=window.__dt(); return (d.G.hs && d.G.hs.graded) ? true : false;})()");
      ok("and the table says how the play felt", !hadChoice || (!!felt && /Sharp|Good|Okay|Costly/.test(felt)), hadChoice ? (felt || "nothing shown") : "a forced play is not graded");
    }
  }

  /* ---------- the room ----------
     Bulbs and papel picado over the table, and faces on the plates.
     Decoration that could catch a tap would be a bug; it cannot. */
  var fiesta = await page.evaluate("(()=>{const sv=document.querySelector('#stage > svg.fiesta'); if(!sv) return null;" +
    "return {flags:sv.querySelectorAll('.flag').length, bulbs:sv.querySelectorAll('.glow').length, pe:getComputedStyle(sv).pointerEvents," +
    "splash:!!document.querySelector('#splash > svg.fiesta')};})()");
  ok("papel picado hangs over the table", !!fiesta && fiesta.flags >= 6, fiesta ? fiesta.flags + " flags" : "no layer");
  ok("under a string of bulbs", !!fiesta && fiesta.bulbs >= 4, fiesta ? fiesta.bulbs + " bulbs" : "");
  ok("and none of it can catch a tap", !!fiesta && fiesta.pe === "none", fiesta ? fiesta.pe : "");
  ok("the door is dressed the same way", !!fiesta && fiesta.splash);
  var faces = await page.evaluate("(()=>{let n=0; for (const id of ['plate1','plate2','plate3']) if (document.querySelector('#'+id+' .av svg')) n++;" +
    "return {plates:n, me:!!document.querySelector('#me svg'), distinct:new Set([1,2,3].map(i=>document.querySelector('#plate'+i+' .av').getAttribute('data-h'))).size};})()");
  ok("every seat has a face", faces.plates === 3 && faces.me, faces.plates + " plates, me " + faces.me);
  ok("and they are three different people", faces.distinct === 3, faces.distinct + " distinct");

  /* ---------- carrying a bone, in 3D ---------- */
  await dragOne(page, "3D");

  /* let the machines play a while — this is where a bad rollout or a
     bad layout would throw */
  await page.waitForTimeout(6000);
  var played = await page.evaluate("window.__dt().G.view.line.length");
  ok("the hand plays on by itself", played >= 2, played + " bones down");
  ok("and nothing has thrown", errors.length === 0, errors.slice(0, 3).join(" | "));

  /* ---------- the bones have sides ----------
     "There is more than one colour on the canvas" is the check that let
     a table of flat white cards ship twice. A bone drawn without its
     sides still passes it, still passes every count of triangles, and
     still looks like a domino seen from directly overhead — the fault
     only exists at the angle a player actually sees.

     The obvious next test is a histogram: collect the bone-coloured
     pixels and look for a spread of brightness. It does not work, and
     it is worth saying why, because it looks like it should. Flattening
     the shader so every face takes the top face's light — a literal
     flat card — leaves that check green. The pips are drilled, so their
     bores and their antialiased rims supply a full ramp of tone inside
     the face on their own. The spread was never coming from the sides.

     So project instead of sampling blind. For each bone take the centre
     of its top face and the midpoint of whichever of its four walls
     most faces the camera, push both through the same proj·view the
     frame was drawn with, and read those two pixels. That compares the
     two surfaces that must differ, and nothing else. */
  /* let anything mid-slam land first — a bone in the air is not where
     the resting layout says it is */
  await page.waitForFunction("!window.__dt().scene().anim", null, { timeout: 4000 }).catch(function () {});
  var sides = await page.evaluate(
    "(() => {" +
    "const d = window.__dt(), g = d.gfx, s = d.scene(), cam = g.lastCam, L = window.Layout;" +
    "if (!cam) return {err:'no camera'};" +
    "const hx = L.LEN/2, hy = L.WID/2, hz = window.Gfx3D.HZ;" +
    "const cv = document.getElementById('table'), gl = cv.getContext('webgl');" +
    "const px = new Uint8Array(cv.width*cv.height*4);" +
    "gl.readPixels(0,0,cv.width,cv.height,gl.RGBA,gl.UNSIGNED_BYTE,px);" +
    "const mv = (m,v) => [0,1,2,3].map(r => m[r]*v[0]+m[4+r]*v[1]+m[8+r]*v[2]+m[12+r]*v[3]);" +
    "function lum(p){" +
    "  const c = mv(cam.proj, mv(cam.view, [p[0],p[1],p[2],1]));" +
    "  if (c[3] <= 0) return null;" +
    /* readPixels counts rows from the bottom, which is also which way
       NDC y runs, so no flip is needed here */
    "  const X = Math.round((c[0]/c[3]*0.5+0.5)*cv.width), Y = Math.round((c[1]/c[3]*0.5+0.5)*cv.height);" +
    "  if (X<2||Y<2||X>=cv.width-2||Y>=cv.height-2) return null;" +
    "  let a=0; for(let j=-1;j<=1;j++) for(let i=-1;i<=1;i++){" +
    "    const k=((Y+j)*cv.width+(X+i))*4; a+=0.299*px[k]+0.587*px[k+1]+0.114*px[k+2]; }" +
    "  return a/9; }" +
    "const out=[];" +
    /* the 3D world is layout with y negated and every turn negated with
       it (see gfx3d.js draw) — the check has to place the bone where the
       renderer did, or it reads felt */
    "for (const b of s.table.bones){" +
    "  const r=-b.rot*Math.PI/180, C=Math.cos(r), S=Math.sin(r), by=-b.y;" +
    "  const to=(lx,ly,lz)=>[b.x+lx*C-ly*S, by+lx*S+ly*C, lz];" +
    "  const top=lum(to(0,0,hz));" +
    "  let best=null,bd=-2;" +
    "  for (const w of [[0,-hy,0,-1],[0,hy,0,1],[-hx,0,-1,0],[hx,0,1,0]]){" +
    "    const n=[w[2]*C-w[3]*S, w[2]*S+w[3]*C, 0], p=to(w[0],w[1],-0.03);" +
    "    const dv=[cam.eye[0]-p[0],cam.eye[1]-p[1],cam.eye[2]-p[2]];" +
    "    const dd=(n[0]*dv[0]+n[1]*dv[1]+n[2]*dv[2])/Math.hypot(dv[0],dv[1],dv[2]);" +
    "    if(dd>bd){bd=dd;best=p;} }" +
    "  const side=lum(best);" +
    "  if(top&&side) out.push(+(side/top).toFixed(3)); }" +
    "return {ratios:out}; })()");
  ok("the bones can be measured", !!(sides.ratios && sides.ratios.length),
     sides.err || (sides.ratios || []).length + " bones");
  if (sides.ratios && sides.ratios.length) {
    /* The *best* wall on the table, not the average of them and not one
       chosen bone. Two things push a reading up towards 1.0 without
       anything being wrong: a bone in the middle of a folded line can
       have all four walls hidden behind neighbours, and a bone caught
       mid-slam is not where the resting layout says it is, so both
       samples land on felt. Both are noise in one direction only. A
       flat card cannot produce a *low* reading, so taking the minimum
       is immune to all of it — the check asks whether anywhere on this
       table a bone shows a wall clearly darker than its own face, which
       is exactly the thing that was missing.

       The real table reads 0.71-0.83 where a wall is visible. A shader
       flattened so every surface takes the top face's light could not
       get a single bone under 1.28, because the bevel then catches
       *more* light than the face does. Nowhere near each other. */
    var best = Math.min.apply(null, sides.ratios);
    ok("a bone is a solid, not a flat card — the wall facing you is darker than the face",
       best < 0.85,
       "best wall reads " + (best * 100).toFixed(0) + "% of its own face, across " +
       sides.ratios.length + " bones");
  }

  /* ---------- the table has a pulse ----------
     Three machines deciding as fast as they can is unreadable: bones
     appear and you work out backwards who put them there. A turn is
     three beats now — the seat says it is thinking, the play lands, and
     there is a pause to look at it before the next one starts. Measured
     rather than assumed, because a pace constant nobody reads is worth
     nothing. */
  var beats = await page.evaluate(`(async () => {
    const d = window.__dt();
    const stamps = [];
    let last = d.G.view.line.length;
    const t0 = performance.now();
    while (performance.now() - t0 < 24000 && stamps.length < 4) {
      await new Promise(r => setTimeout(r, 30));
      /* Keep the hand moving. It is the player's turn a quarter of the
         time and the room is quite right to sit there waiting — but a
         stalled window measures nothing, and the first version of this
         check reported "0 plays seen" for exactly that reason. */
      const g = d.G;
      if (g.view && g.view.turn === g.mySeat && !g.busy) {
        const mv = window.AI.movesFor(g.view);
        if (mv.length) d.tryPlay(mv[0].tile, mv[0].end);
        else d.doPass(g.mySeat);
      }
      const n = d.G.view.line.length;
      if (n > last) { stamps.push(performance.now()); last = n; }
    }
    const gaps = [];
    for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i-1]);
    return { gaps: gaps, n: stamps.length };
  })()`);

  ok("bones keep going down while you watch", beats.n >= 2, beats.n + " plays seen");
  if (beats.gaps.length) {
    var quickest = Math.min.apply(null, beats.gaps);
    /* relaxed is 1150ms of thinking plus up to 800 of spread plus 1050 to
       settle, so the tightest honest gap is about 2.2s; under 1.6s means
       the beats are not being waited on at all */
    ok("and never faster than a person could follow", quickest > 1600,
       "quickest gap " + Math.round(quickest) + "ms");
    console.log("      gaps between plays: " +
                beats.gaps.map(function (g) { return Math.round(g) + "ms"; }).join(", "));
  }

  /* and the table says who is doing what */
  var sawThinking = await page.evaluate(`(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 12000) {
      const el = document.getElementById('lastPlay');
      if (el && /thinking/.test(el.className)) return el.textContent;
      await new Promise(r => setTimeout(r, 40));
    }
    return null;
  })()`);
  ok("it names whoever is deciding", !!sawThinking && /thinking/i.test(sawThinking), sawThinking);
  /* and then what they did — waited for, not snatched, because the
     caption is showing "…is thinking" for a good second either side of
     the play and reading it at the wrong instant proves nothing */
  var sawPlay = await page.evaluate(`(async () => {
    const t0 = performance.now();
    while (performance.now() - t0 < 14000) {
      const t = document.getElementById('lastPlay').textContent || "";
      if (/played the|paso/i.test(t)) return t;
      await new Promise(r => setTimeout(r, 40));
    }
    return document.getElementById('lastPlay').textContent;
  })()`);
  ok("and says what they did", /played the \d\|\d|paso/i.test(sawPlay || ""), sawPlay);

  /* ---------- a person's pace ----------
     The think is scaled by the choice: one bone that fits goes down
     quickly, four take a look at the table. Measured on the real
     function with a real hand, many times, since it is random by design. */
  var think = await page.evaluate("(()=>{const d=window.__dt(), R=window.Rules; const st=R.newHand({seed:5}); let forced=0, open=0, n=0;" +
    "for (let i=0;i<60;i++){ for (let s2=0;s2<4;s2++){ const m=R.moves(st,s2).length; const t=d.thinkFor(st,s2); if(m<=1) forced+=t; else if(m>=3) open+=t; } n++; }" +
    "const cnt={f:0,o:0}; for (let s2=0;s2<4;s2++){ const m=R.moves(st,s2).length; if(m<=1) cnt.f++; else if(m>=3) cnt.o++; }" +
    "return {forced: cnt.f? forced/(n*cnt.f):null, open: cnt.o? open/(n*cnt.o):null, pace:d.P.pace};})()");
  ok("a forced bone goes down sooner than a real choice", think.forced === null || think.open === null || think.forced < think.open,
     "forced " + Math.round(think.forced || 0) + "ms, open " + Math.round(think.open || 0) + "ms (" + think.pace + ")");

  /* ---------- the moment a hand ends ----------
     Whoever went out, big, and what it was worth — before the sheet. */
  await page.evaluate("(()=>{const d=window.__dt(); d.finale({res:{how:'domino', team:0, winner:2, points:23, capicua:false, pipsBySeat:[0,5,8,10]}," +
    " scores:[23,0], over:false, history:[], target:100, hands:[[],[1,2],[],[4,5]], key:'cheer:test'});})()");
  await page.waitForTimeout(700);
  var ch = await page.evaluate("(()=>{const c=document.getElementById('cheer'); return {on:c.classList.contains('on'), txt:c.textContent, faces:c.querySelectorAll('svg').length, won:c.classList.contains('won')};})()");
  ok("a hand ending is celebrated before it is counted", ch.on && /Dominó/.test(ch.txt) && ch.faces >= 1, ch.txt.slice(0, 60));
  ok("with who went out and what it was worth", /went out/.test(ch.txt) && /to us/.test(ch.txt) && ch.won);
  await page.waitForTimeout(2300);
  ok("and then the count", await page.isVisible("#ovEnd"));
  await page.click("[data-close=ovEnd]");
  await page.waitForTimeout(200);

  /* ---------- a tap on the 3D table lands where it looks ----------
     `pointOnTable` inverts the view-projection to turn a pixel back
     into a place on the felt. It went untested at first, and it was
     wrong the whole time: the matrix helper multiplied its arguments in
     the reverse order, which the drawing never noticed (the shader
     multiplies proj and view itself) but which sent every tap on an end
     to the wrong spot. Nothing on screen looked amiss. */
  var aim = await page.evaluate(
    "(()=>{const d=window.__dt(); if(d.gfx.kind!=='3d') return null;" +
    "const c=d.gfx.lastCam; if(!c) return null;" +
    "const at=(fx,fy)=>{const p=d.gfx.pointOnTable(d.gfx.w*fx, d.gfx.h*fy); return p?[p.x,p.y]:null;};" +
    /* the line is framed in the free part of the screen between the plates
       and the hand, so "the middle" is the middle of that, not of the canvas */
    "const my=c.mid?c.mid.y/d.gfx.h:0.5;" +
    "return {mid:at(0.5,my), left:at(0.2,my), right:at(0.8,my), up:at(0.5,my-0.2)," +
    " cx:c.cx, cy:c.cy};})()");
  ok("the middle of the screen unprojects onto the table", !!(aim && aim.mid));
  if (aim && aim.mid && aim.left && aim.right && aim.up) {
    ok("and lands where the camera is looking",
       Math.hypot(aim.mid[0] - aim.cx, aim.mid[1] - aim.cy) < 1.5,
       "off by " + Math.hypot(aim.mid[0] - aim.cx, aim.mid[1] - aim.cy).toFixed(2));

    /* The check that actually bites. A reversed matrix product does not
       shift the answer a little — it collapses it, and *every* pixel
       comes back as the same point on the felt. That is invisible to a
       tolerance test around the centre (the collapsed point sits near
       the middle anyway, which is how the first version of this check
       passed against the bug it was written for). Distinct pixels
       landing in distinct places is the property that cannot survive
       it. */
    var spreadX = Math.abs(aim.right[0] - aim.left[0]);
    var spreadY = Math.abs(aim.up[1] - aim.mid[1]);
    ok("and taps to the left and right land apart", spreadX > 2,
       "only " + spreadX.toFixed(2) + " apart");
    ok("as do taps nearer and further up the table", spreadY > 0.5,
       "only " + spreadY.toFixed(2) + " apart");
  }

  /* ---------- the panels ---------- */
  await page.click("#btnHint");
  await page.waitForTimeout(300);
  var hint = await page.textContent("#chuySay");
  ok("the hint says something", !!hint && hint.length > 5, hint);

  await page.click("#btnCount");
  await page.waitForTimeout(300);
  ok("the counting panel opens", await page.isVisible("#ovCount"));
  var cells = await page.evaluate("document.querySelectorAll('#countBody .cs').length");
  ok("with a column for all seven suits", cells === 7, cells + "");
  await page.click("[data-close=ovCount]");
  await page.waitForTimeout(200);
  ok("and closes again", !(await page.isVisible("#ovCount")));

  await settle(page);
  await page.click("#btnMenu");
  await page.waitForTimeout(250);
  await page.click("#mLook");
  await page.waitForTimeout(500);
  ok("the colours pane opens", await page.isVisible("#ovLook"));
  var tiles = await page.evaluate("document.querySelectorAll('#gallery .tile').length");
  ok("the gallery shows the house tables", tiles >= 8, tiles + "");
  var swatches = await page.evaluate("document.querySelectorAll('#editor input[type=color]').length");
  ok("and every colour can be changed", swatches === 10, swatches + "");
  var sliders = await page.evaluate("document.querySelectorAll('#editor input[type=range]').length");
  ok("with sliders for the rest", sliders === 4, sliders + "");

  /* pick a different table and check it reaches the renderer */
  await page.click("#gallery .tile:nth-child(4)");
  await page.waitForTimeout(400);
  var felt = await page.evaluate("window.__dt().P.skin.table.felt");
  ok("choosing a table changes the felt", /^#[0-9a-f]{6}$/.test(felt), felt);
  await page.click("[data-close=ovLook]");
  await page.waitForTimeout(200);

  /* ---------- 2D and back ---------- */
  await settle(page);
  await page.click("#btnMenu");
  await page.waitForTimeout(200);
  var handBefore = await page.evaluate("(()=>{const g=window.__dt().G;return {no:g.match.handNo, line:g.view.line.length};})()");
  await page.click("#mView");
  await page.waitForTimeout(700);
  var kind2 = await page.evaluate("window.__dt().gfx.kind");
  ok("it switches to 2D mid-hand", kind2 === "2d", kind2);
  var flat = await page.evaluate(VARIED);
  ok("and the flat table draws too", flat > 4, flat + " distinct samples");
  var handAfter = await page.evaluate("(()=>{const g=window.__dt().G;return {no:g.match.handNo, line:g.view.line.length};})()");
  ok("without losing the hand", handAfter.no !== handBefore.no || handAfter.line >= handBefore.line,
     handAfter.line + " vs " + handBefore.line);

  /* ---------- carrying a bone, flat ---------- */
  await dragOne(page, "2D");

  await settle(page);
  await page.click("#btnMenu");
  await page.waitForTimeout(200);
  await page.click("#mView");
  await page.waitForTimeout(700);
  ok("and back to 3D", (await page.evaluate("window.__dt().gfx.kind")) === "3d");

  /* ---------- the join door ---------- */
  await settle(page);
  await page.click("#btnMenu");
  await page.waitForTimeout(200);
  await page.click("#mParty");
  await page.waitForTimeout(400);
  ok("the join door opens", await page.isVisible("#ovParty"));
  ok("and asks for a name first", await page.isVisible("#pName"));
  await page.click("[data-close=ovParty]");

  /* ---------- house rules ---------- */
  await settle(page);
  await page.click("#btnMenu");
  await page.waitForTimeout(200);
  await page.click("#mRules");
  await page.waitForTimeout(300);
  var opts = await page.evaluate("document.querySelectorAll('#rulesForm [data-rk]').length");
  ok("the house rules are all offered", opts >= 14, opts + " choices");
  await page.click("[data-rk=target][data-rv='50']");
  await page.waitForTimeout(300);
  var tgt = await page.evaluate("window.__dt().P.rules.target");
  ok("and picking one takes", tgt === 50, tgt + "");

  /* Every row must show what is currently chosen. Three of these rows do
     not live in P.rules — level and pace are preferences on P itself —
     and a row that reads the wrong place still renders perfectly, just
     with nothing lit up. Counting the lit buttons is what catches it:
     one per row, no more and no fewer. */
  var lit = await page.evaluate(
    "(function(){var rows={},b=document.querySelectorAll('#rulesForm [data-rk]');" +
    "for(var i=0;i<b.length;i++){var k=b[i].getAttribute('data-rk');" +
    "rows[k]=(rows[k]||0)+(b[i].classList.contains('on')?1:0);}return rows;})()");
  var keys = Object.keys(lit), everyRowLit = keys.length > 0;
  for (var ri = 0; ri < keys.length; ri++) if (lit[keys[ri]] !== 1) everyRowLit = false;
  ok("every rule row shows its current setting", everyRowLit,
    keys.map(function (k) { return k + "=" + lit[k]; }).join(" "));

  await page.click("[data-rk=pace][data-rv='quick']");
  await page.waitForTimeout(300);
  var pc = await page.evaluate("window.__dt().P.pace");
  ok("the pace can be changed", pc === "quick", pc + "");
  await page.click("[data-rk=pace][data-rv='relaxed']");
  await page.waitForTimeout(200);
  await page.click("[data-close=ovRules]");

  /* ---------- how it's played ---------- */
  await settle(page);
  await page.click("#btnMenu");
  await page.waitForTimeout(200);
  await page.click("#mLearn");
  await page.waitForTimeout(300);
  var cards = await page.evaluate("document.querySelectorAll('#lessons .opt').length");
  ok("the short course is there", cards === 8, cards + " cards");
  await page.click("[data-close=ovLearn]");

  /* ---------- it survives being resized ---------- */
  await page.setViewportSize({ width: 820, height: 420 });
  await page.waitForTimeout(600);
  var wide = await page.evaluate(VARIED);
  ok("it redraws on a landscape screen", wide > 4, wide + "");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.waitForTimeout(600);
  var small = await page.evaluate(VARIED);
  ok("and on a very small one", small > 4, small + "");

  /* ---------- what it remembers ---------- */
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  var saved = await page.evaluate("(()=>{const raw=JSON.parse(localStorage.getItem('dominotable.v1')||'null');return raw&&raw.rules?raw.rules.target:0;})()");
  ok("the house rules survive a reload", saved === 50, saved + "");

  /* ---------- where you left it ----------
     The match was written down after its last play. The splash has to
     offer it back, and taking it has to put the same hand, the same
     bones and the same score on the table. */
  var expect = await page.evaluate("(()=>{const o=window.__dt().loadMatch(); return o ? {hand:o.match.handNo, line:o.st.line.length, scores:o.match.scores, mine:o.st.hands[0].length} : null;})()");
  ok("a match in progress is written down", !!expect, expect ? "hand " + (expect.hand + 1) + ", " + expect.line + " bones down" : "nothing saved");
  ok("and the door offers it back", await page.isVisible("#goResume"));
  await page.click("#goResume");
  await page.waitForTimeout(1300);
  var got = await page.evaluate("(()=>{const g=window.__dt().G; return {hand:g.match.handNo, line:g.view.line.length, scores:g.match.scores, mine:g.view.hand.length, rated:!!(g.mm&&g.mm.rated), splash:!document.getElementById('splash').classList.contains('gone')};})()");
  ok("taking it puts the same hand back", !!expect && got.hand === expect.hand && got.line >= expect.line && got.mine <= expect.mine,
     JSON.stringify(got) + " vs " + JSON.stringify(expect));
  ok("with the same score", !!expect && got.scores.join() === expect.scores.join());
  ok("still rated", got.rated);
  ok("and the door is out of the way", !got.splash);

  /* ---------- which end, when a bone fits both ----------
     A real position, found by playing random hands until this seat is
     on turn holding a bone that fits both ends; lifting it has to star
     one end, on the slot and on the button, and count a lean. */
  var lean = await page.evaluate("(()=>{const R=window.Rules,d=window.__dt(); let tries=0;" +
    "for (let seed=1; seed<600; seed++){ const st=R.newHand({seed:seed}); const r=R.rng(seed); let guard=0, hit=null;" +
    "  while(!st.over && guard++<60){ if(st.turn===0 && st.line.length>=3){ const mv=R.moves(st,0); const by={}; mv.forEach(m=>{(by[m.tile]=by[m.tile]||[]).push(m.end);});" +
    "    const t=Object.keys(by).find(k=>by[k].length===2); if(t!==undefined){ hit=+t; break; } }" +
    "    const mv=R.moves(st); if(!mv.length){R.pass(st);continue;} R.play(st, mv[Math.floor(r()*mv.length)]); }" +
    "  if (hit===null) continue; tries++;" +
    "  d.G.st=st; d.G.view=R.publicView(st,0); d.G.busy=false; d.G.anim=null; d.G.sel=hit; d.G.hint=null; d.P.coach=true;" +
    "  const before=d.G.mm.leans||0; d.leanFor(hit); d.mood(0,'calm',1);" +
    "  if (d.G.lean){ const rec=document.querySelectorAll('#endPick .btn.rec').length; const vis=!document.getElementById('endPick').classList.contains('hide');" +
    "    const star=document.getElementById('endPick').textContent.indexOf('★')>=0; return {lean:d.G.lean, rec:rec, vis:vis, star:star, counted:(d.G.mm.leans||0)-before, tries:tries}; }" +
    "  if (tries>=6) break; }" +
    "return {lean:null, tries:tries}; })()");
  ok("lifting a bone that fits both ends leans to one", !!(lean && lean.lean), "after " + (lean ? lean.tries : 0) + " positions");
  if (lean && lean.lean) {
    ok("the end picker is up with that end starred", lean.vis && lean.rec === 1 && lean.star, "visible " + lean.vis + ", " + lean.rec + " starred");
    ok("and the lean is counted as help", lean.counted === 1, lean.counted + " counted");
  }
  var sc = await page.evaluate("(()=>{const d=window.__dt(); const s=d.scene(); return {lean:s.lean, ghosts:s.ghosts.length};})()");
  ok("the slot it leans to is marked on the table", sc.ghosts === 2 && (sc.lean === "L" || sc.lean === "R"), JSON.stringify(sc));

  /* ---------- two of you on one phone ----------
     Partners sharing a phone. The table has to be covered when it is
     the other person's turn, lift on their word, and the chair the phone
     sits in has to follow whoever is holding it. */
  await settle(page);
  await page.click("#btnMenu");
  await page.waitForTimeout(200);
  await page.click("#mParty");
  await page.waitForTimeout(400);
  ok("the join door offers one phone for two", await page.isVisible("#pSame"));
  await page.click("#pSame");
  await page.waitForTimeout(300);
  await page.fill("#sName0", "Ana");
  await page.fill("#sName1", "Rosa");
  await page.click("#sDeal");
  await page.waitForTimeout(1900);
  var hot = await page.evaluate("(()=>{const g=window.__dt().G; return {hot:!!g.hot, n0:g.names[0], n2:g.names[2], rated:!!(g.mm&&g.mm.rated), role:document.querySelector('#plate2 .role').textContent};})()");
  ok("the two of you are seated as partners", hot.hot && hot.n0 === "Ana" && hot.n2 === "Rosa", JSON.stringify(hot));
  ok("the plate across says so", /your partner/i.test(hot.role), hot.role);
  ok("and the match is not rated", !hot.rated);
  var handoff = await page.evaluate(`(async () => {
    const d = window.__dt(); const t0 = performance.now();
    let curtains = 0, switched = 0, leaked = 0, handWhenCovered = null;
    while (performance.now() - t0 < 50000 && curtains < 2) {
      await new Promise(r => setTimeout(r, 60));
      const g = d.G; if (!g.view) continue;
      const cv = document.getElementById('ovPass');
      if (!cv.classList.contains('hide')) {
        curtains++;
        /* whose bones are showing under the curtain must be the previous player's, not the one it is for */
        if (g.mySeat === g.st.turn) leaked++;
        const who = document.getElementById('passWho').textContent;
        document.getElementById('passGo').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
        document.getElementById('passGo').dispatchEvent(new PointerEvent('pointerup', {bubbles:true}));
        await new Promise(r => setTimeout(r, 120));
        if (g.mySeat === g.st.turn && cv.classList.contains('hide')) switched++;
        continue;
      }
      if (g.view.turn === g.mySeat && !g.busy) {
        const mv = window.AI.movesFor(g.view);
        if (mv.length) d.tryPlay(mv[0].tile, mv[0].end); else d.doPass(g.mySeat);
      }
      if (g.st && g.st.over) { document.getElementById('endNext').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true})); document.getElementById('endNext').dispatchEvent(new PointerEvent('pointerup', {bubbles:true})); await new Promise(r => setTimeout(r, 1500)); }
    }
    return { curtains, switched, leaked, seat: d.G.mySeat };
  })()`);
  ok("the table is covered when the phone should change hands", handoff.curtains >= 1, handoff.curtains + " curtains in 30s");
  ok("it never covers the table for the person already holding it", handoff.leaked === 0, handoff.leaked + " leaks");
  ok("and lifts on their word, with the chair following", handoff.switched === handoff.curtains, handoff.switched + " of " + handoff.curtains);
  ok("a tap on the dark round the curtain does not lift it", await page.evaluate(
    "(()=>{const cv=document.getElementById('ovPass'); cv.classList.remove('hide'); cv.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); const up=!cv.classList.contains('hide'); cv.classList.add('hide'); return up;})()"));

  /* ---------- the pips, read back ---------- */
  await page.setViewportSize({ width: 820, height: 640 });
  await page.waitForTimeout(400);
  await readback(page, "3D");
  await settle(page);
  await page.click("#btnMenu");
  await page.waitForTimeout(200);
  await page.click("#mView");
  await page.waitForTimeout(600);
  ok("flat again for the read-back", (await page.evaluate("window.__dt().gfx.kind")) === "2d");
  await readback(page, "2D");

  ok("no console error in the whole session", errors.length === 0,
     errors.slice(0, 4).join(" | "));

  await browser.close();
  srv.close();

  console.log("\n" + (fail === 0
    ? "the room opens and plays — " + pass + " checks passed"
    : fail + " of " + (pass + fail) + " checks FAILED"));
  if (fail) { failures.forEach(function (f) { console.log("  · " + f); }); process.exit(1); }
})().catch(function (e) {
  console.log("FAIL  the browser check itself threw — " + e.message);
  process.exit(1);
});
