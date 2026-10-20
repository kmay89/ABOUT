/**
 * Hollow — the mold recipe. All dimensions are millimetres; the model's Z is up.
 *
 * Given a model and a few choices, this builds the printable parts of a mold
 * as signed distance fields, extracts and decimates them, and works out the
 * things a caster needs to know: what will release and what is trapped,
 * where air will collect, how much to mix.
 *
 * Three kinds of mold:
 *  - two-part   a block split on a horizontal parting plane into a lower
 *               half (A) and an upper half (B), with alignment keys, a pour
 *               spout and air vents cut along a chosen pouring direction,
 *               grooves for rubber bands or bolt holes, and pry slots.
 *  - open       a one-piece block with the cavity open at the top, for
 *               anything with a flat back: coasters, tiles, trays, planters.
 *               A vessel comes out as a body plus a core with a collar.
 *  - box        a silicone master: the model standing in a printed tray with
 *               a silicone-thick gap all round, printed as one piece.
 *
 * No DOM: runs in a worker (where it belongs) or in Node for the tests.
 */

import { Grid, gridFor, spacingFor, distanceField, insideField, shapes, apply } from './sdf.js';
import { marchingTetrahedra } from './mc.js';
import { decimate } from './decimate.js';
import { bounds as meshBounds, signedVolume, surfaceArea, faceNormals, transform, translate, watertight } from './mesh.js';

export const DEFAULTS = Object.freeze({
  type: 'two-part',
  wall: 10,
  floor: null,
  cornerRadius: 4,
  clearance: 0,
  partingZ: 'auto',
  pourFrom: '+y',
  spout: { enabled: true, diameter: 10, mouth: 18 },
  vents: { enabled: true, diameter: 2.5, max: 6 },
  keys: { style: 'cones', diameter: 7, height: 4, clearance: 0.25 },
  fasteners: 'bands',
  prySlots: true,
  lip: 2,
  siliconeGap: 10,
  boxWall: 2.4,
  boxFloor: 3,
  quality: 'standard',
  tolerance: 0.02,
  draftAngle: 2,
});

export const QUALITY = Object.freeze({
  draft: { nodes: 2_500_000, label: 'Draft' },
  standard: { nodes: 9_000_000, label: 'Standard' },
  fine: { nodes: 22_000_000, label: 'Fine' },
});

export const MATERIALS = Object.freeze({
  concrete: { name: 'Concrete / cement', density: 2.2, unit: 'g', note: 'Fine mixes (no coarse aggregate) pick up detail best.' },
  plaster: { name: 'Plaster', density: 1.1, unit: 'g', note: 'Plaster expands slightly as it sets; rigid molds release it easily when there is a little draft.' },
  resin: { name: 'Epoxy / polyurethane resin', density: 1.1, unit: 'mL', note: 'Always use a release agent; resin bonds to PLA and PETG.' },
  wax: { name: 'Candle wax', density: 0.9, unit: 'g', note: 'Wax shrinks as it cools and usually releases on its own.' },
  soap: { name: 'Melt-and-pour soap', density: 1.0, unit: 'g', note: 'Chill the mold for a few minutes before unmolding.' },
});

const PLA_DENSITY = 1.24; // g/cm³
const PRINT_FILL = 0.35;  // rough share of a part's volume that becomes plastic at 15 % infill with 3 walls

function merged(options) {
  const s = { ...DEFAULTS, ...options };
  for (const key of ['spout', 'vents', 'keys']) s[key] = { ...DEFAULTS[key], ...(options?.[key] || {}) };
  if (!['two-part', 'open', 'box'].includes(s.type)) throw new RangeError('type must be "two-part", "open" or "box".');
  for (const key of ['wall', 'cornerRadius', 'lip', 'siliconeGap', 'boxWall', 'boxFloor', 'tolerance']) {
    if (!Number.isFinite(s[key]) || s[key] < 0) throw new RangeError(`${key} must be a number of zero or more.`);
  }
  if (s.wall < 3) throw new RangeError('The wall must be at least 3 mm.');
  if (s.floor === null || s.floor === undefined) s.floor = s.wall;
  if (!Number.isFinite(s.clearance) || s.clearance < 0 || s.clearance > 1) throw new RangeError('clearance must be between 0 and 1 mm.');
  if (!/^[+-][xy]$/.test(s.pourFrom)) throw new RangeError('pourFrom must be +x, -x, +y or -y.');
  if (!QUALITY[s.quality]) throw new RangeError('quality must be draft, standard or fine.');
  return s;
}

/** The pouring direction as an axis (0 = x, 1 = y) and sign. */
export function pourAxis(pourFrom) { return { axis: pourFrom[1] === 'x' ? 0 : 1, sign: pourFrom[0] === '-' ? -1 : 1 }; }

/* ---------- the model's columns: what is above and below every point ---------- */

function columnExtremes(inside, grid) {
  const { nx, ny, nz } = grid;
  const top = new Int32Array(nx * ny).fill(-1), bottom = new Int32Array(nx * ny).fill(nz);
  for (let k = 0; k < nz; k++) {
    const base = k * nx * ny;
    for (let c = 0; c < nx * ny; c++) {
      if (inside[base + c]) { if (k > top[c]) top[c] = k; if (k < bottom[c]) bottom[c] = k; }
    }
  }
  return { top, bottom };
}

/** Per-triangle data the release tests need: centroid height, area, and the model
 * material above and below a point a hair outside the face. */
