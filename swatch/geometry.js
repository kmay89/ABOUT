/**
 * Swatch — the coupons. Every test is a grid of small solids, each carrying
 * its own slicer settings and a label it prints on itself, so the plate can
 * be read after the fact without the legend. Only boxes and prisms: a
 * coupon is a slab, a tab for the label, and the label's pixels. Overlapping
 * closed shells inside one object are fine for a slicer — it unions each
 * layer's outlines (non-zero fill) — so the pixels simply sink a little into
 * the tab rather than being booleaned onto it. No DOM; runs in Node and the
 * browser alike.
 *
 * Meshes are { vertices: number[] (xyz triples), indices: number[] (triangle
 * triples) }, millimetres, Z up, the coupon centred on the origin in XY and
 * standing on z = 0 — that is its printing position.
 */

/* ---------- a 3 × 5 pixel font ---------- */

const GLYPHS = {
  '0': ['###', '# #', '# #', '# #', '###'],
  '1': [' # ', '## ', ' # ', ' # ', '###'],
  '2': ['###', '  #', '###', '#  ', '###'],
  '3': ['###', '  #', '###', '  #', '###'],
  '4': ['# #', '# #', '###', '  #', '  #'],
  '5': ['###', '#  ', '###', '  #', '###'],
  '6': ['###', '#  ', '###', '# #', '###'],
  '7': ['###', '  #', ' # ', ' # ', ' # '],
  '8': ['###', '# #', '###', '# #', '###'],
  '9': ['###', '# #', '###', '  #', '###'],
  '.': ['   ', '   ', '   ', '   ', ' # '],
  '-': ['   ', '   ', '###', '   ', '   '],
  '/': ['  #', '  #', ' # ', '#  ', '#  '],
  '%': ['# #', '  #', ' # ', '#  ', '# #'],
  ':': ['   ', ' # ', '   ', ' # ', '   '],
  ' ': ['   ', '   ', '   ', '   ', '   '],
  'A': ['###', '# #', '###', '# #', '# #'],
  'B': ['## ', '# #', '## ', '# #', '## '],
  'C': ['###', '#  ', '#  ', '#  ', '###'],
  'D': ['## ', '# #', '# #', '# #', '## '],
  'E': ['###', '#  ', '## ', '#  ', '###'],
  'F': ['###', '#  ', '## ', '#  ', '#  '],
  'G': ['###', '#  ', '# #', '# #', '###'],
  'H': ['# #', '# #', '###', '# #', '# #'],
  'I': ['###', ' # ', ' # ', ' # ', '###'],
  'J': ['  #', '  #', '  #', '# #', '###'],
  'K': ['# #', '# #', '## ', '# #', '# #'],
  'L': ['#  ', '#  ', '#  ', '#  ', '###'],
  'M': ['# #', '###', '###', '# #', '# #'],
  'N': ['## ', '# #', '# #', '# #', '# #'],
  'O': ['###', '# #', '# #', '# #', '###'],
  'P': ['###', '# #', '###', '#  ', '#  '],
  'Q': ['###', '# #', '# #', '###', '  #'],
  'R': ['## ', '# #', '## ', '# #', '# #'],
  'S': ['###', '#  ', '###', '  #', '###'],
  'T': ['###', ' # ', ' # ', ' # ', ' # '],
  'U': ['# #', '# #', '# #', '# #', '###'],
  'V': ['# #', '# #', '# #', '# #', ' # '],
  'W': ['# #', '# #', '###', '###', '# #'],
  'X': ['# #', '# #', ' # ', '# #', '# #'],
  'Y': ['# #', '# #', '###', ' # ', ' # '],
  'Z': ['###', '  #', ' # ', '#  ', '###'],
};
export const GLYPH_ROWS = 5, GLYPH_COLS = 3, GLYPH_ADVANCE = 4, LINE_ADVANCE = 6;

/** The width in pixels of a line of text in this font. */
export function textCols(text) { return text.length ? text.length * GLYPH_ADVANCE - 1 : 0; }

/**
 * Rasterize lines of text to a set of pixels: [{col, row}], col from the
 * left, row from the TOP of the block (the first line is row 0..4). Unknown
 * characters print as a blank cell. `mirror` flips columns, for a label
 * that will be read from underneath.
 */
