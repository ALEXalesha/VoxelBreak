// Законы сетки: каждая видимая грань покрыта ровно один раз, невидимых граней нет, треугольники
// смотрят наружу, швы между чанками без дыр и без лишних граней.
import test from 'node:test';
import assert from 'node:assert/strict';
import { smallWorld, exposedFaces, meshFaces, World, M } from './helpers.mjs';
import { greedyMesh, padGrid } from '../../web/js/core/mesher.js';
import { Rng } from '../../web/js/core/rng.js';

function checkSame(exposed, covered, problems, label) {
  assert.deepEqual(problems, [], label);
  const holes = [...exposed].filter((k) => !covered.has(k));
  const extra = [...covered.keys()].filter((k) => !exposed.has(k));
  const twice = [...covered].filter(([, n]) => n > 1);
  assert.deepEqual(holes.slice(0, 5), [], `${label}: дыры`);
  assert.deepEqual(extra.slice(0, 5), [], `${label}: лишние грани`);
  assert.deepEqual(twice.slice(0, 5), [], `${label}: грань дважды`);
}

function meshAll(mesh, off, problems) {
  const a = meshFaces(mesh.opaque, off, problems), b = meshFaces(mesh.glass, off, problems);
  for (const [k, n] of b) a.set(k, (a.get(k) || 0) + n);
  return a;
}

test('сетка без дыр и лишних граней: случайные решётки со стеклом', () => {
  const rng = new Rng(21);
  for (let t = 0; t < 30; t++) {
    const sx = rng.int(1, 12), sy = rng.int(1, 12), sz = rng.int(1, 12);
    const data = new Uint8Array(sx * sy * sz);
    const fill = rng.range(0.1, 0.9);
    for (let i = 0; i < data.length; i++) if (rng.next() < fill) data[i] = rng.pick([M.STONE, M.BRICK, M.GLASS, M.STONE, 255]);
    const mesh = greedyMesh(padGrid(data, sx, sy, sz), [sx, sy, sz]);
    const get = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : data[x + sx * (z + sz * y)] === 255 ? 0 : data[x + sx * (z + sz * y)]);
    const problems = [];
    checkSame(exposedFaces(get, [sx, sy, sz]), meshAll(mesh, [0, 0, 0], problems), problems, `решётка ${t}`);
  }
});

test('у каждой грани сетки материал её вокселя, у каждого угла - затенение этого угла', () => {
  const rng = new Rng(77);
  const opaque = (m) => m !== 0 && m !== M.GLASS;
  for (let t = 0; t < 40; t++) {
    const sx = rng.int(2, 9), sy = rng.int(2, 9), sz = rng.int(2, 9);
    const data = new Uint8Array(sx * sy * sz);
    for (let i = 0; i < data.length; i++) if (rng.next() < 0.55) data[i] = rng.pick([M.STONE, M.BRICK, M.PLANK, M.GLASS]);
    const get = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : data[x + sx * (z + sz * y)]);
    const mesh = greedyMesh(padGrid(data, sx, sy, sz), [sx, sy, sz]);
    for (const part of [mesh.opaque, mesh.glass]) {
      const { positions: P, normals: N, mats, ao } = part;
      for (let q = 0; q < part.quads; q++) {
        const base = q * 4;
        const d = [0, 1, 2].find((k) => N[base * 3 + k] !== 0), dir = N[base * 3 + d];
        const u = (d + 1) % 3, v = (d + 2) % 3;
        const lo = [0, 1, 2].map((k) => Math.min(...[0, 1, 2, 3].map((c) => P[(base + c) * 3 + k])));
        const hi = [0, 1, 2].map((k) => Math.max(...[0, 1, 2, 3].map((c) => P[(base + c) * 3 + k])));
        for (let i = lo[u]; i < hi[u]; i++)
          for (let j = lo[v]; j < hi[v]; j++) {
            const c = [0, 0, 0]; c[d] = dir > 0 ? lo[d] - 1 : lo[d]; c[u] = i; c[v] = j;
            assert.equal(get(c[0], c[1], c[2]), mats[q], `грань ${c} - не тот материал`);
          }
        if (mats[q] === M.GLASS) continue;
        // затенение угла: три соседа перед гранью
        for (let k = 0; k < 4; k++) {
          const vx = [0, 1, 2].map((a) => P[(base + k) * 3 + a]);
          const cu = vx[u] === lo[u] ? lo[u] : hi[u] - 1, cv = vx[v] === lo[v] ? lo[v] : hi[v] - 1;
          const du = vx[u] === lo[u] ? -1 : 1, dv = vx[v] === lo[v] ? -1 : 1;
          const f = [0, 0, 0]; f[d] = dir > 0 ? lo[d] : lo[d] - 1;
          const at = (a, b) => { const p = f.slice(); p[u] = cu + a; p[v] = cv + b; return opaque(get(p[0], p[1], p[2])) ? 1 : 0; };
          const s1 = at(du, 0), s2 = at(0, dv), cc = at(du, dv);
          const lv = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
          assert.equal(ao[base + k], lv, `угол ${vx}`);
        }
      }
    }
  }
});

