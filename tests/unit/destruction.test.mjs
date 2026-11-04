// Законы разрушения: висящих кусков нет, масса сохраняется, взрыв радиуса R убирает ожидаемое,
// кусок без опоры падает, горючее даёт цепную реакцию, тела раскалываются, бюджет тел держится.
import test from 'node:test';
import assert from 'node:assert/strict';
import { smallWorld, floatingVoxels, World, M } from './helpers.mjs';
import { Physics } from '../../web/js/core/physics.js';
import { Destruction, carveWorld, MAX_BODIES, MIN_BODY, cropBody } from '../../web/js/core/destruction.js';
import { bodyFromVoxels, bodyFromModel } from '../../web/js/core/body.js';
import { findFloating, gridComponents } from '../../web/js/core/connectivity.js';
import { Rng } from '../../web/js/core/rng.js';
import { assets } from './helpers.mjs';
import { qfromAxisAngle } from '../../web/js/core/math.js';

function flatWorld(sx = 2, sz = 2, h = 5) {
  const w = new World({ sx, sy: 1, sz });
  for (let x = 0; x < w.nx; x++) for (let z = 0; z < w.nz; z++) for (let y = 0; y < h; y++) w.set(x, y, z, y < 2 ? M.BEDROCK : M.DIRT, true);
  return w;
}
const box = (w, x0, y0, z0, x1, y1, z1, m) => { for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) w.set(x, y, z, m); };
const bar = (x0, y0, z0, sx, sy, sz, m = M.BRICK) => {
  const l = [];
  for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) l.push([x0 + x, y0 + y, z0 + z, m]);
  return bodyFromVoxels(0, l);
};

test('после разрушения не остаётся висящих кусков: всё оторванное становится телом', () => {
  for (const [seed, kind] of [[1, 'town'], [2, 'nature'], [3, 'mixed']]) {
    const { plan, world } = smallWorld({ seed, kind, sx: 4, sy: 2, sz: 4 });
    const ph = new Physics(world), de = new Destruction(world, ph);
    const rng = new Rng(seed * 31);
    const targets = plan.structures.filter((s) => ['house', 'bridge', 'tree', 'pole', 'fence'].includes(s.id));
    for (let i = 0; i < 24; i++) {
      const s = rng.pick(targets);
      const x = rng.range(s.x, s.x1), y = rng.range(s.y, Math.min(s.y1, s.y + 20)), z = rng.range(s.z, s.z1);
      de.sphere(x, y, z, rng.range(1, 7), rng.range(2, 14), { impulse: rng.chance(0.5) ? 20 : 0 });
      if (i % 6 === 5) assert.equal(floatingVoxels(world), 0, `${kind}, удар ${i}`);
    }
  }
});

test('масса сохраняется: в мире + в телах + выбито + пыль = было, и при ударах по телам, и после падения', () => {
  const { world } = smallWorld({ seed: 5, kind: 'town', sx: 4, sy: 2, sz: 4 });
  const ph = new Physics(world), de = new Destruction(world, ph);
  const start = de.total();
  const rng = new Rng(8);
  for (let i = 0; i < 30; i++) {
    de.sphere(rng.range(10, 118), rng.range(8, 40), rng.range(10, 118), rng.range(2, 8), 12, { impulse: 25 });
    for (let k = 0; k < 10; k++) { ph.step(); de.update(1 / 60); }
    assert.equal(de.total(), start, `шаг ${i}`);
  }
  assert.ok(ph.bodies.length > 0, 'тела появились');
  // удары прямо по телам: раскол и пыль тоже в счёте
  for (const b of ph.bodies.slice(0, 20)) de.sphere(b.pos[0], b.pos[1], b.pos[2], 1.5, 12);
  assert.equal(de.total(), start);
});

test('оторванное = исчезнувшее из мира: вокселей тел ровно столько, сколько пропало сверх выбитого', () => {
  const w = flatWorld();
  box(w, 20, 5, 20, 22, 15, 22, M.CONCRETE);          // столб
  box(w, 15, 15, 15, 27, 16, 27, M.CONCRETE);         // плита на столбе
  const ph = new Physics(w), de = new Destruction(w, ph);
  const before = w.totalCount();
  const rep = de.sphere(21, 8.5, 21, 1.6, 20);
  const inBodies = ph.bodies.reduce((n, b) => n + b.count, 0);
  assert.equal(before - w.totalCount(), rep.removedWorld + inBodies + de.dust);
  assert.equal(rep.bodies.length, 1);
  const n = rep.bodies[0].count;
  assert.ok(n >= 144 + 16 && n <= 144 + 24 && (n - 144) % 4 === 0, `плита и верх столба: ${n}`);
  assert.equal(floatingVoxels(w), 0);
});