function releaseData(model, grid, columns) {
  const { positions: p, indices: ix } = model;
  const normals = faceNormals(model);
  const T = ix.length / 3;
  const cz = new Float32Array(T), area = new Float32Array(T), qz = new Float32Array(T), nz = new Float32Array(T);
  const above = new Float32Array(T), below = new Float32Array(T), qNode = new Int32Array(T);
  const { h, origin, nx, ny, nz: gnz } = grid;
  for (let t = 0; t < T; t++) {
    const a = ix[t * 3] * 3, b = ix[t * 3 + 1] * 3, c = ix[t * 3 + 2] * 3;
    const cx = (p[a] + p[b] + p[c]) / 3, cy = (p[a + 1] + p[b + 1] + p[c + 1]) / 3, czz = (p[a + 2] + p[b + 2] + p[c + 2]) / 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    area[t] = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    cz[t] = czz; nz[t] = normals[t * 3 + 2];
    // q sits a little way outside the face, in the mold; 2.5 cells keeps the test clear of
    // the face's own curvature once q is snapped to a column of nodes
    const qx = cx + normals[t * 3] * 2.5 * h, qy = cy + normals[t * 3 + 1] * 2.5 * h;
    qz[t] = czz + normals[t * 3 + 2] * 2.5 * h;
    const i = Math.round((qx - origin[0]) / h), j = Math.round((qy - origin[1]) / h), k = Math.round((qz[t] - origin[2]) / h);
    if (i < 0 || j < 0 || i >= nx || j >= ny || k < 0 || k >= gnz) { above[t] = -Infinity; below[t] = Infinity; qNode[t] = -1; continue; }
    const col = j * nx + i;
    qNode[t] = (k * ny + j) * nx + i;
    above[t] = columns.top[col] >= 0 ? origin[2] + columns.top[col] * h : -Infinity;
    below[t] = columns.bottom[col] < grid.nz ? origin[2] + columns.bottom[col] * h : Infinity;
  }
  return { cz, area, qz, nz, above, below, qNode, T };
}

/** Is triangle t trapped when the mold above the plane lifts up and the mold below drops down?
 * Pass partingZ = -Infinity to treat the whole model as lifting straight up out of an open mold. */
function trapped(d, t, partingZ, h) {
  return d.cz[t] > partingZ ? d.above[t] > d.qz[t] + 1.5 * h : d.below[t] < d.qz[t] - 1.5 * h;
}

/** Total trapped area for a parting height. */
function trappedArea(d, partingZ, h) {
  let sum = 0;
  for (let t = 0; t < d.T; t++) if (trapped(d, t, partingZ, h)) sum += d.area[t];
  return sum;
}

/** 0 releases · 1 steep (less draft than asked) · 2 trapped — per triangle, then per vertex.
 * `rule(t)` says which way the mold beside triangle t comes away: 'upper' (it lifts up, so
 * model material above traps it), 'lower' (it drops down), 'none' (there is no mold there, e.g.
 * the open face) or 'print' (overhang check for a positive that is printed as it stands). */
function classify(model, d, h, draftAngle, rule) {
  const sinDraft = Math.sin(draftAngle * Math.PI / 180);
  const triClass = new Uint8Array(d.T);
  let trappedA = 0, steepA = 0, total = 0;
  for (let t = 0; t < d.T; t++) {
    total += d.area[t];
    let c = 0;
    const r = rule(t);
    if (r === 'print') {
      c = d.nz[t] < -0.72 ? 2 : d.nz[t] < -0.35 ? 1 : 0; // overhangs steeper than 45°, then 20°
    } else if (r !== 'none') {
      const upper = r === 'upper';
      const draft = upper ? d.nz[t] : -d.nz[t]; // the component of the normal along the release direction
      const hooked = upper ? d.above[t] > d.qz[t] + 1.5 * h : d.below[t] < d.qz[t] - 1.5 * h;
      if (hooked || draft < -sinDraft) c = 2;
      else if (draft < sinDraft) c = 1;
    }
    triClass[t] = c;
    if (c === 2) trappedA += d.area[t]; else if (c === 1) steepA += d.area[t];
  }
  const vertexClass = new Uint8Array(model.positions.length / 3);
  const ix = model.indices;
  for (let t = 0; t < d.T; t++) for (let k = 0; k < 3; k++) {
    const v = ix[t * 3 + k];
    if (triClass[t] > vertexClass[v]) vertexClass[v] = triClass[t];
  }
  return { vertexClass, trappedFraction: total ? trappedA / total : 0, steepFraction: total ? steepA / total : 0 };
}

/* ---------- air traps: where a pour leaves bubbles ---------- */

/** Sweep the model's occupancy from the top of the pour downwards and record every place a
 * new pocket of cavity begins. The first is where the spout goes; the rest want vents. */
