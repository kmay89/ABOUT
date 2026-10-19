import { buildMesh, binarySTL } from './mesh.js';

self.onmessage = ({ data }) => {
  const { id, settings, values, nx, ny } = data;
  try {
    self.postMessage({ id, progress:15, message:'Building the photo surface…' });
    const mesh=buildMesh({ ...settings, values, nx, ny });
    self.postMessage({ id, progress:70, message:'Writing the STL…' });
    const raw=binarySTL(mesh);
    const buffer=raw instanceof ArrayBuffer ? raw : raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength);
    self.postMessage({ id, progress:100, buffer, triangleCount:mesh.triangleCount, vertexCount:mesh.vertexCount, volume:mesh.signedVolume, bounds:mesh.bounds },[buffer]);
  } catch (error) { self.postMessage({ id, error:error.message || 'The mesh could not be exported.' }); }
};
