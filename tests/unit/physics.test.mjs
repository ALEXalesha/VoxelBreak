// Законы физики обломков: падает и ложится, не проваливается, стопка стоит, одинаковый вход -
// одинаковый результат, сон и пробуждение, столкновения тел, улёт за мир.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, M } from './helpers.mjs';
import { Physics, sphereVsCubes, GRAVITY } from '../../web/js/core/physics.js';
import { Destruction } from '../../web/js/core/destruction.js';
import { bodyFromVoxels, Body, MAX_SAMPLES } from '../../web/js/core/body.js';
import { qfromAxisAngle, qmul, inv3, len } from '../../web/js/core/math.js';

function flat() {
  const w = new World({ sx: 2, sy: 1, sz: 2 });
  for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) for (let y = 0; y < 5; y++) w.set(x, y, z, y < 2 ? M.BEDROCK : M.DIRT, true);
  return w;
}
const bar = (x0, y0, z0, sx, sy, sz, m = M.BRICK) => {
  const l = [];
  for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) l.push([x0 + x, y0 + y, z0 + z, m]);
  return bodyFromVoxels(0, l);
};
const lowest = (b) => { b.syncR(); return Math.min(...b.voxelsWorld().map((v) => v[1])) - 0.5; };

test('ящик падает с высоты, ложится на землю без проникания и засыпает', () => {
  const ph = new Physics(flat());
  const b = ph.add(bar(10, 30, 10, 4, 4, 4));
  let minLow = Infinity, steps = 0;
  while (!b.sleeping && steps < 600) { ph.step(); minLow = Math.min(minLow, lowest(b)); steps++; }
  assert.ok(b.sleeping, 'уснул');
  assert.ok(steps < 240, `за ${steps} шагов`);
  assert.ok(Math.abs(lowest(b) - 5) < 0.06, `стоит на земле: ${lowest(b)}`);
  assert.ok(minLow > 5 - 0.4, `не проваливался: ${minLow}`);
});

test('свободное падение по закону g: за 0,5 с - около g t² / 2', () => {
  const ph = new Physics(flat());
  const b = ph.add(bar(10, 50, 10, 2, 2, 2));
  const y0 = b.pos[1];
  for (let i = 0; i < 30; i++) ph.step();
  const fall = y0 - b.pos[1];
  assert.ok(Math.abs(fall - GRAVITY * 0.125) < GRAVITY * 0.125 * 0.05, `${fall}`);
});

test('наклонная доска падает, ложится плашмя и не тонет', () => {
  const ph = new Physics(flat());
  const b = ph.add(bar(30, 25, 30, 16, 2, 3, M.PLANK));
  b.q = qfromAxisAngle(1, 0.3, 0.5, 0.9);
  let minLow = Infinity;
  for (let i = 0; i < 600 && !b.sleeping; i++) { ph.step(); minLow = Math.min(minLow, lowest(b)); }
  assert.ok(b.sleeping);
  assert.ok(minLow > 4.6, `${minLow}`);
  b.syncR();
  const top = Math.max(...b.voxelsWorld().map((v) => v[1]));
  assert.ok(top - lowest(b) < 3.6, 'лежит плашмя');
});

test('стопка из трёх ящиков стоит и не расползается', () => {
  const ph = new Physics(flat());
  const s = [ph.add(bar(40, 5, 40, 6, 6, 6)), ph.add(bar(40, 11.02, 40, 6, 6, 6)), ph.add(bar(41, 17.04, 41, 4, 4, 4))];
  const x0 = s.map((b) => [b.pos[0], b.pos[2]]);
  for (let i = 0; i < 300; i++) ph.step();
  s.forEach((b, i) => {
    assert.ok(b.sleeping, `ящик ${i} спит`);
    assert.ok(Math.hypot(b.pos[0] - x0[i][0], b.pos[2] - x0[i][1]) < 0.3, `ящик ${i} не уехал`);
  });
  assert.ok(Math.abs(lowest(s[2]) - 17) < 0.15, `${lowest(s[2])}`);
});

test('одинаковый вход - одинаковый результат до последнего бита', () => {
  const run = () => {
    const w = flat();
    const ph = new Physics(w), de = new Destruction(w, ph);
    for (let i = 0; i < 6; i++) ph.add(bar(10 + i * 7, 12 + i * 3, 20 + (i % 2), 3 + i, 2, 3));
    de.explode(25, 10, 20, 6);
    for (let i = 0; i < 200; i++) { ph.step(); de.update(1 / 60); }
    return ph.bodies.map((b) => [b.id, ...b.pos, ...b.q]);
  };
  assert.deepEqual(run(), run());
});

