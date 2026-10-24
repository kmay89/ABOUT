/**
 * Knurl — the worker. Subdividing and displacing a few hundred thousand
 * triangles takes a second; it happens here so the page stays alive.
 * Messages in: { id, kind: 'texture' | 'inlay', mesh, options }; out:
 * { id, kind, ...result } with the big arrays transferred, or { id, error }.
 */
import { applyTexture, regions } from './texture.js';
import { buildInlay } from './inlay.js';

self.onmessage = e => {
  const { id, kind, mesh, options } = e.data;
  try {
    if (kind === 'texture') {
      const r = applyTexture(mesh, options);
      const transfer = [r.mesh.positions.buffer, r.mesh.indices.buffer]; if (r.source) transfer.push(r.source.buffer);
      self.postMessage({ id, kind, mesh: r.mesh, stats: r.stats, mapping: r.mapping, textured: r.textured, source: r.source, on: r.on }, transfer.filter((b, i, a) => a.indexOf(b) === i));
    } else if (kind === 'regions') {
      const r = regions(mesh, options.angle || 8);
      self.postMessage({ id, kind, id_: r.id, count: r.count, area: r.area }, [r.id.buffer, r.area.buffer]);
    } else if (kind === 'inlay') {
      const r = buildInlay(mesh, options);
      self.postMessage({ id, kind, mesh: r.mesh, area: r.area, height: r.height, grams: r.grams, count: r.raster.count, footprint: { width: r.footprint.width, height: r.footprint.height, cell: r.footprint.cell } }, [r.mesh.positions.buffer, r.mesh.indices.buffer]);
    }
  } catch (err) {
    self.postMessage({ id, kind, error: err.message || String(err) });
  }
};