test('кусок без опоры падает и ложится; конструкция с опорой стоит', () => {
  const w = flatWorld();
  box(w, 20, 5, 20, 22, 15, 22, M.CONCRETE);
  box(w, 15, 15, 15, 27, 16, 27, M.CONCRETE);
  box(w, 40, 5, 40, 42, 15, 42, M.CONCRETE);          // второй столб - его не трогаем
  const ph = new Physics(w), de = new Destruction(w, ph);
  de.sphere(21, 9.5, 21, 1.6, 20);
  const b = ph.bodies[0];
  const y0 = b.pos[1];
  for (let i = 0; i < 600 && !b.sleeping; i++) ph.step();
  assert.ok(b.pos[1] < y0 - 2, `упал: ${y0} -> ${b.pos[1]}`);
  assert.equal(b.sleeping, true, 'лёг и уснул');
  assert.equal(w.get(41, 14, 41), M.CONCRETE, 'целый столб стоит');
});

test('взрыв радиуса R убирает ожидаемое: всё в ядре, ничего дальше 1,15 R, объём в пределах', () => {
  for (const R of [3, 5, 8]) {
    const w = new World({ sx: 2, sy: 2, sz: 2 });
    box(w, 0, 0, 0, 64, 2, 64, M.BEDROCK);
    box(w, 0, 2, 0, 64, 60, 64, M.CONCRETE);
    const c = [32, 30, 32];
    const removed = carveWorld(w, ...c, R, 12, 9);
    const dist = removed.map(([x, y, z]) => Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1], z + 0.5 - c[2]));
    assert.ok(Math.max(...dist) <= 1.15 * R + 1e-9, 'дальше края не бьёт');
    for (let x = 0; x < 64; x++) for (let y = 2; y < 60; y++) for (let z = 0; z < 64; z++)
      if (Math.hypot(x + 0.5 - c[0], y + 0.5 - c[1], z + 0.5 - c[2]) <= 0.85 * R * 0.5) assert.equal(w.get(x, y, z), 0, 'ядро выбито');
    const vol = (r) => 4 / 3 * Math.PI * r ** 3;
    assert.ok(removed.length >= vol(0.85 * R) * 0.7 && removed.length <= vol(1.15 * R) * 1.15, `R ${R}: ${removed.length}`);
  }
  const w = flatWorld();
  box(w, 10, 5, 10, 14, 9, 14, M.METAL);
  assert.equal(carveWorld(w, 12, 7, 12, 1.5, 2.5).length, 0, 'молот не берёт металл');
  assert.equal(carveWorld(w, 12, 1, 12, 6, 1000).filter((v) => v[3] === M.BEDROCK).length, 0, 'коренную породу не выбить');
});

test('стекло бьётся дальше остального', () => {
  const w = flatWorld();
  box(w, 10, 10, 10, 30, 11, 11, M.GLASS);
  box(w, 10, 12, 10, 30, 13, 11, M.PLANK);
  const removed = carveWorld(w, 20, 11.5, 10.5, 4, 4);
  const far = (m) => Math.max(0, ...removed.filter((v) => v[3] === m).map((v) => Math.abs(v[0] + 0.5 - 20)));
  assert.ok(far(M.GLASS) > far(M.PLANK));
});

test('цепная реакция: взрыв зажигает соседние бочки по очереди, горючего не остаётся', () => {
  const w = flatWorld(3, 1);
  const ph = new Physics(w), de = new Destruction(w, ph);
  const barrel = assets.get('barrel');
  const bodies = [0, 1, 2, 3, 4].map((k) => ph.add(bodyFromModel(0, barrel, 10 + k * 8, 5, 20)));
  for (const b of bodies) b.sleeping = true;
  const fuel = () => ph.bodies.reduce((n, b) => n + Array.from(b.data).filter((m) => m === M.EXPLOSIVE).length, 0);
  assert.ok(fuel() > 0);
  de.explode(12.5, 7, 22.5, 4);
  let waves = 0;
  for (let i = 0; i < 120; i++) { ph.step(); waves += de.update(1 / 60); }
  assert.equal(fuel(), 0, 'все бочки сгорели');
  assert.ok(waves >= 4, `взрывы шли по очереди: ${waves}`);
  // горючее в самом мире вспыхивает целиком
  const w2 = flatWorld();
  box(w2, 10, 5, 10, 13, 9, 13, M.EXPLOSIVE);
  const de2 = new Destruction(w2, new Physics(w2));
  const rep = de2.sphere(10.5, 5.5, 10.5, 1, 3);
  assert.ok(rep.explosive.length >= 1);
  assert.equal(w2.get(12, 8, 12), 0);
});

