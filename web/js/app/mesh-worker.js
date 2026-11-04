// Построение сеток в отдельном потоке: мир не замирает, пока перестраиваются чанки после взрыва.
import { greedyMesh } from '../core/mesher.js';

self.onmessage = (e) => {
  const { id, version, grid, dims } = e.data;
  const m = greedyMesh(grid, dims);
  const list = [];
  for (const part of [m.opaque, m.glass]) list.push(part.positions.buffer, part.normals.buffer, part.colors.buffer, part.vary.buffer, part.indices.buffer, part.ao.buffer, part.mats.buffer);
  self.postMessage({ id, version, mesh: m }, list);
};
