/**
 * Cameo — the cut-out. A mask is a Uint8Array of width × height, 1 where
 * the subject is. These are the operations that make one from a photo's
 * alpha, a magic wand or a brush, clean it, and measure it: connected
 * components, hole filling, morphology, a blur, and an exact Euclidean
 * distance transform (Felzenszwalb & Huttenlocher's two-pass parabola
 * method), which is what later rounds the figure's edges over. No DOM;
 * runs in Node and the browser alike.
 */

export function makeMask(width, height, fill = 0) {
  const data = new Uint8Array(width * height);
  if (fill) data.fill(1);
  return { width, height, data };
}

/** A mask from an alpha (or any grey) channel: 1 where the value is above `threshold`. */
export function fromAlpha(alpha, width, height, threshold = 128) {
  const m = makeMask(width, height);
  for (let i = 0; i < width * height; i++) m.data[i] = alpha[i] > threshold ? 1 : 0;
  return m;
}

/** A mask from RGBA pixels and a predicate on (r, g, b, a). */
export function fromPixels(rgba, width, height, keep) {
  const m = makeMask(width, height);
  for (let i = 0, p = 0; i < width * height; i++, p += 4) m.data[i] = keep(rgba[p], rgba[p + 1], rgba[p + 2], rgba[p + 3]) ? 1 : 0;
  return m;
}

export function count(mask) { let n = 0; for (let i = 0; i < mask.data.length; i++) n += mask.data[i]; return n; }

export function clone(mask) { return { width: mask.width, height: mask.height, data: new Uint8Array(mask.data) }; }

/** The bounding box of the set pixels: { x0, y0, x1, y1 } inclusive, or null. */
export function bounds(mask) {
  const { width, height, data } = mask;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (data[y * width + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Label 4-connected components; returns { labels: Int32Array (0 = none),
 * sizes: number[] (index = label) }.
 */
export function components(mask) {
  const { width, height, data } = mask;
  const labels = new Int32Array(width * height);
  const sizes = [0];
  const stack = new Int32Array(width * height);
  let next = 1;
  for (let start = 0; start < data.length; start++) {
    if (!data[start] || labels[start]) continue;
    const label = next++;
    let size = 0, top = 0;
    stack[top++] = start; labels[start] = label;
    while (top) {
      const i = stack[--top]; size++;
      const x = i % width, y = (i - x) / width;
      if (x > 0 && data[i - 1] && !labels[i - 1]) { labels[i - 1] = label; stack[top++] = i - 1; }
      if (x < width - 1 && data[i + 1] && !labels[i + 1]) { labels[i + 1] = label; stack[top++] = i + 1; }
      if (y > 0 && data[i - width] && !labels[i - width]) { labels[i - width] = label; stack[top++] = i - width; }
      if (y < height - 1 && data[i + width] && !labels[i + width]) { labels[i + width] = label; stack[top++] = i + width; }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/** Keep only the largest component. */
export function largest(mask) {
  const { labels, sizes } = components(mask);
  if (sizes.length < 2) return clone(mask);
  let best = 1;
  for (let l = 2; l < sizes.length; l++) if (sizes[l] > sizes[best]) best = l;
  const out = makeMask(mask.width, mask.height);
  for (let i = 0; i < labels.length; i++) out.data[i] = labels[i] === best ? 1 : 0;
  return out;
}

/**
 * Fill holes: every background region not connected to the image border,
 * or only those smaller than `maxArea` pixels when given (so a gap between
 * a dog's legs stays open but a speck of background in its fur closes).
 */
export function fillHoles(mask, maxArea = Infinity) {
  const inv = makeMask(mask.width, mask.height);
  for (let i = 0; i < inv.data.length; i++) inv.data[i] = mask.data[i] ? 0 : 1;
  const { labels, sizes } = components(inv);
  const { width, height } = mask;
  const touches = new Uint8Array(sizes.length);
  for (let x = 0; x < width; x++) { touches[labels[x]] = 1; touches[labels[(height - 1) * width + x]] = 1; }
  for (let y = 0; y < height; y++) { touches[labels[y * width]] = 1; touches[labels[y * width + width - 1]] = 1; }
  const out = clone(mask);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l && !touches[l] && sizes[l] <= maxArea) out.data[i] = 1;
  }
  return out;
}

function dilateOrErode(mask, radius, erode) {
  const { width, height, data } = mask;
  const out = makeMask(width, height);
  const r2 = radius * radius;
  // separable-ish: a disc by checking the neighbourhood; radii are small
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const here = data[y * width + x];
    let hit = false;
    for (let dy = -radius; dy <= radius && !hit; dy++) {
      const yy = y + dy; if (yy < 0 || yy >= height) { if (erode) hit = true; continue; }
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const xx = x + dx; if (xx < 0 || xx >= width) { if (erode) { hit = true; break; } continue; }
        const v = data[yy * width + xx];
        if (erode ? !v : v) { hit = true; break; }
      }
    }
    out.data[y * width + x] = erode ? (here && !hit ? 1 : 0) : (here || hit ? 1 : 0);
  }
  return out;
}
export const dilate = (mask, radius = 1) => dilateOrErode(mask, radius, false);
export const erode = (mask, radius = 1) => dilateOrErode(mask, radius, true);
/** Open (erode then dilate) removes specks and hairs; close fills nicks. */
export const open = (mask, radius = 1) => dilate(erode(mask, radius), radius);
export const close = (mask, radius = 1) => erode(dilate(mask, radius), radius);

/** Tidy a cut-out for printing: close nicks, open hairs, keep the biggest piece, fill small holes. */
export function tidy(mask, { radius = 2, holeArea = 400 } = {}) {
  return fillHoles(largest(open(close(mask, radius), radius)), holeArea);
}

/* ---------- distance transform ---------- */

/** One-dimensional squared distance transform (Felzenszwalb & Huttenlocher). */
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

/**
 * Exact Euclidean distance, in pixels, from every set pixel to the nearest
 * unset pixel (or the image edge when `edgeIsOutside`). Unset pixels get 0.
 * Returns a Float32Array.
 */
export function distanceTransform(mask, { edgeIsOutside = true } = {}) {
  if (edgeIsOutside) {
    // a ring of outside pixels round the image, so the edge counts as outside exactly
    const W = mask.width + 2, H = mask.height + 2;
    const padded = makeMask(W, H);
    for (let y = 0; y < mask.height; y++) padded.data.set(mask.data.subarray(y * mask.width, (y + 1) * mask.width), (y + 1) * W + 1);
    const d = distanceTransform(padded, { edgeIsOutside: false });
    const out = new Float32Array(mask.width * mask.height);
    for (let y = 0; y < mask.height; y++) out.set(d.subarray((y + 1) * W + 1, (y + 1) * W + 1 + mask.width), y * mask.width);
    return out;
  }
  const { width, height, data } = mask;
  const INF = 1e20;
  const f = new Float64Array(width * height);
  for (let i = 0; i < f.length; i++) f[i] = data[i] ? INF : 0;
  const n = Math.max(width, height);
  const col = new Float64Array(n), dcol = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) col[y] = f[y * width + x];
    edt1d(col, height, dcol, v, z);
    for (let y = 0; y < height; y++) f[y * width + x] = dcol[y];
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = f.subarray(y * width, (y + 1) * width);
    edt1d(row, width, dcol, v, z);
    for (let x = 0; x < width; x++) out[y * width + x] = Math.sqrt(dcol[x]);
  }
  return out;
}