export function rasterize(lines, { mirror = false } = {}) {
  const pixels = [];
  const width = Math.max(0, ...lines.map(textCols));
  lines.forEach((line, li) => {
    const text = String(line).toUpperCase();
    const offset = Math.floor((width - textCols(text)) / 2);
    for (let ci = 0; ci < text.length; ci++) {
      const glyph = GLYPHS[text[ci]] || GLYPHS[' '];
      for (let r = 0; r < GLYPH_ROWS; r++) for (let c = 0; c < GLYPH_COLS; c++) {
        if (glyph[r][c] !== '#') continue;
        const col = offset + ci * GLYPH_ADVANCE + c;
        pixels.push({ col: mirror ? width - 1 - col : col, row: li * LINE_ADVANCE + r });
      }
    }
  });
  const rows = lines.length ? lines.length * LINE_ADVANCE - 1 : 0;
  return { pixels, cols: width, rows };
}

/* ---------- primitives ---------- */

export function emptyMesh() { return { vertices: [], indices: [] }; }

/** An axis-aligned box from (x0,y0,z0) to (x1,y1,z1), wound outward. */
export function box(mesh, x0, y0, z0, x1, y1, z1) {
  const b = mesh.vertices.length / 3;
  mesh.vertices.push(
    x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0,
    x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1);
  const q = (a, b2, c, d) => mesh.indices.push(b + a, b + b2, b + c, b + a, b + c, b + d);
  q(0, 3, 2, 1); // bottom, seen from below
  q(4, 5, 6, 7); // top
  q(0, 1, 5, 4); // front (y0)
  q(1, 2, 6, 5); // right (x1)
  q(2, 3, 7, 6); // back (y1)
  q(3, 0, 4, 7); // left (x0)
  return mesh;
}

/** A right prism on a regular n-gon: a cylinder for the slicer's purposes. */
export function prism(mesh, cx, cy, r, z0, z1, n = 96) {
  const b = mesh.vertices.length / 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    mesh.vertices.push(x, y, z0, x, y, z1);
  }
  const cb = b + 2 * n, ct = cb + 1;
  mesh.vertices.push(cx, cy, z0, cx, cy, z1);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n, lo = b + 2 * i, hi = lo + 1, lo2 = b + 2 * j, hi2 = lo2 + 1;
    mesh.indices.push(lo, lo2, hi2, lo, hi2, hi); // side, outward
    mesh.indices.push(cb, lo2, lo);               // bottom fan, facing down
    mesh.indices.push(ct, hi, hi2);               // top fan, facing up
  }
  return mesh;
}

/* ---------- labels ---------- */

/**
 * Raised pixels for `lines` of text, centred on (cx, cy), the block's top
 * edge toward +y, standing on z = base (sunk `sink` below it so the shells
 * overlap) and `raise` tall. Pixel size `px` mm. Returns the block's size.
 */
export function raisedLabel(mesh, lines, { cx = 0, cy = 0, px = 1, base = 0, raise = 0.6, sink = 0.2 } = {}) {
  const { pixels, cols, rows } = rasterize(lines);
  const x0 = cx - cols * px / 2, yTop = cy + rows * px / 2;
  for (const p of pixels) {
    const x = x0 + p.col * px, y = yTop - (p.row + 1) * px;
    box(mesh, x, y, base - sink, x + px, y + px, base + raise);
  }
  return { width: cols * px, depth: rows * px };
}

/**
 * The solid part of a label strip that reads as holes: a block `w` × `d`
 * from z0 to z1 with the text cut through it, mirrored so it reads from
 * underneath (the first layer is judged from the bottom). The strip is
 * cells of `px`; each row's solid cells are merged into runs, one box per
 * run, and an unused border of cells is one box. Cells touching cells is
 * fine for a slicer. `edge` is a tiny overlap so neighbours never merely
 * touch at floating-point width.
 */
export function stencilStrip(mesh, lines, { x0, y0, w, d, z0, z1, px = 1.2, edge = 0.02 } = {}) {
  const { pixels, cols, rows } = rasterize(lines, { mirror: true });
  const gridCols = Math.max(cols, Math.floor(w / px)), gridRows = Math.max(rows, Math.floor(d / px));
  const cellW = w / gridCols, cellD = d / gridRows;
  const colOff = Math.floor((gridCols - cols) / 2), rowOff = Math.floor((gridRows - rows) / 2);
  const holes = new Set(pixels.map(p => `${p.col + colOff},${rowOff + p.row}`));
  for (let r = 0; r < gridRows; r++) {
    // rows count from the top (back, +y) of the block downward
    const yTop = y0 + d - r * cellD, yBot = yTop - cellD;
    let run = -1;
    for (let c = 0; c <= gridCols; c++) {
      const solid = c < gridCols && !holes.has(`${c},${r}`);
      if (solid && run < 0) run = c;
      if (!solid && run >= 0) {
        box(mesh, x0 + run * cellW - (run ? edge : 0), yBot - (r < gridRows - 1 ? edge : 0), z0,
          x0 + c * cellW + (c < gridCols ? edge : 0), yTop + (r ? edge : 0), z1);
        run = -1;
      }
    }
  }
  return { cellW, cellD };
}

