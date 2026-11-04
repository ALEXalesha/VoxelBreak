// Чем ломать. Цифры - в вокселях (0,25 м) и секундах; сила сравнивается с прочностью
// материала (кирпич 3, бетон 5, камень 6, металл 9).
export const TOOLS = [
  { id: 'hammer', key: 'Digit1', range: 12, radius: 1.7, power: 5.5, cooldown: 0.32, push: 30 },
  { id: 'hands', key: 'Digit2', range: 14, push: 55, grabMass: 3000, cooldown: 0.25 },
  { id: 'dynamite', key: 'Digit3', range: 16, radius: 6.5, power: 14, fuse: 3, cooldown: 0.5, max: 12, ammo: 20 },
  { id: 'shotgun', key: 'Digit4', range: 90, pellets: 9, spread: 0.06, radius: 1.0, power: 4.6, cooldown: 0.85, push: 14, ammo: 40 },
  { id: 'rocket', key: 'Digit5', speed: 90, radius: 5.5, power: 13, cooldown: 1.1, ammo: 12 },
  { id: 'laser', key: 'Digit6', range: 220, radius: 0.85, power: 10, cooldown: 0, rate: 30 },
  { id: 'vehicle', key: 'Digit7', cooldown: 1 },
];
export const TOOL = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
export const VEHICLES = ['car', 'bulldozer', 'crane'];

// разброс дроби: детерминированные направления вокруг взгляда
export function pelletDirs(dir, n, spread, seed) {
  const [dx, dy, dz] = dir;
  const up = Math.abs(dy) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  let ux = up[1] * dz - up[2] * dy, uy = up[2] * dx - up[0] * dz, uz = up[0] * dy - up[1] * dx;
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed * 1.7, r = spread * (i === 0 ? 0 : 0.45 + 0.55 * ((i * 7919 + seed) % 13) / 12);
    const ex = Math.cos(a) * r, ey = Math.sin(a) * r;
    const x = dx + ux * ex + vx * ey, y = dy + uy * ex + vy * ey, z = dz + uz * ex + vz * ey;
    const l = Math.hypot(x, y, z);
    out.push([x / l, y / l, z / l]);
  }
  return out;
}