test('сон: спящее не двигается; пропала опора - просыпается и падает', () => {
  const w = flat();
  for (let y = 5; y < 15; y++) w.set(20, y, 20, M.WOOD);
  const ph = new Physics(w), de = new Destruction(w, ph);
  const b = ph.add(bar(18, 15, 18, 5, 2, 5));
  for (let i = 0; i < 120; i++) ph.step();
  assert.ok(b.sleeping);
  const y = b.pos[1];
  for (let i = 0; i < 60; i++) ph.step();
  assert.equal(b.pos[1], y, 'спит и не дрожит');
  de.sphere(20.5, 14.5, 20.5, 1.2, 20);
  assert.equal(b.sleeping, false, 'проснулся');
  for (let i = 0; i < 120; i++) ph.step();
  assert.ok(b.pos[1] < y - 0.5, 'упал');
});

test('толчок: импульс будит и двигает тело, вращает от плеча', () => {
  const ph = new Physics(flat());
  const b = ph.add(bar(10, 5, 10, 4, 4, 4));
  b.sleeping = true;
  ph.applyImpulse(b, [b.pos[0], b.pos[1] + 2, b.pos[2]], [b.mass * 10, 0, 0]);
  assert.equal(b.sleeping, false);
  assert.ok(Math.abs(b.v[0] - 10) < 1e-9);
  assert.ok(Math.abs(b.w[2]) > 0.1, 'удар выше центра крутит');
  ph.applyImpulse(b, b.pos, [b.mass * 1e4, 0, 0]);
  assert.ok(len(b.v) <= 70 + 1e-9, 'скорость ограничена');
});

test('тела не проходят друг сквозь друга: малый ящик ложится на большой', () => {
  const ph = new Physics(flat());
  const big = ph.add(bar(20, 5, 20, 12, 4, 12, M.CONCRETE));
  const small = ph.add(bar(24, 20, 24, 3, 3, 3));
  for (let i = 0; i < 300; i++) ph.step();
  assert.ok(lowest(small) > 9 - 0.3, `лежит сверху: ${lowest(small)}`);
  assert.ok(big.sleeping && small.sleeping);
  // сильный удар будит спящего
  const fast = ph.add(bar(25, 30, 25, 2, 2, 2));
  fast.v = [0, -60, 0];
  let woke = false;
  for (let i = 0; i < 60; i++) { ph.step(); if (!small.sleeping) woke = true; }
  assert.ok(woke, 'удар разбудил');
});

test('улетевшее за край мира удаляется и учитывается', () => {
  const ph = new Physics(flat());
  ph.add(bar(-20, 10, 10, 2, 2, 2));
  for (let i = 0; i < 200; i++) ph.step();
  assert.equal(ph.bodies.length, 0);
  assert.equal(ph.lost, 8);
});

test('касание шара с кубиками: снаружи - от кубика, внутри - через открытую грань', () => {
  const solid = new Set(['0,0,0', '0,1,0']);
  const get = (x, y, z) => solid.has(`${x},${y},${z}`);
  const out = sphereVsCubes(0.5, 2.3, 0.5, get);
  assert.ok(Math.abs(out[1] - 1) < 1e-9 && Math.abs(out[3] - 0.2) < 1e-9);
  const inside = sphereVsCubes(0.5, 1.9, 0.5, get);
  assert.deepEqual(inside.slice(0, 3), [0, 1, 0]);
  assert.equal(sphereVsCubes(5, 5, 5, get), null);
  const side = sphereVsCubes(0.1, 0.5, 0.5, get);
  assert.deepEqual(side.slice(0, 3), [-1, 0, 0], 'изнутри к ближней открытой грани');
  const buried = sphereVsCubes(0.5, 0.5, 0.5, () => true);
  assert.deepEqual(buried.slice(0, 3), [0, 1, 0], 'всё закрыто - вверх');
});

test('тело: масса, центр масс, точки касания ограничены', () => {
  const b = bar(0, 0, 0, 40, 10, 10);
  assert.ok(b.samples.length / 3 <= MAX_SAMPLES);
  assert.ok(b.samples.length / 3 >= 100);
  assert.deepEqual(b.com, [20, 5, 5]);
  assert.ok(b.mass > 0 && b.invMass > 0);
  const empty = new Body(1, 1, 1, 1, new Uint8Array(1));
  assert.equal(empty.invMass, 0);
  assert.deepEqual(inv3([0, 0, 0, 0, 0, 0, 0, 0, 0]), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const q = qmul(qfromAxisAngle(0, 1, 0, 0.5), qfromAxisAngle(0, 1, 0, 0.5));
  assert.ok(Math.abs(q[1] - Math.sin(0.5)) < 1e-12);
});
