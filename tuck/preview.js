import * as THREE from './vendor/three.module.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { foldTransforms } from './plan.js';

/**
 * The box in 3D, two ways: the flat sheet as it will print (the real
 * mesh, with the inlay under it), and a folding model built from the
 * plan's panels, each a thin box hanging off its parent at the hinge
 * line, driven by one fold fraction from flat to closed. The name is
 * drawn on the lid's outside as a texture. Drag to orbit, scroll to zoom.
 */
export class BoxPreview {
  constructor(container, { onFailure } = {}) {
    this.container = container; this.failed = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 5000); this.camera.up.set(0, 0, 1);
    try { this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch (error) { this.failed = true; onFailure?.(error); return; }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const canvas = this.renderer.domElement;
    canvas.setAttribute('aria-label', 'Interactive 3D box. Drag to rotate; pinch or scroll to zoom.'); canvas.setAttribute('role', 'img'); canvas.tabIndex = 0;
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline-offset:-5px;';
    container.append(canvas);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enableDamping = false; this.controls.enablePan = false; this.controls.minDistance = 10; this.controls.maxDistance = 3000;
    this.controls.addEventListener('change', () => this.render());
    canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); this.failed = true; onFailure?.(new Error('WebGL context lost')); });
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6b6258, 1.3));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-180, -260, 300); this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xd6e3ee, 0.9); fill.position.set(260, -80, 120); this.scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffd9a8, 1.0); rim.position.set(40, 300, 180); this.scene.add(rim);
    const under = new THREE.DirectionalLight(0xcfd8e2, 0.7); under.position.set(0, 0, -300); this.scene.add(under);
    this.bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.6, metalness: 0 });
    this.inlayMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 });
    this.flat = new THREE.Group(); this.folding = new THREE.Group(); this.scene.add(this.flat, this.folding);
    this.mode = 'folding'; this.flat.visible = false; this.fraction = 1; this.size = 100; this.centre = [0, 0, 0];
    this.resize(); new ResizeObserver(() => this.resize()).observe(container); this.resetView();
  }
  resize() { if (this.failed) return; const w = this.container.clientWidth || 300, h = this.container.clientHeight || 300; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.render(); }
  setColours(body, inlay) { this.bodyMaterial.color.set(body); this.inlayMaterial.color.set(inlay); if (this.lidTexture) this.drawLid(); this.render(); }
  dispose(group) { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); group.clear(); }

  /** The flat sheet (the real mesh) and its inlay. */
  showFlat(sheet, inlay) {
    if (this.failed) return;
    this.dispose(this.flat);
    const toGeo = m => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(m.positions, 3)); g.setIndex(new THREE.Uint32BufferAttribute(m.indices, 1)); g.computeVertexNormals(); return g; };
    if (sheet) this.flat.add(new THREE.Mesh(toGeo(sheet), this.bodyMaterial));
    if (inlay && inlay.indices.length) { const m = new THREE.Mesh(toGeo(inlay), this.inlayMaterial); m.position.z = -0.03; this.flat.add(m); }
    this.render();
  }

  /** The folding model from the plan's panels. `name` is drawn on the lid's outside. */
  showFolding(plan, { name = '', font = '700 48px system-ui, sans-serif', inlayColour = '#ffffff' } = {}) {
    if (this.failed) return;
    this.dispose(this.folding);
    this.plan = plan; this.name = name; this.font = font; this.inlayColour = inlayColour;
    const { t } = plan.p;
    const nodes = {};
    for (const p of plan.panels) {
      const w = p.x1 - p.x0, d = p.y1 - p.y0;
      const geo = new THREE.BoxGeometry(w, d, t);
      geo.translate((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, t / 2);   // in sheet coordinates; the fold matrix moves it
      let mats = this.bodyMaterial;
      if (p.id === 'lid' && name) { this.lidCanvas = document.createElement('canvas'); this.lidTexture = new THREE.CanvasTexture(this.lidCanvas); this.lidTexture.colorSpace = THREE.SRGBColorSpace; this.drawLid(w, d); const face = new THREE.MeshStandardMaterial({ map: this.lidTexture, roughness: 0.6 }); mats = [this.bodyMaterial, this.bodyMaterial, this.bodyMaterial, this.bodyMaterial, this.bodyMaterial, face]; }
      const mesh = new THREE.Mesh(geo, mats);
      mesh.matrixAutoUpdate = false;
      this.folding.add(mesh);
      nodes[p.id] = { mesh, panel: p };
    }
    this.nodes = nodes;
    this.setFold(this.fraction);
    const [sw, sd] = plan.size; this.size = Math.max(sw, sd, plan.p.H * 3); this.centre = [plan.p.W / 2, plan.p.D / 2, this.mode === 'flat' ? 0 : plan.p.H / 2];
    this.render();
  }
  drawLid(w = this.lidW, d = this.lidD) {
    if (!this.lidCanvas) return;
    this.lidW = w; this.lidD = d;
    const scale = 8, c = this.lidCanvas; c.width = Math.max(2, Math.round(w * scale)); c.height = Math.max(2, Math.round(d * scale));
    const ctx = c.getContext('2d'); if (!ctx) return;
    ctx.fillStyle = '#' + this.bodyMaterial.color.getHexString(); ctx.fillRect(0, 0, c.width, c.height);
    // on a BoxGeometry's -z face the canvas's top lands at the sheet's +y and its right at -x; the lid flips over the back
    // (y → -y), so from above a plain drawing would be upside down and reversed: turn it half a circle
    ctx.save(); ctx.translate(c.width / 2, c.height / 2); ctx.rotate(Math.PI);
    ctx.fillStyle = this.inlayColour; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let size = Math.min(c.height * 0.5, 400); ctx.font = this.font.replace(/\d+px/, `${size}px`);
    const width = ctx.measureText(this.name).width; if (width > c.width * 0.86) size *= c.width * 0.86 / width;
    ctx.font = this.font.replace(/\d+px/, `${Math.max(8, size)}px`); ctx.fillText(this.name, 0, 0); ctx.restore();
    this.lidTexture.needsUpdate = true;
  }
  /** 0 = flat, 1 = closed. */
  setFold(fraction) {
    this.fraction = fraction;
    if (!this.nodes || !this.plan) return;
    const M = foldTransforms(this.plan, fraction);
    for (const [id, { mesh }] of Object.entries(this.nodes)) {
      const m = M[id];
      mesh.matrix.set(m[0][0], m[0][1], m[0][2], m[0][3], m[1][0], m[1][1], m[1][2], m[1][3], m[2][0], m[2][1], m[2][2], m[2][3], 0, 0, 0, 1);
    }
    this.render();
  }
  setMode(mode) { this.mode = mode; this.flat.visible = mode === 'flat'; this.folding.visible = mode !== 'flat'; if (this.plan) this.centre = [this.plan.p.W / 2, this.plan.p.D / 2, mode === 'flat' ? 0 : this.plan.p.H / 2]; this.render(); }
  resetView(from = 'front') {
    const d = this.size * 1.9, c = this.centre;
    if (from === 'below') this.camera.position.set(c[0] - d * 0.3, c[1] + d * 0.6, c[2] - d * 0.7);
    else if (from === 'top') this.camera.position.set(c[0] + d * 0.05, c[1] - d * 0.35, c[2] + d * 0.95);
    else this.camera.position.set(c[0] + d * 0.5, c[1] - d * 0.8, c[2] + d * 0.5);
    this.controls.target.set(c[0], c[1], c[2]); this.controls.update(); this.render();
  }
  render() { if (!this.failed) this.renderer.render(this.scene, this.camera); }
}