function airTraps(inside, grid, pour) {
  const { nx, ny, nz, h, origin } = grid;
  const { axis, sign } = pour;
  const n = [nx, ny, nz];
  const [u, v] = axis === 0 ? [1, 2] : [0, 2];
  const nu = n[u], nv = n[v];
  const nodeIndex = (s, iu, iv) => axis === 0 ? (iv * ny + iu) * nx + s : (iv * ny + s) * nx + iu;
  let prev = new Int32Array(nu * nv), cur = new Int32Array(nu * nv);
  const births = []; // { s, u, v, area, mergedAt }
  const parent = [];
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const stack = [];
  const steps = n[axis];
  for (let step = 0; step < steps; step++) {
    const s = sign > 0 ? steps - 1 - step : step;
    cur.fill(0);
    for (let iv = 0; iv < nv; iv++) for (let iu = 0; iu < nu; iu++) {
      const c = iv * nu + iu;
      if (cur[c] || !inside[nodeIndex(s, iu, iv)]) continue;
      // flood this slice component
      const cells = [];
      stack.length = 0; stack.push(c); cur[c] = -1;
      while (stack.length) {
        const q = stack.pop(); cells.push(q);
        const qu = q % nu, qv = (q - qu) / nu;
        const nb = [[qu - 1, qv], [qu + 1, qv], [qu, qv - 1], [qu, qv + 1]];
        for (const [au, av] of nb) {
          if (au < 0 || av < 0 || au >= nu || av >= nv) continue;
          const r = av * nu + au;
          if (!cur[r] && inside[nodeIndex(s, au, av)]) { cur[r] = -1; stack.push(r); }
        }
      }
      // which earlier components does it touch?
      let root = -1;
      for (const q of cells) {
        const pl = prev[q];
        if (pl > 0) {
          const r = find(pl - 1);
          if (root === -1) root = r;
          else if (r !== root) { parent[r] = root; if (births[r].mergedAt === null) births[r].mergedAt = s; }
        }
      }
      if (root === -1) {
        let su = 0, sv = 0;
        for (const q of cells) { su += q % nu; sv += (q - q % nu) / nu; }
        root = births.length;
        parent.push(root);
        births.push({ s, u: su / cells.length, v: sv / cells.length, area: cells.length, mergedAt: null });
      }
      for (const q of cells) cur[q] = root + 1;
    }
    [prev, cur] = [cur, prev];
  }
  // world positions
  const toWorld = (b) => {
    const pos = [0, 0, 0];
    pos[axis] = origin[axis] + b.s * h; pos[u] = origin[u] + b.u * h; pos[v] = origin[v] + b.v * h;
    const end = b.mergedAt === null ? (sign > 0 ? 0 : steps - 1) : b.mergedAt;
    return { position: pos, depth: Math.abs(end - b.s) * h, area: b.area * h * h };
  };
  return births.map(toWorld);
}

/* ---------- how thick the model is ---------- */

/** What share of the model is thinner than about 1.5, 3 and 5 mm. A point is "thin" when no
 * ball of the given radius fits inside the model around it — measured by looking, from a sample
 * of inside nodes, for a node within that radius that lies that deep (sdf ≤ −r). A solid pebble
 * has none; a 3 mm plate is nothing else. A cast that is mostly thin breaks in a brittle
 * material; the page turns these into plain words per material. */
function thicknessMap(sdf, inside, grid) {
  const { nx, ny, nz, h } = grid;
  const insideNodes = [];
  for (let i = 0; i < inside.length; i++) if (inside[i]) insideNodes.push(i);
  const total = insideNodes.length;
  if (!total) return { under1_5mm: 0, under3mm: 0, under5mm: 0 };
  const samples = Math.min(total, 4000);
  const stride = total / samples;
  const result = {};
  for (const [key, mm] of [['under1_5mm', 1.5], ['under3mm', 3], ['under5mm', 5]]) {
    const r = mm / 2, rc = Math.ceil(r / h), deep = -(r - 0.5 * h);
    let thin = 0;
    for (let n = 0; n < samples; n++) {
      const idx = insideNodes[Math.floor(n * stride)];
      if (sdf[idx] <= deep) continue; // deep enough itself
      const i = idx % nx, j = Math.floor(idx / nx) % ny, k = Math.floor(idx / (nx * ny));
      let covered = false;
      for (let dk = -rc; dk <= rc && !covered; dk++) {
        const kk = k + dk; if (kk < 0 || kk >= nz) continue;
        for (let dj = -rc; dj <= rc && !covered; dj++) {
          const jj = j + dj; if (jj < 0 || jj >= ny) continue;
          for (let di = -rc; di <= rc; di++) {
            const ii = i + di; if (ii < 0 || ii >= nx) continue;
            if ((di * di + dj * dj + dk * dk) * h * h > r * r) continue;
            if (sdf[(kk * ny + jj) * nx + ii] <= deep) { covered = true; break; }
          }
        }
      }
      if (!covered) thin++;
    }
    result[key] = thin / samples;
  }
  return result;
}

/* ---------- the block ---------- */

function blockFor(type, mb, s) {
  const w = s.wall;
  if (type === 'two-part') return { min: [mb.min[0] - w, mb.min[1] - w, mb.min[2] - w], max: [mb.max[0] + w, mb.max[1] + w, mb.max[2] + w] };
  if (type === 'open') return { min: [mb.min[0] - w, mb.min[1] - w, mb.min[2] - s.floor], max: [mb.max[0] + w, mb.max[1] + w, mb.max[2] + s.lip] };
  const g = s.siliconeGap + s.boxWall;
  return { min: [mb.min[0] - g, mb.min[1] - g, 0], max: [mb.max[0] + g, mb.max[1] + g, s.boxFloor + mb.size[2] + s.siliconeGap] };
}

