// Общее для законов ядра: модели, маленькие миры, полный поиск висящих кусков, грани сетки.
import { World, CS } from '../../web/js/core/world.js';
import { makePlan, generateWorld } from '../../web/js/core/gen.js';
import { Assets } from '../../web/js/core/assets.js';
import { MANIFEST } from '../../web/assets/manifest.js';
import { BUILDERS } from '../../web/assets/proc/index.js';
import { MATERIALS, M } from '../../web/js/core/materials.js';

export const assets = new Assets(MANIFEST, BUILDERS);

export function smallWorld({ seed = 7, kind = 'town', sx = 4, sy = 2, sz = 4 } = {}) {
  const plan = makePlan({ seed, kind, sx, sy, sz }, assets);
  const world = generateWorld(plan, new World({ sx, sy, sz }));
  return { plan, world };
}

// хеш содержимого мира: одинаковый мир - одинаковое число
export function worldHash(world) {
  let h = 2166136261;
  world.chunks.forEach((c, i) => {
    h = Math.imul(h ^ i, 16777619);
    if (!c) return;
    for (let k = 0; k < c.data.length; k++) h = Math.imul(h ^ c.data[k], 16777619);
  });
  return h >>> 0;
}

// полный обход от опор: все твёрдые воксели, НЕ связанные с коренной породой
export function floatingVoxels(world) {
  const { nx, ny, nz } = world;
  const seen = new Uint8Array(nx * ny * nz);
  const key = (x, y, z) => x + nx * (z + nz * y);
  const stack = [];
  let solid = 0;
  for (let y = 0; y < ny; y++)
    for (let z = 0; z < nz; z++)
      for (let x = 0; x < nx; x++) {
        const m = world.get(x, y, z);
        if (!m) continue;
        solid++;
        if (MATERIALS[m].anchor) { seen[key(x, y, z)] = 1; stack.push(x, y, z); }
      }
  let reached = stack.length / 3;
  while (stack.length) {
    const z = stack.pop(), y = stack.pop(), x = stack.pop();
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const a = x + dx, b = y + dy, c = z + dz;
      if (!world.inside(a, b, c)) continue;
      const k = key(a, b, c);
      if (seen[k] || !world.get(a, b, c)) continue;
      seen[k] = 1; reached++;
      stack.push(a, b, c);
    }
  }
  return solid - reached;
}

const opaque = (m) => m !== 0 && m !== M.GLASS && m !== 255;

// все видимые единичные грани решётки get(x, y, z) в пределах [0, n)
export function exposedFaces(get, [sx, sy, sz]) {
  const out = new Set();
  for (let y = 0; y < sy; y++)
    for (let z = 0; z < sz; z++)
      for (let x = 0; x < sx; x++) {
        const a = get(x, y, z);
        if (!a) continue;
        for (let d = 0; d < 3; d++)
          for (const dir of [-1, 1]) {
            const p = [x, y, z]; p[d] += dir;
            const b = get(p[0], p[1], p[2]);
            const show = a === M.GLASS ? b === 0 : !opaque(b);
            if (show) out.add(`${x},${y},${z},${d},${dir}`);
          }
      }
  return out;
}

// единичные грани, которые покрывает готовая сетка; проверяет и обход треугольников
export function meshFaces(mesh, [ox, oy, oz] = [0, 0, 0], problems = []) {
  const out = new Map();
  const P = mesh.positions, N = mesh.normals, I = mesh.indices;
  for (let q = 0; q < I.length / 6; q++) {
    const base = I[q * 6];
    const vs = [...new Set(Array.from(I.subarray(q * 6, q * 6 + 6)))];
    if (vs.length !== 4) { problems.push(`квад ${q}: ${vs.length} вершин`); continue; }
    const n = [N[base * 3], N[base * 3 + 1], N[base * 3 + 2]];
    const d = n.findIndex((v) => v !== 0), dir = n[d];
    for (let t = 0; t < 2; t++) {
      const [a, b, c] = [0, 1, 2].map((k) => I[q * 6 + t * 3 + k]);
      const e1 = [0, 1, 2].map((k) => P[b * 3 + k] - P[a * 3 + k]);
      const e2 = [0, 1, 2].map((k) => P[c * 3 + k] - P[a * 3 + k]);
      const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (Math.sign(cr[d]) !== dir || cr[(d + 1) % 3] !== 0 || cr[(d + 2) % 3] !== 0) problems.push(`квад ${q}: треугольник смотрит не наружу`);
    }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of vs) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[v * 3 + k]); hi[k] = Math.max(hi[k], P[v * 3 + k]); }
    if (lo[d] !== hi[d]) { problems.push(`квад ${q}: не плоский`); continue; }
    const u = (d + 1) % 3, v = (d + 2) % 3;
    for (let i = lo[u]; i < hi[u]; i++)
      for (let j = lo[v]; j < hi[v]; j++) {
        const c = [0, 0, 0];
        c[d] = dir > 0 ? lo[d] - 1 : lo[d]; c[u] = i; c[v] = j;
        const k = `${c[0] + ox},${c[1] + oy},${c[2] + oz},${d},${dir}`;
        out.set(k, (out.get(k) || 0) + 1);
      }
  }
  return out;
}

export { World, CS, M, MATERIALS };
