import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { absorption, transmissionRGB, LIGHTS } from './image-processing.js';

/** Interactive view of the very same solid used for STL export. Units are mm. */
export class LithophanePreview {
  constructor(container, onFailure, onRestore) {
    this.container = container;
    this.mode = 'lit';
    this.power = 1;
    this.k = absorption('pla', 'white');
    this.light = LIGHTS.warm.rgb;
    this.failed = false;
    this.onFailure = onFailure;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.1, 4000);
    this.camera.up.set(0, 0, 1);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', 'Interactive 3D lithophane. Drag to rotate; pinch or scroll to zoom.');
    canvas.setAttribute('role', 'img');
    canvas.tabIndex = 0;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-5px;';
    container.append(canvas);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.92;
    this.controls.minDistance = 40;
    this.controls.maxDistance = 1200;
    this.controls.addEventListener('change', () => this.render());
    canvas.addEventListener('keydown', (e) => {
      if (e.key === 'Home') { this.resetView(); e.preventDefault(); }
      else if (e.key === '+' || e.key === '=') { this.zoom(0.9); e.preventDefault(); }
      else if (e.key === '-') { this.zoom(1.1); e.preventDefault(); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const v = this.camera.position.clone().sub(this.controls.target);
        v.applyAxisAngle(new THREE.Vector3(0, 0, 1), e.key === 'ArrowLeft' ? 0.12 : -0.12);
        this.camera.position.copy(this.controls.target).add(v); this.controls.update(); e.preventDefault();
      }
    });
    this.scene.add(new THREE.HemisphereLight(0xfff3de, 0x786653, 2));
    const key = new THREE.DirectionalLight(0xffefd7, 3.2);
    key.position.set(-180, -240, 280); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xc7d9e5, 1.2);
    fill.position.set(170, -80, 140); this.scene.add(fill);
    const back = new THREE.DirectionalLight(0xffcd89, 2);
    back.position.set(0, 220, 190); this.scene.add(back);
    this.litMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.FrontSide });
    this.litMaterial.toneMapped = false;
    this.solidMaterial = new THREE.MeshStandardMaterial({ color: 0xf1ede3, roughness: 0.83, metalness: 0 });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault(); this.failed = true; this.onFailure?.();
    });
    canvas.addEventListener('webglcontextrestored', () => { this.failed = false; canvas.hidden = false; onRestore?.(); this.render(); });
    this.resize();
  }

  zoom(multiplier) {
    const delta = this.camera.position.clone().sub(this.controls.target).multiplyScalar(multiplier);
    if (delta.length() < this.controls.minDistance || delta.length() > this.controls.maxDistance) return;
    this.camera.position.copy(this.controls.target).add(delta); this.controls.update();
  }

  resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    if (this.data && !this.userFramed) this.resetView();
    this.render();
  }

  update(mesh, reset = false) {
    if (this.model) { this.scene.remove(this.model); this.model.geometry.dispose(); }
    this.data = mesh;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geometry.computeVertexNormals();
    this.model = new THREE.Mesh(geometry, this.mode === 'lit' ? this.litMaterial : this.solidMaterial);
    this.scene.add(this.model);
    this.updateColors();
    if (reset || !this.hasView) this.resetView();
    this.render();
  }

  updateColors() {
    if (!this.data || !this.model) return;
    const mesh = this.data;
    const color = new Float32Array(mesh.vertexCount * 3);
    // Front/back grids have equal shape and share physical thickness, so the image
    // is visible through either side of the panel.
    const half = mesh.vertexCount / 2;
    for (let i = 0; i < half; i++) {
      const j = i * 3, k = (i + half) * 3;
      const [r, g, b] = transmissionRGB(mesh.thicknesses[i], this.k, this.light, this.power);
      // The numbers are linear light; the renderer supplies display color conversion.
      for (const index of [j, k]) {
        color[index] = r;
        color[index + 1] = g;
        color[index + 2] = b;
      }
    }
    this.model.geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
  }

  resetView() {
    if (!this.data) return;
    const v = this.data.vertices;
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < v.length; i += 3) for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a], v[i+a]); hi[a] = Math.max(hi[a], v[i+a]); }
    const target = new THREE.Vector3(0, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    const width = hi[0]-lo[0], height = hi[2]-lo[2], depth = hi[1]-lo[1];
    const fov = this.camera.fov * Math.PI / 180;
    const distance = Math.max(height, width / this.camera.aspect, depth) / (2 * Math.tan(fov/2)) * 1.34;
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(new THREE.Vector3(distance * 0.16, -distance, distance * 0.13));
    this.controls.minDistance = Math.max(width, height) * 0.65;
    this.controls.maxDistance = Math.max(distance * 4, 600);
    this.camera.near = 0.1;
    this.camera.far = Math.max(4000, distance*8);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.hasView = true;
    this.render();
  }

  setMode(mode) {
    this.mode = mode;
    if (this.model) this.model.material = mode === 'lit' ? this.litMaterial : this.solidMaterial;
    this.render();
  }

  /** Frames and bases, already placed beside the picture: [{vertices, indices, kind?}].
   * kind 'board' is an LED board and 'pane' another picture, both shown but not printed. */
  setAccessories(meshes) {
    if (this.extras) { this.scene.remove(this.extras); this.extras.children.forEach(m => m.geometry.dispose()); }
    this.extras = new THREE.Group();
    this.accessoryMaterial ||= new THREE.MeshStandardMaterial({ color: this.frameColour || 0x4a3426, roughness: 0.55, metalness: 0, side: THREE.DoubleSide, flatShading: true });
    this.boardMaterial ||= new THREE.MeshStandardMaterial({ color: 0xf1f1ea, roughness: 0.5, emissive: 0xfff4dc, emissiveIntensity: 0.35, side: THREE.DoubleSide });
    this.paneMaterial ||= Object.assign(new THREE.MeshBasicMaterial({ color: 0xf0d6a4, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }), { toneMapped: false });
    for (const mesh of meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
      geometry.computeVertexNormals();
      const material = mesh.kind === 'board' ? this.boardMaterial : mesh.kind === 'pane' ? this.paneMaterial : this.accessoryMaterial;
      this.extras.add(new THREE.Mesh(geometry, material));
    }
    this.scene.add(this.extras);
    this.render();
  }

  setFrameColour(hex) {
    this.frameColour = new THREE.Color(hex).getHex();
    if (this.accessoryMaterial) this.accessoryMaterial.color.set(hex);
    this.render();
  }

  setLight(value) { this.power = value; this.updateColors(); this.render(); }
  /** Filament absorption per channel (see absorption()) and the light's colour. */
  setFilament(k, light, surface) {
    this.k = k; this.light = light;
    if (surface) this.solidMaterial.color.setRGB(surface[0] * 0.95, surface[1] * 0.93, surface[2] * 0.89, THREE.SRGBColorSpace);
    this.updateColors(); this.render();
  }
  render() { if (!this.failed) this.renderer.render(this.scene, this.camera); }
}
