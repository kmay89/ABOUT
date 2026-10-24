/**
 * Tuck — the worker. The sheet and the inlay are built here so the page
 * stays alive. In: { id, kind: 'sheet' | 'inlay', options }; out:
 * { id, kind, ... } with the big arrays transferred, or { id, error }.
 */
import { planBox, namePlace } from './plan.js';
import { sheetMesh } from './geometry.js';
import { footprint, placeRaster, patternRaster, inlaySolid } from './inlay.js';
import { inlayById } from '../knurl/textures.js';

self.onmessage = e => {
  const { id, kind, options } = e.data;
  try {
    if (kind === 'sheet') {
      const plan = planBox(options);
      const mesh = sheetMesh(plan.regions);
      self.postMessage({ id, kind, mesh, size: plan.size, volume: plan.volume, area: plan.area, warnings: plan.warnings, bounds: plan.bounds, panels: plan.panels, lid: plan.lid, notch: plan.notch, window: plan.window ? { shape: plan.window.shape, size: plan.window.size } : null }, [mesh.positions.buffer, mesh.indices.buffer]);
    } else if (kind === 'inlay') {
      const plan = planBox(options.box);
      const fp = footprint(plan);
      let grid = { ...fp, data: new Uint8Array(fp.data.length), count: 0 };
      const merge = g => { for (let i = 0; i < grid.data.length; i++) if (g.data[i]) grid.data[i] = 1; };
      if (options.raster && options.where) for (const where of options.where) merge(placeRaster(fp, options.raster, namePlace(plan, where), { margin: 0 }));
      if (options.pattern && options.pattern !== 'none') {
        const def = inlayById(options.pattern);
        if (def.f) merge(patternRaster(fp, (u, v) => def.f(u, v, options.patternPeriod || 8, { weight: options.patternWeight || 0.35 })));
      }
      let count = 0; for (const v of grid.data) count += v; grid.count = count;
      const r = inlaySolid(grid, { layers: options.layers || 2 });
      self.postMessage({ id, kind, mesh: r.mesh, count: r.count, area: r.area, height: r.height, grams: r.grams }, [r.mesh.positions.buffer, r.mesh.indices.buffer]);
    }
  } catch (err) { self.postMessage({ id, kind, error: err.message || String(err) }); }
};