/* ---------- coupons ---------- */

/** Pixel size that lets `cols` pixels fit in `room` mm, between bounds. */
function fitPx(cols, room, want, min) { return Math.max(min, Math.min(want, cols ? room / cols : want)); }

/**
 * Choose one line or two for a label: one line when its pixels stay at
 * least `minPx`, else two. `lines` forces a count and `px` a size, so a
 * whole grid can share one layout (plate.js works it out from the longest
 * label). Returns { lines, px }.
 */
export function layoutLabel(parts, room, { px = 1, minPx = 0.85, lines: force = 0 } = {}) {
  const clean = parts.map(String).filter(Boolean);
  const one = [clean.join('/')];
  const onePx = fitPx(textCols(one[0]), room, px, 0);
  if (force !== 2 && (clean.length < 2 || force === 1 || onePx >= minPx)) return { lines: one, px: Math.max(onePx, minPx) };
  return { lines: clean, px: fitPx(Math.max(...clean.map(textCols)), room, px, minPx) };
}

/** The width a coupon of this kind offers its label. */
export function labelRoom(type, c = {}) {
  if (type === 'cylinder') return (c.r ?? 10) * Math.SQRT2 - 2;
  if (type === 'gauge') { const w = c.w ?? 30, hole = c.hole ?? 10; return w / 2 - (-(w / 2 - hole / 2 - 3) + hole / 2) - 2; }
  if (type === 'socket') return (c.peg ?? 8) - 1;
  const margin = c.margin ?? 1.5;
  return (c.w ?? (type === 'pillar' ? 20 : 26)) - 2 * margin;
}

/**
 * A flat tile for judging a top surface: a slab `w` × `d` × `h` with a
 * lower tab along the front carrying the label in raised pixels. The test
 * area is the slab's top; the tab's top is a step down so the label never
 * interrupts it.
 */
export function tileCoupon({ w = 26, d = 22, h = 2.4, label = ['1'], px = 1, step = 1, raise = 0.6, margin = 1.5, layout } = {}) {
  const mesh = emptyMesh();
  const { lines, px: usePx } = layoutLabel(label, w - 2 * margin, { px, ...layout });
  const rows = lines.length * LINE_ADVANCE - 1;
  const tab = Math.ceil((rows * usePx + 2 * margin) * 2) / 2;
  const depth = d + tab, y0 = -depth / 2;
  const tabH = Math.max(0.6, h - step);
  box(mesh, -w / 2, y0 + tab - 0.02, 0, w / 2, depth / 2, h);
  box(mesh, -w / 2, y0, 0, w / 2, y0 + tab, tabH);
  raisedLabel(mesh, lines, { cx: 0, cy: y0 + tab / 2, px: usePx, base: tabH, raise });
  return { mesh, size: [w, depth, Math.max(h, tabH + raise)], area: [w, d], lines };
}

/**
 * A thin tile for judging the first layer from underneath: the label is
 * holes through a strip along the front, mirrored to read from below.
 */
export function stencilCoupon({ w = 26, d = 30, h = 1.2, label = ['1'], px = 1.2, margin = 1.5, layout } = {}) {
  const mesh = emptyMesh();
  const { lines, px: usePx } = layoutLabel(label, w - 2 * margin, { px, minPx: 1, ...layout });
  const rows = lines.length * LINE_ADVANCE - 1;
  const strip = Math.min(d - 6, Math.ceil((rows * usePx + 2 * margin) * 2) / 2);
  const y0 = -d / 2;
  box(mesh, -w / 2, y0 + strip - 0.02, 0, w / 2, d / 2, h);
  stencilStrip(mesh, lines, { x0: -w / 2, y0, w, d: strip, z0: 0, z1: h, px: usePx });
  return { mesh, size: [w, d, h], area: [w, d - strip], lines };
}

