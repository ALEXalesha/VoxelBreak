// Связность после удара. От каждого твёрдого соседа выбитых вокселей ищем путь к опоре
// (коренной породе), шагая сначала вниз: очередь по высоте, ниже - раньше. Нашли опору -
// весь пройденный кусок держится. Не нашли, а соседи кончились - кусок висит в воздухе:
// он вырезается из мира и становится телом.
import { MATERIALS } from './materials.js';

const ANCHOR = MATERIALS.map((m) => m.anchor);

// seeds - ключи вокселей x + nx * (z + nz * y); вернёт висящие куски (массивы ключей)
export function findFloating(world, seeds, { limit = 3_000_000 } = {}) {
  const { nx, ny, nz } = world;
  const plane = nx * nz;
  const state = new Map();            // 1 - держится, 2 - висит
  const out = [];
  const buckets = Array.from({ length: ny }, () => []);
  for (const seed of seeds) {
    if (state.has(seed)) continue;
    const sx = seed % nx, sz = Math.floor(seed / nx) % nz, sy = Math.floor(seed / plane);
    if (!world.get(sx, sy, sz)) continue;
    const cur = new Set([seed]);
    let minY = sy;
    buckets[sy].push(seed);
    let held = false;
    search: for (;;) {
      while (minY < ny && buckets[minY].length === 0) minY++;
      if (minY >= ny) break;
      const k = buckets[minY].pop();
      const x = k % nx, z = Math.floor(k / nx) % nz, y = minY;
      if (ANCHOR[world.get(x, y, z)]) { held = true; break; }
      for (let n = 0; n < 6; n++) {
        let a = x, b = y, c = z;
        if (n === 0) b--; else if (n === 1) a--; else if (n === 2) a++; else if (n === 3) c--; else if (n === 4) c++; else b++;
        if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
        const key = a + nx * (c + nz * b);
        if (cur.has(key)) continue;
        if (!world.get(a, b, c)) continue;
        if (state.get(key) === 1) { held = true; break search; }
        cur.add(key);
        buckets[b].push(key);
        if (b < minY) minY = b;
      }
      if (cur.size > limit) { held = true; break; }    // предохранитель: огромное считаем опёртым
    }
    for (const b of buckets) b.length = 0;
    const mark = held ? 1 : 2;
    for (const k of cur) state.set(k, mark);
    if (!held) out.push(cur);
  }
  return out;
}

// соседи по граням набора выбитых вокселей - точки, откуда ищется опора
export function neighbourSeeds(world, removed) {
  const { nx, nz } = world;
  const seeds = new Set();
  for (const [x, y, z] of removed) {
    for (const [dx, dy, dz] of DIRS) {
      const a = x + dx, b = y + dy, c = z + dz;
      if (world.inside(a, b, c) && world.get(a, b, c)) seeds.add(a + nx * (c + nz * b));
    }
  }
  return [...seeds].sort((p, q) => p - q);
}
const DIRS = [[0, -1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0]];

// связные куски воксельной сетки тела (опоры нет): массивы индексов x + sx * (z + sz * y)
export function gridComponents(data, sx, sy, sz) {
  const label = new Int32Array(data.length).fill(-1);
  const comps = [];
  const plane = sx * sz;
  const stack = [];
  for (let i = 0; i < data.length; i++) {
    if (!data[i] || label[i] >= 0) continue;
    const id = comps.length, list = [];
    label[i] = id; stack.push(i);
    while (stack.length) {
      const k = stack.pop();
      list.push(k);
      const x = k % sx, z = Math.floor(k / sx) % sz, y = Math.floor(k / plane);
      if (x > 0) visit(k - 1); if (x < sx - 1) visit(k + 1);
      if (z > 0) visit(k - sx); if (z < sz - 1) visit(k + sx);
      if (y > 0) visit(k - plane); if (y < sy - 1) visit(k + plane);
    }
    comps.push(list);
    function visit(j) { if (data[j] && label[j] < 0) { label[j] = id; stack.push(j); } }
  }
  return comps;
}
