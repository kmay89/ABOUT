/**
 * Pictures that are not photographs, and words on top of any picture.
 *
 * A lithophane shows light where its picture is light, so every pattern here
 * is drawn as light on dark (or dark on light) with shapes bold enough to
 * survive becoming plastic: nothing finer than about a millimetre, no
 * hairlines. They are drawn on a canvas at the picture's own proportions and
 * then go through the same pipeline as a photo, so they fill the other sides
 * of a lantern, a showcase frame's spare slots, or a pane of their own.
 *
 * Words are drawn onto the picture in millimetres, after the photo and before
 * it becomes thickness, in one of seven open-licence fonts bundled in
 * luma/fonts/ (see OFL.txt). Every function draws into a 2D context and
 * keeps no state; patterns are seeded, so the same choice always gives the
 * same picture.
 */

export const FONTS = Object.freeze([
  { id: 'cormorant', name: 'Classic', family: 'Luma Cormorant', file: 'cormorant-garamond.woff2', scale: 1.15 },
  { id: 'playfair', name: 'Elegant', family: 'Luma Playfair', file: 'playfair-display.woff2', scale: 1.0 },
  { id: 'vibes', name: 'Script', family: 'Luma Great Vibes', file: 'great-vibes.woff2', scale: 1.35 },
  { id: 'dancing', name: 'Handwritten', family: 'Luma Dancing Script', file: 'dancing-script.woff2', scale: 1.15 },
  { id: 'cinzel', name: 'Roman', family: 'Luma Cinzel', file: 'cinzel.woff2', scale: 0.95 },
  { id: 'josefin', name: 'Deco', family: 'Luma Josefin Sans', file: 'josefin-sans.woff2', scale: 1.05 },
  { id: 'montserrat', name: 'Modern', family: 'Luma Montserrat', file: 'montserrat.woff2', scale: 0.95 },
]);

const loaded = new Map();
/** Load a bundled font once; resolves when the canvas can draw with it. */
export function loadFont(id, base = './fonts/') {
  const font = FONTS.find(f => f.id === id);
  if (!font || typeof FontFace === 'undefined' || typeof document === 'undefined') return Promise.resolve(false);
  if (!loaded.has(id)) {
    loaded.set(id, new FontFace(font.family, `url(${base}${font.file})`).load()
      .then(face => { document.fonts.add(face); return true; })
      .catch(() => false));
  }
  return loaded.get(id);
}

/** A small, seeded random number generator, so a pattern is the same every time. */
function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const grey = v => { const c = Math.round(Math.max(0, Math.min(1, v)) * 255); return `rgb(${c},${c},${c})`; };

function sky(ctx, w, h, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, grey(top)); g.addColorStop(1, grey(bottom));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function halo(ctx, x, y, r, v, a = 0.6) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(255,255,255,${a * v})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
}

function moon(ctx, x, y, r, crescent) {
  halo(ctx, x, y, r * 3.2, 1, 0.45);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  if (crescent) {
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.2, r * 0.92, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
}

function stars(ctx, w, h, n, rnd, maxY = h) {
  const u = Math.min(w, h) / 100;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w, y = rnd() * maxY, r = u * (0.35 + rnd() * rnd() * 0.9);
    ctx.fillStyle = grey(0.7 + rnd() * 0.3);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    if (rnd() < 0.08) sparkle(ctx, x, y, r * 4);
  }
}

function sparkle(ctx, x, y, s) {
  ctx.fillStyle = '#fff'; ctx.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, r = k % 2 ? s * 0.22 : s;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
}

function pine(ctx, x, base, height, v) {
  const w = height * 0.42;
  ctx.fillStyle = grey(v); ctx.beginPath(); ctx.moveTo(x, base - height);
  for (let t = 1; t <= 4; t++) {
    const y = base - height + height * t / 4.4, half = w * t / 4 / 2;
    ctx.lineTo(x + half, y); ctx.lineTo(x + half * 0.45, y);
  }
  ctx.lineTo(x + height * 0.04, base); ctx.lineTo(x - height * 0.04, base);
  for (let t = 4; t >= 1; t--) {
    const y = base - height + height * t / 4.4, half = w * t / 4 / 2;
    ctx.lineTo(x - half * 0.45, y); ctx.lineTo(x - half, y);
  }
  ctx.closePath(); ctx.fill();
}

