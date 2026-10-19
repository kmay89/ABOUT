/**
 * Printable companions for a lithophane: a light box and a desk stand for a
 * flat picture, a tea-light base for a lamp, and a nightlight stand for a
 * curved shade. All dimensions are millimetres, measured from the picture's
 * own settings, so each one fits the panel it was made for.
 *
 * Every part is built the same way: a 2D cross-section (a "profile") swept
 * along a path — round a rectangle, round a circle, along an arc, or straight
 * — which gives a closed, consistently wound solid with no booleans. A part
 * that needs two shapes (the nightlight stand's floor and its rim) is two
 * such solids that overlap a little; slicers union overlapping shells within
 * one file.
 *
 * Each part comes in its print orientation (Z up, on the plate at Z = 0) and
 * with `place`, a function that moves a print-space point to where the part
 * sits beside the picture in the preview (picture coordinates from mesh.js:
 * X across, the image facing -Y, Z up). No DOM; runs anywhere.
 */

const CLEAR = 0.25;      // clearance round the picture, each side
const WALL = 2.4;        // six 0.4 mm lines
const FLOOR = 2;

/** Is a polygon in (u, v) counter-clockwise? */
function area(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Ear-clipping triangulation of a simple counter-clockwise polygon. */
export function triangulate(poly) {
  const index = poly.map((_, i) => i), out = [];
  const cross = (a, b, c) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  const inside = (p, a, b, c) => {
    const s = (u, v, w) => (poly[v][0] - poly[u][0]) * (p[1] - poly[u][1]) - (poly[v][1] - poly[u][1]) * (p[0] - poly[u][0]);
    return s(a, b) > 1e-12 && s(b, c) > 1e-12 && s(c, a) > 1e-12;
  };
  let guard = 0;
  while (index.length > 3 && guard++ < 10000) {
    let clipped = false;
    for (let k = 0; k < index.length; k++) {
      const a = index[(k + index.length - 1) % index.length], b = index[k], c = index[(k + 1) % index.length];
      if (cross(a, b, c) <= 1e-12) continue;                       // reflex or flat
      if (index.some(j => j !== a && j !== b && j !== c && inside(poly[j], a, b, c))) continue;
      out.push([a, b, c]); index.splice(k, 1); clipped = true; break;
    }
    if (!clipped) throw new RangeError('This outline could not be triangulated.');
  }
  out.push([index[0], index[1], index[2]]);
  return out;
}

/**
 * Sweep a closed profile [[d, z], …] (counter-clockwise, d outward) along a
 * path of points {x, y, nx, ny}, where (nx, ny) is how far one unit of d moves
 * that point. A closed path makes a ring; an open one is capped at both ends.
 */
function sweep(path, profile, closed) {
  if (area(profile) <= 0) throw new RangeError('A profile must run counter-clockwise.');
  const P = profile.length, K = path.length;
  const vertices = new Float32Array(K * P * 3);
  path.forEach((p, k) => profile.forEach(([d, z], i) => {
    const at = (k * P + i) * 3;
    vertices[at] = p.x + d * p.nx; vertices[at + 1] = p.y + d * p.ny; vertices[at + 2] = z;
  }));
  const tris = [], id = (k, i) => k * P + (i % P);
  const spans = closed ? K : K - 1;
  for (let k = 0; k < spans; k++) {
    const k2 = (k + 1) % K;
    for (let i = 0; i < P; i++) {
      tris.push([id(k, i), id(k2, i), id(k2, i + 1)], [id(k, i), id(k2, i + 1), id(k, i + 1)]);
    }
  }
  if (!closed) {
    for (const [a, b, c] of triangulate(profile)) {
      tris.push([id(0, a), id(0, b), id(0, c)]);
      tris.push([id(K - 1, a), id(K - 1, c), id(K - 1, b)]);
    }
  }
  return orient({ vertices, indices: Uint32Array.from(tris.flat()) });
}

/** Extrude a counter-clockwise outline in XY from z = 0 to z = height. */
function extrude(outline, height) {
  if (area(outline) <= 0) throw new RangeError('An outline must run counter-clockwise.');
  const n = outline.length, vertices = new Float32Array(n * 6);
  outline.forEach(([x, y], i) => { vertices.set([x, y, 0], i * 3); vertices.set([x, y, height], (n + i) * 3); });
  const tris = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    tris.push([i, j, n + j], [i, n + j, n + i]);
  }
  for (const [a, b, c] of triangulate(outline)) tris.push([a, c, b], [n + a, n + b, n + c]);
  return orient({ vertices, indices: Uint32Array.from(tris.flat()) });
}

