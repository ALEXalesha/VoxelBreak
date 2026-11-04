// Законы игрока: ходит, упирается в стены, шагает на ступеньку до 0,5 м, прыгает на 1,15 м,
// приседает, летает, стоит на обломках и толкает их.
import test from 'node:test';
import assert from 'node:assert/strict';
import { World, M } from './helpers.mjs';
import { newPlayer, stepPlayer, collides, lookDir, eyeY, P } from '../../web/js/game/player.js';
import { bodyFromVoxels } from '../../web/js/core/body.js';

function flat() {
  const w = new World({ sx: 2, sy: 1, sz: 2 });
  for (let x = 0; x < 64; x++) for (let z = 0; z < 64; z++) for (let y = 0; y < 5; y++) w.set(x, y, z, M.DIRT, true);
  return w;
}
const run = (w, p, input, seconds, bodies = []) => { let pushes = []; for (let i = 0; i < Math.round(seconds * 60); i++) pushes = pushes.concat(stepPlayer(w, p, input, 1 / 60, bodies)); return pushes; };

test('игрок стоит на земле и идёт вперёд со скоростью шага', () => {
  const w = flat(), p = newPlayer(20.5, 8, 60.5);
  run(w, p, {}, 1);
  assert.equal(p.y, 5);
  assert.equal(p.onGround, true);
  p.yaw = 0;
  const z0 = p.z;
  run(w, p, { mz: 1 }, 1);
  assert.ok(z0 - p.z > P.WALK * 0.75 && z0 - p.z < P.WALK * 1.05, `${z0 - p.z}`);
  const z1 = p.z;
  run(w, p, { mz: 1, run: true }, 1);
  assert.ok(z1 - p.z > P.WALK * 1.2, 'бег быстрее шага');
  run(w, p, { mx: 1, mz: 1 }, 1);
  assert.ok(Math.hypot(p.vx, p.vz) <= P.WALK * 1.01, 'по диагонали не быстрее');
});

test('стена держит, ступенька до 2 вокселей - шагом, 3 - нет', () => {
  const w = flat();
  for (let x = 0; x < 64; x++) for (let z = 30; z < 64; z++) for (let y = 5; y < 7; y++) w.set(x, y, z, M.BRICK);   // помост на 2
  for (let x = 0; x < 64; x++) for (let y = 7; y < 10; y++) w.set(x, y, 45, M.BRICK);                             // стена 3 над помостом
  const p = newPlayer(20.5, 5, 25);
  p.yaw = Math.PI;                       // смотрит на +z
  run(w, p, {}, 0.2);
  run(w, p, { mz: 1 }, 0.6);
  assert.equal(p.y, 7, 'поднялся на помост');
  run(w, p, { mz: 1 }, 2);
  assert.equal(p.y, 7);
  assert.ok(p.z < 45 - P.HALF + 1e-6 && p.z > 42, `упёрся в стену: ${p.z}`);
  assert.equal(collides(w, p), false);
});

test('прыжок на 1,15 м и обратно на землю; потолок не пускает выше', () => {
  const w = flat(), p = newPlayer(20.5, 5, 20.5);
  run(w, p, {}, 0.1);
  let top = 0;
  stepPlayer(w, p, { jump: true }, 1 / 60);
  for (let i = 0; i < 90; i++) { stepPlayer(w, p, {}, 1 / 60); top = Math.max(top, p.y); }
  assert.ok(Math.abs(top - 5 - 1.15 / 0.25) < 0.3, `${top - 5}`);
  assert.equal(p.y, 5);
  for (let x = 15; x < 25; x++) for (let z = 15; z < 25; z++) w.set(x, 13, z, M.CONCRETE);
  stepPlayer(w, p, { jump: true }, 1 / 60);
  for (let i = 0; i < 90; i++) stepPlayer(w, p, {}, 1 / 60);
  assert.equal(p.y, 5, 'ударился головой и упал обратно');
});