function snowflake(ctx, x, y, r, angle, v) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.strokeStyle = grey(v); ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, r * 0.16);
  for (let k = 0; k < 6; k++) {
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r);
    for (const t of [0.45, 0.72]) {
      ctx.moveTo(0, -r * t); ctx.lineTo(r * 0.28 * (1.2 - t), -r * (t + 0.18));
      ctx.moveTo(0, -r * t); ctx.lineTo(-r * 0.28 * (1.2 - t), -r * (t + 0.18));
    }
    ctx.stroke(); ctx.rotate(Math.PI / 3);
  }
  ctx.restore();
}

function heart(ctx, x, y, s, angle, fill) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(0, 0.35);
  ctx.bezierCurveTo(-0.9, -0.25, -0.45, -0.95, 0, -0.45);
  ctx.bezierCurveTo(0.45, -0.95, 0.9, -0.25, 0, 0.35);
  ctx.fillStyle = fill; ctx.fill(); ctx.restore();
}

function leaf(ctx, x, y, s, angle, v, vein) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.fillStyle = grey(v); ctx.beginPath(); ctx.moveTo(0, -s);
  ctx.quadraticCurveTo(s * 0.62, -s * 0.2, 0, s); ctx.quadraticCurveTo(-s * 0.62, -s * 0.2, 0, -s); ctx.fill();
  if (vein !== undefined) {
    ctx.strokeStyle = grey(vein); ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.beginPath(); ctx.moveTo(0, -s * 0.85); ctx.lineTo(0, s * 1.25); ctx.stroke();
  }
  ctx.restore();
}

