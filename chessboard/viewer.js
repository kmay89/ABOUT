/**
 * Make your own chess board — the 3D side of the page.
 *
 * kit.bin holds the real print files, thinned for a browser (tools/make-kit.mjs):
 * the two board halves (light body + dark inlay), the fit-test coupons, the inlay
 * tiles and the six piece shapes, quantised to 16 bits, plus the nest layout the
 * case generator itself computed. Everything here is in the generator's own frame:
 * millimetres, Z up, the opened case lying trays-up with the hinge along X at
 * (y = 0, z = H). Half A (the lid, ranks 1–4) is at y > 0, half B (the tray) at y < 0.
 *
 * The story is one pure function of time, so the scrubber, the chapter buttons and
 * the autoplay all ask the same question: where is everything at t seconds?
 */
import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

/* ------------------------------------------------------------------ the kit */

export async function loadKit(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`kit ${res.status}`);
  const total = +res.headers.get('content-length') || 0;
  let buf;
  if (res.body && total && onProgress) {
    const reader = res.body.getReader();
    const out = new Uint8Array(total);
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.set(value, got); got += value.length;
      onProgress(got / total);
    }
    buf = out.buffer.slice(0, got);
  } else {
    buf = await res.arrayBuffer();
  }
  const hlen = new DataView(buf).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, hlen)));
  const base = 4 + hlen;
  const geoms = {};
  for (const [name, m] of Object.entries(header.meshes)) {
    const q = new Uint16Array(buf, base + m.pos, m.verts * 3);
    const I = m.i32 ? new Uint32Array(buf, base + m.idx, m.tris * 3) : new Uint16Array(buf, base + m.idx, m.tris * 3);
    const P = new Float32Array(m.verts * 3);
    for (let i = 0; i < m.verts; i++) for (let k = 0; k < 3; k++) {
      P[i * 3 + k] = m.min[k] + (q[i * 3 + k] / 65535) * (m.max[k] - m.min[k]);
    }
    geoms[name] = creased(P, I, 32);
  }
  return { geoms, layout: header.layout, meshes: header.meshes };
}

/**
 * Flat where the model is faceted, smooth where it is curved: each corner of each
 * triangle averages only the neighbouring faces within `deg` of its own.
 */
