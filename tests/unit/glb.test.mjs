// Законы перевода моделей из Blender (GLB) в воксели: размеры, материалы по имени и по цвету,
// узлы с перемещением и масштабом, оболочка и заливка, ошибки на испорченных файлах.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGlb, boxMesh } from './glbwriter.mjs';
import { parseGlb, voxelize, glbToModel, triBox } from '../../web/js/core/glb.js';
import { Assets } from '../../web/js/core/assets.js';
import { BUILDERS } from '../../web/assets/proc/index.js';
import { M, MATERIALS } from '../../web/js/core/materials.js';
import { Rng } from '../../web/js/core/rng.js';
import { makePlan, generateWorld } from '../../web/js/core/gen.js';
import { World } from '../../web/js/core/world.js';
import { MANIFEST } from '../../web/assets/manifest.js';

const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

test('ящик 2 × 1 × 1,5 м из Blender - 8 × 4 × 6 вокселей; заливка даёт полный объём, оболочка - только стенки', () => {
  const glb = makeGlb([{ ...boxMesh(2, 1, 1.5), material: { name: 'brick' } }]);
  const solid = glbToModel(glb, { voxel: 0.25, solid: true });
  assert.deepEqual([solid.sx, solid.sy, solid.sz], [8, 4, 6]);
  assert.equal(solid.count(), 8 * 4 * 6);
  assert.ok([...solid.data].every((m) => m === M.BRICK), 'материал по имени');
  const shell = glbToModel(glb, { voxel: 0.25, solid: false });
  assert.equal(shell.count(), 8 * 4 * 6 - 6 * 2 * 4, 'внутри пусто');
  assert.deepEqual(shell.pivot, [4, 0, 3]);
});

test('материал без знакомого имени - ближайший по цвету; узлы двигают и масштабируют', () => {
  const red = MATERIALS[M.PAINT_RED].color.map((c) => srgbToLinear(c / 255));
  const glass = MATERIALS[M.GLASS].color.map((c) => srgbToLinear(c / 255));
  const glb = makeGlb([
    { ...boxMesh(1, 1, 1), material: { name: 'Кузов.001', color: red } },
    { ...boxMesh(1, 1, 1), material: { name: 'glass.002', color: [0, 0, 0] }, node: { translation: [2, 0, 0], scale: [1, 0.5, 1] } },
  ], { shortIndex: false });
  const m = voxelize(parseGlb(glb), { voxel: 0.25, solid: true });
  assert.deepEqual([m.sx, m.sy, m.sz], [12, 4, 4]);
  assert.equal(m.get(1, 1, 1), M.PAINT_RED, 'по цвету');
  assert.equal(m.get(9, 1, 1), M.GLASS, 'по имени, суффикс Blender отброшен');
  assert.equal(m.get(9, 3, 1), 0, 'масштаб по высоте');
  assert.equal(m.get(5, 1, 1), 0, 'между ящиками пусто');
  // поворот на 90° вокруг вертикали меняет длину и ширину местами
  const turned = voxelize(parseGlb(makeGlb([{ ...boxMesh(2, 1, 1), node: { rotation: [0, Math.SQRT1_2, 0, Math.SQRT1_2] } }])), { voxel: 0.25 });
  assert.deepEqual([turned.sx, turned.sz], [4, 8]);
  const matrix = voxelize(parseGlb(makeGlb([{ ...boxMesh(1, 1, 1), node: { matrix: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1] } }])), { voxel: 0.25, scale: 2 });
  assert.deepEqual([matrix.sx, matrix.sy], [16, 8], 'матрица узла и общий масштаб');
  assert.equal(nonAnchor(m), true);
});
const nonAnchor = (m) => [...m.data].every((v) => !MATERIALS[v] || !MATERIALS[v].anchor);

test('треугольник и кубик: проверка пересечения совпадает с перебором точек', () => {
  const rng = new Rng(17);
  let agree = 0;
  for (let t = 0; t < 400; t++) {
    const tri = Array.from({ length: 9 }, () => rng.range(-1.5, 1.5));
    const fast = triBox(tri, 0, 0, 0);
    let slow = false;
    for (let a = 0; a <= 40 && !slow; a++)
      for (let b = 0; a + b <= 40 && !slow; b++) {
        const u = a / 40, v = b / 40, w = 1 - u - v;
        const p = [0, 1, 2].map((k) => tri[k] * w + tri[3 + k] * u + tri[6 + k] * v);
        if (p.every((c) => Math.abs(c) <= 0.5)) slow = true;
      }
    if (slow) assert.equal(fast, true, `перебор нашёл точку внутри, а проверка - нет (${t})`);
    if (fast === slow) agree++;
  }
  assert.ok(agree > 380, `${agree}`);
});

test('испорченный GLB - понятная ошибка', () => {
  const good = makeGlb([{ ...boxMesh(1, 1, 1) }]);
  assert.throws(() => parseGlb(new Uint8Array(4)), /короткий/);
  const bad = good.slice(); bad[0] = 0;
  assert.throws(() => parseGlb(bad), /подписи/);
  const v1 = good.slice(); v1[4] = 1;
  assert.throws(() => parseGlb(v1), /версия/);
  const nojson = good.slice(); nojson[16] = 0;
  assert.throws(() => parseGlb(nojson), /нет описания/);
  assert.throws(() => voxelize([], {}), /нет треугольников/);
  assert.throws(() => voxelize(parseGlb(makeGlb([{ ...boxMesh(100, 100, 100) }])), { voxel: 0.1 }), /слишком большая/);
  const lines = makeGlb([{ ...boxMesh(1, 1, 1) }]);
  const tris = parseGlb(lines);
  assert.equal(tris.length, 12);
});

test('слой assets: модель из GLB подменяет модель кодом без переделки генератора', async () => {
  const glb = makeGlb([{ ...boxMesh(1.5, 0.5, 1), material: { name: 'explosive' } }]);
  const manifest = { voxel: 0.25, models: { ...MANIFEST.models, barrel: { src: 'models/barrel.glb', solid: true } } };
  const assets = new Assets(manifest, BUILDERS, { fetchBytes: async () => glb, glbToModel });
  await assets.preload();
  const b = assets.get('barrel');
  assert.deepEqual([b.sx, b.sy, b.sz], [6, 2, 4]);
  const plan = makePlan({ seed: 3, kind: 'town', sx: 4, sy: 2, sz: 4 }, assets);
  const world = generateWorld(plan, new World({ sx: 4, sy: 2, sz: 4 }));
  assert.ok(world.totalCount() > 0);
  assert.ok(plan.props.filter((p) => p.id === 'barrel').every((p) => p.w === 6 || p.w === 4));
});