function blossom(ctx, x, y, r, v, centre) {
  ctx.fillStyle = grey(v);
  for (let k = 0; k < 5; k++) {
    const a = k * Math.PI * 2 / 5 - Math.PI / 2;
    ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.5, r * 0.32, a, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = grey(centre); ctx.beginPath(); ctx.arc(x, y, r * 0.24, 0, Math.PI * 2); ctx.fill();
}

/** Each pattern: a name, the season it suits, and draw(ctx, w, h). Light glows; dark holds back. */
export const PATTERNS = Object.freeze([
  { id: 'stars', name: 'Starry night', season: 'Any night', draw(ctx, w, h) {
    const rnd = random(7); sky(ctx, w, h, 0.05, 0.22);
    stars(ctx, w, h, Math.round(w * h / 2600), rnd);
    moon(ctx, w * 0.72, h * 0.22, Math.min(w, h) * 0.1, true);
  } },
  { id: 'forest', name: 'Moonlit pines', season: 'Winter · holidays', draw(ctx, w, h) {
    const rnd = random(11); sky(ctx, w, h, 0.12, 0.72);
    stars(ctx, w, h, Math.round(w * h / 5200), rnd, h * 0.55);
    moon(ctx, w * 0.3, h * 0.24, Math.min(w, h) * 0.09, false);
    for (let i = 0; i < 9; i++) pine(ctx, w * (i + rnd() * 0.6) / 8, h * 0.86, h * (0.18 + rnd() * 0.12), 0.38);
    ctx.fillStyle = grey(0.38); ctx.fillRect(0, h * 0.85, w, h * 0.15);
    for (let i = 0; i < 6; i++) pine(ctx, w * (i + rnd() * 0.5) / 5 - w * 0.05, h * 1.0, h * (0.3 + rnd() * 0.16), 0.04);
  } },
  { id: 'snow', name: 'Snowfall', season: 'Winter', draw(ctx, w, h) {
    const rnd = random(23), g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, grey(0.36)); g.addColorStop(1, grey(0.12)); ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const u = Math.min(w, h);
    for (let i = 0; i < 26; i++) snowflake(ctx, rnd() * w, rnd() * h, u * (0.03 + rnd() * 0.07), rnd() * Math.PI, 0.82 + rnd() * 0.18);
    for (let i = 0; i < 90; i++) { ctx.fillStyle = grey(0.9); ctx.beginPath(); ctx.arc(rnd() * w, rnd() * h, u * 0.006, 0, Math.PI * 2); ctx.fill(); }
  } },
  { id: 'blossom', name: 'Vines & blossoms', season: 'Spring', draw(ctx, w, h) {
    const rnd = random(31); sky(ctx, w, h, 0.97, 0.82);
    const u = Math.min(w, h);
    ctx.strokeStyle = grey(0.12); ctx.lineCap = 'round';
    for (let v = 0; v < 3; v++) {
      const x0 = w * (0.15 + v * 0.35), pts = [];
      ctx.lineWidth = u * 0.016; ctx.beginPath();
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const x = x0 + Math.sin(t * Math.PI * 3 + v) * w * 0.09, y = h * (1.05 - t * 1.1);
        pts.push([x, y]); t ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      pts.forEach(([x, y], i) => {
        if (i % 4 === 2) leaf(ctx, x, y, u * 0.045, (i % 8 ? 1 : -1) * (0.9 + rnd() * 0.4), 0.15);
        if (i % 9 === 5) blossom(ctx, x + (rnd() - 0.5) * u * 0.08, y, u * 0.06, 0.1, 0.95);
      });
    }
  } },
  { id: 'waves', name: 'Waves', season: 'Summer', draw(ctx, w, h) {
    const bands = 9;
    for (let b = 0; b <= bands; b++) {
      ctx.fillStyle = grey(0.92 - b * 0.085); ctx.beginPath();
      const y0 = h * (b / bands) * 0.95 + h * 0.06, amp = h * 0.025;
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 60) ctx.lineTo(x, y0 + Math.sin(x / w * Math.PI * (2.5 + b * 0.25) + b * 1.3) * amp);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
    }
    halo(ctx, w * 0.75, h * 0.12, Math.min(w, h) * 0.35, 1, 0.9);
  } },
  { id: 'leaves', name: 'Falling leaves', season: 'Autumn', draw(ctx, w, h) {
    const rnd = random(41); sky(ctx, w, h, 0.85, 0.6);
    const u = Math.min(w, h);
    for (let i = 0; i < 34; i++) leaf(ctx, rnd() * w, rnd() * h, u * (0.05 + rnd() * 0.06), rnd() * Math.PI * 2, 0.08 + rnd() * 0.32, 0.8);
  } },
  { id: 'hearts', name: 'Hearts', season: 'Valentine’s · anniversaries', draw(ctx, w, h) {
    const rnd = random(53); sky(ctx, w, h, 0.18, 0.08);
    const u = Math.min(w, h);
    for (let i = 0; i < 30; i++) heart(ctx, rnd() * w, rnd() * h, u * (0.05 + rnd() * 0.08), (rnd() - 0.5) * 0.6, grey(0.75 + rnd() * 0.25));
    heart(ctx, w / 2, h / 2, u * 0.3, 0, '#fff');
  } },
  { id: 'deco', name: 'Art deco sunburst', season: 'Any time', draw(ctx, w, h) {
    ctx.fillStyle = grey(0.1); ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 1.02, rays = 28, R = Math.hypot(w, h);
    for (let i = 0; i < rays; i++) {
      const a0 = Math.PI + i * Math.PI / rays, a1 = a0 + Math.PI / rays * 0.55;
      ctx.fillStyle = grey(i % 2 ? 0.55 : 0.8); ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1); ctx.closePath(); ctx.fill();
    }
    for (let k = 4; k >= 1; k--) {
      ctx.fillStyle = grey(k % 2 ? 0.08 : 0.95); ctx.beginPath(); ctx.arc(cx, cy, Math.min(w, h) * 0.11 * k, Math.PI, 0); ctx.fill();
    }
    const m = Math.min(w, h) * 0.04;
    ctx.strokeStyle = grey(0.95); ctx.lineWidth = m * 0.35; ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
    ctx.lineWidth = m * 0.18; ctx.strokeRect(m * 1.9, m * 1.9, w - 3.8 * m, h - 3.8 * m);
  } },
  { id: 'honeycomb', name: 'Honeycomb', season: 'Any time', draw(ctx, w, h) {
    ctx.fillStyle = grey(0.06); ctx.fillRect(0, 0, w, h);
    const r = Math.min(w, h) / 9, dx = r * Math.sqrt(3), dy = r * 1.5;
    for (let row = -1; row * dy < h + r; row++) for (let col = -1; col * dx < w + dx; col++) {
      const x = col * dx + (row % 2 ? dx / 2 : 0), y = row * dy;
      const d = Math.hypot(x - w / 2, y - h / 2) / Math.hypot(w / 2, h / 2);
      ctx.fillStyle = grey(0.95 - d * 0.55); ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; ctx.lineTo(x + Math.cos(a) * r * 0.86, y + Math.sin(a) * r * 0.86); }
      ctx.closePath(); ctx.fill();
    }
  } },
  { id: 'glow', name: 'Soft glow', season: 'A quiet side', draw(ctx, w, h) {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.hypot(w, h) / 2);
    g.addColorStop(0, grey(1)); g.addColorStop(0.7, grey(0.9)); g.addColorStop(1, grey(0.62));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  } },
  { id: 'card', name: 'Words card', season: 'For your own words', draw(ctx, w, h) {
    sky(ctx, w, h, 0.96, 0.9);
    const m = Math.min(w, h) * 0.05;
    ctx.strokeStyle = grey(0.1); ctx.lineWidth = m * 0.3; ctx.strokeRect(m, m, w - 2 * m, h - 2 * m);
    ctx.lineWidth = m * 0.12; ctx.strokeRect(m * 1.8, m * 1.8, w - 3.6 * m, h - 3.6 * m);
    for (const [x, y] of [[m * 1.8, m * 1.8], [w - m * 1.8, m * 1.8], [m * 1.8, h - m * 1.8], [w - m * 1.8, h - m * 1.8]]) {
      ctx.fillStyle = grey(0.1); ctx.beginPath(); ctx.arc(x, y, m * 0.45, 0, Math.PI * 2); ctx.fill();
    }
  } },
]);