test('присед: ниже и медленнее; под низким потолком не встать', () => {
  const w = flat(), p = newPlayer(20.5, 5, 20.5);
  run(w, p, { crouch: true }, 0.1);
  assert.equal(p.crouch, true);
  assert.ok(eyeY(p) < 5 + P.EYE);
  for (let x = 15; x < 25; x++) for (let z = 15; z < 25; z++) w.set(x, 11, z, M.CONCRETE);
  run(w, p, {}, 0.1);
  assert.equal(p.crouch, true, 'встать некуда');
  for (let x = 15; x < 25; x++) for (let z = 15; z < 25; z++) w.set(x, 11, z, 0);
  run(w, p, {}, 0.1);
  assert.equal(p.crouch, false);
});

test('полёт: вверх и вниз без тяжести', () => {
  const w = flat(), p = newPlayer(20.5, 10, 20.5);
  p.flying = true;
  run(w, p, { up: true }, 1);
  assert.ok(p.y > 30);
  const y = p.y;
  run(w, p, {}, 1);
  assert.ok(Math.abs(p.y - y) < 3, 'висит');
  run(w, p, { down: true, run: true }, 3);
  assert.equal(p.y, 5);
  const d = lookDir({ yaw: 0, pitch: 0 });
  assert.deepEqual(d.map((v) => Math.round(v) + 0), [0, 0, -1]);
});

test('обломки: на них стоят, в них упираются и толкают', () => {
  const w = flat();
  const list = [];
  for (let x = 0; x < 10; x++) for (let z = 0; z < 10; z++) list.push([15 + x, 5, 15 + z, M.CONCRETE]);
  const slab = bodyFromVoxels(1, list);
  const p = newPlayer(20.5, 8, 20.5);
  run(w, p, {}, 1, [slab]);
  assert.ok(p.y >= 5.9, `стоит на плите: ${p.y}`);
  const box = [];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 8; y++) for (let z = 0; z < 4; z++) box.push([40 + x, 5 + y, 20 + z, M.PLANK]);
  const crate = bodyFromVoxels(2, box);
  const q = newPlayer(36, 5, 22);
  q.yaw = -Math.PI / 2;                  // смотрит на +x
  const pushes = run(w, q, { mz: 1 }, 1, [crate]);
  assert.ok(pushes.length > 0 && pushes[0].body === crate, 'толкает ящик');
  assert.ok(q.x < 41, 'не прошёл сквозь');
});

test('персонаж: скелет цел, части на своих костях, рост как у игрока; шаг - руки и ноги в противофазе', async () => {
  const { assets } = await import('./helpers.mjs');
  const { checkRig, pose } = await import('../../web/js/game/character.js');
  const rig = assets.get('character');
  assert.equal(checkRig(rig), null);
  assert.ok(Math.abs(rig.height * rig.voxel - P.HEIGHT) < 0.5, 'рост как у игрока');
  assert.match(checkRig({ bones: [{ name: 'a', parent: 'b' }], parts: [] }), /нет родителя/);
  assert.match(checkRig({ bones: [{ name: 'a', parent: null }, { name: 'a', parent: null }], parts: [] }), /повторяется/);
  assert.match(checkRig({ bones: [{ name: 'a', parent: null }], parts: [{ bone: 'z' }] }), /несуществующей/);
  const st = {};
  const walk = { vx: 18, vz: 0, onGround: true, pitch: 0.3 };
  let maxSwing = 0;
  for (let i = 0; i < 60; i++) {
    const a = pose(st, walk, 1 / 60);
    assert.ok(Math.abs(a['leg.L'][0] + a['leg.R'][0]) < 1e-9, 'ноги в противофазе');
    assert.ok(Math.abs(a['arm.L'][0] + a['leg.L'][0]) < 1e-9, 'рука идёт с другой ногой');
    maxSwing = Math.max(maxSwing, Math.abs(a['leg.L'][0]));
  }
  assert.ok(maxSwing > 0.5);
  const still = pose({}, { vx: 0, vz: 0, onGround: true }, 1 / 60);
  assert.equal(still['leg.L'][0], 0, 'стоя ноги прямо');
  const jump = pose({}, { vx: 0, vz: 0, onGround: false, crouch: true }, 1 / 60);
  assert.ok(jump['arm.L'][2] < 0 && jump.spine[0] > 0);
});
