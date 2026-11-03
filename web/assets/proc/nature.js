// Природа кодом: деревья и скалы. Форма зависит только от зерна (rng).
import { VoxelModel } from '../../js/core/model.js';
import { M } from '../../js/core/materials.js';

export function tree({ kind = 'oak', height = 14 } = {}, rng) {
  if (kind === 'pine') {
    const r = 5;
    const m = new VoxelModel(r * 2 + 2, height + 4, r * 2 + 2);
    const c = r;
    m.box(c, 0, c, c + 2, height, c + 2, M.WOOD);
    for (let y = 5; y < height + 3; y++) {
      const k = 1 - (y - 5) / (height - 2);
      const rr = Math.max(0.6, r * k + ((y & 1) ? 0.7 : 0));
      for (let z = 0; z < m.sz; z++)
        for (let x = 0; x < m.sx; x++)
          if ((x - c - 0.5) ** 2 + (z - c - 0.5) ** 2 <= rr * rr && m.get(x, y, z) === 0) m.set(x, y, z, M.LEAVES);
    }
    m.keepConnected((x, y) => y === 0);
    return m;
  }
  const r = 4 + Math.floor(rng.next() * 3);
  const m = new VoxelModel(r * 2 + 3, height + r + 2, r * 2 + 3);
  const c = r + 1;
  m.box(c, 0, c, c + 2, height, c + 2, M.WOOD);
  m.box(c - 2, height - 3, c, c, height - 2, c + 1, M.WOOD);   // сук
  const cy = height + 1;
  for (let y = 0; y < m.sy; y++)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) {
        const d = Math.hypot(x - c - 0.5, (y - cy) * 1.25, z - c - 0.5);
        if (d <= r + rng.next() * 1.2 - 0.6 && m.get(x, y, z) === 0) m.set(x, y, z, M.LEAVES);
      }
  m.keepConnected((x, y) => y === 0);
  return m;
}

export function rock({ size = 5 } = {}, rng) {
  const s = size;
  const m = new VoxelModel(s * 2 + 1, s + 3, s * 2 + 1);
  const ax = 0.8 + rng.next() * 0.5, az = 0.8 + rng.next() * 0.5;
  for (let y = 0; y < m.sy; y++)
    for (let z = 0; z < m.sz; z++)
      for (let x = 0; x < m.sx; x++) {
        const d = Math.hypot((x - s) / ax, (y + 1) * 1.3, (z - s) / az);
        if (d <= s + rng.next() * 1.5 - 0.7) m.set(x, y, z, rng.next() < 0.12 ? M.ORE : M.STONE);
      }
  m.keepConnected((x, y) => y === 0);
  return m;
}