function signedVolume({ vertices: v, indices: f }) {
  let volume = 0;
  for (let t = 0; t < f.length; t += 3) {
    const a = f[t] * 3, b = f[t + 1] * 3, c = f[t + 2] * 3;
    volume += (v[a] * (v[b + 1] * v[c + 2] - v[b + 2] * v[c + 1])
      - v[a + 1] * (v[b] * v[c + 2] - v[b + 2] * v[c])
      + v[a + 2] * (v[b] * v[c + 1] - v[b + 1] * v[c])) / 6;
  }
  return volume;
}

/** Wind a closed solid outward, whichever way round its parts were listed. */
function orient(mesh) {
  if (signedVolume(mesh) < 0) {
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const b = mesh.indices[t + 1];
      mesh.indices[t + 1] = mesh.indices[t + 2]; mesh.indices[t + 2] = b;
    }
  }
  return mesh;
}

/** Several shells as one mesh, for one STL. */
function merge(...meshes) {
  const vertexTotal = meshes.reduce((n, m) => n + m.vertices.length, 0);
  const vertices = new Float32Array(vertexTotal), indices = new Uint32Array(meshes.reduce((n, m) => n + m.indices.length, 0));
  let v = 0, f = 0;
  for (const m of meshes) {
    vertices.set(m.vertices, v);
    for (let i = 0; i < m.indices.length; i++) indices[f + i] = m.indices[i] + v / 3;
    v += m.vertices.length; f += m.indices.length;
  }
  return { vertices, indices, shells: meshes.length };
}

function finish(mesh, extra) {
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.vertices.length; i += 3) for (let a = 0; a < 3; a++) {
    lo[a] = Math.min(lo[a], mesh.vertices[i + a]); hi[a] = Math.max(hi[a], mesh.vertices[i + a]);
  }
  return { shells: 1, ...mesh, triangleCount: mesh.indices.length / 3, volume: signedVolume(mesh),
    size: hi.map((h, a) => h - lo[a]), ...extra };
}

/* ---------- paths ---------- */

function rectanglePath(halfW, halfH) {
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => ({ x: sx * halfW, y: sy * halfH, nx: sx, ny: sy }));
}

/** Points on a circle round the origin, angle 0 facing -Y (the picture's front). Edges sit at the radius. */
function circlePath(radius, segments) {
  const grow = 1 / Math.cos(Math.PI / segments);
  return Array.from({ length: segments }, (_, k) => {
    const a = 2 * Math.PI * k / segments, s = Math.sin(a), c = -Math.cos(a);
    return { x: radius * s * grow, y: radius * c * grow, nx: s * grow, ny: c * grow };
  });
}

function arcPath(radius, angle, segments) {
  return Array.from({ length: segments + 1 }, (_, k) => {
    const a = -angle / 2 + angle * k / segments, s = Math.sin(a), c = -Math.cos(a);
    return { x: radius * s, y: radius * c, nx: s, ny: c };
  });
}

/* ---------- the parts ---------- */

/**
 * Light box for a flat picture: a frame the picture presses into from the
 * front, flush, resting on a ledge behind its border; a hollow behind it for
 * an LED strip or puck light; and a rabbet at the back for a cover with a
 * notch for the cable. Prints face down, so the front comes off the plate
 * smooth.
 */
export function lightBox({ width, height, maxThickness, border, depth = 30 }) {
  const T = maxThickness + 0.2, ledge = Math.max(1.2, border - 0.5), back = 2;
  const halfW = width / 2 + CLEAR, halfH = height / 2 + CLEAR;
  if (depth < T + back + 8) throw new RangeError('The light box needs to be deeper than that.');
  const step = -ledge + 1.2;                         // the back opening, 1.2 mm outside the ledge
  const profile = [
    [0, 0], [WALL, 0], [WALL, depth], [step, depth], [step, depth - back],
    [-ledge, depth - back], [-ledge, T], [0, T],
  ];
  const frame = finish(sweep(rectanglePath(halfW, halfH), profile, true), {
    place: ([x, y, z]) => [x, z - maxThickness, y + height / 2],
  });
  // The cover: the back opening less clearance, with a notch at the bottom for a cable.
  const cw = halfW + step - CLEAR, ch = halfH + step - CLEAR, notch = Math.min(6, cw / 3);
  const outline = [[-cw, -ch], [-notch, -ch], [-notch, -ch + 5], [notch, -ch + 5], [notch, -ch], [cw, -ch], [cw, ch], [-cw, ch]];
  const cover = finish(extrude(outline, back - 0.2), {
    place: ([x, y, z]) => [x, depth - back - maxThickness + z, y + height / 2],
  });
  return {
    parts: [
      { id: 'frame', name: 'Light box frame', mesh: frame },
      { id: 'cover', name: 'Light box back', mesh: cover },
    ],
    notes: `Press the picture into the front (a dot of glue in each corner holds it), lay an LED strip or puck light in the ${Math.round(depth - T - back)} mm space behind, and click the back on. The notch at the bottom is for the cable. Print the frame face down; no supports.`,
  };
}

