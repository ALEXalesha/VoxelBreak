// Материалы вокселей. Один байт на воксель: 0 - воздух, CARVE (255) бывает только в моделях
// и значит «вырезать здесь мир». strength - сколько силы удара нужно, чтобы выбить воксель;
// density - масса одного вокселя (кг на воксель 0,25 м), vary - пёстрость цвета по вокселю.

export const VOXEL = 0.25;          // метров в вокселе
export const CARVE = 255;

const LIST = [
  ['air', [0, 0, 0], 0, 0, 0],
  ['bedrock', [52, 50, 56], Infinity, 40, 0.10, { anchor: true }],
  ['dirt', [122, 88, 58], 1.2, 25, 0.16],
  ['grass', [86, 142, 60], 1.2, 25, 0.18],
  ['stone', [128, 128, 132], 6, 40, 0.14],
  ['sand', [214, 196, 140], 0.8, 24, 0.10],
  ['wood', [116, 80, 48], 1.8, 10, 0.12],
  ['plank', [176, 132, 84], 1.2, 8, 0.10],
  ['leaves', [62, 118, 52], 0.25, 2, 0.22],
  ['brick', [160, 72, 56], 3, 30, 0.14],
  ['concrete', [168, 168, 160], 5, 36, 0.06],
  ['glass', [170, 214, 232], 0.4, 4, 0.02, { fragile: true }],
  ['metal', [120, 128, 138], 9, 120, 0.05],
  ['asphalt', [58, 60, 64], 4, 35, 0.08],
  ['roof', [120, 50, 44], 1.6, 14, 0.08],
  ['plaster', [226, 218, 198], 1.4, 18, 0.05],
  ['paint_red', [196, 40, 36], 4, 60, 0.03],
  ['paint_blue', [40, 88, 190], 4, 60, 0.03],
  ['paint_yellow', [232, 186, 40], 4, 60, 0.03],
  ['paint_white', [232, 234, 236], 4, 60, 0.03],
  ['rubber', [30, 30, 32], 2, 20, 0.04],
  ['explosive', [210, 52, 30], 1, 15, 0.05, { explosive: true }],
  ['tile', [200, 190, 172], 2.5, 25, 0.04],
  ['marking', [236, 230, 210], 4, 35, 0.04],
  ['paint_green', [52, 140, 70], 4, 60, 0.03],
  ['ore', [92, 84, 96], 7, 45, 0.20],
];

export const MATERIALS = LIST.map(([name, color, strength, density, vary, flags = {}], id) => ({
  id, name, color, strength, density, vary,
  anchor: !!flags.anchor, fragile: !!flags.fragile, explosive: !!flags.explosive,
}));

export const M = Object.fromEntries(MATERIALS.map((m) => [m.name.toUpperCase(), m.id]));
M.CARVE = CARVE;

export const byName = (name) => MATERIALS.find((m) => m.name === name) || null;
export const isSolid = (m) => m !== 0 && m !== CARVE;
export const strengthOf = (m) => (MATERIALS[m] ? MATERIALS[m].strength : 0);
export const densityOf = (m) => (MATERIALS[m] ? MATERIALS[m].density : 0);

// ближайший материал по цвету - для моделей из GLB, где есть только цвета
export function nearestMaterial(r, g, b, allowed = null) {
  let best = M.CONCRETE, bestD = Infinity;
  for (const m of MATERIALS) {
    if (m.id === 0 || m.anchor || (allowed && !allowed.includes(m.id))) continue;
    const d = (m.color[0] - r) ** 2 + (m.color[1] - g) ** 2 + (m.color[2] - b) ** 2;
    if (d < bestD) { bestD = d; best = m.id; }
  }
  return best;
}
