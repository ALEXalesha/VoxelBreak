// Предметы в руках кодом (мелкие воксели, вид от первого лица). Длинная сторона - вдоль -z (от себя).
import { VoxelModel } from '../../js/core/model.js';
import { M } from '../../js/core/materials.js';

function item(sx, sy, sz, draw) {
  const m = new VoxelModel(sx, sy, sz);
  draw(m);
  m.pivot = [sx / 2, sy / 2, sz];
  return m;
}

export const hammer = () => item(7, 7, 22, (m) => {
  m.box(2, 2, 4, 5, 5, 22, M.WOOD);                 // рукоять
  m.box(0, 0, 0, 7, 7, 6, M.METAL);                 // боёк
});
export const hands = () => item(8, 5, 8, (m) => {
  m.box(0, 0, 2, 8, 5, 8, M.PLASTER);
  m.box(0, 3, 0, 8, 5, 2, M.PLASTER);
  m.box(0, 0, 6, 8, 5, 8, M.PAINT_BLUE);
});
export const dynamite = () => item(4, 4, 10, (m) => {
  m.box(0, 0, 2, 4, 4, 10, M.EXPLOSIVE);
  m.box(1, 1, 0, 3, 3, 2, M.PAINT_WHITE);
});
export const shotgun = () => item(4, 7, 28, (m) => {
  m.box(1, 3, 0, 3, 5, 20, M.METAL);                // ствол
  m.box(0, 1, 16, 4, 5, 22, M.METAL);
  m.box(1, 0, 20, 3, 4, 28, M.WOOD);                // приклад
  m.box(1, 2, 8, 3, 3, 14, M.WOOD);                 // цевьё
});
export const rocket = () => item(5, 7, 24, (m) => {
  m.box(0, 2, 0, 5, 7, 24, M.PAINT_GREEN);
  m.box(1, 3, 0, 4, 6, 1, M.RUBBER);
  m.box(2, 0, 12, 3, 2, 15, M.METAL);
});
export const laser = () => item(6, 8, 22, (m) => {
  m.box(1, 3, 0, 5, 7, 18, M.PAINT_WHITE);
  m.box(2, 4, 0, 4, 6, 2, M.PAINT_RED);
  m.box(2, 0, 12, 4, 3, 16, M.METAL);
  m.box(0, 4, 6, 6, 6, 10, M.GLASS);
});
export const remote = () => item(6, 3, 9, (m) => {
  m.box(0, 0, 0, 6, 3, 9, M.PAINT_YELLOW);
  m.box(1, 3 - 1, 1, 3, 3, 3, M.PAINT_RED);
  m.box(3, 3 - 1, 1, 5, 3, 3, M.PAINT_GREEN);
});
