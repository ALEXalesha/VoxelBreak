// Законы хранения вокселей: запись и чтение, края мира, счёт вокселей, луч.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, M } from './helpers.mjs';
import { Rng, seedFrom, hash32 } from '../../web/js/core/rng.js';
import { fbm2, valueNoise2 } from '../../web/js/core/noise.js';
import { MATERIALS, byName, nearestMaterial, isSolid, strengthOf, densityOf, CARVE } from '../../web/js/core/materials.js';

test('мир: записанное читается, счёт вокселей сходится с содержимым', () => {
  const w = new World({ sx: 2, sy: 2, sz: 2 });
  const rng = new Rng(5);
  const ref = new Map();
  for (let i = 0; i < 5000; i++) {
    const x = rng.int(0, 63), y = rng.int(0, 63), z = rng.int(0, 63), m = rng.int(0, 12);
    w.set(x, y, z, m);
    ref.set(`${x},${y},${z}`, m);
  }
  let n = 0;
  for (const [k, m] of ref) {
    const [x, y, z] = k.split(',').map(Number);
    assert.equal(w.get(x, y, z), m);
    if (m) n++;
  }
  assert.equal(w.totalCount(), n);
});

test('мир: ниже нуля - коренная порода, за краями - воздух, запись за край ничего не делает', () => {
  const w = new World({ sx: 1, sy: 1, sz: 1 });
  assert.equal(w.get(5, -1, 5), M.BEDROCK);
  assert.equal(w.get(-1, 5, 5), 0);
  assert.equal(w.get(5, 32, 5), 0);
  assert.equal(w.get(5, 5, 32), 0);
  assert.equal(w.set(40, 1, 1, M.STONE), 0);
  assert.equal(w.set(1, 1, 1, 0), 0);
  assert.equal(w.chunks[0], null, 'воздух не заводит чанк');
  w.set(1, 1, 1, M.STONE);
  assert.equal(w.set(1, 1, 1, M.STONE), M.STONE, 'та же запись - без изменений');
  assert.equal(w.chunks[0].version, 1);
});

test('мир: правка у края чанка помечает соседние чанки, включая диагональные', () => {
  const w = new World({ sx: 3, sy: 3, sz: 3 });
  w.set(32, 32, 32, M.STONE);
  const got = w.takeDirty();
  assert.equal(got.length, 8);
  w.set(48, 48, 48, M.STONE);
  assert.deepEqual(w.takeDirty(), [w.chunkIndex(1, 1, 1)]);
  assert.equal(w.dirty.size, 0);
});

test('мир: копия с каймой совпадает с чтением по одному вокселю', () => {
  const w = new World({ sx: 3, sy: 2, sz: 3 });
  const rng = new Rng(9);
  for (let i = 0; i < 20000; i++) w.set(rng.int(0, 95), rng.int(0, 63), rng.int(0, 95), rng.int(1, 5));
  for (const [cx, cy, cz] of [[1, 0, 1], [0, 1, 2], [2, 1, 0]]) {
    const p = w.padded(cx, cy, cz);
    for (let i = 0; i < p.length; i += 7) {
      const x = i % 34, z = Math.floor(i / 34) % 34, y = Math.floor(i / 34 / 34);
      assert.equal(p[i], w.get(cx * 32 - 1 + x, cy * 32 - 1 + y, cz * 32 - 1 + z));
    }
  }
  const empty = new World({ sx: 2, sy: 1, sz: 1 });
  empty.set(32, 5, 5, M.STONE);
  const p = empty.padded(0, 0, 0);
  assert.equal(p[33 + 34 * (6 + 34 * 6)], M.STONE, 'кайма пустого чанка берётся у соседа');
});