test('жадное слияние: сплошной ящик - 6 прямоугольников, а не грань на каждый воксель', () => {
  const data = new Uint8Array(8 * 8 * 8).fill(M.CONCRETE);
  const mesh = greedyMesh(padGrid(data, 8, 8, 8), [8, 8, 8]);
  assert.equal(mesh.opaque.quads, 6);
  assert.equal(mesh.glass.quads, 0);
  assert.equal(mesh.opaque.indices.length, 36);
  const empty = greedyMesh(padGrid(new Uint8Array(8), 2, 2, 2), [2, 2, 2]);
  assert.equal(empty.opaque.quads, 0);
});

test('затенение углов: грань у стены темнее открытой', () => {
  const data = new Uint8Array(3 * 2 * 1);
  data[0] = data[1] = data[2] = M.CONCRETE;     // пол из трёх вокселей
  data[3] = M.CONCRETE;                          // над первым - стена
  const mesh = greedyMesh(padGrid(data, 3, 2, 1), [3, 2, 1]);
  const { positions: P, normals: N, colors: C } = mesh.opaque;
  let dark = 255, light = 0;
  for (let v = 0; v < P.length / 3; v++) {
    if (N[v * 3 + 1] !== 1 || P[v * 3 + 1] !== 1) continue;    // верх пола
    if (P[v * 3] === 1) dark = Math.min(dark, C[v * 3]);
    if (P[v * 3] === 3) light = Math.max(light, C[v * 3]);
  }
  assert.ok(dark < light, `${dark} < ${light}`);
});

test('швы чанков: сетки всех чанков вместе покрывают ровно видимые грани всего мира', () => {
  const { world } = smallWorld({ seed: 2, kind: 'town', sx: 3, sy: 2, sz: 3 });
  // ломаем по шву, чтобы грани на границах чанков были и сверху, и сбоку
  for (let y = 8; y < 40; y++) for (let z = 20; z < 44; z++) world.set(32, y, z, y % 3 ? M.GLASS : 0);
  const problems = [];
  const covered = new Map();
  for (const c of world.chunks) {
    if (!c) continue;
    const mesh = greedyMesh(world.padded(c.cx, c.cy, c.cz), [32, 32, 32]);
    for (const [k, n] of meshAll(mesh, [c.cx * 32, c.cy * 32, c.cz * 32], problems)) covered.set(k, (covered.get(k) || 0) + n);
  }
  const exposed = exposedFaces((x, y, z) => world.get(x, y, z), [world.nx, world.ny, world.nz]);
  // грани на внешних краях мира тоже должны быть: за краем воздух
  checkSame(exposed, covered, problems, 'мир');
});

test('пустые и полные чанки: сетка пустого - пустая', () => {
  const w = new World({ sx: 1, sy: 1, sz: 1 });
  const mesh = greedyMesh(w.padded(0, 0, 0), [32, 32, 32]);
  assert.equal(mesh.opaque.positions.length, 0);
});
