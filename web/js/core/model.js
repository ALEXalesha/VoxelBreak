// Воксельная модель: дом, машина, дерево, предмет. Источник - код (web/assets/proc) или GLB,
// переведённый в воксели; игре всё равно, она получает только VoxelModel.
// Индекс x + sx * (z + sz * y). CARVE (255) - «здесь вырезать мир» (комнаты, проёмы).
import { CARVE } from './materials.js';

export class VoxelModel {
  constructor(sx, sy, sz, data = null) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.data = data || new Uint8Array(sx * sy * sz);
    this.pivot = [sx / 2, 0, sz / 2];   // точка установки: середина низа
  }
  idx(x, y, z) { return x + this.sx * (z + this.sz * y); }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz; }
  get(x, y, z) { return this.inside(x, y, z) ? this.data[this.idx(x, y, z)] : 0; }
  set(x, y, z, m) { if (this.inside(x, y, z)) this.data[this.idx(x, y, z)] = m; }
  // полуоткрытый ящик [x0, x1) × [y0, y1) × [z0, z1)
  box(x0, y0, z0, x1, y1, z1, m) {
    for (let y = Math.max(0, y0); y < Math.min(this.sy, y1); y++)
      for (let z = Math.max(0, z0); z < Math.min(this.sz, z1); z++)
        for (let x = Math.max(0, x0); x < Math.min(this.sx, x1); x++) this.data[this.idx(x, y, z)] = m;
    return this;
  }
  count() {
    let n = 0;
    for (const m of this.data) if (m !== 0 && m !== CARVE) n++;
    return n;
  }
  // оставить только то, что связано по граням с вокселями опоры (base(x, y, z) === true):
  // в модели не бывает висящих в воздухе крошек
  keepConnected(base) {
    const { sx, sy, sz, data } = this;
    const seen = new Uint8Array(data.length);
    const stack = [];
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++) {
          const i = this.idx(x, y, z);
          if (data[i] !== 0 && data[i] !== CARVE && base(x, y, z)) { seen[i] = 1; stack.push(i); }
        }
    const plane = sx * sz;
    while (stack.length) {
      const i = stack.pop();
      const x = i % sx, z = Math.floor(i / sx) % sz, y = Math.floor(i / plane);
      const nb = [x > 0 ? i - 1 : -1, x < sx - 1 ? i + 1 : -1, z > 0 ? i - sx : -1, z < sz - 1 ? i + sx : -1,
        y > 0 ? i - plane : -1, y < sy - 1 ? i + plane : -1];
      for (const j of nb) if (j >= 0 && !seen[j] && data[j] !== 0 && data[j] !== CARVE) { seen[j] = 1; stack.push(j); }
    }
    let removed = 0;
    for (let i = 0; i < data.length; i++) if (data[i] !== 0 && data[i] !== CARVE && !seen[i]) { data[i] = 0; removed++; }
    return removed;
  }
}

// поворот на rot × 90° вокруг вертикали: локальные (x, z) -> мировые смещения
export function rotXZ(x, z, sx, sz, rot) {
  switch (rot & 3) {
    case 0: return [x, z];
    case 1: return [sz - 1 - z, x];
    case 2: return [sx - 1 - x, sz - 1 - z];
    default: return [z, sx - 1 - x];
  }
}
export function rotatedSize(model, rot) { return rot & 1 ? [model.sz, model.sx] : [model.sx, model.sz]; }

// повёрнутая копия модели (так же, как её кладёт генератор)
export function rotateModel(model, rot) {
  if (!(rot & 3)) return model;
  const [w, d] = rotatedSize(model, rot);
  const out = new VoxelModel(w, model.sy, d);
  for (let y = 0; y < model.sy; y++)
    for (let z = 0; z < model.sz; z++)
      for (let x = 0; x < model.sx; x++) {
        const [a, b] = rotXZ(x, z, model.sx, model.sz, rot);
        out.data[a + w * (b + d * y)] = model.data[model.idx(x, y, z)];
      }
  return out;
}

// обратное: мировое смещение внутри повёрнутого ящика -> локальные (x, z)
export function unrotXZ(wx, wz, sx, sz, rot) {
  switch (rot & 3) {
    case 0: return [wx, wz];
    case 1: return [wz, sz - 1 - wx];
    case 2: return [sx - 1 - wx, sz - 1 - wz];
    default: return [sx - 1 - wz, wx];
  }
}