function creased(P, I, deg) {
  const V = P.length / 3, F = I.length / 3;
  const fa = new Float32Array(F * 3), fu = new Float32Array(F * 3);
  for (let f = 0; f < F; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    fa[f * 3] = nx; fa[f * 3 + 1] = ny; fa[f * 3 + 2] = nz;
    fu[f * 3] = nx / l; fu[f * 3 + 1] = ny / l; fu[f * 3 + 2] = nz / l;
  }
  const start = new Uint32Array(V + 1);
  for (let i = 0; i < I.length; i++) start[I[i] + 1]++;
  for (let v = 0; v < V; v++) start[v + 1] += start[v];
  const fill = start.slice(0, V), adj = new Uint32Array(I.length);
  for (let i = 0; i < I.length; i++) adj[fill[I[i]]++] = (i / 3) | 0;
  const cos = Math.cos(deg * Math.PI / 180);
  const pos = new Float32Array(F * 9), nor = new Float32Array(F * 9);
  for (let f = 0; f < F; f++) {
    for (let k = 0; k < 3; k++) {
      const v = I[f * 3 + k], o = f * 9 + k * 3;
      pos[o] = P[v * 3]; pos[o + 1] = P[v * 3 + 1]; pos[o + 2] = P[v * 3 + 2];
      let nx = 0, ny = 0, nz = 0;
      for (let j = start[v]; j < start[v + 1]; j++) {
        const g = adj[j];
        if (fu[f * 3] * fu[g * 3] + fu[f * 3 + 1] * fu[g * 3 + 1] + fu[f * 3 + 2] * fu[g * 3 + 2] >= cos) {
          nx += fa[g * 3]; ny += fa[g * 3 + 1]; nz += fa[g * 3 + 2];
        }
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      nor[o] = nx / l; nor[o + 1] = ny / l; nor[o + 2] = nz / l;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.computeBoundingBox(); g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------------ materials */

/**
 * One material per role ("light" and "dark"), shared by every mesh in both stages, so a new
 * filament changes everything at once with no shader rebuild. The finish decides how the
 * surface takes light; the colour is the filament's own code (filaments.js). Marble and wood
 * carry their flecks and grain in model space, so they stay put on the part; sparkle and
 * galaxy glint.
 */
const FINISH = {
  basic:   { roughness: 0.48, metalness: 0,    clearcoat: 0.25, ccRough: 0.5,  fleck: 0,    grain: 0,    sparkle: 0 },
  matte:   { roughness: 0.92, metalness: 0,    clearcoat: 0,    ccRough: 1,    fleck: 0,    grain: 0,    sparkle: 0 },
  silk:    { roughness: 0.3,  metalness: 0.55, clearcoat: 0.6,  ccRough: 0.25, fleck: 0,    grain: 0,    sparkle: 0 },
  marble:  { roughness: 0.62, metalness: 0,    clearcoat: 0,    ccRough: 1,    fleck: 0.85, grain: 0,    sparkle: 0 },
  wood:    { roughness: 0.82, metalness: 0,    clearcoat: 0,    ccRough: 1,    fleck: 0.35, grain: 1,    sparkle: 0 },
  sparkle: { roughness: 0.42, metalness: 0,    clearcoat: 0.3,  ccRough: 0.4,  fleck: 0,    grain: 0,    sparkle: 1 },
  galaxy:  { roughness: 0.38, metalness: 0,    clearcoat: 0.4,  ccRough: 0.3,  fleck: 0,    grain: 0,    sparkle: 0.8 },
  metal:   { roughness: 0.38, metalness: 0.7,  clearcoat: 0.2,  ccRough: 0.4,  fleck: 0,    grain: 0,    sparkle: 0.15 },
};
const ROLES = {
  light: { mats: [], uniforms: null, finish: 'marble', hex: '#F7F3F0' },
  dark:  { mats: [], uniforms: null, finish: 'basic', hex: '#1C1C1E' },
};
for (const r of Object.values(ROLES)) {
  r.uniforms = { uFleck: { value: 0 }, uFleckCol: { value: new THREE.Color(0x0d0d0e) }, uGrain: { value: 0 }, uSparkle: { value: 0 } };
}

function applyRole(m, role) {
  const r = ROLES[role], f = FINISH[r.finish] || FINISH.basic;
  m.color.set(r.hex);
  m.roughness = f.roughness; m.metalness = f.metalness;
  m.clearcoat = f.clearcoat; m.clearcoatRoughness = f.ccRough;
  // silk and metal: the shine takes the colour of the filament, as it does on the real thing
  m.specularColor.set(f.metalness > 0.3 ? r.hex : '#ffffff');
}

export function filamentMaterial(role) {
  const r = ROLES[role];
  const m = new THREE.MeshPhysicalMaterial({ envMapIntensity: 0.85 });
  applyRole(m, role);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, r.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vObj;
uniform float uFleck; uniform vec3 uFleckCol; uniform float uGrain; uniform float uSparkle;
float hash3(vec3 c){ return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float fleck(vec3 p, float scale, float keep){
  vec3 c = floor(p * scale);
  float h = hash3(c);
  vec3 o = vec3(fract(h * 13.1), fract(h * 71.7), fract(h * 33.3)) * 0.5 + 0.25;
  float r = length(fract(p * scale) - o);
  return step(keep, h) * smoothstep(0.24, 0.12, r);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uFleck > 0.0) {
  float f = max(fleck(vObj, 0.75, 0.80), fleck(vObj + 17.0, 1.3, 0.90) * 0.7);
  diffuseColor.rgb = mix(diffuseColor.rgb, uFleckCol, f * uFleck);
}
if (uGrain > 0.0) {
  float g = sin(vObj.x * 1.7 + sin(vObj.y * 0.23 + vObj.z * 0.4) * 2.6) * 0.5 + 0.5;
  diffuseColor.rgb *= 1.0 - uGrain * 0.12 * smoothstep(0.55, 1.0, g);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uSparkle > 0.0) {
  float s = fleck(vObj * 1.0 + 3.0, 2.6, 0.955);
  float tw = 0.55 + 0.45 * sin(dot(vViewPosition, vec3(0.9, 1.3, 0.7)) * 0.08 + hash3(floor(vObj * 2.6)) * 6.28);
  totalEmissiveRadiance += vec3(s * uSparkle * tw * 0.75);
}`);
  };
  m.customProgramCacheKey = () => 'filament';
  r.mats.push(m);
  return m;
}

/** Give a role a filament: { hex, finish } (and the marble/wood fleck colour follows the body). */
export function setFilament(role, { hex, finish }) {
  const r = ROLES[role];
  r.hex = hex; r.finish = finish;
  const f = FINISH[finish] || FINISH.basic;
  const base = new THREE.Color(hex);
  const hsl = {}; base.getHSL(hsl);
  r.uniforms.uFleck.value = f.fleck;
  // marble flecks are dark on light stone and light on dark stone; wood flecks are darker wood
  r.uniforms.uFleckCol.value.copy(finish === 'wood' ? base.clone().multiplyScalar(0.55)
    : hsl.l > 0.45 ? new THREE.Color(0x0d0d0e) : new THREE.Color(0xd8d4cc));
  r.uniforms.uGrain.value = f.grain;
  r.uniforms.uSparkle.value = f.sparkle;
  for (const m of r.mats) applyRole(m, role);
}

/** A soft studio for reflections: a warm room with a big window and two softboxes. */
function studio(renderer) {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0x3a3129, side: THREE.BackSide }));
  room.position.y = 2;
  scene.add(room);
  const panel = (w, h, c, x, y, z, rx, ry) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    p.position.set(x, y, z); p.rotation.set(rx, ry, 0);
    scene.add(p);
  };
  panel(5, 2.2, new THREE.Color(3.2, 3.0, 2.7), -2, 4.9, 1.5, Math.PI / 2, 0);   // overhead window
  panel(2.4, 2.4, new THREE.Color(2.2, 2.1, 2.0), 4.9, 2.2, -1, 0, -Math.PI / 2); // softbox right
  panel(2.4, 1.6, new THREE.Color(1.5, 1.4, 1.3), -4.9, 1.8, 2, 0, Math.PI / 2);  // softbox left
  panel(10, 10, 0x1c1712, 0, -0.99, 0, -Math.PI / 2, 0);                           // dark table
  const pm = new THREE.PMREMGenerator(renderer);
  const env = pm.fromScene(scene, 0.035).texture;
  pm.dispose();
  return env;
}

/* ------------------------------------------------------------------ a stage */

export function makeStage(canvas, { fov = 32, shadows = true } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Khronos PBR Neutral: keeps a base colour looking like its code, where ACES shifts hues
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, 5, 6000);
  scene.environment = studio(renderer);
  scene.add(new THREE.HemisphereLight(0xfff6ea, 0x2a2018, 0.55));
  const key = new THREE.DirectionalLight(0xfff4e6, 2.1);
  key.position.set(-260, 520, 260);
  key.castShadow = shadows;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -330; key.shadow.camera.right = 330;
  key.shadow.camera.top = 330; key.shadow.camera.bottom = -330;
  key.shadow.camera.near = 50; key.shadow.camera.far = 1600;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.6;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xeceae6, 0.5);
  rim.position.set(300, 220, -420);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xfff0e0, 0.3);
  fill.position.set(380, 160, 300);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.CircleGeometry(900, 64), new THREE.ShadowMaterial({ opacity: 0.32 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 120;
  controls.maxDistance = 1400;
  controls.maxPolarAngle = Math.PI * 0.49;

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
      renderer.setSize(w, h, false);
    }
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Only draw while on screen.
  let visible = true;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { rootMargin: '120px' }).observe(canvas);

  let tick = null;
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (!visible || document.hidden) return;
    resize();
    if (tick) tick(now);
    controls.update();
    renderer.render(scene, camera);
  };
  requestAnimationFrame(loop);

  return { renderer, scene, camera, controls, key, floor, onTick: (f) => { tick = f; } };
}

/* ------------------------------------------------------------------ geometry facts */

const H = 12.2;           // half thickness, face to rim
const FEET = 16;          // face to the top of the knuckles / corner bosses: the feet in play
const SQ = 25, BORDER = 9;
const fileX = (f) => BORDER + SQ / 2 + SQ * f;                  // a..h → 0..7
const playY = (r) => SQ * (r - 1) - 87.5;                       // rank 1..8, play frame (white at y < 0)
const ease = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const ease5 = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (u * (u * 6 - 15) + 10));
const clamp01 = (u) => Math.max(0, Math.min(1, u));
const X_AXIS = new THREE.Vector3(1, 0, 0), Z_AXIS = new THREE.Vector3(0, 0, 1);
const qAxis = (axis, a) => new THREE.Quaternion().setFromAxisAngle(axis, a);

/* ------------------------------------------------------------------ the story */

export const CHAPTERS = [
  { id: 'closed', t: 0.0,  title: 'Closed', text: 'A case 218 × 109 × 24 mm. All thirty-two pieces are inside it.' },
  { id: 'open',   t: 1.2,  title: 'Open', text: 'The latch lets go, and the lid swings open on a printed hinge with a 1.75 mm filament pin.' },
  { id: 'unpack', t: 4.2,  title: 'Unpack', text: 'Every piece has its own contoured nest, half in the tray and half in the lid. Nothing rattles.' },
  { id: 'flip',   t: 8.0,  title: 'Flip', text: 'Turn it over. The hinge knuckles and the corner bosses become the feet.' },
  { id: 'setup',  t: 10.6, title: 'Set up', text: '25 mm squares, printed face-down on the plate so they come off smooth and crisp.' },
  { id: 'play',   t: 14.6, title: 'Play', text: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5: the Italian Game, the same opening the tiny set on the desk is paused in.' },
];
export const STORY_END = 20.6;
const T = { lidOpen: [1.2, 3.4], unpack: [4.2, 7.6], hop: 1.0, flip: [8.0, 10.2], setup: [10.6, 13.8], set: 0.9, moves: 14.6, ply: 0.8 };
const MOVES = [['e2', 'e4'], ['e7', 'e5'], ['g1', 'f3'], ['b8', 'c6'], ['f1', 'c4'], ['f8', 'c5']];
const BACK = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

export function buildStory(stage, kit) {
  const { geoms, layout } = kit;
  const marble = filamentMaterial('light'), black = filamentMaterial('dark');
  // Z-up model frame → Y-up world, centred on the board.
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  root.position.set(-109, 0, 0);
  stage.scene.add(root);

  const flipper = new THREE.Group();
  root.add(flipper);
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o; };
  const tray = new THREE.Group();
  tray.add(mesh(geoms.trayLight, marble), mesh(geoms.trayDark, black));
  flipper.add(tray);
  const hinge = new THREE.Group();            // pivots about the hinge axis
  hinge.position.set(0, 0, H);
  const lid = new THREE.Group();
  lid.position.set(0, 0, -H);
  lid.add(mesh(geoms.lidLight, marble), mesh(geoms.lidDark, black));
  hinge.add(lid);
  flipper.add(hinge);

  // Pieces: one per nest. Marble nests are the left half (side −1), black the right.
  const pieces = [];
  const homes = { white: {}, black: {} };
  for (let f = 0; f < 8; f++) {
    for (const [colour, r1, r2] of [['white', 1, 2], ['black', 8, 7]]) {
      (homes[colour][BACK[f]] ||= []).push({ f, r: r1 });
      (homes[colour].pawn ||= []).push({ f, r: r2 });
    }
  }
  const byKind = { white: {}, black: {} };
  layout.nests.forEach((n) => {
    const colour = n.side < 0 ? 'white' : 'black';
    (byKind[colour][n.kind] ||= []).push(n);
  });
  const qStore = qAxis(X_AXIS, Math.PI / 2);                  // piece axis (+z) → −y, base toward the hinge
  for (const colour of ['white', 'black']) {
    for (const [kind, nests] of Object.entries(byKind[colour])) {
      // nearest-first pairing: nests sorted by x go to squares sorted by file
      const ns = nests.slice().sort((a, b) => a.xc - b.xc || a.y0 - b.y0);
      const hs = homes[colour][kind].slice().sort((a, b) => a.f - b.f);
      ns.forEach((n, i) => {
        const o = mesh(geoms[kind], colour === 'white' ? marble : black);
        root.add(o);
        const home = hs[i];
        const face = qAxis(Z_AXIS, colour === 'white' ? Math.PI / 2 : -Math.PI / 2);
        const sideY = colour === 'white' ? -1 : 1;
        pieces.push({
          o, kind, colour, home,
          store: { p: new THREE.Vector3(n.xc, -n.y0, H), q: qStore.clone() },
          wait: { p: new THREE.Vector3(fileX(home.f), sideY * (kind === 'pawn' ? 140 : 168), 0), q: face },
          sq: home,
          face,
        });
      });
    }
  }
  // Unpack order: nearest the hinge first, so nothing lifts through a neighbour; set-up order: back rank, then pawns.
  const unpackOrder = pieces.slice().sort((a, b) => a.store.p.y - b.store.p.y || a.store.p.x - b.store.p.x).reverse();
  unpackOrder.forEach((p, i) => { p.tUnpack = T.unpack[0] + i * ((T.unpack[1] - T.unpack[0] - T.hop) / (pieces.length - 1)); });
  const setupOrder = pieces.slice().sort((a, b) => (a.colour === b.colour ? 0 : a.colour === 'white' ? -1 : 1) || (a.kind === 'pawn') - (b.kind === 'pawn') || a.home.f - b.home.f);
  setupOrder.forEach((p, i) => { p.tSet = T.setup[0] + i * ((T.setup[1] - T.setup[0] - T.set) / (pieces.length - 1)); });

  // The opening, as hops: which piece moves when, from where to where.
  const sqName = (s) => 'abcdefgh'[s.f] + s.r;
  const at = (name) => ({ f: name.charCodeAt(0) - 97, r: +name[1] });
  const where = new Map(pieces.map((p) => [sqName(p.home), p]));
  pieces.forEach((p) => { p.moves = []; });
  MOVES.forEach(([from, to], i) => {
    const p = where.get(from);
    where.delete(from); where.set(to, p);
    p.moves.push({ t: T.moves + i * T.ply, from: at(from), to: at(to) });
  });

  const tmpP = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
  const onBoard = (s, out) => out.set(fileX(s.f), playY(s.r), FEET);
  const hopTo = (a, b, u, h, out) => {
    const e = ease(u);
    out.lerpVectors(a, b, e);
    out.z += h * 4 * e * (1 - e);
    return out;
  };

  function pose(t) {
    // the lid: closed (π) → open (0)
    hinge.rotation.x = Math.PI * (1 - ease5(clamp01((t - T.lidOpen[0]) / (T.lidOpen[1] - T.lidOpen[0]))));
    // the case flips over, lifted clear of the table
    // it tips over its long edge like a book: the pivot rises just enough that the lowest
    // corner stays on the table (half-depth 113 mm incl. knuckles, half-thickness 8 mm)
    const s = ease(clamp01((t - T.flip[0]) / (T.flip[1] - T.flip[0])));
    const th = Math.PI * s;
    flipper.rotation.x = th;
    const mid = FEET / 2;                               // pivot through the middle of the thickness
    flipper.position.y = mid * Math.sin(th);
    flipper.position.z = mid - mid * Math.cos(th) + Math.max(0, 113 * Math.sin(th) + mid * Math.abs(Math.cos(th)) - mid);

    for (const p of pieces) {
      const o = p.o;
      if (t < p.tUnpack) {
        o.position.copy(p.store.p); o.quaternion.copy(p.store.q);
      } else if (t < p.tSet) {
        const u = clamp01((t - p.tUnpack) / T.hop);
        hopTo(p.store.p, p.wait.p, u, 70, o.position);
        o.quaternion.slerpQuaternions(p.store.q, p.wait.q, ease(Math.min(1, u * 1.6)));
      } else {
        const u = clamp01((t - p.tSet) / T.set);
        let sq = p.home;
        hopTo(p.wait.p, onBoard(sq, tmpP), u, 46, o.position);
        o.quaternion.copy(p.wait.q);
        for (const m of p.moves) {
          if (t < m.t) break;
          const v = clamp01((t - m.t) / (T.ply * 0.85));
          const a = onBoard(m.from, new THREE.Vector3()), b = onBoard(m.to, tmpP);
          hopTo(a, b, v, p.kind === 'knight' ? 42 : 16, o.position);
          sq = m.to;
        }
      }
    }
  }

  return { pose, root, pieces, tray, lid };
}

/* ------------------------------------------------------------------ the parts table */

/** Show one printed part at a time, laid as it prints (or turned over to show its face). */
export function buildParts(stage, kit) {
  const { geoms } = kit;
  const marble = filamentMaterial('light'), black = filamentMaterial('dark');
  const root = new THREE.Group();
  root.rotation.x = -Math.PI / 2;
  stage.scene.add(root);
  const holder = new THREE.Group();
  root.add(holder);
  const mk = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = o.receiveShadow = true; return o; };

  const sets = {
    fit: () => {
      const g = new THREE.Group();
      const a = mk(geoms.fitA, marble), b = mk(geoms.fitB, marble);
      a.position.y = 6; b.position.y = -6;
      g.add(a, b); return g;
    },
    lid: () => { const g = new THREE.Group(); g.add(mk(geoms.lidLight, marble), mk(geoms.lidDark, black)); return g; },
    tray: () => { const g = new THREE.Group(); g.add(mk(geoms.trayLight, marble), mk(geoms.trayDark, black)); return g; },
    marble: () => pieceRow(marble),
    black: () => pieceRow(black),
    tiles: () => { const g = new THREE.Group(); g.add(mk(geoms.tiles, black)); return g; },
  };
  function pieceRow(mat) {
    const g = new THREE.Group();
    const order = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];
    order.forEach((k, i) => { const o = mk(geoms[k], mat); o.position.set((i - 3.5) * 26, 13, 0); o.rotation.z = Math.PI / 2; g.add(o); });
    for (let i = 0; i < 8; i++) { const o = mk(geoms.pawn, mat); o.position.set((i - 3.5) * 26, -13, 0); g.add(o); }
    return g;
  }

  let current = null, faceUp = false;
  function show(id, flip = faceUp) {
    faceUp = flip;
    if (current) holder.remove(current);
    current = sets[id]();
    holder.add(current);
    // centre it on the turntable, resting on the table
    // (in the part's own frame: the turntable and the Y-up turn must not leak into it)
    const box = new THREE.Box3();
    current.updateMatrix();
    current.children.forEach((m) => { m.updateMatrix(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrix)); });
    const c = box.getCenter(new THREE.Vector3());
    current.position.x -= c.x; current.position.y -= c.y; current.position.z -= box.min.z;
    const flippable = id === 'lid' || id === 'tray' || id === 'tiles';
    holder.rotation.set(flip && flippable ? Math.PI : 0, 0, 0);
    holder.position.z = flip && flippable ? box.max.z - box.min.z : 0;
    const size = box.getSize(new THREE.Vector3());
    return { size, flippable };
  }
  return { show, root };
}