/* ---------- a magic wand and a brush ---------- */

/**
 * Flood-fill from (x, y) over pixels whose colour is within `tolerance`
 * (0–255, on the largest channel difference) of the start pixel; 8-way.
 * Returns a mask of the region.
 */
export function wand(rgba, width, height, x, y, tolerance = 32) {
  const m = makeMask(width, height);
  const start = (y * width + x) * 4;
  const r0 = rgba[start], g0 = rgba[start + 1], b0 = rgba[start + 2];
  const stack = new Int32Array(width * height);
  let top = 0;
  const i0 = y * width + x;
  stack[top++] = i0; m.data[i0] = 1;
  const near = i => { const p = i * 4; return Math.max(Math.abs(rgba[p] - r0), Math.abs(rgba[p + 1] - g0), Math.abs(rgba[p + 2] - b0)) <= tolerance; };
  while (top) {
    const i = stack[--top];
    const cx = i % width, cy = (i - cx) / width;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = cx + dx, yy = cy + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const j = yy * width + xx;
      if (m.data[j] || !near(j)) continue;
      m.data[j] = 1; stack[top++] = j;
    }
  }
  return m;
}

/** Paint a disc of `radius` at (x, y) into the mask, with value 1 (add) or 0 (take away). */
export function brush(mask, x, y, radius, value = 1) {
  const { width, height, data } = mask;
  const r = Math.ceil(radius);
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > radius * radius) continue;
    const xx = Math.round(x) + dx, yy = Math.round(y) + dy;
    if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
    data[yy * width + xx] = value;
  }
  return mask;
}

export function union(a, b) { const out = clone(a); for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] || b.data[i] ? 1 : 0; return out; }
export function subtract(a, b) { const out = clone(a); for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] && !b.data[i] ? 1 : 0; return out; }
export function invert(a) { const out = clone(a); for (let i = 0; i < out.data.length; i++) out.data[i] = a.data[i] ? 0 : 1; return out; }

/** Nearest-neighbour resample of a mask to another size. */
export function resample(mask, width, height) {
  const out = makeMask(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(mask.height - 1, Math.floor((y + 0.5) * mask.height / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(mask.width - 1, Math.floor((x + 0.5) * mask.width / width));
      out.data[y * width + x] = mask.data[sy * mask.width + sx];
    }
  }
  return out;
}

/** Bilinear resample of a float field to another size. */
export function resampleField(field, w, h, width, height) {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.max(0, Math.min(h - 1, (y + 0.5) * h / height - 0.5)), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.max(0, Math.min(w - 1, (x + 0.5) * w / width - 0.5)), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      out[y * width + x] = (field[y0 * w + x0] * (1 - tx) + field[y0 * w + x1] * tx) * (1 - ty) + (field[y1 * w + x0] * (1 - tx) + field[y1 * w + x1] * tx) * ty;
    }
  }
  return out;
}

/** A separable box blur of a float field, `passes` times (three passes ≈ Gaussian). */
export function blurField(field, width, height, radius = 2, passes = 3) {
  let src = Float32Array.from(field), dst = new Float32Array(field.length);
  const tmp = new Float32Array(field.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) {
      let sum = 0; const row = y * width;
      for (let x = -radius; x <= radius; x++) sum += src[row + Math.max(0, Math.min(width - 1, x))];
      for (let x = 0; x < width; x++) {
        tmp[row + x] = sum / (2 * radius + 1);
        sum += src[row + Math.min(width - 1, x + radius + 1)] - src[row + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += tmp[Math.max(0, Math.min(height - 1, y)) * width + x];
      for (let y = 0; y < height; y++) {
        dst[y * width + x] = sum / (2 * radius + 1);
        sum += tmp[Math.min(height - 1, y + radius + 1) * width + x] - tmp[Math.max(0, y - radius) * width + x];
      }
    }
    [src, dst] = [dst, src];
  }
  return src;
}
