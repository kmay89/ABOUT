/* The mold is built off the main thread so the page stays alive while a few
   million voxels are measured, traced and simplified. Messages:
   in  { id, model: { positions, indices }, options }
   out { id, progress, message } … then { id, result } or { id, error }      */
import { buildMold } from './mold.js';

self.onmessage = ({ data }) => {
  const { id, model, options } = data;
  try {
    const result = buildMold(model, options, (progress, message) => self.postMessage({ id, progress, message }));
    const transfer = [];
    for (const part of result.parts) transfer.push(part.mesh.positions.buffer, part.mesh.indices.buffer);
    if (result.analysis?.vertexClass) transfer.push(result.analysis.vertexClass.buffer);
    self.postMessage({ id, result }, transfer);
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'The mold could not be built.' });
  }
};
