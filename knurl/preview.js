import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';

/**
 * The part in 3D: the textured body in the first filament's colour, the
 * first-layer inlay in the second, lit to show the relief. Drag to orbit,
 * scroll to zoom; a button flips to look at the bottom.
 */
export class PartPreview {
  constructor(container, { onFailure } = {}) {
    this.container = container;
    this.failed = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 5000);
    this.camera.up.set(0, 0, 1);
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch (error) { this.failed = true; onFailure?.(error); return; }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', 'Interactive 3D part. Drag to rotate; pinch or scroll to zoom.');
    canvas.setAttribute('role', 'img'); canvas.tabIndex = 0;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-5px;';
    container.append(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false; this.controls.enablePan = false;
    this.controls.minDistance = 10; this.controls.maxDistance = 3000;
    this.controls.addEventListener('change', () => this.render());
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.failed = true; onFailure?.(new Error('WebGL context lost')); });
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b6258, 1.3));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6); key.position.set(-180, -260, 300); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd6e3ee, 0.9); fill.position.set(260, -80, 120); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9a8, 1.1); rim.position.set(40, 300, 180); this.scene.add(rim);
    const under = new THREE.DirectionalLight(0xcfd8e2, 0.8); under.position.set(0, 0, -300); this.scene.add(under);
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf0ece2, roughness: 0.55, metalness: 0, flatShading: false });
    this.inlayMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0 });
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.size = 60;
    this.resize();
    new ResizeObserver(() => this.resize()).observe(container);
    this.resetView();
  }

  resize() {
    if (this.failed) return;
    const w = this.container.clientWidth || 300, h = this.container.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.render();
  }

  setColours(body, inlay) {
    this.bodyMaterial.color.set(body); this.inlayMaterial.color.set(inlay); this.render();
  }

  /** Show the body (and the inlay, if any). Meshes are { positions, indices } in part coordinates. */
  show(body, inlay, { size } = {}) {
    if (this.failed) return;
    for (const m of this.group.children) m.geometry.dispose();
    this.group.clear();
    const toGeo = mesh => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3)); g.setIndex(new THREE.Uint32BufferAttribute(mesh.indices, 1)); g.computeVertexNormals(); return g; };
    if (body) this.group.add(new THREE.Mesh(toGeo(body), this.bodyMaterial));
    if (inlay && inlay.indices.length) { const m = new THREE.Mesh(toGeo(inlay), this.inlayMaterial); m.position.z = -0.03; this.group.add(m); }
    if (size) { this.size = Math.max(...size); this.centre = [0, 0, size[2] / 2]; }
    this.render();
  }

  resetView(from = 'front') {
    const d = this.size * 2.2, c = this.centre || [0, 0, this.size / 2];
    if (from === 'below') this.camera.position.set(c[0] - d * 0.3, c[1] + d * 0.6, c[2] - d * 0.7);  // from the far side, so +Y is up on screen and a mirrored inlay reads right
    else this.camera.position.set(c[0] + d * 0.45, c[1] - d * 0.8, c[2] + d * 0.45);
    this.controls.target.set(c[0], c[1], c[2]);
    this.controls.update();
    this.render();
  }

  render() { if (!this.failed) this.renderer.render(this.scene, this.camera); }
}