/** A square pillar for judging its outside walls, labelled on top. */
export function pillarCoupon({ w = 20, d = 20, h = 30, label = ['1'], px = 1, raise = 0.6, margin = 1.5, layout } = {}) {
  const mesh = emptyMesh();
  const { lines, px: usePx } = layoutLabel(label, w - 2 * margin, { px, minPx: 0.8, ...layout });
  box(mesh, -w / 2, -d / 2, 0, w / 2, d / 2, h);
  raisedLabel(mesh, lines, { cx: 0, cy: 0, px: usePx, base: h, raise });
  return { mesh, size: [w, d, h + raise], area: [w, d], lines };
}

/** A cylinder for judging the seam, labelled on top. */
export function cylinderCoupon({ r = 10, h = 25, label = ['1'], px = 1, raise = 0.6, sides = 120, layout } = {}) {
  const mesh = emptyMesh();
  const room = r * Math.SQRT2 - 2;
  const { lines, px: usePx } = layoutLabel(label, room, { px, minPx: 0.8, ...layout });
  prism(mesh, 0, 0, r, 0, h, sides);
  raisedLabel(mesh, lines, { cx: 0, cy: 0, px: usePx, base: h, raise });
  return { mesh, size: [2 * r, 2 * r, h + raise], area: [2 * r, 2 * r], lines };
}

/**
 * A block with a round through-hole: the outline sampled by angle from the
 * hole's centre (the rectangle's own corners added to the angles so they
 * stay sharp), inner and outer rings joined by quads top and bottom, and
 * walls outside and inside. One closed shell, no boolean needed.
 */
export function holedBlock(mesh, { w, d, h, cx = 0, cy = 0, r, n = 96 } = {}) {
  const corners = [[w / 2, d / 2], [-w / 2, d / 2], [-w / 2, -d / 2], [w / 2, -d / 2]].map(([x, y]) => Math.atan2(y - cy, x - cx));
  const angles = [...corners];
  for (let i = 0; i < n; i++) angles.push(-Math.PI + (i / n) * Math.PI * 2);
  angles.sort((a, b) => a - b);
  const uniq = angles.filter((a, i) => i === 0 || a - angles[i - 1] > 1e-9);
  const b = mesh.vertices.length / 3, m = uniq.length;
  for (const a of uniq) {
    const dx = Math.cos(a), dy = Math.sin(a);
    // the ray from the hole centre to the rectangle's edge
    const tx = dx > 1e-12 ? (w / 2 - cx) / dx : dx < -1e-12 ? (-w / 2 - cx) / dx : Infinity;
    const ty = dy > 1e-12 ? (d / 2 - cy) / dy : dy < -1e-12 ? (-d / 2 - cy) / dy : Infinity;
    const t = Math.min(tx, ty);
    const ox = cx + dx * t, oy = cy + dy * t, ix = cx + r * dx, iy = cy + r * dy;
    mesh.vertices.push(ox, oy, 0, ox, oy, h, ix, iy, 0, ix, iy, h); // outer lo, outer hi, inner lo, inner hi
  }
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m, o0 = b + 4 * i, o1 = b + 4 * j;
    const [olo, ohi, ilo, ihi] = [o0, o0 + 1, o0 + 2, o0 + 3], [olo2, ohi2, ilo2, ihi2] = [o1, o1 + 1, o1 + 2, o1 + 3];
    mesh.indices.push(ohi, ohi2, ihi2, ohi, ihi2, ihi);   // top ring, facing up
    mesh.indices.push(olo, ilo2, olo2, olo, ilo, ilo2);   // bottom ring, facing down
    mesh.indices.push(olo, olo2, ohi2, olo, ohi2, ohi);   // outer wall, outward
    mesh.indices.push(ilo, ihi2, ilo2, ilo, ihi, ihi2);   // inner wall, facing the hole
  }
  return mesh;
}

/**
 * A gauge for the calipers: a block with a Ø`hole` hole through it, so the
 * outside (contour compensation) and the inside (hole compensation) can
 * both be measured, labelled on top beside the hole.
 */
export function gaugeCoupon({ w = 30, d = 24, h = 4, hole = 10, label = ['1'], px = 0.9, raise = 0.6, layout } = {}) {
  const mesh = emptyMesh();
  const cx = -(w / 2 - hole / 2 - 3);                  // hole toward the left, 3 mm from the edge
  const room = w / 2 - (cx + hole / 2) - 2;            // what is left to the right of it
  const { lines, px: usePx } = layoutLabel(label, room, { px, minPx: 0.7, ...layout });
  holedBlock(mesh, { w, d, h, cx, cy: 0, r: hole / 2 });
  raisedLabel(mesh, lines, { cx: (cx + hole / 2 + w / 2) / 2, cy: 0, px: usePx, base: h, raise });
  return { mesh, size: [w, d, h + raise], area: [w, d], lines, measure: { width: w, depth: d, hole } };
}

