import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { faceNormals, transform } from './mesh.js';

/**
 * The 3D stage: the model with its release map, the mold parts (assembled,
 * exploded or cut open), the parts laid on the printer's plate, and the mold
 * standing as it will when poured. Units are millimetres; Z is up.
 */

const CLASS_COLOURS = [new THREE.Color('#8fbf7a'), new THREE.Color('#e3b24d'), new THREE.Color('#d4583a')];
const PART_COLOURS = { 'half-a': '#d9dcd3', 'half-b': '#c9cfc3', body: '#d9dcd3', core: '#c5ccbd', master: '#d9dcd3' };
const CAST_COLOURS = { concrete: '#a8a59c', plaster: '#ece7dd', resin: '#d9a44e', wax: '#f1e2c0', soap: '#b9d7d9' };

function geometryFrom(mesh, colors) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

function classColors(vertexClass) {
  const colors = new Float32Array(vertexClass.length * 3);
  for (let i = 0; i < vertexClass.length; i++) {
    const c = CLASS_COLOURS[vertexClass[i]] || CLASS_COLOURS[0];
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  return colors;
}

/** A flat-shaded copy of a mesh in print orientation, each face painted by its overhang:
 * red past 45°, amber past 20°, the base colour otherwise. The first layer (faces on the
 * plate) is not an overhang, and per-face colours keep a red floor from bleeding up a wall. */
function overhangGeometry(mesh, base) {
  const n = faceNormals(mesh);
  const { positions: p, indices: ix } = mesh;
  const T = ix.length / 3;
  const positions = new Float32Array(T * 9), colors = new Float32Array(T * 9);
  const b = new THREE.Color(base);
  for (let t = 0; t < T; t++) {
    const nz = n[t * 3 + 2];
    let onPlate = true;
    for (let k = 0; k < 3; k++) if (p[ix[t * 3 + k] * 3 + 2] > 0.6) onPlate = false;
    const c = onPlate ? b : nz < -0.72 ? CLASS_COLOURS[2] : nz < -0.35 ? CLASS_COLOURS[1] : b;
    for (let k = 0; k < 3; k++) {
      const v = ix[t * 3 + k] * 3, o = t * 9 + k * 3;
      positions[o] = p[v]; positions[o + 1] = p[v + 1]; positions[o + 2] = p[v + 2];
      colors[o] = c.r; colors[o + 1] = c.g; colors[o + 2] = c.b;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export class MoldViewer {
  constructor(container, { onStatus, onFailure } = {}) {
    this.container = container;
    this.onStatus = onStatus || (() => {});
    this.view = 'model';
    this.explode = 0;
    this.section = 0.5;
    this.plate = { x: 256, y: 256, z: 256 };
    this.material = 'concrete';
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
    this.camera.up.set(0, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.localClippingEnabled = true;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', 'Interactive 3D view. Drag to orbit; scroll or pinch to zoom; right-drag to pan.');
    canvas.setAttribute('role', 'img');
    canvas.tabIndex = 0;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-5px;';
    container.append(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 3000;
    this.controls.maxPolarAngle = Math.PI * 0.96;
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => { this.userFramed = true; });
    canvas.addEventListener('keydown', (e) => {
      if (e.key === 'Home') { this.resetView(); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { this.zoom(0.88); e.preventDefault(); }
      else if (e.key === '-') { this.zoom(1.14); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const v = this.camera.position.clone().sub(this.controls.target);
        v.applyAxisAngle(new THREE.Vector3(0, 0, 1), e.key === 'ArrowLeft' ? 0.12 : -0.12);
        this.camera.position.copy(this.controls.target).add(v); this.controls.update(); e.preventDefault();
      }
    });
    canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); onFailure?.(); });

    this.scene.add(new THREE.HemisphereLight(0xf6f1e6, 0x3b4440, 1.6));
    const key = new THREE.DirectionalLight(0xfff4e2, 2.4); key.position.set(-160, -260, 340); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd3e3ea, 0.9); fill.position.set(220, -60, 120); this.scene.add(fill);
    const back = new THREE.DirectionalLight(0xffe2b8, 1.1); back.position.set(60, 260, 160); this.scene.add(back);

    this.groups = {};
    for (const name of ['model', 'mold', 'section', 'print', 'pour']) { const g = new THREE.Group(); g.visible = name === 'model'; this.scene.add(g); this.groups[name] = g; }
    this.helpers = new THREE.Group(); this.scene.add(this.helpers);
    this.clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
    this.disposables = [];
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.rendering = false;
    this.animate = this.animate.bind(this);
    this.resize();
    requestAnimationFrame(this.animate);
  }

  /* ---------- plumbing ---------- */
  animate() {
    this.controls.update();
    if (this.needsRender) { this.needsRender = false; this.renderer.render(this.scene, this.camera); }
    requestAnimationFrame(this.animate);
  }
  requestRender() { this.needsRender = true; }
  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }
  zoom(multiplier) {
    const delta = this.camera.position.clone().sub(this.controls.target).multiplyScalar(multiplier);
    if (delta.length() < this.controls.minDistance || delta.length() > this.controls.maxDistance) return;
    this.camera.position.copy(this.controls.target).add(delta); this.controls.update();
  }
  clear(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.geometry?.dispose?.();
      if (Array.isArray(child.material)) child.material.forEach(m => m.dispose()); else child.material?.dispose?.();
      child.traverse?.((c) => { if (c !== child) { c.geometry?.dispose?.(); c.material?.dispose?.(); } });
    }
  }
  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
  dispose() { this.observer.disconnect(); this.controls.dispose(); this.renderer.dispose(); }

  /* ---------- content ---------- */
  setMaterialName(name) { this.material = name; if (this.lastParts) this.setParts(...this.lastParts); }

  /** The model alone, painted by what releases (green), what is steep (amber) and what is trapped (red). */
  setModel(mesh, vertexClass, meta = {}) {
    this.model = mesh; this.meta = meta;
    this.clear(this.groups.model);
    this.clear(this.helpers);
    if (!mesh) { this.requestRender(); return; }
    const colors = vertexClass ? classColors(vertexClass) : null;
    const material = new THREE.MeshStandardMaterial({ color: colors ? 0xffffff : 0xb9c0b4, vertexColors: !!colors, roughness: 0.78, metalness: 0, side: THREE.DoubleSide });
    const geometry = geometryFrom(mesh, colors);
    this.groups.model.add(new THREE.Mesh(geometry, material));
    this.bounds = geometry.boundingBox;
    this.drawHelpers(meta);
    if (!this.userFramed) this.resetView();
    this.requestRender();
  }

  drawHelpers(meta) {
    const bb = this.bounds; if (!bb) return;
    const size = bb.getSize(new THREE.Vector3());
    const floorZ = meta.block ? meta.block.min[2] : bb.min.z;
    const span = Math.max(size.x, size.y, (meta.block ? meta.block.max[0] - meta.block.min[0] : 0)) * 2.4 + 40;
    const grid = new THREE.GridHelper(span, Math.round(span / 10), 0x5a665e, 0x3b4642);
    grid.rotation.x = Math.PI / 2;
    grid.position.set((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, floorZ - 0.05);
    grid.material.transparent = true; grid.material.opacity = 0.55;
    this.helpers.add(grid);
    if (meta.block) {
      const b = meta.block;
      const box = new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max));
      const helper = new THREE.Box3Helper(box, 0x8ea295);
      helper.material.transparent = true; helper.material.opacity = 0.5;
      this.helpers.add(helper);
      this.helperBox = box;
    }
    if (meta.type === 'two-part' && Number.isFinite(meta.partingZ) && meta.block) {
      const b = meta.block;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(b.max[0] - b.min[0] + 12, b.max[1] - b.min[1] + 12),
        new THREE.MeshBasicMaterial({ color: 0xe0b14a, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }));
      plane.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, meta.partingZ);
      this.helpers.add(plane);
      if (meta.pour) {
        const dir = new THREE.Vector3(meta.pour.axis === 0 ? meta.pour.sign : 0, meta.pour.axis === 1 ? meta.pour.sign : 0, 0);
        const origin = new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, meta.partingZ);
        const len = (meta.pour.axis === 0 ? b.max[0] - b.min[0] : b.max[1] - b.min[1]) / 2 + 18;
        const arrow = new THREE.ArrowHelper(dir, origin, len, 0xe0b14a, 9, 5);
        this.helpers.add(arrow);
      }
    }
  }

  /** The mold's parts (model space) with print placements, plus the metadata that places them. */
  setParts(parts, meta = {}) {
    this.lastParts = [parts, meta];
    this.parts = parts; this.meta = { ...this.meta, ...meta };
    for (const name of ['mold', 'section', 'print', 'pour']) this.clear(this.groups[name]);
    this.clear(this.helpers); this.drawHelpers(this.meta);
    if (!parts || !parts.length) { this.requestRender(); return; }
    const castColour = new THREE.Color(CAST_COLOURS[this.material] || CAST_COLOURS.concrete);
    const partMaterial = (role, extra = {}) => new THREE.MeshStandardMaterial({ color: PART_COLOURS[role] || '#d9dcd3', roughness: 0.6, metalness: 0.02, ...extra });
    const castMesh = (opacity = 1) => this.model ? new THREE.Mesh(geometryFrom(this.model), new THREE.MeshStandardMaterial({ color: castColour, roughness: 0.9, transparent: opacity < 1, opacity })) : null;

    // assembled / exploded
    const block = this.meta.block;
    const centre = block ? new THREE.Vector3((block.min[0] + block.max[0]) / 2, (block.min[1] + block.max[1]) / 2, (block.min[2] + block.max[2]) / 2) : new THREE.Vector3();
    const height = block ? block.max[2] - block.min[2] : 50;
    this.explodeTargets = [];
    parts.forEach((part) => {
      const mesh = new THREE.Mesh(geometryFrom(part.mesh), partMaterial(part.role));
      let dir = new THREE.Vector3(0, 0, 0);
      if (part.role === 'half-a') dir.set(0, 0, -1);
      else if (part.role === 'half-b') dir.set(0, 0, 1);
      else if (part.role === 'core') dir.set(0, 0, 1);
      this.groups.mold.add(mesh);
      this.explodeTargets.push({ mesh, dir, distance: height * 0.7 + 10 });
      // cut open
      const cut = new THREE.Mesh(geometryFrom(part.mesh), partMaterial(part.role, { side: THREE.DoubleSide, clippingPlanes: [this.clipPlane], clipShadows: true }));
      this.groups.section.add(cut);
    });
    if (this.meta.type !== 'box') { const cast = castMesh(1); if (cast) { cast.visible = false; this.groups.mold.add(cast); this.castInMold = cast; } }
    const sectionCast = castMesh(1);
    if (sectionCast && this.meta.type !== 'box') { sectionCast.material.clippingPlanes = [this.clipPlane]; sectionCast.material.side = THREE.DoubleSide; this.groups.section.add(sectionCast); }
    this.setExplode(this.explode);
    this.setSection(this.section);

    // on the plate
    this.layoutPrint(parts);

    // poured: stand the assembly so the pour runs upwards
    if (this.meta.type === 'two-part' && this.meta.pour) {
      const g = new THREE.Group();
      parts.forEach((part) => g.add(new THREE.Mesh(geometryFrom(part.mesh), partMaterial(part.role, { transparent: true, opacity: 0.32, depthWrite: false }))));
      const cast = castMesh(1); if (cast) g.add(cast);
      const { axis, sign } = this.meta.pour;
      // rotate so the pour axis (+d) becomes +Z, pivoting about the block centre
      g.position.copy(centre.clone().negate());
      const wrap = new THREE.Group(); wrap.add(g);
      if (axis === 1) wrap.rotation.x = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      else wrap.rotation.y = sign > 0 ? Math.PI / 2 : -Math.PI / 2;
      const outer = new THREE.Group(); outer.add(wrap);
      const halfLen = (axis === 0 ? block.max[0] - block.min[0] : block.max[1] - block.min[1]) / 2;
      outer.position.set(centre.x, centre.y, (block ? block.min[2] : 0) + halfLen);
      this.groups.pour.add(outer);
      const stand = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 4, 24), new THREE.MeshStandardMaterial({ color: 0x5c6a62 }));
      stand.rotation.x = Math.PI / 2; stand.position.set(centre.x, centre.y, (block ? block.min[2] : 0) - 2); stand.visible = false; this.groups.pour.add(stand);
    } else if (this.meta.type === 'open' || this.meta.type === 'box') {
      parts.forEach((part) => this.groups.pour.add(new THREE.Mesh(geometryFrom(part.mesh), partMaterial(part.role, { transparent: true, opacity: 0.32, depthWrite: false }))));
      const cast = castMesh(1); if (cast) { if (this.meta.type === 'box') cast.material.color.set('#b9c0b4'); this.groups.pour.add(cast); }
    }
    this.setView(this.view);
  }

  layoutPrint(parts) {
    this.clear(this.groups.print);
    const gap = 12;
    const placed = [];
    let x = 0, y = 0, rowDepth = 0;
    for (const part of parts) {
      const size = part.print.size;
      if (x > 0 && x + size[0] > this.plate.x) { x = 0; y += rowDepth + gap; rowDepth = 0; }
      placed.push({ part, at: [x, y, 0] });
      x += size[0] + gap; rowDepth = Math.max(rowDepth, size[1]);
    }
    const used = { x: Math.max(...placed.map(p => p.at[0] + p.part.print.size[0])), y: Math.max(...placed.map(p => p.at[1] + p.part.print.size[1])) };
    const offset = [(this.plate.x - Math.min(used.x, this.plate.x)) / 2, (this.plate.y - Math.min(used.y, this.plate.y)) / 2];
    this.printLayout = placed.map(p => ({ name: p.part.name, at: [p.at[0] + offset[0], p.at[1] + offset[1], 0], size: p.part.print.size }));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(this.plate.x, this.plate.y), new THREE.MeshStandardMaterial({ color: 0x2c3431, roughness: 0.95 }));
    plate.position.set(this.plate.x / 2, this.plate.y / 2, -0.6);
    this.groups.print.add(plate);
    const grid = new THREE.GridHelper(this.plate.x, Math.round(this.plate.x / 16), 0x6a7a70, 0x455049);
    grid.rotation.x = Math.PI / 2; grid.position.set(this.plate.x / 2, this.plate.y / 2, -0.05);
    this.groups.print.add(grid);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(this.plate.x, this.plate.y, this.plate.z)), new THREE.LineBasicMaterial({ color: 0x8ea295, transparent: true, opacity: 0.35 }));
    edges.position.set(this.plate.x / 2, this.plate.y / 2, this.plate.z / 2);
    this.groups.print.add(edges);
    this.printLayout.forEach((p, i) => {
      const part = parts[i];
      const printed = transform(part.mesh, part.print.matrix, part.print.translate);
      const mesh = new THREE.Mesh(overhangGeometry(printed, PART_COLOURS[part.role] || '#d9dcd3'), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true }));
      mesh.position.set(p.at[0], p.at[1], 0);
      this.groups.print.add(mesh);
    });
  }

  setPlate(plate) { this.plate = { ...plate }; if (this.parts) this.layoutPrint(this.parts); this.requestRender(); }

  setExplode(amount) {
    this.explode = amount;
    for (const t of this.explodeTargets || []) t.mesh.position.copy(t.dir.clone().multiplyScalar(t.distance * amount));
    if (this.castInMold) this.castInMold.visible = amount > 0.15;
    this.requestRender();
  }

  setSection(fraction) {
    this.section = fraction;
    const b = this.meta?.block;
    if (b) {
      const x = b.min[0] - 1 + (b.max[0] - b.min[0] + 2) * fraction;
      this.clipPlane.set(new THREE.Vector3(-1, 0, 0), x);
    }
    this.requestRender();
  }

  setView(view) {
    this.view = view;
    for (const [name, g] of Object.entries(this.groups)) g.visible = name === view;
    this.helpers.visible = view === 'model' || view === 'mold' || view === 'section';
    if (view === 'print') this.framePrint(); else if (!this.userFramed) this.resetView();
    this.requestRender();
  }

  framePrint() {
    const p = this.plate;
    this.controls.target.set(p.x / 2, p.y / 2, 20);
    this.camera.position.set(p.x / 2 - p.x * 0.5, p.y / 2 - p.y * 1.25, p.z * 0.9);
    this.controls.update();
  }

  resetView() {
    this.userFramed = false;
    const box = this.view === 'pour' && this.groups.pour.children.length ? new THREE.Box3().setFromObject(this.groups.pour) : (this.helperBox || this.bounds);
    if (!box) return;
    const size = box.getSize(new THREE.Vector3()), centre = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.length() / 2, 10);
    const distance = radius / Math.sin(this.camera.fov * Math.PI / 360) * 1.15;
    this.controls.target.copy(centre);
    this.camera.position.set(centre.x - distance * 0.55, centre.y - distance * 0.72, centre.z + distance * 0.5);
    this.camera.near = Math.max(0.5, distance / 200); this.camera.far = distance * 20; this.camera.updateProjectionMatrix();
    this.controls.update();
    this.requestRender();
  }
}
