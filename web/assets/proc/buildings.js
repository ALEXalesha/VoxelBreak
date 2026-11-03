// Постройки кодом: дом, мост, забор, столб. Размеры - в вокселях (0,25 м).
// Модель ставится по углу с наименьшими координатами; низ модели (y = 0) - на земле.
import { VoxelModel } from '../../js/core/model.js';
import { M, CARVE } from '../../js/core/materials.js';

const FLOOR_H = 12;     // 3 м на этаж

const STYLES = {
  brick: { wall: M.BRICK, trim: M.CONCRETE, floor: M.CONCRETE, t: 2 },
  plaster: { wall: M.PLASTER, trim: M.WOOD, floor: M.PLANK, t: 2 },
  wood: { wall: M.PLANK, trim: M.WOOD, floor: M.PLANK, t: 1 },
};

// w - вдоль x, d - вдоль z (перед дома - сторона z = 0), floors - этажей
export function house({ w = 28, d = 22, floors = 2, style = 'brick', roof = 'gable' } = {}, rng) {
  const S = STYLES[style] || STYLES.brick;
  const T = S.t;
  const wallTop = 1 + floors * FLOOR_H;
  const roofH = roof === 'gable' ? Math.ceil((d + 2) / 2) + 1 : 3;
  const m = new VoxelModel(w + 2, wallTop + roofH + 1, d + 2);
  const X0 = 1, Z0 = 1;                     // дом внутри модели, по краю - свес крыши
  const box = (x0, y0, z0, x1, y1, z1, mat) => m.box(X0 + x0, y0, Z0 + z0, X0 + x1, y1, Z0 + z1, mat);

  box(0, 0, 0, w, 1, d, M.CONCRETE);                       // фундамент
  box(0, 1, 0, w, wallTop, d, S.wall);                      // коробка стен
  box(T, 1, T, w - T, wallTop, d - T, CARVE);               // пустота внутри
  for (let k = 1; k < floors; k++) box(T, k * FLOOR_H, T, w - T, k * FLOOR_H + 1, d - T, S.floor);
  box(0, wallTop - 1, 0, w, wallTop, d, S.floor);           // потолок верхнего этажа
  for (let k = 0; k < floors; k++) box(0, k * FLOOR_H + 1, 0, w, k * FLOOR_H + 2, d, S.trim);  // пояс по низу этажа

  // перегородка с проёмом
  const ix = Math.floor(w / 2);
  box(ix, 1, T, ix + 1, wallTop - 1, d - T, M.PLASTER);
  for (let k = 0; k < floors; k++) box(ix, k * FLOOR_H + 2, Math.floor(d / 2) - 2, ix + 1, k * FLOOR_H + 10, Math.floor(d / 2) + 2, CARVE);
  for (let k = 1; k < floors; k++) box(ix, k * FLOOR_H, T, ix + 1, k * FLOOR_H + 1, d - T, S.floor);

  // окна: стекло в наружном слое, внутренний слой стены вырезан
  const windowsAlong = (len, put) => {
    for (let a = 5; a + 4 <= len - 4; a += 9) put(a);
  };
  for (let k = 0; k < floors; k++) {
    const y0 = k * FLOOR_H + 5, y1 = y0 + 5;
    windowsAlong(w, (a) => {
      if (!(k === 0 && a <= Math.floor(w / 2) - 2 && a + 4 >= Math.floor(w / 2) - 2)) {
        box(a, y0, 0, a + 4, y1, 1, M.GLASS); if (T > 1) box(a, y0, 1, a + 4, y1, T, CARVE);
      }
      box(a, y0, d - 1, a + 4, y1, d, M.GLASS); if (T > 1) box(a, y0, d - T, a + 4, y1, d - 1, CARVE);
    });
    windowsAlong(d, (a) => {
      box(0, y0, a, 1, y1, a + 4, M.GLASS); if (T > 1) box(1, y0, a, T, y1, a + 4, CARVE);
      box(w - 1, y0, a, w, y1, a + 4, M.GLASS); if (T > 1) box(w - T, y0, a, w - 1, y1, a + 4, CARVE);
    });
  }
  // дверь в передней стене
  const dx = Math.floor(w / 2) - 6;
  box(dx, 1, 0, dx + 4, 9, T, CARVE);

  // мебель первого этажа: стол и шкаф
  const tx = T + 3, tz = T + 3;
  box(tx, 4, tz, tx + 6, 5, tz + 4, M.PLANK);
  for (const [lx, lz] of [[0, 0], [5, 0], [0, 3], [5, 3]]) box(tx + lx, 1, tz + lz, tx + lx + 1, 4, tz + lz + 1, M.WOOD);
  box(w - T - 2, 1, T + 2, w - T, 9, T + 8, M.WOOD);
  box(w - T - 2, 3, T + 3, w - T - 1, 8, T + 7, CARVE);
  box(w - T - 2, 5, T + 3, w - T - 1, 6, T + 7, M.PLANK);

  if (roof === 'gable') {
    // скат по z, конёк вдоль x; торцы - фронтоны из материала стены
    for (let r = 0; r * 2 < d + 2; r++) {
      const y = wallTop + r;
      const za = r - 1, zb = d - r;
      if (za > zb) break;
      m.box(0, y, Z0 + za, w + 2, y + 1, Z0 + za + 1, M.ROOF);
      m.box(0, y, Z0 + zb, w + 2, y + 1, Z0 + zb + 1, M.ROOF);
      if (zb - za > 1) {
        m.box(X0, y, Z0 + za + 1, X0 + 1, y + 1, Z0 + zb, S.wall);
        m.box(X0 + w - 1, y, Z0 + za + 1, X0 + w, y + 1, Z0 + zb, S.wall);
        m.box(X0 + 1, y, Z0 + za + 1, X0 + w - 1, y + 1, Z0 + zb, CARVE);
      }
    }
  } else {
    box(0, wallTop, 0, w, wallTop + 2, 1, S.trim);
    box(0, wallTop, d - 1, w, wallTop + 2, d, S.trim);
    box(0, wallTop, 0, 1, wallTop + 2, d, S.trim);
    box(w - 1, wallTop, 0, w, wallTop + 2, d, S.trim);
  }
  m.keepConnected((x, y) => y === 0);
  return m;
}

