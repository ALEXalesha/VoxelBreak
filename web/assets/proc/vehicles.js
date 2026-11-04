// Техника кодом: бульдозер, кран, шар крана. Машина для езды - та же модель car из props.
// Вдоль x - перёд машины (x растёт вперёд).
import { VoxelModel } from '../../js/core/model.js';
import { M } from '../../js/core/materials.js';

export function bulldozer() {
  const m = new VoxelModel(22, 12, 12);
  m.box(2, 0, 0, 16, 3, 3, M.RUBBER);                  // гусеницы
  m.box(2, 0, 9, 16, 3, 12, M.RUBBER);
  m.box(1, 2, 1, 17, 6, 11, M.PAINT_YELLOW);           // корпус
  m.box(4, 6, 2, 12, 11, 10, M.GLASS);                 // кабина
  m.box(4, 11, 2, 12, 12, 10, M.PAINT_YELLOW);
  for (const [x, z] of [[4, 2], [11, 2], [4, 9], [11, 9]]) m.box(x, 6, z, x + 1, 11, z + 1, M.PAINT_YELLOW);
  m.box(5, 6, 3, 11, 11, 9, 0);
  m.box(17, 3, 4, 20, 4, 8, M.METAL);                  // рычаги отвала
  m.box(20, 0, 0, 22, 7, 12, M.METAL);                 // отвал
  m.box(14, 6, 8, 15, 10, 9, M.METAL);                 // выхлопная труба
  return m;
}

export function crane() {
  const m = new VoxelModel(14, 44, 14);
  m.box(0, 0, 0, 14, 3, 14, M.CONCRETE);               // основание
  m.box(5, 3, 5, 9, 40, 9, M.PAINT_YELLOW);            // башня
  m.box(6, 4, 6, 8, 39, 8, 0);
  m.box(3, 40, 3, 11, 44, 11, M.PAINT_YELLOW);         // поворотная кабина
  m.box(4, 41, 10, 10, 43, 11, M.GLASS);
  return m;
}

// стрела крана: вдоль x, крепится к верху башни
export function boom({ length = 48 } = {}) {
  const m = new VoxelModel(length, 3, 3);
  m.box(0, 0, 0, length, 1, 3, M.PAINT_YELLOW);
  m.box(0, 2, 0, length, 3, 3, M.PAINT_YELLOW);
  for (let x = 0; x < length; x += 3) m.box(x, 1, 0, x + 1, 2, 3, M.PAINT_YELLOW);
  m.box(length - 2, 0, 1, length, 1, 2, M.METAL);
  return m;
}

export function ball({ r = 3 } = {}) {
  const d = r * 2 + 1;
  const m = new VoxelModel(d, d, d);
  for (let y = 0; y < d; y++)
    for (let z = 0; z < d; z++)
      for (let x = 0; x < d; x++) if ((x - r) ** 2 + (y - r) ** 2 + (z - r) ** 2 <= r * r + r) m.set(x, y, z, M.METAL);
  m.pivot = [r + 0.5, r + 0.5, r + 0.5];
  return m;
}
