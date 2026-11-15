import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

/**
 * The figurine in 3D, standing in its pedestal the way it will on the
 * shelf: the figure mesh (built lying on its back, relief up) is turned up
 * on its edge and dropped into the slot. Drag to orbit, scroll to zoom.
 */
export class FigurePreview {
  constructor(container, { onFailure } = {}) {
    this.container = container;
    this.failed = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);
    this.camera.up.set(0, 0, 1);
    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch (error) { this.failed = true; onFailure?.(error); return; }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', 'Interactive 3D figurine. Drag to rotate; pinch or scroll to zoom.');
    canvas.setAttribute('role', 'img');
    canvas.tabIndex = 0;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-5px;';
    container.append(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.05;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 30;
    this.controls.maxDistance = 2000;
    this.controls.addEventListener('change', () => this.render());
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.failed = true; onFailure?.(new Error('WebGL context lost')); });
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x7a6e60, 1.5));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-160, -260, 380); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd6e3ee, 1.0); fill.position.set(240, -100, 140); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9a8, 1.2); rim.position.set(40, 300, 200); this.scene.add(rim);
    this.material = new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.62, metalness: 0 });
    this.pedestalMaterial = new THREE.MeshStandardMaterial({ color: 0x8a7a5d, roughness: 0.7, metalness: 0 });
    this.group = new THREE.Group();
    this.scene.add(this.group);
    const shelf = new THREE.Mesh(new THREE.CircleGeometry(600, 64), new THREE.MeshStandardMaterial({ color: 0x2f3531, roughness: 1 }));
    shelf.position.z = -0.05; this.scene.add(shelf);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resetView(120);
  }

  resize() {
    if (this.failed) return;
    const w = this.container.clientWidth || 300, h = this.container.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.render();
  }

  /** Show a figure (mesh lying on its back) and a pedestal (standing) with its slot. */
  show(figure, pedestal) {
    if (this.failed) return;
    for (const m of this.group.children) m.geometry.dispose();
    this.group.clear();
    const toGeo = mesh => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3));
      g.setIndex(mesh.indices);
      g.computeVertexNormals();
      return g;
    };
    const ped = new THREE.Mesh(toGeo(pedestal.mesh), this.pedestalMaterial);
    this.group.add(ped);
    const fig = new THREE.Mesh(toGeo(figure.mesh), this.material);
    // lying on its back (relief toward +Z) → standing, relief toward -Y (the viewer's front), tab down in the slot
    fig.rotation.x = Math.PI / 2;
    const tabTop = pedestal.height, bottom = -figure.size[1] / 2; // figure Y runs from -d/2 (tab end) to +d/2
    fig.position.set(0, figure.tab.thickness / 2, tabTop - pedestal.slot.depth - bottom);
    this.group.add(fig);
    this.resetView(Math.max(figure.size[1], pedestal.length) + 40);
  }

  resetView(size = 120) {
    const d = size * 1.9;
    this.camera.position.set(d * 0.35, -d, d * 0.45);
    this.controls.target.set(0, 0, size * 0.42);
    this.controls.update();
    this.render();
  }

  render() { if (!this.failed) this.renderer.render(this.scene, this.camera); }
}
