// Тело обломка: своя воксельная сетка + положение центра масс (pos), поворот (q), скорости.
// Сетка индексируется x + sx * (z + sz * y); локальная точка вокселя i - его центр минус com.
import { densityOf } from './materials.js';
import { inv3, qmat, mulMV, mulMTV } from './math.js';

export const MAX_SAMPLES = 256;

export class Body {
  constructor(id, sx, sy, sz, data, origin = [0, 0, 0]) {
    this.id = id;
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.data = data;
    this.origin = origin.slice();       // мировой угол сетки при рождении: узор вокселей не прыгает
    this.pos = [0, 0, 0];
    this.q = [0, 0, 0, 1];
    this.v = [0, 0, 0];
    this.w = [0, 0, 0];
    this.sleeping = false;
    this.sleepT = 0;
    this.version = 0;
    this.R = qmat(this.q);
    this.recompute();
  }

  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  at(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz ? this.data[this.idx(x, y, z)] : 0; }

  // масса, центр масс, тензор инерции, точки касания
  recompute() {
    const { sx, sy, sz, data } = this;
    let mass = 0, cx = 0, cy = 0, cz = 0, count = 0;
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++) {
          const m = data[x + sx * (z + sz * y)];
          if (!m) continue;
          const dm = densityOf(m);
          mass += dm; cx += dm * (x + 0.5); cy += dm * (y + 0.5); cz += dm * (z + 0.5); count++;
        }
    this.count = count;
    this.mass = mass;
    this.com = mass > 0 ? [cx / mass, cy / mass, cz / mass] : [sx / 2, sy / 2, sz / 2];
    const I = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    let r2max = 0;
    const surface = [];
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++) {
          const m = data[x + sx * (z + sz * y)];
          if (!m) continue;
          const dm = densityOf(m);
          const rx = x + 0.5 - this.com[0], ry = y + 0.5 - this.com[1], rz = z + 0.5 - this.com[2];
          const r2 = rx * rx + ry * ry + rz * rz;
          I[0] += dm * (r2 - rx * rx + 1 / 6); I[4] += dm * (r2 - ry * ry + 1 / 6); I[8] += dm * (r2 - rz * rz + 1 / 6);
          I[1] -= dm * rx * ry; I[2] -= dm * rx * rz; I[5] -= dm * ry * rz;
          if (r2 > r2max) r2max = r2;
          if (!this.at(x - 1, y, z) || !this.at(x + 1, y, z) || !this.at(x, y - 1, z) || !this.at(x, y + 1, z) || !this.at(x, y, z - 1) || !this.at(x, y, z + 1)) surface.push([rx, ry, rz]);
        }
    I[3] = I[1]; I[6] = I[2]; I[7] = I[5];
    this.invMass = mass > 0 ? 1 / mass : 0;
    this.invI = mass > 0 ? inv3(I) : [0, 0, 0, 0, 0, 0, 0, 0, 0];
    this.radius = Math.sqrt(r2max) + 0.87;
    this.samples = pickSamples(surface);
    this.version++;
  }

  syncR() { qmat(this.q, this.R); return this.R; }
  toWorld(l) { const r = mulMV(this.R, l); return [r[0] + this.pos[0], r[1] + this.pos[1], r[2] + this.pos[2]]; }
  // мировая точка -> координаты сетки (воксель i занимает [i, i + 1))
  toGrid(p) {
    const l = mulMTV(this.R, [p[0] - this.pos[0], p[1] - this.pos[1], p[2] - this.pos[2]]);
    return [l[0] + this.com[0], l[1] + this.com[1], l[2] + this.com[2]];
  }
  aabb() {
    const r = this.radius;
    return [this.pos[0] - r, this.pos[1] - r, this.pos[2] - r, this.pos[0] + r, this.pos[1] + r, this.pos[2] + r];
  }
  // мировые координаты центров всех вокселей (для сохранения массы и проверок)
  voxelsWorld() {
    const out = [];
    for (let y = 0; y < this.sy; y++)
      for (let z = 0; z < this.sz; z++)
        for (let x = 0; x < this.sx; x++) {
          const m = this.data[this.idx(x, y, z)];
          if (m) out.push([...this.toWorld([x + 0.5 - this.com[0], y + 0.5 - this.com[1], z + 0.5 - this.com[2]]), m]);
        }
    return out;
  }
}

// крайние точки по 26 направлениям + равномерная выборка остальных
function pickSamples(surface) {
  if (surface.length <= MAX_SAMPLES) return Float64Array.from(surface.flat());
  const chosen = new Set();
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dy && !dz) continue;
        let best = 0, bestV = -Infinity;
        surface.forEach((p, i) => { const v = p[0] * dx + p[1] * dy + p[2] * dz; if (v > bestV) { bestV = v; best = i; } });
        chosen.add(best);
      }
  const step = surface.length / (MAX_SAMPLES - chosen.size);
  for (let f = 0; chosen.size < MAX_SAMPLES && f < surface.length; f += step) chosen.add(Math.floor(f));
  return Float64Array.from([...chosen].sort((a, b) => a - b).flatMap((i) => surface[i]));
}

// тело из набора мировых вокселей [x, y, z, m]: стоит ровно там, где были воксели
export function bodyFromVoxels(id, list) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
  for (const [x, y, z] of list) {
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z;
    if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z;
  }
  const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1;
  const data = new Uint8Array(sx * sy * sz);
  for (const [x, y, z, m] of list) data[(x - x0) + sx * ((z - z0) + sz * (y - y0))] = m;
  const b = new Body(id, sx, sy, sz, data, [x0, y0, z0]);
  b.pos = [x0 + b.com[0], y0 + b.com[1], z0 + b.com[2]];
  return b;
}

// тело из модели (предметы мира): data модели без CARVE
export function bodyFromModel(id, model, x0, y0, z0) {
  const data = model.data.map((m) => (m === 255 ? 0 : m));
  const b = new Body(id, model.sx, model.sy, model.sz, data, [x0, y0, z0]);
  b.pos = [x0 + b.com[0], y0 + b.com[1], z0 + b.com[2]];
  return b;
}
