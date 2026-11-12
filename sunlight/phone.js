/* phone.js — the last bar.

   Chapter One's kicker, given the whole screen: the phone comes up in your
   hands on the third stair, the one bar climbs, and three days of friends
   spill in at once — the quiz nobody would finish, the thing that wasn't
   funny that you laughed at anyway, the whole warm bright clamor of them.
   Then the bar trembles. Sinks. Trembles. And goes out. The chat grays,
   the last message never sends, and two gray words are all that's left.
   The narration is then read over the dead screen, and it goes down.
   A tap hurries it along. Reduced motion lets it all simply happen. */
(function () {
  "use strict";
  var BS = window.BS, G = BS.G, A = BS.audio;
  var P = BS.phone = {};
  function reduced() { return G.prefs.reduced; }
  function haptic(p) { if (G.prefs.haptics && navigator.vibrate) navigator.vibrate(p); }

  var el = document.createElement("div"); el.className = "phx"; el.setAttribute("aria-hidden", "true");
  el.innerHTML =
    '<div class="phd"><div class="phscr">' +
      '<div class="phs"><span class="pht">2:47</span><span class="phr"><span class="phsig"><i></i><i></i><i></i><i></i></span><span class="phnet">No Service</span><span class="phbat"><b></b></span></span></div>' +
      '<div class="phh"><span class="phav"><i style="background:#e08a6a">P</i><i style="background:#6a9ae0">T</i><i style="background:#8a7ac8">+4</i></span><b>Priya, Theo &amp; everyone</b></div>' +
      '<div class="phm"></div>' +
      '<div class="phsend"><span>Message</span><i>↑</i></div>' +
      '<div class="phns"><b>No Service</b></div>' +
      '<div class="phcloud"></div>' +
    "</div></div>";
  document.body.appendChild(el);
  var $ = function (s) { return el.querySelector(s); };

  /* three days of them, all at once. Wren's own last message waits at the bottom, never sent */
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
  var timers = [], fast = false;
  function at(ms, fn) { timers.push(setTimeout(fn, fast ? 0 : ms)); }
  function sigTo(n) { $(".phsig").setAttribute("data-n", n); $(".phnet").textContent = n > 0 ? "" : "No Service"; G.signalBars = n; G.hud && G.hud(); }
  function bubble(m) {
    var d = document.createElement("div");
    if (m[0] === "day") { d.className = "phday"; d.textContent = m[1]; }
    else if (m[0] === "r") { d.className = "phreact"; d.textContent = m[1]; }
    else if (m[0] === "o") { d.className = "phmore"; d.textContent = m[1]; }
    else { d.className = "phb " + m[0]; d.innerHTML = "<small>" + m[1] + "</small>" + G.fmt(m[2]).replace(/\[([^\]]+)\]/, "<em>$1</em>"); }
    var box = $(".phm"); box.appendChild(d);
    requestAnimationFrame(function () { d.classList.add("in"); box.scrollTop = box.scrollHeight; });
  }

  /* up, spill, sink, out. Resolves when the screen has gone dead and stayed dead a moment */
  P.lose = function () {
    return new Promise(function (res) {
      fast = false; timers = [];
      $(".phm").innerHTML = ""; el.className = "phx"; sigTo(0);
      $(".phbat b").style.width = Math.max(4, G.s.battery || 4) + "%";
      var done = false;
      function finish() { if (done) return; done = true; el.removeEventListener("click", hurry); res(); }
      function hurry() { if (done) return; fast = true; timers.forEach(clearTimeout); end(); }
      el.addEventListener("click", hurry);
      document.body.classList.add("phoneup");
      requestAnimationFrame(function () { el.classList.add("on"); });
      if (reduced() || G.skipWaits) fast = true;
      /* the one bar climbs */
      at(1100, function () { $(".phsig").classList.add("seek"); });
      at(2100, function () { $(".phsig").classList.remove("seek"); sigTo(1); A.sfx("signal"); haptic(10); $(".phsig").classList.add("got"); setTimeout(function () { $(".phsig").classList.remove("got"); }, 1400); });
      /* and three days come spilling in, faster and faster */
      var t = 2700, gap = 520;
      MSGS.forEach(function (m, i) {
        at(t, function () { bubble(m); if (m[0] === "p" || m[0] === "t") { A.sfx(i < 3 ? "buzz" : "phone"); haptic(i < 3 ? [20, 40, 20] : 8); } });
        t += m[0] === "day" ? gap * 0.5 : gap; gap = Math.max(150, gap * 0.84);
      });
      t += 900;
      /* Wren starts typing back */
      at(t, function () { $(".phsend span").textContent = "I'm at my gran's"; $(".phsend").classList.add("typing"); });
      t += 1300;
      /* a cloud, or a breath of wind, or nothing at all */
      at(t, function () { el.classList.add("cloud"); $(".phsig").classList.add("tremble"); });
      at(t + 900, function () { sigTo(0); });
      at(t + 1150, function () { sigTo(1); });
      at(t + 1900, function () { sigTo(0); });
      at(t + 2050, function () { sigTo(1); });
      t += 2900;
      at(t, function () { end(); });
      function end() {
        timers.forEach(clearTimeout); timers = [];
        if (!$(".phm").children.length) MSGS.forEach(bubble);
        $(".phsig").classList.remove("tremble", "seek"); el.classList.remove("cloud");
        sigTo(0); el.classList.add("dead");
        $(".phsend span").textContent = "I'm at my gran's"; $(".phsend").classList.add("typing", "failed");
        A.sfx("nosignal"); A.sfx("thud"); haptic([60]);
        setTimeout(finish, fast ? 600 : 1700);
      }
    });
  };
  /* put it away */
  P.away = function () {
    el.classList.add("down");
    setTimeout(function () { el.className = "phx"; document.body.classList.remove("phoneup"); }, 900);
    document.body.classList.remove("phoneup");
  };
})();
