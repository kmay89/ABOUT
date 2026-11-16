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
   It is paced to you: each beat holds until you answer it (see P.lose).
   Reduced motion drops the animation between beats, never the beats. */
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
  /* how long a message wants before the next one lands: long enough to read it */
  function readTime(m) {
    if (m[0] === "day" || m[0] === "r") return 520;
    if (m[0] === "o") return 720;
    return Math.min(1250, 480 + String(m[2] || m[1] || "").length * 17);
  }

  /* Up, wake, spill, reply, send, stall, out — in beats, and the beats wait
     for you. Each one plays at a pace you can read, then settles and holds
     with a small prompt until you answer it (E, A, or a tap; on a phone, tap
     the thing itself): the notification to open it, the message field to
     reply, the arrow to send. A press while a beat is still playing finishes
     that beat, the way it finishes a line of dialogue. The send is the one
     that matters, so it is yours — and its failing can't be hurried.
     Resolves when the screen has gone dead and you've had your look at it. */
  P.lose = function () {
    return new Promise(function (res) {
      $(".phm").innerHTML = ""; $(".phnots").innerHTML = ""; el.className = "phx"; sigTo(0);
      var clk = CLOCK[G.s.tod] || "12:04";
      $(".pht").textContent = clk; $(".phbig").textContent = clk; $(".phdate").textContent = G.s.day || "Monday";
      $(".phtx").textContent = "Message"; $(".phsend").className = "phsend";
      $(".phprog i").style.cssText = "";
      $$(".phbat b").forEach(function (b) { b.style.width = Math.max(4, G.s.battery || 4) + "%"; });
      var skipAll = !!G.skipWaits, quick = reduced(), rushing = false, canRush = false, sleepers = [], mine = null, over = false;
      /* a wait that a press can cut short (unless it is firm) */
      function sleep(ms, firm) {
        return new Promise(function (r) {
          if (skipAll || ((quick || rushing) && !firm)) return r();
          var o = { r: r, firm: firm };
          o.id = setTimeout(function () { sleepers.splice(sleepers.indexOf(o), 1); r(); }, ms);
          sleepers.push(o);
        });
      }
      function rush() {
        if (!canRush) return;
        rushing = true;
        sleepers.slice().forEach(function (o) { if (o.firm) return; clearTimeout(o.id); sleepers.splice(sleepers.indexOf(o), 1); o.r(); });
      }
      /* steps: [wait before, what happens, firm?] */
      function beat(steps, rushable) {
        rushing = false; canRush = rushable !== false; G.cueFn = rush;
        return steps.reduce(function (p, st) {
          return p.then(function () { return sleep(st[0], st[2]); }).then(function () { if (!over) st[1](); });
        }, Promise.resolve()).then(function () { rushing = false; canRush = false; });
      }
      function nop() { }
      function cue(o) { o.el = el; return G.cue(o); }
      el.addEventListener("pointerup", rush);
      document.body.classList.add("phoneup");
      requestAnimationFrame(function () { el.classList.add("on"); });

      /* the screen wakes, and looks for anyone at all — and finds one bar */
      beat([
        [600, function () { el.classList.add("wake"); A.sfx("click"); }],
        [900, function () { $(".phs .phsig").classList.add("seek"); el.classList.add("seeking"); }],
        [1700, function () {
          $(".phs .phsig").classList.remove("seek"); el.classList.remove("seeking");
          sigTo(1); A.sfx("signal"); haptic(10); el.classList.add("got");
          setTimeout(function () { el.classList.remove("got"); }, 1500);
        }],
        [1200, nop]
      ]).then(function () {
        /* and they land, one on top of another, each with time to be read */
        return beat(NOTES.map(function (n, i) {
          return [i ? 1150 : 300, function () { note(n, i); A.sfx("buzz"); haptic([20, 40, 20]); }];
        }).concat([[1000, nop]]));
      }).then(function () {
        return cue({ label: "Open", tap: "Tap to open", at: $(".phnots"), ring: $(".phnots").firstChild, lock: 150 });
      }).then(function () {
        /* three days of them, at the speed you'd read them */
        var steps = [[0, function () { el.classList.add("open"); A.sfx("click"); }]], w = 700;
        MSGS.forEach(function (m) {
          steps.push([w, function () { bubble(m); if (m[0] === "p" || m[0] === "t") { A.sfx("phone"); haptic(6); } }]);
          w = readTime(m);
        });
        steps.push([w + 250, nop]);
        return beat(steps);
      }).then(function () {
        return cue({ label: "Reply", tap: "Tap to reply", at: $(".phsend"), over: true, lock: 200 });
      }).then(function () {
        /* Wren types back, one letter at a time */
        var steps = [[0, function () { $(".phsend").classList.add("typing"); $(".phtx").textContent = ""; }]];
        REPLY.split("").forEach(function (c, i) {
          steps.push([(i ? 78 : 240) + (i === 4 ? 240 : 0), function () { $(".phtx").textContent = REPLY.slice(0, i + 1); if (i % 3 === 0) A.sfx("tok"); }]);
        });
        steps.push([350, nop]);
        return beat(steps);
      }).then(function () {
        $(".phsend").classList.add("ready");
        return cue({ label: "Send", tap: "Tap to send", at: $(".phsend i"), lock: 150 });
      }).then(function () {
        /* send. The little blue line crawls… a cloud, or a breath of wind, or nothing at all */
        return beat([
          [0, function () {
            $(".phtx").textContent = "Message"; $(".phsend").classList.remove("typing", "ready");
            mine = bubble(["me", REPLY]); A.sfx("whiff"); haptic(12); el.classList.add("sending");
          }, true],
          [1300, function () { el.classList.add("cloud"); $(".phs .phsig").classList.add("tremble"); }, true],
          [1100, function () { sigTo(0); }, true],
          [320, function () { sigTo(1); }, true],
          [900, function () { sigTo(0); }, true],
          [220, function () { sigTo(1); el.classList.add("stall"); }, true],
          [1300, nop, true]
        ], false);
      }).then(function () {
        /* and it goes out */
        if (!mine) mine = bubble(["me", REPLY]);
        $(".phs .phsig").classList.remove("tremble", "seek");
        el.classList.remove("cloud", "seeking", "got"); el.classList.add("wake", "open", "sending", "stall");
        sigTo(0); mine.classList.add("failed"); el.classList.add("dead");
        A.sfx("nosignal"); A.sfx("thud"); haptic([60]);
        return sleep(2000, true);
      }).then(function () {
        return cue({ label: "", lock: 0, bottom: "calc(var(--vh) * 7)" });
      }).then(function () {
        /* and then it's only a phone in your hand again */
        el.classList.add("back");
        return sleep(900, true);
      }).then(function () {
        over = true; G.cueFn = null; el.removeEventListener("pointerup", rush); res();
      });
    });
  };
  /* put it away */
  P.away = function () {
    el.classList.add("down");
    document.body.classList.remove("phoneup");
    setTimeout(function () { el.className = "phx"; }, 1000);
  };
})();