/** A pattern as a canvas of the picture's proportions, ready to use like a photo. */
export function patternCanvas(id, aspect, long = 1400) {
  const p = PATTERNS.find(x => x.id === id) || PATTERNS[0];
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(aspect >= 1 ? long : long * aspect);
  canvas.height = Math.round(aspect >= 1 ? long / aspect : long);
  const ctx = canvas.getContext('2d');
  p.draw(ctx, canvas.width, canvas.height);
  return canvas;
}

/**
 * Words on the picture. Drawn in millimetres into a context already scaled to
 * millimetres, across a photo area iw × ih. Light letters glow; dark letters
 * read as shadow. A soft band behind them keeps them legible over a busy photo.
 * @param {object} w { lines: [string, string], font, size (mm, letter height),
 *   position: 'top'|'middle'|'bottom', style: 'glow'|'dark', band: boolean }
 */
export function drawWords(ctx, iw, ih, w) {
  const lines = (w.lines || []).map(s => (s || '').trim()).filter(Boolean);
  if (!lines.length) return;
  const font = FONTS.find(f => f.id === w.font) || FONTS[0];
  const size = Math.max(3, Math.min(40, w.size || 10)) * font.scale;
  const second = size * 0.62, gapMm = size * 0.35;
  const sizes = lines.map((_, i) => i ? second : size);
  const block = sizes.reduce((a, b) => a + b, 0) + gapMm * (lines.length - 1);
  const margin = Math.max(4, size * 0.5);
  const top = w.position === 'top' ? margin : w.position === 'middle' ? (ih - block) / 2 : ih - margin - block;
  const glow = w.style !== 'dark';
  ctx.save();
  if (w.band) {
    const pad = size * 0.55, y0 = top - pad, y1 = top + block + pad;
    const g = ctx.createLinearGradient(0, y0, 0, y1), c = glow ? '0,0,0' : '255,255,255';
    g.addColorStop(0, `rgba(${c},0)`); g.addColorStop(0.25, `rgba(${c},0.62)`);
    g.addColorStop(0.75, `rgba(${c},0.62)`); g.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = g; ctx.fillRect(0, y0, iw, y1 - y0);
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  let y = top;
  lines.forEach((text, i) => {
    const s = sizes[i];
    ctx.font = `${s}px "${font.family}", Georgia, serif`;
    // Shrink a line that would not fit across the photo.
    const width = ctx.measureText(text).width, fit = Math.min(1, (iw - 2 * margin) / Math.max(1e-6, width));
    if (fit < 1) ctx.font = `${s * fit}px "${font.family}", Georgia, serif`;
    y += s * (fit < 1 ? fit : 1);
    // A thin outline in the opposite tone keeps letters crisp against the photo.
    ctx.lineJoin = 'round'; ctx.lineWidth = s * 0.08;
    ctx.strokeStyle = glow ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.85)';
    ctx.strokeText(text, iw / 2, y - s * 0.12);
    ctx.fillStyle = glow ? '#fff' : '#000';
    ctx.fillText(text, iw / 2, y - s * 0.12);
    y += gapMm;
  });
  ctx.restore();
}