/** Desk stand for a flat picture: a foot with a slot the picture stands in. */
export function deskStand({ width, maxThickness, border }) {
  const slot = maxThickness + 0.3, deep = Math.min(8, Math.max(4, border + 1)), base = 3.5, half = slot / 2 + 3.5;
  const top = base + deep, foot = 22, length = Math.max(30, width);
  const section = [[-foot, 0], [foot, 0], [foot, base - 1], [half, base + 1.5], [half, top], [slot / 2, top], [slot / 2, base],
    [-slot / 2, base], [-slot / 2, top], [-half, top], [-half, base + 1.5], [-foot, base - 1]];
  // Lay the cross-section along X: (u, v) in the section becomes (y, z), the extrusion becomes x.
  const m = extrude(section, length), v = m.vertices;
  for (let i = 0; i < v.length; i += 3) { const u = v[i], w = v[i + 1], h = v[i + 2]; v[i] = h - length / 2; v[i + 1] = u; v[i + 2] = w; }
  const mesh = finish(orient(m), { place: ([x, y, z]) => [x, y - maxThickness / 2, z - base] });
  return {
    parts: [{ id: 'stand', name: 'Desk stand', mesh }],
    notes: `The picture stands in a ${deep.toFixed(1)} mm slot, so the slot hides ${Math.max(0, deep - border).toFixed(1)} mm of the photo's bottom edge${deep > border ? ' — a wider border avoids that' : ''}. Put a light a few centimetres behind it.`,
  };
}

/** Tea-light base for a lamp: a cup with a groove the lamp stands in, room for an LED tea light, and a hole underneath to reach its switch. */
export function lampBase({ diameter, maxThickness, border }) {
  const r = diameter / 2, T = maxThickness, groove = Math.max(3, border), hole = Math.min(12, r - 8);
  if (r < 14) throw new RangeError('This lamp is too narrow for a base.');
  const top = FLOOR + groove;
  const profile = [[hole - r, 0], [T + 0.3 + WALL, 0], [T + 0.3 + WALL, top], [T + 0.3, top], [T + 0.3, FLOOR],
    [-0.3, FLOOR], [-0.3, top], [-1.9, top], [-1.9, FLOOR], [hole - r, FLOOR]];
  const mesh = finish(sweep(circlePath(r, 180), profile, true), { place: ([x, y, z]) => [x, y + r, z - FLOOR] });
  const room = 2 * (r - 1.9);
  return {
    parts: [{ id: 'base', name: 'Tea-light base', mesh }],
    notes: `The lamp drops into the groove. Inside there's room for a light up to ${Math.floor(room)} mm across — a standard LED tea light is 38 mm${room < 39 ? ', which won’t fit: make the lamp wider' : ''}. Push its switch through the hole underneath. LED lights only.`,
  };
}

/** Nightlight stand for a curved shade: a round floor for an LED puck or tea light, and a curved rim with a groove the shade stands in. */
export function shadeStand({ width, angleDeg, maxThickness, border }) {
  const theta = angleDeg * Math.PI / 180, r = width / theta, T = maxThickness, groove = Math.max(3, border), top = FLOOR + groove;
  const rim = [[-1.9, 0], [T + 0.3 + WALL, 0], [T + 0.3 + WALL, top], [T + 0.3, top], [T + 0.3, FLOOR],
    [-0.3, FLOOR], [-0.3, top], [-1.9, top]];
  const floor = extrude(circlePath(r - 1, 120).map(p => [p.x, p.y]), FLOOR);   // counter-clockwise already
  const mesh = finish(merge(sweep(arcPath(r, theta, Math.max(24, Math.round(angleDeg))), rim, false), floor),
    { place: ([x, y, z]) => [x, y + r, z - FLOOR], shells: 2 });
  return {
    parts: [{ id: 'stand', name: 'Nightlight stand', mesh }],
    notes: `The shade drops into the curved groove; an LED puck or tea light sits on the round floor behind it (up to ${Math.floor(2 * r - 6)} mm across). LED lights only.`,
  };
}

/** The accessories that suit a shape, for the picker. */
export const ACCESSORIES = Object.freeze({
  flat: [{ id: 'lightbox', name: 'Light box', blurb: 'A frame with a back — add an LED and it glows on a shelf or wall', make: lightBox },
    { id: 'stand', name: 'Desk stand', blurb: 'A slotted foot, to stand it in front of a light', make: deskStand }],
  cylinder: [{ id: 'base', name: 'Tea-light base', blurb: 'A cup it stands in, hiding an LED tea light', make: lampBase }],
  curved: [{ id: 'stand', name: 'Nightlight stand', blurb: 'A round base that holds the shade and a light', make: shadeStand }],
});