const centre = (b) => [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
const half = (b) => [(b.max[0] - b.min[0]) / 2, (b.max[1] - b.min[1]) / 2, (b.max[2] - b.min[2]) / 2];

/* ---------- parts ---------- */

function extract(field, grid, s, progress, label) {
  progress?.(`Tracing ${label}…`);
  const raw = marchingTetrahedra(field, grid);
  progress?.(`Simplifying ${label} (${(raw.indices.length / 3).toLocaleString()} triangles)…`);
  const mesh = decimate(raw, { tolerance: s.tolerance });
  return mesh;
}

function partStats(mesh) {
  const vol = signedVolume(mesh);
  return { volumeMm3: vol, bounds: meshBounds(mesh), triangles: mesh.indices.length / 3, plasticGrams: vol / 1000 * PLA_DENSITY * PRINT_FILL, closed: watertight(mesh).closed };
}

/** The transform that lays a part down for printing: `flip` turns it over (180° about X). */
function printPlacement(mesh, flip) {
  const m = flip ? [1, 0, 0, 0, -1, 0, 0, 0, -1] : [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const b = meshBounds(transform(mesh, m));
  return { matrix: m, translate: [-b.min[0], -b.min[1], -b.min[2]], size: b.size };
}

/* ---------- the recipe ---------- */

/**
 * Build a mold.
 * @param model {positions, indices} in mm, Z up, however the user oriented it
 * @param options see DEFAULTS
 * @param progress optional (fraction 0–1, message) callback
 */
export function buildMold(model, options = {}, progress = () => {}) {
  const s = merged(options);
  if (!model || !model.positions || !model.indices || model.indices.length < 12) throw new Error('The model needs at least four triangles.');
  const mb = meshBounds(model);
  if (!mb.size.every(v => v > 0.05)) throw new Error('The model is flat in one direction; it needs some thickness in every axis.');
  const modelVolume = Math.abs(signedVolume(model));
  const modelArea = surfaceArea(model);
  const warnings = [];
  const tight = watertight(model);
  if (!tight.closed) warnings.push(tight.boundaryEdges
    ? `The model has ${tight.boundaryEdges.toLocaleString()} open edges, so it is not quite a closed solid. The cavity was filled by majority vote and is usually fine — check it in the preview.`
    : 'Some of the model\'s faces are wound the wrong way or share an edge with more than two others. The cavity was filled by majority vote and is usually fine — check it in the preview.');

  // The silicone box stands the model on its base plate; everything else works in model space.
  const working = s.type === 'box' ? translate(model, [0, 0, -mb.min[2] + s.boxFloor - 0.6]) : model;
  const wb = s.type === 'box' ? meshBounds(working) : mb;
  const block = blockFor(s.type, wb, s);
  const blockSize = [block.max[0] - block.min[0], block.max[1] - block.min[1], block.max[2] - block.min[2]];
  const margin = 1.5;
  const h = Math.max(0.2, spacingFor(blockSize, QUALITY[s.quality].nodes, 0.3, margin));
  const grid = gridFor(block.min, block.max, h, margin + h);
  // The band is at least 3 mm so the thickness map below can tell a 5 mm wall from a thin one.
  const band = Math.max(3 * h, s.clearance + 3 * h, 3);
  let step = 0; const steps = s.type === 'two-part' ? 9 : 6;
  const tick = (message) => progress(Math.min(0.95, (step++) / steps), message);

  tick(`Measuring the model at ${h.toFixed(2)} mm…`);
  const dist = distanceField(working, grid, band);
  tick('Working out inside from outside…');
  const { inside, disagreement } = insideField(working, grid);
  if (disagreement > 0.02) warnings.push('Inside and outside disagreed in places, which usually means the model has holes or overlapping shells. Repairing it in your slicer first will give a cleaner cavity.');
  const sdf = dist;
  for (let i = 0; i < sdf.length; i++) if (inside[i]) sdf[i] = -sdf[i];
  const columns = columnExtremes(inside, grid);
  const release = releaseData(working, grid, columns);
  const thickness = thicknessMap(sdf, inside, grid);

  const result = { settings: s, h, grid: { nx: grid.nx, ny: grid.ny, nz: grid.nz, nodes: grid.count }, model: { bounds: mb, volumeMm3: modelVolume, areaMm2: modelArea, closed: tight.closed, boundaryEdges: tight.boundaryEdges, thickness }, block, parts: [], warnings, features: {} };

  if (s.type === 'two-part') buildTwoPart(working, s, grid, sdf, inside, columns, release, block, result, tick);
  else if (s.type === 'open') buildOpen(working, s, grid, sdf, inside, release, block, result, tick);
  else buildBox(working, s, grid, sdf, release, block, result, tick, mb);

  progress(1, 'Done');
  return result;
}

function sliceOf(grid, z) { return Math.min(grid.nz - 1, Math.max(0, Math.round((z - grid.origin[2]) / grid.h))); }

function buildTwoPart(model, s, grid, sdf, inside, columns, release, block, result, tick) {
  const { h } = grid;
  const mb = result.model.bounds;
  // ---- the parting plane
  tick('Looking for the best parting plane…');
  const zLo = mb.min[2] + 2 * h, zHi = mb.max[2] - 2 * h;
  const candidates = [];
  const count = Math.min(90, Math.max(12, Math.round((zHi - zLo) / h)));
  for (let i = 0; i <= count; i++) candidates.push(zLo + (zHi - zLo) * i / count);
  // cross-section area per slice, to prefer the widest section when trapped areas tie
  const sectionArea = new Float64Array(grid.nz);
  for (let k = 0; k < grid.nz; k++) { let n = 0; const base = k * grid.nx * grid.ny; for (let c = 0; c < grid.nx * grid.ny; c++) n += inside[base + c]; sectionArea[k] = n; }
  let bestZ = (zLo + zHi) / 2, bestScore = Infinity;
  const curve = [];
  for (const z of candidates) {
    const a = trappedArea(release, z, h);
    curve.push({ z, trapped: a });
    const score = a - sectionArea[sliceOf(grid, z)] * h * h * 1e-3; // a hair of preference for the widest section
    if (score < bestScore) { bestScore = score; bestZ = z; }
  }
  const partingZ = s.partingZ === 'auto' ? bestZ : Math.min(zHi, Math.max(zLo, +s.partingZ));
  const cls = classify(model, release, h, s.draftAngle, (t) => release.cz[t] > partingZ ? 'upper' : 'lower');
  result.analysis = { partingZ, autoPartingZ: bestZ, partingCurve: curve, ...cls, mode: 'release' };
  if (cls.trappedFraction > 0.08) result.warnings.push(`About ${Math.round(cls.trappedFraction * 100)} % of the surface is trapped at this parting plane. A rigid mold will not release it; print the mold in a flexible filament such as TPU, choose a different plane or orientation, or make a silicone mold instead.`);
  else if (cls.trappedFraction > 0.005) result.warnings.push(`A little of the surface (${(cls.trappedFraction * 100).toFixed(1)} %) is trapped — shown red in the preview. Small undercuts usually pull free of a rigid mold with a tap; deep ones will not.`);
  if (cls.steepFraction > 0.3) result.warnings.push(`A lot of the surface is nearly vertical (amber). Rigid molds release best with a few degrees of draft; a release agent and a tap help.`);

  // ---- geometry shared by both halves
  const c = centre(block), hs = half(block);
  const r = Math.min(s.cornerRadius, Math.min(hs[0], hs[1]) - 0.5);
  const pour = pourAxis(s.pourFrom);
  const lateral = pour.axis === 0 ? 1 : 0;
  const clear = s.clearance;
  const N = grid.count, { nx, ny, origin } = grid;

  const baseField = (upper) => {
    const field = new Float32Array(N);
    for (let k = 0; k < grid.nz; k++) {
      const z = origin[2] + k * h;
      const plane = upper ? partingZ - z : z - partingZ;
      for (let j = 0; j < ny; j++) {
        const y = origin[1] + j * h;
        let idx = (k * ny + j) * nx;
        for (let i = 0; i < nx; i++, idx++) {
          const b = shapes.roundedBoxXY(origin[0] + i * h, y, z, c, hs, r);
          const m = clear - sdf[idx];
          field[idx] = Math.max(b, m, plane);
        }
      }
    }
    return field;
  };

  // ---- keys
  const features = result.features;
  const keyR = Math.min(s.keys.diameter / 2, s.wall / 2 - 1.5);
  const keyInset = s.wall / 2 + 0.25;
  const corners = [[block.min[0] + keyInset, block.min[1] + keyInset], [block.max[0] - keyInset, block.min[1] + keyInset], [block.min[0] + keyInset, block.max[1] - keyInset]];
  const keys = [];
  if (s.keys.style !== 'none' && keyR >= 1.5) {
    const hk = Math.min(s.keys.height, keyR * 1.2);
    const cones = s.keys.style === 'cones' ? corners : [corners[2]];
    for (const [x, y] of cones) keys.push({ x, y, r: keyR, height: hk });
    features.keys = { style: s.keys.style, pegs: keys.map(k => ({ x: k.x, y: k.y, z: partingZ, radius: k.r, height: k.height })), clearance: s.keys.clearance };
    if (s.keys.style === 'rail') features.keys.rail = { inset: s.wall / 2, width: 2, height: 1.6 };
  } else if (s.keys.style !== 'none') result.warnings.push('The wall is too thin for alignment keys; make it at least 7 mm for pegs.');

  // ---- spout: enters the cavity where the model's cross-section at the parting plane reaches furthest in the pouring direction
  const kp = sliceOf(grid, partingZ);
  let entry = null;
  {
    const base = kp * nx * ny;
    let bestCoord = -Infinity;
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (!inside[base + j * nx + i]) continue;
      const coord = pour.sign * (pour.axis === 0 ? origin[0] + i * h : origin[1] + j * h);
      if (coord > bestCoord) { bestCoord = coord; entry = [origin[0] + i * h, origin[1] + j * h, partingZ]; }
    }
  }
  if (!entry) result.warnings.push('The parting plane does not cut through the model, so there is no cavity on it to pour into. Move the plane or re-orient the model.');
  const faceCoord = pour.sign > 0 ? block.max[pour.axis] : block.min[pour.axis];
  if (entry && s.spout.enabled) {
    const rIn = s.spout.diameter / 2, rOut = Math.max(rIn, s.spout.mouth / 2);
    const a = entry.slice(); a[pour.axis] -= pour.sign * rIn * 0.8; // overlap into the cavity
    const b = entry.slice(); b[pour.axis] = faceCoord + pour.sign * 2;
    features.spout = { from: a, to: b, radiusIn: rIn, radiusOut: rOut, volumeMm3: Math.PI * Math.abs(b[pour.axis] - a[pour.axis]) * (rIn * rIn + rIn * rOut + rOut * rOut) / 3 };
  }

  // ---- vents
  const traps = airTraps(inside, grid, pour);
  const vents = [];
  if (entry && s.vents.enabled) {
    const farFromSpout = (t) => Math.hypot(t.position[0] - entry[0], t.position[1] - entry[1]) > s.spout.diameter / 2 + s.vents.diameter;
    const useful = traps.slice(1).filter(t => t.depth >= 1 && t.area >= 1.5 && farFromSpout(t));
    useful.sort((p, q) => q.depth - p.depth);
    for (const t of useful.slice(0, s.vents.max)) {
      const a = t.position.slice(); a[pour.axis] -= pour.sign * Math.min(1.5, t.depth / 2);
      const b = t.position.slice(); b[pour.axis] = faceCoord + pour.sign * 2;
      vents.push({ from: a, to: b, radius: s.vents.diameter / 2, depth: t.depth });
    }
  }
  features.vents = vents;
  features.airTraps = traps.length - 1;

  // ---- fasteners and pry slots
  const along = (f) => block.min[pour.axis] + (block.max[pour.axis] - block.min[pour.axis]) * f;
  features.pour = { axis: pour.axis, sign: pour.sign, face: faceCoord };
  if (s.fasteners === 'bands') features.bands = [0.25, 0.75].map(f => ({ at: along(f), width: 6, depth: 2.5 }));
  if (s.fasteners === 'bolts') {
    if (s.wall < 12) result.warnings.push('Bolt holes want a wall of at least 12 mm; the holes are cut, but the wall beside them is thin.');
    const inset = Math.max(s.wall / 2, 3.5);
    features.bolts = [];
    for (const f of [0.3, 0.7]) for (const side of [-1, 1]) {
      const p = [0, 0, 0]; p[pour.axis] = along(f); p[lateral] = side > 0 ? block.max[lateral] - inset : block.min[lateral] + inset;
      features.bolts.push({ x: p[0], y: p[1], radius: 2.75 });
    }
  }
  if (s.prySlots) features.prySlots = [-1, 1].map(side => { const p = [0, 0, partingZ]; p[pour.axis] = along(0.5); p[lateral] = side > 0 ? block.max[lateral] : block.min[lateral]; return { at: p, radius: 4, depth: 6, side }; });

  // ---- build both halves
  const cut = (field, min, max, shape) => apply(field, grid, 'cut', min, max, shape);
  const add = (field, min, max, shape) => apply(field, grid, 'union', min, max, shape);
  const shared = (field) => {
    if (features.spout) {
      const sp = features.spout; const lo = [], hi = [];
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(sp.from[i], sp.to[i]) - sp.radiusOut - h; hi[i] = Math.max(sp.from[i], sp.to[i]) + sp.radiusOut + h; }
      cut(field, lo, hi, (x, y, z) => shapes.cone(x, y, z, sp.from, sp.to, sp.radiusIn, sp.radiusOut));
    }
    for (const v of vents) {
      const lo = [], hi = [];
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(v.from[i], v.to[i]) - v.radius - h; hi[i] = Math.max(v.from[i], v.to[i]) + v.radius + h; }
      cut(field, lo, hi, (x, y, z) => shapes.cone(x, y, z, v.from, v.to, v.radius, v.radius));
    }
    for (const g of features.bands || []) {
      const lo = block.min.slice(), hi = block.max.slice();
      lo[pour.axis] = g.at - g.width / 2 - h; hi[pour.axis] = g.at + g.width / 2 + h;
      lo[0] -= h; lo[1] -= h; lo[2] -= h; hi[0] += h; hi[1] += h; hi[2] += h;
      const innerHs = [hs[0] - g.depth, hs[1] - g.depth, hs[2] - g.depth];
      cut(field, lo, hi, (x, y, z) => {
        const p = pour.axis === 0 ? x : y;
        const slab = Math.abs(p - g.at) - g.width / 2;
        const innerBlock = shapes.roundedBoxXY(x, y, z, c, innerHs, Math.max(0.5, r - g.depth));
        return Math.max(slab, -innerBlock);
      });
    }
    for (const bolt of features.bolts || []) {
      cut(field, [bolt.x - bolt.radius - h, bolt.y - bolt.radius - h, block.min[2] - h], [bolt.x + bolt.radius + h, bolt.y + bolt.radius + h, block.max[2] + h],
        (x, y, z) => shapes.cone(x, y, z, [bolt.x, bolt.y, block.min[2] - 2], [bolt.x, bolt.y, block.max[2] + 2], bolt.radius, bolt.radius));
    }
    for (const slot of features.prySlots || []) {
      const a = slot.at.slice(), b = slot.at.slice();
      a[lateral] += slot.side * 2; b[lateral] -= slot.side * slot.depth;
      const lo = [], hi = [];
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(a[i], b[i]) - slot.radius - h; hi[i] = Math.max(a[i], b[i]) + slot.radius + h; }
      cut(field, lo, hi, (x, y, z) => shapes.cone(x, y, z, a, b, slot.radius, slot.radius));
    }
  };

  // half A — below the parting plane, pegs up
  tick('Shaping half A…');
  let field = baseField(false);
  for (const k of keys) {
    add(field, [k.x - k.r - h, k.y - k.r - h, partingZ - 1 - h], [k.x + k.r + h, k.y + k.r + h, partingZ + k.height + h],
      (x, y, z) => shapes.cone(x, y, z, [k.x, k.y, partingZ - 0.8], [k.x, k.y, partingZ + k.height], k.r, k.r * 0.6));
  }
  if (features.keys?.rail) {
    const rail = features.keys.rail, ringHs = [hs[0] - rail.inset, hs[1] - rail.inset];
    add(field, [block.min[0] - h, block.min[1] - h, partingZ - 1 - h], [block.max[0] + h, block.max[1] + h, partingZ + rail.height + h],
      (x, y, z) => shapes.rectRing(x, y, z, c, ringHs, Math.max(0.5, r - rail.inset), rail.width, partingZ - 0.8, partingZ + rail.height));
  }
  shared(field);
  const meshA = extract(field, grid, s, tick, 'half A');
  result.parts.push({ name: 'Half A (lower)', role: 'half-a', mesh: meshA, ...partStats(meshA), print: printPlacement(meshA, false) });

  // half B — above the parting plane, sockets down
  tick('Shaping half B…');
  field = baseField(true);
  const kc = s.keys.clearance;
  for (const k of keys) {
    cut(field, [k.x - k.r - kc - h, k.y - k.r - kc - h, partingZ - 1 - h], [k.x + k.r + kc + h, k.y + k.r + kc + h, partingZ + k.height + kc + h],
      (x, y, z) => shapes.cone(x, y, z, [k.x, k.y, partingZ - 1], [k.x, k.y, partingZ + k.height + kc], k.r + kc, k.r * 0.6 + kc));
  }
  if (features.keys?.rail) {
    const rail = features.keys.rail, ringHs = [hs[0] - rail.inset, hs[1] - rail.inset];
    cut(field, [block.min[0] - h, block.min[1] - h, partingZ - 1 - h], [block.max[0] + h, block.max[1] + h, partingZ + rail.height + kc + h],
      (x, y, z) => shapes.rectRing(x, y, z, c, ringHs, Math.max(0.5, r - rail.inset), rail.width + 2 * kc, partingZ - 1, partingZ + rail.height + kc));
  }
  shared(field);
  const meshB = extract(field, grid, s, tick, 'half B');
  result.parts.push({ name: 'Half B (upper)', role: 'half-b', mesh: meshB, ...partStats(meshB), print: printPlacement(meshB, true) });

  const castVolume = result.model.volumeMm3 + (features.spout ? features.spout.volumeMm3 : 0);
  result.cast = { volumeMm3: castVolume, spoutMm3: features.spout ? features.spout.volumeMm3 : 0 };
}