// мост вдоль x: настил на высоте depth, опоры до низа модели
export function bridge({ length = 48, width = 12, depth = 16, material = 'wood' } = {}) {
  const deck = material === 'concrete' ? M.CONCRETE : M.PLANK;
  const post = material === 'concrete' ? M.CONCRETE : M.WOOD;
  const m = new VoxelModel(length, depth + 6, width);
  m.box(0, depth, 0, length, depth + 2, width, deck);
  for (let x = 0; x < length; x += 4) {
    m.box(x, depth + 2, 0, x + 1, depth + 5, 1, post);
    m.box(x, depth + 2, width - 1, x + 1, depth + 5, width, post);
  }
  m.box(0, depth + 5, 0, length, depth + 6, 1, post);
  m.box(0, depth + 5, width - 1, length, depth + 6, width, post);
  for (let x = 10; x + 2 <= length - 10; x += 14) {
    m.box(x, 0, 1, x + 2, depth, 3, post);
    m.box(x, 0, width - 3, x + 2, depth, width - 1, post);
    m.box(x, depth - 4, 3, x + 2, depth - 2, width - 3, post);
  }
  m.keepConnected((x, y, z) => y === 0 || x < 6 || x >= length - 6);
  return m;
}

export function fence({ length = 24, height = 5 } = {}) {
  const m = new VoxelModel(length, height, 1);
  for (let x = 0; x < length; x += 6) m.box(x, 0, 0, x + 1, height, 1, M.WOOD);
  m.box(0, 0, 0, 1, height, 1, M.WOOD);
  m.box(length - 1, 0, 0, length, height, 1, M.WOOD);
  m.box(0, 2, 0, length, 3, 1, M.PLANK);
  m.box(0, height - 1, 0, length, height, 1, M.PLANK);
  return m;
}

export function pole({ height = 30, lamp = true } = {}) {
  const m = new VoxelModel(5, height + 2, 1);
  m.box(0, 0, 0, 1, height, 1, lamp ? M.METAL : M.WOOD);
  if (lamp) {
    m.box(0, height - 1, 0, 4, height, 1, M.METAL);
    m.box(3, height - 2, 0, 4, height - 1, 1, M.PAINT_WHITE);
  } else {
    m.box(0, height - 4, 0, 5, height - 3, 1, M.WOOD);
    m.box(0, height - 3, 0, 1, height - 2, 1, M.METAL);
    m.box(4, height - 3, 0, 5, height - 2, 1, M.METAL);
  }
  m.keepConnected((x, y) => y === 0);
  return m;
}