test('луч: находит первый твёрдый воксель и грань входа; мимо - null', () => {
  const w = new World({ sx: 2, sy: 1, sz: 1 });
  w.set(20, 5, 5, M.BRICK);
  const hit = w.raycast(2.5, 5.5, 5.5, 1, 0, 0, 40);
  assert.deepEqual([hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, hit.m], [20, 5, 5, -1, 0, 0, M.BRICK]);
  assert.ok(Math.abs(hit.t - 17.5) < 1e-9);
  const up = w.raycast(20.5, 1.5, 5.5, 0, 1, 0, 40);
  assert.deepEqual([up.y, up.ny], [5, -1]);
  const back = w.raycast(20.5, 5.5, 20.5, 0, 0, -1, 40);
  assert.deepEqual([back.z, back.nz], [5, 1]);
  const down = w.raycast(20.5, 9.5, 5.5, 0, -1, 0, 40);
  assert.deepEqual([down.y, down.ny], [5, 1]);
  const left = w.raycast(30.5, 5.5, 5.5, -1, 0, 0, 40);
  assert.deepEqual([left.x, left.nx], [20, 1]);
  assert.equal(w.raycast(2.5, 5.5, 5.5, 1, 0, 0, 10), null);
  assert.equal(w.raycast(2.5, 5.5, 5.5, 0, 0, 0, 10), null, 'луч без направления никуда не попадает');
  const floor = w.raycast(2.5, 3.5, 2.5, 0, -1, 0, 10);
  assert.equal(floor.m, M.BEDROCK, 'ниже мира - порода');
});

test('случайность: одно зерно - одна последовательность, строки дают зерно', () => {
  const a = new Rng(42), b = new Rng(42);
  const sa = Array.from({ length: 50 }, () => a.next()), sb = Array.from({ length: 50 }, () => b.next());
  assert.deepEqual(sa, sb);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
  assert.notDeepEqual(sa, Array.from({ length: 50 }, ((r) => () => r.next())(new Rng(43))));
  assert.equal(seedFrom('123'), 123);
  assert.equal(seedFrom(77.9), 77);
  assert.equal(seedFrom('город'), seedFrom('город'));
  assert.notEqual(seedFrom('город'), seedFrom('природа'));
  assert.equal(seedFrom(null), seedFrom(''));
  const r = new Rng(1);
  for (let i = 0; i < 200; i++) {
    const v = r.int(3, 6);
    assert.ok(v >= 3 && v <= 6 && Number.isInteger(v));
    assert.ok(r.range(2, 4) >= 2);
  }
  assert.equal(typeof r.chance(0.5), 'boolean');
  assert.ok(['a', 'b'].includes(r.pick(['a', 'b'])));
  assert.notEqual(r.fork(1).next(), r.fork(2).next());
  assert.equal(hash32(1, 2, 3), hash32(1, 2, 3));
});

test('шум: гладкий и в пределах [0, 1)', () => {
  for (let i = 0; i < 500; i++) {
    const x = i * 0.137, z = i * 0.071;
    const v = fbm2(3, x, z);
    assert.ok(v >= 0 && v < 1);
    assert.ok(Math.abs(valueNoise2(3, x, z) - valueNoise2(3, x + 0.001, z)) < 0.01);
  }
});

test('материалы: имена, прочность, ближайший по цвету', () => {
  assert.equal(byName('brick').id, M.BRICK);
  assert.equal(byName('нет'), null);
  assert.equal(strengthOf(M.BEDROCK), Infinity);
  assert.equal(strengthOf(200), 0);
  assert.equal(densityOf(200), 0);
  assert.ok(densityOf(M.METAL) > densityOf(M.PLANK));
  assert.equal(isSolid(CARVE), false);
  assert.equal(isSolid(0), false);
  assert.equal(isSolid(M.DIRT), true);
  assert.equal(nearestMaterial(...MATERIALS[M.BRICK].color), M.BRICK);
  assert.equal(nearestMaterial(...MATERIALS[M.BRICK].color, [M.GLASS, M.METAL]) !== M.BRICK, true);
  assert.notEqual(nearestMaterial(52, 50, 56), M.BEDROCK, 'породу из цвета не получить');
});