function buildOpen(model, s, grid, sdf, inside, release, block, result, tick) {
  const { h, nx, ny, nz, origin } = grid;
  const mb = result.model.bounds;
  // Flat-side hint: the open face is the top; a flat back there gives a wide opening.
  const kTop = sliceOf(grid, mb.max[2] - 1.5 * h), kBot = sliceOf(grid, mb.min[2] + 1.5 * h);
  const count = (k) => { let n = 0; const base = k * nx * ny; for (let c = 0; c < nx * ny; c++) n += inside[base + c]; return n; };
  const topArea = count(kTop) * h * h, bottomArea = count(kBot) * h * h;
  if (topArea < 0.5 * bottomArea) result.warnings.push('The model is wider at the bottom than at the open top. If the flat side is meant to be the opening, flip the model over.');

  tick('Shaping the mold…');
  const c = centre(block), hs = half(block);
  const r = Math.min(s.cornerRadius, Math.min(hs[0], hs[1]) - 0.5);
  const clear = s.clearance;
  const field = new Float32Array(grid.count);
  const kSec = kTop; // the section that is extruded up through the lip
  for (let k = 0; k < nz; k++) {
    const z = origin[2] + k * h;
    for (let j = 0; j < ny; j++) {
      const y = origin[1] + j * h;
      let idx = (k * ny + j) * nx;
      for (let i = 0; i < nx; i++, idx++) {
        let m = sdf[idx];
        if (k > kSec) m = Math.min(m, sdf[(kSec * ny + j) * nx + i]);
        field[idx] = Math.max(shapes.roundedBoxXY(origin[0] + i * h, y, z, c, hs, r), clear - m);
      }
    }
  }
  // Pieces: a vessel leaves a core inside the body. Label the solid regions.
  tick('Finding the pieces…');
  const label = labelComponents(field, grid);
  const order = Object.entries(label.sizes).sort((a, b) => b[1] - a[1]);
  const bodyId = +order[0][0];
  const cores = order.slice(1).filter(([, n]) => n * h * h * h > 500).map(([id]) => +id); // ignore crumbs under 0.5 cm³
  // Now the release check: the body stays put while the cast lifts out of it, so the cast
  // must have nothing of the mold above it; a core lifts up out of the cast, so it must
  // have nothing of the cast above it. Where there is no mold (the open face), nothing can trap.
  tick('Checking what will lift out…');
  const coreSet = new Set(cores);
  const cls = classify(model, release, h, s.draftAngle, (t) => {
    const n = release.qNode[t];
    if (n < 0 || field[n] >= 0) return 'none';
    const id = label.ids[n];
    return id === bodyId ? 'lower' : coreSet.has(id) ? 'upper' : 'none';
  });
  result.analysis = { ...cls, mode: 'release', openingMm2: topArea };
  if (cls.trappedFraction > 0.08) result.warnings.push(`About ${Math.round(cls.trappedFraction * 100)} % of the surface is trapped — the cast cannot lift straight out of a rigid mold. Re-orient, print in TPU, or use a two-part mold.`);
  else if (cls.trappedFraction > 0.005) result.warnings.push(`A little of the surface (${(cls.trappedFraction * 100).toFixed(1)} %) is trapped, shown red. Small undercuts usually come free with a tap.`);
  // One piece on its own: the other pieces' solid nodes become empty; everything else — including
  // the empty nodes just outside this piece, which fix where its surface falls — stays as it is.
  const only = (id) => { const f = new Float32Array(grid.count); for (let i = 0; i < f.length; i++) f[i] = (field[i] >= 0 || label.ids[i] === id) ? field[i] : 1.5 * h; return f; };
  const bodyField = cores.length ? only(bodyId) : field;
  const meshBody = extract(bodyField, grid, s, tick, 'the mold');
  result.parts.push({ name: cores.length ? 'Mold body' : 'Mold', role: 'body', mesh: meshBody, ...partStats(meshBody), print: printPlacement(meshBody, false) });
  result.features.cores = cores.length;
  cores.forEach((id, n) => {
    const f = only(id);
    // a collar on top so the core rests on the body's rim at the right depth
    const fp = footprint(label.ids, id, grid);
    const top = block.max[2];
    const collar = { min: [Math.max(fp.min[0] - 8, block.min[0] + 1), Math.max(fp.min[1] - 8, block.min[1] + 1), top], max: [Math.min(fp.max[0] + 8, block.max[0] - 1), Math.min(fp.max[1] + 8, block.max[1] - 1), top + 3] };
    const cc = centre(collar), ch = half(collar);
    apply(f, grid, 'union', [collar.min[0] - h, collar.min[1] - h, top - 2 * h], [collar.max[0] + h, collar.max[1] + h, collar.max[2] + h],
      (x, y, z) => shapes.roundedBoxXY(x, y, z, [cc[0], cc[1], cc[2] - 0.6], [ch[0], ch[1], ch[2] + 0.6], Math.min(3, ch[0] - 0.5, ch[1] - 0.5)));
    const meshCore = extract(f, grid, s, tick, `core ${n + 1}`);
    result.parts.push({ name: cores.length > 1 ? `Core ${n + 1}` : 'Core', role: 'core', mesh: meshCore, ...partStats(meshCore), print: printPlacement(meshCore, true) });
  });
  result.cast = { volumeMm3: result.model.volumeMm3, spoutMm3: 0 };
}