/**
 * A socket and its peg: a block with a hole of Ø(`peg` + `clearance`) and,
 * standing beside it, a Ø`peg` pin to try in it. The clearance is the
 * label.
 */
export function socketCoupon({ peg = 8, clearance = 0.2, block = 18, h = 8, pegHeight = 14, gap = 5, label = ['1'], px = 0.9, raise = 0.6, layout } = {}) {
  const mesh = emptyMesh();
  const total = block + gap + peg, x0 = -total / 2;
  const bx = x0 + block / 2, pxc = x0 + block + gap + peg / 2;
  const { lines, px: usePx } = layoutLabel(label, block - 3, { px, minPx: 0.7, lines: 1, ...layout });
  // the block is shifted so the label strip along its front edge stays clear of the hole
  holedBlock(mesh, { w: block, d: block, h, cx: 0, cy: 0, r: (peg + clearance) / 2 });
  // move the block into place by shifting its vertices (it was built around the origin)
  for (let i = 0; i < mesh.vertices.length; i += 3) mesh.vertices[i] += bx;
  prism(mesh, pxc, 0, peg / 2, 0, pegHeight, 96);
  raisedLabel(mesh, lines, { cx: pxc, cy: 0, px: Math.min(usePx, (peg - 1) / Math.max(1, textCols(lines[0]))), base: pegHeight, raise });
  return { mesh, size: [total, block, pegHeight + raise], area: [total, block], lines, measure: { peg, clearance } };
}

export const COUPONS = Object.freeze({
  tile: tileCoupon, stencil: stencilCoupon, pillar: pillarCoupon, cylinder: cylinderCoupon, gauge: gaugeCoupon, socket: socketCoupon,
});

/* ---------- checks (used by the tests and the page's self-check) ---------- */

/** Signed volume by the divergence theorem; positive for outward winding. */
export function volume(mesh) {
  const v = mesh.vertices, ix = mesh.indices;
  let sum = 0;
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
    sum += v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1])
      - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c])
      + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c]);
  }
  return sum / 6;
}

/**
 * Is every edge shared by exactly two triangles that run it in opposite
 * directions? True for any union of closed, consistently wound shells.
 */
export function isClosed(mesh) {
  const edges = new Map();
  const ix = mesh.indices;
  for (let i = 0; i < ix.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const a = ix[i + k], b = ix[i + (k + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      const dir = a < b ? 1 : -1;
      edges.set(key, (edges.get(key) || 0) + dir);
      const n = `${key}#`;
      edges.set(n, (edges.get(n) || 0) + 1);
    }
  }
  for (const [key, count] of edges) {
    if (key.endsWith('#')) { if (count !== 2) return false; }
    else if (count !== 0) return false;
  }
  return true;
}

/** Axis-aligned bounds of a mesh: [[minx,miny,minz],[maxx,maxy,maxz]]. */
export function bounds(mesh) {
  const v = mesh.vertices, lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < v.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], v[i + k]); hi[k] = Math.max(hi[k], v[i + k]); }
  return [lo, hi];
}

/** Binary STL bytes of a mesh. */
export function binarySTL(mesh, { header = 'Swatch coupon | mm | Z up' } = {}) {
  const tris = mesh.indices.length / 3;
  const out = new ArrayBuffer(84 + tris * 50), view = new DataView(out);
  new TextEncoder().encodeInto(header.slice(0, 80), new Uint8Array(out, 0, 80));
  view.setUint32(80, tris, true);
  const v = mesh.vertices;
  let o = 84;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] * 3, b = mesh.indices[i + 1] * 3, c = mesh.indices[i + 2] * 3;
    const ux = v[b] - v[a], uy = v[b + 1] - v[a + 1], uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a], wy = v[c + 1] - v[a + 1], wz = v[c + 2] - v[a + 2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz) || 1; nx /= len; ny /= len; nz /= len;
    view.setFloat32(o, nx, true); view.setFloat32(o + 4, ny, true); view.setFloat32(o + 8, nz, true); o += 12;
    for (const p of [a, b, c]) { view.setFloat32(o, v[p], true); view.setFloat32(o + 4, v[p + 1], true); view.setFloat32(o + 8, v[p + 2], true); o += 12; }
    view.setUint16(o, 0, true); o += 2;
  }
  return out;
}
