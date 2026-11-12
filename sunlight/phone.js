/* phone.js — the last bar.

   Chapter One's kicker, given the whole screen. On a phone, your own screen
   becomes Wren's: it wakes on the lock screen, No Service in the corner, and
   the one bar climbs. Three days of friends land as notifications, one on
   top of another, and then the chat opens and the whole warm bright clamor
   of them spills in — the quiz nobody would finish, the thing that wasn't
   funny that you laughed at anyway. Wren types back. Sends. The little blue
   line crawls across the top… and stalls. The bar trembles. Sinks. Trembles.
   Goes out. Not Delivered. The chat grays, and two gray words are left.
   Then the camera pulls back and it's only a phone in your hand again, and
   the narration is read over it, and it goes down.
   A tap hurries it along. Reduced motion lets it all simply happen. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio;
  var P = BS.phone = {};
  function reduced() { return G.prefs.reduced; }
  function haptic(p) { if (G.prefs.haptics && navigator.vibrate) navigator.vibrate(p); }
  var CLOCK = { dawn: "6:12", morning: "9:40", noon: "12:04", afternoon: "2:47", evening: "6:31", golden: "7:48", dusk: "8:55", night: "11:20" };
  var SIG = '<span class="phsig"><i></i><i></i><i></i><i></i></span>';

  var el = document.createElement("div"); el.className = "phx"; el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<div class="phd"><div class="phscr">' +
      '<div class="phisl"></div>' +
      '<div class="phs"><span class="pht">12:04</span><span class="phr">' + SIG + '<span class="phnet">No Service</span><span class="phbat"><b></b></span></span></div>' +
      /* the lock screen */
      '<div class="phlock"><div class="phwall"></div>' +
        '<div class="phclk"><small class="phdate">Monday</small><b class="phbig">12:04</b></div>' +
        '<div class="phsrch">Searching…</div>' +
        '<div class="phnots"></div>' +
        '<div class="phhome"></div>' +
      "</div>" +
      /* the chat */
      '<div class="phapp">' +
        '<div class="phh"><span class="phback">‹ 41</span><span class="phav"><i style="background:#e08a6a">P</i><i style="background:#6a9ae0">T</i><i style="background:#8a7ac8">+4</i></span><b>Priya, Theo &amp; everyone</b><span class="phprog"><i></i></span></div>' +
        '<div class="phm"></div>' +
        '<div class="phsend"><span class="phtx">Message</span><i>↑</i></div>' +
        '<div class="phhome"></div>' +
      "</div>" +
      '<div class="phcloud"></div>' +
      '<div class="phns"><div><span class="phx0">' + SIG + '</span><b>No Service</b></div></div>' +
    "</div></div>";
  document.body.appendChild(el);
  var $ = function (s) { return el.querySelector(s); };
  var $$ = function (s) { return el.querySelectorAll(s); };

  /* three days of them, all at once */
  var NOTES = [
    ["Priya", "did ANYONE finish the quiz", "#e08a6a", "Saturday"],
    ["Theo", "[the thing that wasn't funny that you laughed at anyway]", "#6a9ae0", "Saturday"],
    ["Priya, Theo & everyone", "41 new messages", "#8a7ac8", "now"]
  ];
  var MSGS = [
    ["day", "Saturday"],
    ["p", "Priya", "did ANYONE finish the quiz"],
    ["p", "Priya", "like any of it"],
    ["t", "Theo", "[the thing that wasn't funny that you laughed at anyway]"],
    ["r", "😂 3"],
    ["day", "Sunday"],
    ["t", "Theo", "wren"],
    ["t", "Theo", "wren??"],
    ["p", "Priya", "ok we're getting ice cream without you"],
    ["o", "+ 37 more"],
    ["day", "Today"],
    ["p", "Priya", "where even ARE you"]
  ];
  var REPLY = "I'm at my gran's";
  var timers = [], fast = false;
  function at(ms, fn) { timers.push(setTimeout(fn, fast ? 0 : ms)); }
  function sigTo(n) {
    $$(".phsig").forEach(function (s) { s.setAttribute("data-n", n); });
    $(".phnet").textContent = n > 0 ? "" : "No Service"; G.signalBars = n; G.hud && G.hud();
  }
  function fmt(t) { return G.fmt(t).replace(/\[([^\]]+)\]/, "<em>$1</em>"); }
  function note(n, i) {
    var d = document.createElement("div"); d.className = "phnote";
    d.innerHTML = '<i style="background:' + n[2] + '">' + n[0][0] + '</i><div><b>' + n[0].replace("&", "&amp;") + '</b><span>' + fmt(n[1]) + '</span></div><small>' + n[3] + "</small>";
    $(".phnots").insertBefore(d, $(".phnots").firstChild);
    requestAnimationFrame(function () { d.classList.add("in"); });
  }
  function bubble(m) {
    var d = document.createElement("div");
    if (m[0] === "day") { d.className = "phday"; d.textContent = m[1]; }
    else if (m[0] === "r") { d.className = "phreact"; d.textContent = m[1]; }
    else if (m[0] === "o") { d.className = "phmore"; d.textContent = m[1]; }
    else if (m[0] === "me") { d.className = "phb me"; d.textContent = m[1]; }
    else { d.className = "phb " + m[0]; d.innerHTML = "<small>" + m[1] + "</small>" + fmt(m[2]); }
    var box = $(".phm"); box.appendChild(d);
    requestAnimationFrame(function () { d.classList.add("in"); });
    return d;
  }

  /* up, wake, spill, send, stall, out. Resolves when the screen has gone dead and stayed dead a moment */
  P.lose = function () {
    return new Promise(function (res) {
      fast = false; timers = [];
      $(".phm").innerHTML = ""; $(".phnots").innerHTML = ""; el.className = "phx"; sigTo(0);
      var clk = CLOCK[G.s.tod] || "12:04";
      $(".pht").textContent = clk; $(".phbig").textContent = clk; $(".phdate").textContent = G.s.day || "Monday";
      $(".phtx").textContent = "Message"; $(".phsend").className = "phsend";
      $(".phprog i").style.cssText = "";
      $$(".phbat b").forEach(function (b) { b.style.width = Math.max(4, G.s.battery || 4) + "%"; });
      var done = false, mine = null;
      function finish() { if (done) return; done = true; el.removeEventListener("click", hurry); res(); }
      function hurry() { if (done) return; if (el.classList.contains("dead")) { finish(); return; } fast = true; timers.forEach(clearTimeout); end(); }
      el.addEventListener("click", hurry);
      document.body.classList.add("phoneup");
      requestAnimationFrame(function () { el.classList.add("on"); });
      if (reduced() || G.skipWaits) fast = true;

      /* the screen wakes, and looks for anyone at all */
      at(500, function () { el.classList.add("wake"); A.sfx("click"); });
      at(1200, function () { $(".phs .phsig").classList.add("seek"); el.classList.add("seeking"); });
      /* the one bar */
      at(2500, function () {
        $(".phs .phsig").classList.remove("seek"); el.classList.remove("seeking");
        sigTo(1); A.sfx("signal"); haptic(10); el.classList.add("got");
        setTimeout(function () { el.classList.remove("got"); }, 1500);
      });
      /* and they land, one on top of another */
      var t = 3100;
      NOTES.forEach(function (n, i) { at(t, function () { note(n, i); A.sfx("buzz"); haptic([20, 40, 20]); }); t += 620 - i * 120; });
      t += 900;
      /* open it */
      at(t, function () { el.classList.add("open"); A.sfx("click"); });
      t += 450;
      var gap = 330;
      MSGS.forEach(function (m, i) {
        at(t, function () { bubble(m); if (m[0] === "p" || m[0] === "t") { A.sfx("phone"); haptic(6); } });
        t += m[0] === "day" ? gap * 0.5 : gap; gap = Math.max(120, gap * 0.86);
      });
      t += 900;
      /* Wren types back, one letter at a time */
      at(t, function () { $(".phsend").classList.add("typing"); $(".phtx").textContent = ""; });
      REPLY.split("").forEach(function (c, i) {
        at(t + 160 + i * 75 + (i === 4 ? 220 : 0), function () { $(".phtx").textContent = REPLY.slice(0, i + 1); if (i % 3 === 0) A.sfx("tok"); });
      });
      t += 160 + REPLY.length * 75 + 600;
      /* send */
      at(t, function () {
        $(".phtx").textContent = "Message"; $(".phsend").classList.remove("typing");
        mine = bubble(["me", REPLY]); A.sfx("whiff"); el.classList.add("sending");
      });
      /* the little blue line crawls… a cloud, or a breath of wind, or nothing at all */
      at(t + 900, function () { el.classList.add("cloud"); $(".phs .phsig").classList.add("tremble"); });
      at(t + 1700, function () { sigTo(0); });
      at(t + 1950, function () { sigTo(1); });
      at(t + 2600, function () { sigTo(0); });
      at(t + 2760, function () { sigTo(1); el.classList.add("stall"); });
      t += 3500;
      at(t, function () { end(); });

      function end() {
        timers.forEach(clearTimeout); timers = [];
        if (!$(".phm").children.length) MSGS.forEach(bubble);
        if (!$(".phnots").children.length) NOTES.forEach(note);
        if (!mine) mine = bubble(["me", REPLY]);
        $(".phtx").textContent = "Message"; $(".phsend").classList.remove("typing");
        $(".phs .phsig").classList.remove("tremble", "seek");
        el.classList.remove("cloud", "seeking", "got"); el.classList.add("wake", "open", "sending", "stall");
        sigTo(0); mine.classList.add("failed");
        el.classList.add("dead");
        A.sfx("nosignal"); A.sfx("thud"); haptic([60]);
        /* and then it's only a phone in your hand again */
        setTimeout(function () { el.classList.add("back"); }, fast ? 250 : 1500);
        setTimeout(finish, fast ? 700 : 2300);
      }
    });
  };
  /* put it away */
  P.away = function () {
    el.classList.add("down");
    document.body.classList.remove("phoneup");
    setTimeout(function () { el.className = "phx"; }, 1000);
  };
})();