function buildBox(model, s, grid, sdf, release, block, result, tick, originalBounds) {
  const { h, nx, ny, nz, origin } = grid;
  const wb = meshBounds(model);
  tick('Checking overhangs for printing…');
  const cls = classify(model, release, h, s.draftAngle, () => 'print');
  result.analysis = { ...cls, mode: 'print' };
  if (cls.trappedFraction > 0.03) result.warnings.push('The model has overhangs steeper than 45° (red); the slicer will want supports under them. Supports on a silicone master are fine — sand the marks before pouring.');
  tick('Shaping the tray…');
  const c = centre(block), hs = half(block);
  const r = Math.min(s.cornerRadius + s.siliconeGap, Math.min(hs[0], hs[1]) - 0.5);
  const inner = { min: [wb.min[0] - s.siliconeGap, wb.min[1] - s.siliconeGap, s.boxFloor], max: [wb.max[0] + s.siliconeGap, wb.max[1] + s.siliconeGap, block.max[2] + 10] };
  const ic = centre(inner), ih = half(inner), ir = Math.max(0.5, r - s.boxWall);
  const field = new Float32Array(grid.count);
  for (let k = 0; k < nz; k++) {
    const z = origin[2] + k * h;
    for (let j = 0; j < ny; j++) {
      const y = origin[1] + j * h;
      let idx = (k * ny + j) * nx;
      for (let i = 0; i < nx; i++, idx++) {
        const x = origin[0] + i * h;
        const shell = Math.max(shapes.roundedBoxXY(x, y, z, c, hs, r), -shapes.roundedBoxXY(x, y, z, ic, ih, ir));
        field[idx] = Math.min(shell, sdf[idx]);
      }
    }
  }
  const mesh = extract(field, grid, s, tick, 'the master');
  result.parts.push({ name: 'Silicone master', role: 'master', mesh, ...partStats(mesh), print: printPlacement(mesh, false) });
  const innerVolume = (inner.max[0] - inner.min[0]) * (inner.max[1] - inner.min[1]) * (block.max[2] - s.boxFloor);
  result.features.silicone = { volumeMm3: Math.max(0, innerVolume - result.model.volumeMm3), gap: s.siliconeGap, innerSize: [inner.max[0] - inner.min[0], inner.max[1] - inner.min[1], block.max[2] - s.boxFloor] };
  result.features.modelOffset = [0, 0, -originalBounds.min[2] + s.boxFloor - 0.6];
  result.cast = { volumeMm3: result.model.volumeMm3, spoutMm3: 0 };
}

