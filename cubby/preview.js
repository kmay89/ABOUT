import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { binRect, grid } from './layout.js';

/**
 * The drawer in 3D: a translucent box the size of the drawer's inside, with
 * every bin standing in its place — the very same solids that go to the
 * printer, so what you see is what you get. Drag to orbit, scroll to zoom,
 * click a bin to select it. Units are mm; the drawer's front is -Y.
 */
export class DrawerPreview {
  constructor(container, { onSelect, onFailure } = {}) {
    this.container = container;
    this.onSelect = onSelect;
    this.failed = false;
    this.selected = null;
    this.binMeshes = [];
    this.geometries = new Map();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
    this.camera.up.set(0, 0, 1);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (error) {
      this.failed = true;
      onFailure?.(error);
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', 'Interactive 3D drawer. Drag to rotate; pinch or scroll to zoom; click a bin to select it.');
    canvas.setAttribute('role', 'img');
    canvas.tabIndex = 0;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-5px;';
    container.append(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 60;
    this.controls.maxDistance = 4000;
    this.controls.addEventListener('change', () => this.render());
    canvas.addEventListener('keydown', (e) => {
      if (e.key === 'Home') { this.resetView(); e.preventDefault(); }
    });
    // A click (not a drag) picks a bin.
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
    canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) { down = null; return; }
      down = null;
      this.pick(e);
    });
    canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); this.failed = true; onFailure?.(new Error('WebGL context lost')); });

    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7a66, 1.6));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(-200, -300, 420); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd6e3ee, 1.1);
    fill.position.set(260, -120, 160); this.scene.add(fill);
    const back = new THREE.DirectionalLight(0xffd9a8, 1.2);
    back.position.set(60, 320, 220); this.scene.add(back);

    this.binMaterial = new THREE.MeshStandardMaterial({ color: 0xf2eee4, roughness: 0.72, metalness: 0, flatShading: true });
    this.lowMaterial = new THREE.MeshStandardMaterial({ color: 0xe7e1d2, roughness: 0.72, metalness: 0, flatShading: true });
    this.selectedMaterial = new THREE.MeshStandardMaterial({ color: 0xf0b84a, roughness: 0.6, metalness: 0, flatShading: true, emissive: 0x3a2a08 });
    this.drawerGroup = new THREE.Group();
    this.binGroup = new THREE.Group();
    this.scene.add(this.drawerGroup, this.binGroup);
    this.raycaster = new THREE.Raycaster();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
  }

  resize() {
    if (this.failed) return;
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() { if (!this.failed) this.renderer.render(this.scene, this.camera); }

  /** Rebuild the drawer and the bins from a design and its parts list. */
  setDesign(design, list) {
    if (this.failed) return;
    const { width: W, depth: D, height: H } = design.drawer;
    const g = grid(design);
    this.drawerGroup.clear();
    const wallT = 12, floorT = 8;
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a7a55, roughness: 0.85, metalness: 0 });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(W + 2 * wallT, D + 2 * wallT, floorT), wood);
    floor.position.set(W / 2, D / 2, -floorT / 2);
    this.drawerGroup.add(floor);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xb08f66, roughness: 0.85, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
    const sides = [
      [W + 2 * wallT, wallT, H, W / 2, -wallT / 2, H / 2],
      [W + 2 * wallT, wallT, H, W / 2, D + wallT / 2, H / 2],
      [wallT, D, H, -wallT / 2, D / 2, H / 2],
      [wallT, D, H, W + wallT / 2, D / 2, H / 2],
    ];
    for (const [sx, sy, sz, x, y, z] of sides) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), sideMat);
      m.position.set(x, y, z);
      this.drawerGroup.add(m);
    }
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, D, H)), new THREE.LineBasicMaterial({ color: 0x5a4733, transparent: true, opacity: 0.6 }));
    edges.position.set(W / 2, D / 2, H / 2);
    this.drawerGroup.add(edges);

    // Geometries per unique part, bins placed per copy.
    const keep = new Set();
    this.binGroup.clear();
    this.binMeshes = [];
    const byId = new Map();
    for (const part of list.parts) {
      if (part.kind !== 'bin' || !part.mesh) continue;
      keep.add(part.key);
      if (!this.geometries.has(part.key)) {
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(part.mesh.vertices, 3));
        geom.setIndex(new THREE.BufferAttribute(part.mesh.indices, 1));
        const flat = geom.toNonIndexed();
        flat.computeVertexNormals();
        geom.dispose();
        this.geometries.set(part.key, flat);
      }
      for (const id of part.bins) byId.set(id, part);
    }
    for (const [key, geom] of this.geometries) if (!keep.has(key)) { geom.dispose(); this.geometries.delete(key); }
    for (const bin of design.bins) {
      const part = byId.get(bin.id);
      if (!part) continue;
      const rect = binRect(design, bin, g);
      const mesh = new THREE.Mesh(this.geometries.get(part.key), bin.low ? this.lowMaterial : this.binMaterial);
      mesh.position.set(rect.x, rect.y, 0);
      mesh.userData.binId = bin.id;
      mesh.userData.low = bin.low;
      this.binGroup.add(mesh);
      this.binMeshes.push(mesh);
    }
    const changed = !this.size || this.size.some((v, i) => Math.abs(v - [W, D, H][i]) > 0.5);
    this.size = [W, D, H];
    if (changed) this.resetView();
    this.select(this.selected);
  }

  select(id) {
    this.selected = id;
    for (const mesh of this.binMeshes) {
      mesh.material = mesh.userData.binId === id ? this.selectedMaterial : mesh.userData.low ? this.lowMaterial : this.binMaterial;
    }
    this.render();
  }

  pick(event) {
    if (this.failed || !this.binMeshes.length) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const p = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(p, this.camera);
    const hit = this.raycaster.intersectObjects(this.binMeshes, false)[0];
    this.onSelect?.(hit ? hit.object.userData.binId : null);
  }

  resetView() {
    if (this.failed) return;
    const [W, D, H] = this.size || [400, 400, 60];
    const span = Math.max(W, D * 1.15, H * 3);
    this.controls.target.set(W / 2, D / 2 - D * 0.05, H * 0.3);
    this.camera.position.set(W / 2 - span * 0.35, -span * 1.05, span * 0.95);
    this.controls.update();
    this.render();
  }

  dispose() {
    this.observer?.disconnect();
    this.controls?.dispose();
    for (const g of this.geometries.values()) g.dispose();
    this.renderer?.dispose();
  }
}
