// Предметы мира кодом: машина, бочка с горючим, ящик. В мире они - свободные тела (их можно
// толкать и таранить), в моделях - обычные воксели.
import { VoxelModel } from '../../js/core/model.js';
import { M } from '../../js/core/materials.js';

const PAINTS = { red: M.PAINT_RED, blue: M.PAINT_BLUE, yellow: M.PAINT_YELLOW, white: M.PAINT_WHITE, green: M.PAINT_GREEN };

// машина вдоль x: 4 м × 1,75 м × 1,6 м
export function car({ color = 'red' } = {}) {
  const paint = PAINTS[color] || M.PAINT_RED;
  const m = new VoxelModel(16, 7, 7);
  for (const x of [2, 11]) for (const z of [0, 6]) m.box(x, 0, z, x + 3, 3, z + 1, M.RUBBER);
  m.box(0, 1, 1, 16, 4, 6, paint);
  m.box(4, 4, 1, 12, 6, 6, M.GLASS);
  m.box(4, 6, 1, 12, 7, 6, paint);
  for (const x of [4, 11]) { m.box(x, 4, 1, x + 1, 6, 2, paint); m.box(x, 4, 5, x + 1, 6, 6, paint); }
  m.box(15, 2, 1, 16, 3, 2, M.PAINT_WHITE);
  m.box(15, 2, 5, 16, 3, 6, M.PAINT_WHITE);
  m.box(0, 2, 1, 1, 3, 2, M.PAINT_RED);
  m.box(0, 2, 5, 1, 3, 6, M.PAINT_RED);
  m.box(5, 4, 2, 11, 6, 5, 0);
  return m;
}

// бочка: горючее внутри, обручи из металла (горючее взрывается, металл летит обломками)
export function barrel() {
  const m = new VoxelModel(5, 5, 5);
  for (let y = 0; y < 5; y++)
    for (let z = 0; z < 5; z++)
      for (let x = 0; x < 5; x++)
        if ((x - 2) ** 2 + (z - 2) ** 2 <= 5) m.set(x, y, z, y === 4 ? M.METAL : M.EXPLOSIVE);
  return m;
}

export function crate({ size = 5 } = {}) {
  const m = new VoxelModel(size, size, size);
  m.box(0, 0, 0, size, size, size, M.PLANK);
  m.box(1, 1, 1, size - 1, size - 1, size - 1, 0);
  for (const [x, z] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) m.box(x, 0, z, x + 1, size, z + 1, M.WOOD);
  return m;
}
