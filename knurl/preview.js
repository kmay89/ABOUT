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
    this.heatMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0, vertexColors: true });
    this.inlayMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2b2b, roughness: 0.6, metalness: 0 });
    this.pickMaterial = new THREE.MeshBasicMaterial({ color: 0xe8ae39, transparent: true, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, depthWrite: false });
    this.group = new THREE.Group(); this.scene.add(this.group);
    this.heat = false; this.body = null; this.bodyMesh = null; this.pickMesh = null;
    this.raycaster = new THREE.Raycaster();
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
    this.body = body; this.bodyMesh = null; this.pickMesh = null;
    if (body) { this.bodyMesh = new THREE.Mesh(this.heat ? heatGeometry(body) : toGeo(body), this.heat ? this.heatMaterial : this.bodyMaterial); this.group.add(this.bodyMesh); }
    if (inlay && inlay.indices.length) { const m = new THREE.Mesh(toGeo(inlay), this.inlayMaterial); m.position.z = -0.03; this.group.add(m); }
    if (size) { this.size = Math.max(...size); this.centre = [0, 0, size[2] / 2]; }
    this.render();
  }

  /** Colour every face by how far it overhangs (green, amber, red), or back to the plain body. */
  setHeat(on) {
    if (this.failed || this.heat === !!on) return;
    this.heat = !!on;
    if (this.bodyMesh && this.body) {
      this.bodyMesh.geometry.dispose();
      this.bodyMesh.geometry = this.heat ? heatGeometry(this.body) : toGeo(this.body);
      this.bodyMesh.material = this.heat ? this.heatMaterial : this.bodyMaterial;
    }
    this.render();
  }

  /** Tint the triangles whose mask is set (a Uint8Array per body triangle), or clear the tint. */
  highlight(mask) {
    if (this.failed) return;
    if (this.pickMesh) { this.group.remove(this.pickMesh); this.pickMesh.geometry.dispose(); this.pickMesh = null; }
    if (mask && this.body && this.bodyMesh) {
      const src = this.body.indices; let n = 0; for (let t = 0; t < mask.length; t++) if (mask[t]) n++;
      if (n) {
        const idx = new Uint32Array(n * 3); let k = 0;
        for (let t = 0; t < mask.length; t++) if (mask[t]) { idx[k++] = src[t * 3]; idx[k++] = src[t * 3 + 1]; idx[k++] = src[t * 3 + 2]; }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', this.bodyMesh.geometry.getAttribute('position'));
        g.setIndex(new THREE.Uint32BufferAttribute(idx, 1));
        this.pickMesh = new THREE.Mesh(g, this.pickMaterial); this.group.add(this.pickMesh);
      }
    }
    this.render();
  }

  /** The body triangle under a canvas point (clientX, clientY), or -1. */
  pick(clientX, clientY) {
    if (this.failed || !this.bodyMesh) return -1;
    const r = this.renderer.domElement.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * 2 - 1, y = -((clientY - r.top) / r.height) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    const hit = this.raycaster.intersectObject(this.bodyMesh, false)[0];
    return hit && hit.faceIndex != null ? hit.faceIndex : -1;
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

function toGeo(mesh) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
  g.setIndex(new THREE.Uint32BufferAttribute(mesh.indices, 1));
  g.computeVertexNormals();
  return g;
}

/**
 * A non-indexed copy with a colour per face: the overhang angle of every
 * down-facing triangle (0° a wall, 90° a ceiling) mapped green under 45°,
 * amber to 60°, red beyond; up-facing and the bottom stay pale.
 */
function heatGeometry(mesh) {
  const { positions: p, indices: ix } = mesh, n = ix.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let zmin = Infinity; for (let i = 2; i < p.length; i += 3) if (p[i] < zmin) zmin = p[i];
  const pale = [0.93, 0.91, 0.86], green = [0.45, 0.72, 0.42], amber = [0.93, 0.66, 0.2], red = [0.86, 0.26, 0.2];
  for (let t = 0; t < n; t += 3) {
    const a = ix[t] * 3, b = ix[t + 1] * 3, c = ix[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz) || 1;
    const zmax = Math.max(p[a + 2], p[b + 2], p[c + 2]);
    let colour = pale;
    if (nz / l < -0.05 && zmax > zmin + 0.05) {
      const angle = Math.asin(Math.min(1, -nz / l)) * 180 / Math.PI;
      colour = angle < 45 ? green : angle < 60 ? amber : red;
    }
    for (let k = 0; k < 3; k++) { const v = ix[t + k] * 3; pos.set([p[v], p[v + 1], p[v + 2]], t * 3 + k * 3); col.set(colour, t * 3 + k * 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