test('тело раскалывается: удар посередине бруска даёт два тела там же, где были воксели', () => {
  const w = flatWorld();
  const ph = new Physics(w), de = new Destruction(w, ph);
  const b = ph.add(bar(10, 20, 10, 21, 2, 2));
  b.q = qfromAxisAngle(0, 1, 0, 0.4); b.syncR();
  b.w = [0, 1, 0];
  const before = b.voxelsWorld();
  const centre = b.toWorld([0, 0, 0]);
  de.sphere(centre[0], centre[1], centre[2], 1.2, 12);
  assert.equal(ph.bodies.length, 2);
  const after = ph.bodies.flatMap((x) => (x.syncR(), x.voxelsWorld()));
  const key = (v) => v.slice(0, 3).map((n) => n.toFixed(3)).join(',');
  const set = new Set(before.map(key));
  for (const v of after) assert.ok(set.has(key(v)), 'кусок остался на своём месте');
  assert.equal(before.length, after.length + de.destroyed + de.dust);
  assert.notDeepEqual(ph.bodies[0].v, ph.bodies[1].v, 'вращение даёт кускам разные скорости');
});

test('удар по телу целиком или до крошек: тело исчезает, крошки - в пыль', () => {
  const w = flatWorld();
  const ph = new Physics(w), de = new Destruction(w, ph);
  const small = ph.add(bar(10, 20, 10, 2, 2, 2));
  de.sphere(small.pos[0], small.pos[1], small.pos[2], 3, 20);
  assert.equal(ph.bodies.length, 0);
  const plus = ph.add(bar(30, 20, 30, 7, 1, 1));
  de.sphere(plus.pos[0], plus.pos[1], plus.pos[2], 0.6, 20);
  assert.equal(ph.bodies.length, 0, '3 + 3 вокселя - обе части пыль');
  assert.equal(de.dust, 6);
});

test('бюджет тел: сверх предела мелкие тела рассыпаются в пыль, счёт сходится', () => {
  const w = flatWorld(4, 4);
  const ph = new Physics(w), de = new Destruction(w, ph);
  for (let i = 0; i < MAX_BODIES + 50; i++) ph.add(bar(2 + (i % 40) * 3, 10 + Math.floor(i / 1600) * 3, 2 + Math.floor(i / 40) * 3, 2, 1 + (i % 3), 2));
  const before = de.total();
  de.enforceBudget();
  assert.equal(ph.bodies.length, MAX_BODIES);
  assert.equal(de.total(), before);
  assert.ok(de.dust > 0);
  assert.equal(de.enforceBudget(), 0);
});

test('связность: опора по кратчайшему пути вниз, предохранитель на огромные куски, части сетки', () => {
  const w = flatWorld();
  box(w, 10, 5, 10, 11, 20, 11, M.WOOD);
  box(w, 30, 10, 30, 34, 14, 34, M.STONE);               // висит
  const key = (x, y, z) => x + w.nx * (z + w.nz * y);
  const comps = findFloating(w, [key(10, 19, 10), key(31, 11, 31), key(31, 12, 31), key(50, 50, 50)]);
  assert.equal(comps.length, 1);
  assert.equal(comps[0].size, 64);
  assert.equal(findFloating(w, [key(31, 11, 31)], { limit: 10 }).length, 0, 'больше предела - считается опёртым');
  const data = new Uint8Array(27);
  data[0] = 1; data[26] = 1; data[1] = 1;
  assert.deepEqual(gridComponents(data, 3, 3, 3).map((c) => c.length).sort(), [1, 2]);
  assert.ok(MIN_BODY >= 2);
});

test('ужатие сетки тела не двигает воксели в мире', () => {
  const b = bar(5, 5, 5, 6, 3, 4);
  b.q = qfromAxisAngle(1, 2, 3, 1.1); b.syncR();
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) for (let z = 0; z < 4; z++) b.data[b.idx(x, y, z)] = 0;
  const keep = b.voxelsWorld();
  cropBody(b);
  assert.equal(b.sx, 3);
  const after = b.voxelsWorld();
  assert.equal(after.length, keep.length);
  for (let i = 0; i < keep.length; i++) for (let k = 0; k < 3; k++) assert.ok(Math.abs(keep[i][k] - after[i][k]) < 1e-9);
});

test('удар о землю: тяжёлая плита с высоты раскалывается, ящик с малой высоты цел; масса сходится', () => {
  const w = flatWorld(3, 3);
  const ph = new Physics(w), de = new Destruction(w, ph);
  const start = de.total();
  const slab = ph.add(bar(20, 45, 20, 14, 3, 14, M.BRICK));
  const crate = ph.add(bar(70, 7, 70, 3, 3, 3, M.PLANK));
  const total0 = de.total();
  for (let i = 0; i < 300; i++) { de.update(1 / 60); ph.step(); }
  assert.ok(de.destroyed > 0, 'плита откололась в месте удара');
  assert.ok(ph.bodies.length > 2 || ph.bodies.find((b) => b === slab).count < 14 * 3 * 14, 'раскололась');
  assert.equal(crate.count, 27, 'ящик с 0,5 м цел');
  assert.equal(de.total(), total0);
  assert.ok(total0 > start);
  assert.ok(de.events.some((e) => e.type === 'crack'));
});
