/* icons.js — the things that become yours, drawn big for the moment you
   get them, and small in the book. Each is a few shapes, warm-lit. */
(function () {
  "use strict";
  var BS = window.BS;
  function glow(x, S, c) { var g = x.createRadialGradient(S / 2, S / 2, 4, S / 2, S / 2, S / 2); g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, S, S); }
  function rr(x, X, Y, w, h, r, f) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); x.fillStyle = f; x.fill(); }
  BS.icons = {
    book: function (x, S) {
      glow(x, S, "rgba(255,210,120,.35)");
      rr(x, S * 0.24, S * 0.2, S * 0.52, S * 0.62, 4, "#5a3a26"); rr(x, S * 0.27, S * 0.22, S * 0.46, S * 0.57, 3, "#e9dfc6");
      x.strokeStyle = "rgba(40,40,70,.7)"; x.lineWidth = 1.5; for (var i = 0; i < 6; i++) { x.beginPath(); x.moveTo(S * 0.32, S * 0.32 + i * 7); x.lineTo(S * (0.6 + (i % 3) * 0.04), S * 0.32 + i * 7); x.stroke(); }
      x.strokeStyle = "rgba(255,200,70,.9)"; x.lineWidth = 1; for (i = 0; i < 9; i++) { x.beginPath(); x.moveTo(S * 0.24, S * (0.3 + i * 0.06)); x.quadraticCurveTo(S * 0.15, S * (0.35 + i * 0.05), S * 0.1, S * (0.3 + i * 0.07)); x.stroke(); }
    },
    lantern: function (x, S) {
      glow(x, S, "rgba(255,230,150,.45)");
      rr(x, S * 0.28, S * 0.3, S * 0.44, S * 0.46, 8, "#d8b83a"); rr(x, S * 0.3, S * 0.32, S * 0.4, S * 0.08, 4, "#efe0a0");
      x.fillStyle = "#fff6d0"; x.beginPath(); x.arc(S * 0.5, S * 0.55, S * 0.11, 0, 6.3); x.fill();
      x.strokeStyle = "#555"; x.lineWidth = 3; x.beginPath(); x.moveTo(S * 0.72, S * 0.5); x.lineTo(S * 0.86, S * 0.5); x.lineTo(S * 0.86, S * 0.66); x.stroke();
      x.fillStyle = "#333"; x.fillRect(S * 0.82, S * 0.64, S * 0.08, S * 0.06);
      x.strokeStyle = "#8a7a3a"; x.beginPath(); x.arc(S * 0.5, S * 0.3, S * 0.12, Math.PI, 0); x.stroke();
    },
    scooter: function (x, S) {
      glow(x, S, "rgba(255,200,120,.3)");
      x.strokeStyle = "#333"; x.lineWidth = 4; x.beginPath(); x.moveTo(S * 0.3, S * 0.72); x.lineTo(S * 0.36, S * 0.2); x.lineTo(S * 0.26, S * 0.2); x.stroke();
      rr(x, S * 0.3, S * 0.66, S * 0.46, S * 0.08, 3, "#c33");
      x.fillStyle = "#111"; x.beginPath(); x.arc(S * 0.3, S * 0.78, S * 0.08, 0, 6.3); x.fill(); x.beginPath(); x.arc(S * 0.74, S * 0.78, S * 0.08, 0, 6.3); x.fill();
      rr(x, S * 0.36, S * 0.5, S * 0.18, S * 0.15, 4, "#d8b83a"); x.fillStyle = "#fff6d0"; x.beginPath(); x.arc(S * 0.42, S * 0.57, S * 0.04, 0, 6.3); x.fill();
      x.strokeStyle = "#999"; x.lineWidth = 2; x.beginPath(); x.moveTo(S * 0.54, S * 0.56); x.lineTo(S * 0.72, S * 0.72); x.stroke();
    },
    lens: function (x, S) {
      glow(x, S, "rgba(150,210,255,.35)");
      rr(x, S * 0.3, S * 0.14, S * 0.4, S * 0.72, 8, "#1c1c22"); rr(x, S * 0.33, S * 0.18, S * 0.34, S * 0.6, 4, "#2a3a44");
      x.fillStyle = "#0a0a0a"; x.beginPath(); x.arc(S * 0.5, S * 0.26, S * 0.05, 0, 6.3); x.fill();
      var g = x.createRadialGradient(S * 0.48, S * 0.22, 1, S * 0.5, S * 0.25, S * 0.1); g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(1, "rgba(160,210,255,.4)");
      x.fillStyle = g; x.beginPath(); x.ellipse(S * 0.5, S * 0.24, S * 0.09, S * 0.075, 0, 0, 6.3); x.fill();
    },
    oats: function (x, S) {
      glow(x, S, "rgba(255,200,80,.35)");
      x.fillStyle = "#c9b48a"; x.beginPath(); x.ellipse(S * 0.5, S * 0.62, S * 0.3, S * 0.14, 0, 0, 6.3); x.fill();
      for (var i = 0; i < 14; i++) { x.fillStyle = "#efe2c0"; x.beginPath(); x.ellipse(S * (0.3 + (i * 37 % 40) / 100), S * (0.5 + (i * 13 % 14) / 100), 5, 3, i, 0, 6.3); x.fill(); }
      x.strokeStyle = "rgba(255,200,70,.95)"; x.lineWidth = 2.5; x.beginPath(); x.moveTo(S * 0.1, S * 0.3); x.quadraticCurveTo(S * 0.3, S * 0.4, S * 0.42, S * 0.52); x.moveTo(S * 0.2, S * 0.18); x.quadraticCurveTo(S * 0.3, S * 0.35, S * 0.38, S * 0.5); x.stroke();
    },
    roots: function (x, S) {
      glow(x, S, "rgba(240,240,230,.25)");
      x.fillStyle = "#8e9294"; x.fillRect(S * 0.42, S * 0.05, S * 0.16, S * 0.4);
      x.strokeStyle = "#6a4a2a"; x.lineWidth = 5; [[-0.3, 0.35], [0, 0.45], [0.3, 0.35]].forEach(function (d) { x.beginPath(); x.moveTo(S * 0.5, S * 0.45); x.quadraticCurveTo(S * (0.5 + d[0] / 2), S * 0.6, S * (0.5 + d[0]), S * (0.45 + d[1])); x.stroke(); });
      x.strokeStyle = "rgba(245,245,235,.8)"; x.lineWidth = 1; for (var i = 0; i < 40; i++) { var a = i * 0.7, r = 10 + (i * 7) % 30; x.beginPath(); x.moveTo(S * 0.5 + Math.cos(a) * r * 0.5, S * 0.7 + Math.sin(a) * r * 0.3); x.lineTo(S * 0.5 + Math.cos(a) * r, S * 0.7 + Math.sin(a) * r * 0.6); x.stroke(); }
    },
    log: function (x, S) {
      glow(x, S, "rgba(140,200,100,.3)");
      rr(x, S * 0.08, S * 0.5, S * 0.84, S * 0.24, 10, "#4a3a26"); x.fillStyle = "#5e8a36"; x.fillRect(S * 0.1, S * 0.46, S * 0.8, S * 0.07);
      for (var i = 0; i < 5; i++) { x.strokeStyle = "#6aa83a"; x.lineWidth = 2; x.beginPath(); x.moveTo(S * (0.2 + i * 0.14), S * 0.47); x.lineTo(S * (0.2 + i * 0.14), S * (0.2 + (i % 2) * 0.06)); x.stroke(); x.fillStyle = "#8ac85a"; x.fillRect(S * (0.2 + i * 0.14) - 4, S * (0.18 + (i % 2) * 0.06), 8, 4); }
    },
    still: function (x, S) {
      glow(x, S, "rgba(255,220,150,.3)");
      x.fillStyle = "#d9c693"; x.beginPath(); x.moveTo(S * 0.05, S * 0.85); x.lineTo(S * 0.5, S * 0.2); x.lineTo(S * 0.95, S * 0.85); x.fill();
      x.strokeStyle = "#8a6a3a"; x.lineWidth = 2; x.beginPath(); x.arc(S * 0.95, S * 0.85, S * 0.2, Math.PI, Math.PI + 0.6); x.stroke();
      x.fillStyle = "#3a3a36"; x.fillRect(S * 0.66, S * 0.7, S * 0.3, S * 0.08);
    },
    tun: function (x, S) {
      glow(x, S, "rgba(150,220,180,.35)");
      x.fillStyle = "rgba(230,215,190,.95)"; x.beginPath(); x.ellipse(S * 0.5, S * 0.5, S * 0.3, S * 0.17, 0, 0, 6.3); x.fill();
      for (var k = 0; k < 4; k++) { x.fillRect(S * (0.28 + k * 0.13), S * 0.64, 6, 10); x.fillRect(S * (0.28 + k * 0.13), S * 0.26, 6, 10); x.fillStyle = "#3a2a1a"; x.fillRect(S * (0.28 + k * 0.13), S * 0.73, 6, 2); x.fillRect(S * (0.28 + k * 0.13), S * 0.25, 6, 2); x.fillStyle = "rgba(230,215,190,.95)"; }
      x.fillStyle = "#1a1a1a"; x.beginPath(); x.arc(S * 0.78, S * 0.47, 2, 0, 6.3); x.fill(); x.beginPath(); x.arc(S * 0.78, S * 0.53, 2, 0, 6.3); x.fill();
    },
    jar: function (x, S) {
      glow(x, S, "rgba(255,200,90,.25)");
      rr(x, S * 0.3, S * 0.22, S * 0.4, S * 0.6, 10, "rgba(220,235,240,.35)"); rr(x, S * 0.32, S * 0.14, S * 0.36, S * 0.1, 3, "#b8a050");
      x.fillStyle = "#a89a50"; x.beginPath(); x.ellipse(S * 0.5, S * 0.7, S * 0.08, S * 0.05, 0.4, 0, 6.3); x.fill();
      x.strokeStyle = "rgba(255,255,255,.6)"; x.lineWidth = 2; x.beginPath(); x.moveTo(S * 0.36, S * 0.3); x.lineTo(S * 0.36, S * 0.7); x.stroke();
    },
    eye: function (x, S) {
      glow(x, S, "rgba(255,210,100,.5)");
      x.strokeStyle = "rgba(255,200,70,.95)"; x.lineWidth = 2;
      for (var i = 0; i < 18; i++) { var a = i / 18 * 6.283; x.beginPath(); x.moveTo(S / 2 + Math.cos(a) * S * 0.12, S / 2 + Math.sin(a) * S * 0.12); x.quadraticCurveTo(S / 2 + Math.cos(a + 0.3) * S * 0.3, S / 2 + Math.sin(a + 0.3) * S * 0.3, S / 2 + Math.cos(a) * S * 0.44, S / 2 + Math.sin(a) * S * 0.44); x.stroke(); }
      x.fillStyle = "#ffe8a0"; x.beginPath(); x.arc(S / 2, S / 2, S * 0.1, 0, 6.3); x.fill();
    },
    signal: function (x, S) {
      glow(x, S, "rgba(160,220,255,.3)");
      x.fillStyle = "#1c1c22"; x.fillRect(S * 0.36, S * 0.2, S * 0.28, S * 0.56);
      x.fillStyle = "#9fe0a0"; x.fillRect(S * 0.42, S * 0.5, S * 0.05, S * 0.12);
      x.fillStyle = "rgba(255,255,255,.2)"; x.fillRect(S * 0.49, S * 0.44, S * 0.05, S * 0.18); x.fillRect(S * 0.56, S * 0.38, S * 0.05, S * 0.24);
      x.strokeStyle = "rgba(160,220,255,.7)"; x.lineWidth = 2; for (var r = 1; r < 4; r++) { x.beginPath(); x.arc(S * 0.5, S * 0.12, r * 8, 0.3, Math.PI - 0.3); x.stroke(); }
    },
    eyes: function (x, S) {
      x.fillStyle = "#050806"; x.fillRect(0, 0, S, S);
      x.fillStyle = "rgba(160,230,120,.6)"; for (var i = 0; i < 30; i++) x.fillRect((i * 37) % S, (i * 53) % S * 0.4, 2, 1);
      x.strokeStyle = "rgba(240,240,230,.85)"; x.lineWidth = 2; x.beginPath(); x.moveTo(S * 0.15, S * 0.6); x.quadraticCurveTo(S * 0.5, S * 0.32, S * 0.85, S * 0.6); x.quadraticCurveTo(S * 0.5, S * 0.86, S * 0.15, S * 0.6); x.stroke();
      var g = x.createRadialGradient(S / 2, S * 0.6, 2, S / 2, S * 0.6, S * 0.16); g.addColorStop(0, "#000"); g.addColorStop(0.55, "#000"); g.addColorStop(0.6, "#4a6a3a"); g.addColorStop(1, "#2a3a22");
      x.fillStyle = g; x.beginPath(); x.arc(S / 2, S * 0.6, S * 0.15, 0, 6.3); x.fill();
    },
    beck: function (x, S) {
      glow(x, S, "rgba(255,190,140,.3)");
      x.strokeStyle = "#1c1c1c"; x.lineWidth = 4; x.beginPath(); x.arc(S * 0.3, S * 0.7, S * 0.14, 0, 6.3); x.stroke(); x.beginPath(); x.arc(S * 0.72, S * 0.7, S * 0.14, 0, 6.3); x.stroke();
      x.strokeStyle = "#a33"; x.lineWidth = 4; x.beginPath(); x.moveTo(S * 0.3, S * 0.7); x.lineTo(S * 0.48, S * 0.46); x.lineTo(S * 0.72, S * 0.7); x.moveTo(S * 0.48, S * 0.46); x.lineTo(S * 0.66, S * 0.46); x.lineTo(S * 0.72, S * 0.7); x.stroke();
      x.strokeStyle = "#6b4a2c"; x.lineWidth = 3; x.beginPath(); x.moveTo(S * 0.18, S * 0.18); x.lineTo(S * 0.58, S * 0.4); x.stroke();
      x.fillStyle = "#c99a50"; x.beginPath(); x.arc(S * 0.8, S * 0.24, S * 0.07, 0, 6.3); x.fill();
    },
    pen: function (x, S) {
      glow(x, S, "rgba(255,220,150,.3)");
      rr(x, S * 0.12, S * 0.3, S * 0.76, S * 0.5, 4, "#e9dfc6");
      x.strokeStyle = "rgba(40,40,70,.7)"; x.lineWidth = 1.2; for (var i = 0; i < 4; i++) { x.beginPath(); x.moveTo(S * 0.18, S * (0.4 + i * 0.08)); x.lineTo(S * 0.5, S * (0.4 + i * 0.08)); x.stroke(); }
      x.strokeStyle = "rgba(20,60,120,.8)"; for (i = 0; i < 3; i++) { x.beginPath(); x.moveTo(S * 0.54, S * (0.42 + i * 0.08)); x.lineTo(S * 0.8, S * (0.42 + i * 0.08)); x.stroke(); }
      x.save(); x.translate(S * 0.78, S * 0.3); x.rotate(0.7); rr(x, -3, -30, 7, 40, 3, "#2a3a6a"); x.restore();
    }
  };
})();