/* ---------- connected pieces of a field ---------- */

function labelComponents(field, grid) {
  const { nx, ny, nz } = grid;
  const ids = new Int32Array(grid.count);
  const sizes = {};
  let next = 0;
  const stack = new Int32Array(1 << 16); let stackCap = stack.length; let st = stack;
  for (let start = 0; start < field.length; start++) {
    if (field[start] >= 0 || ids[start]) continue;
    const id = ++next; let size = 0, sp = 0;
    st[sp++] = start; ids[start] = id;
    while (sp) {
      const n = st[--sp]; size++;
      const i = n % nx, j = Math.floor(n / nx) % ny, k = Math.floor(n / (nx * ny));
      const nb = [i > 0 ? n - 1 : -1, i < nx - 1 ? n + 1 : -1, j > 0 ? n - nx : -1, j < ny - 1 ? n + nx : -1, k > 0 ? n - nx * ny : -1, k < nz - 1 ? n + nx * ny : -1];
      for (const m of nb) {
        if (m < 0 || ids[m] || field[m] >= 0) continue;
        ids[m] = id;
        if (sp === stackCap) { const bigger = new Int32Array(stackCap * 2); bigger.set(st); st = bigger; stackCap *= 2; }
        st[sp++] = m;
      }
    }
    sizes[id] = size;
  }
  return { ids, sizes };
}

function footprint(ids, id, grid) {
  const { nx, ny, nz, h, origin } = grid;
  let i0 = nx, i1 = -1, j0 = ny, j1 = -1;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) {
    const base = (k * ny + j) * nx;
    for (let i = 0; i < nx; i++) if (ids[base + i] === id) { if (i < i0) i0 = i; if (i > i1) i1 = i; if (j < j0) j0 = j; if (j > j1) j1 = j; }
  }
  return { min: [origin[0] + i0 * h, origin[1] + j0 * h], max: [origin[0] + i1 * h, origin[1] + j1 * h] };
}

/* ---------- handy numbers for the page ---------- */

export function castEstimate(volumeMm3, material) {
  const m = MATERIALS[material] || MATERIALS.concrete;
  const mL = volumeMm3 / 1000;
  return { mL, grams: mL * m.density, unit: m.unit, material: m };
}

export { PLA_DENSITY, PRINT_FILL };
