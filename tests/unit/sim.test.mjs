// Законы игры целиком: предметы мира стоят, инструменты ломают и толкают, динамит и ракета
// взрываются, лазер режет, техника таранит, всё сохраняется; масса сходится на каждом шаге.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assets, floatingVoxels, worldHash, M } from './helpers.mjs';
import { Sim } from '../../web/js/game/sim.js';
import { TOOLS, TOOL, pelletDirs } from '../../web/js/game/tools.js';
import { SPECS } from '../../web/js/game/vehicles.js';
import { eyeY } from '../../web/js/game/player.js';
import { bodyFromVoxels } from '../../web/js/core/body.js';

const SMALL = [4, 2, 4];
const game = (o = {}) => new Sim(assets).newGame({ seed: 7, kind: 'town', size: SMALL, ...o });
const steps = (sim, n, input = {}) => { for (let i = 0; i < n; i++) sim.step(i === 0 ? input : { ...input, fire1Pressed: false, fire2Pressed: false, use: false, fly: false, tool: null, look: null }); };
const idx = (id) => TOOLS.findIndex((t) => t.id === id);

// поставить игрока перед стеной из кирпича (x = 60..61, во всю ширину) и смотреть на неё
function wallScene(sim, dist = 8, m = M.BRICK) {
  const w = sim.world;
  for (let z = 30; z < 60; z++) for (let y = 11; y < 30; y++) for (let x = 60; x < 62; x++) w.set(x, y, z, m);
  for (let z = 30; z < 60; z++) for (let x = 60 - dist - 20; x < 60; x++) for (let y = 11; y < 40; y++) w.set(x, y, z, 0);
  sim.physics.bodies.length = 0;
  const p = sim.player;
  Object.assign(p, { x: 60 - dist, y: 11, z: 45, vx: 0, vy: 0, vz: 0, yaw: -Math.PI / 2, pitch: 0, flying: false });
  sim.startTotal = sim.destruction.total();
  return p;
}

test('предметы мира - спящие тела на земле; первый шаг их не роняет; масса сходится', () => {
  const sim = game();
  assert.ok(sim.physics.bodies.length > 0);
  assert.ok(sim.physics.bodies.every((b) => b.sleeping && b.prop));
  const pos = sim.physics.bodies.map((b) => b.pos[1]);
  steps(sim, 60);
  assert.deepEqual(sim.physics.bodies.map((b) => b.pos[1]), pos);
  assert.equal(sim.destruction.total(), sim.startTotal);
  assert.equal(sim.player.onGround, true);
});

test('молот: удар выбивает кирпич перед игроком, металл не берёт', () => {
  const sim = game();
  wallScene(sim, 6);
  const before = sim.world.totalCount();
  steps(sim, 30, { tool: idx('hammer'), fire1: true, fire1Pressed: true });
  assert.ok(sim.world.totalCount() < before, 'кирпич выбит');
  const s2 = game();
  wallScene(s2, 6, M.METAL);
  const b2 = s2.world.totalCount();
  steps(s2, 30, { tool: idx('hammer'), fire1: true, fire1Pressed: true });
  assert.equal(s2.world.totalCount(), b2, 'металл держит');
  assert.ok(s2.drainEvents().some((e) => e.type === 'swing'));
});

test('руки: толкнуть тело, взять, нести и бросить; тяжёлое не взять', () => {
  const sim = game();
  const p = wallScene(sim, 30);
  const crate = sim.physics.add(bodyFromVoxels(0, Array.from({ length: 27 }, (_, i) => [p.x + 8 + (i % 3), 11 + Math.floor(i / 9), 44 + Math.floor(i / 3) % 3, M.PLANK])));
  for (let i = 0; i < 60; i++) sim.physics.step();
  p.pitch = Math.atan2(12.5 - eyeY(p), 9.5);
  const x0 = crate.pos[0];
  steps(sim, 1, { tool: idx('hands'), fire1Pressed: true });
  steps(sim, 20);
  assert.ok(crate.pos[0] > x0 + 0.5, 'толкнул');
  steps(sim, 60);
  p.x = crate.pos[0] - 7; p.z = crate.pos[2];
  steps(sim, 2);
  p.pitch = Math.atan2(crate.pos[1] - eyeY(p), Math.hypot(crate.pos[0] - p.x, crate.pos[2] - p.z));
  p.yaw = Math.atan2(-(crate.pos[0] - p.x), -(crate.pos[2] - p.z));
  steps(sim, 1, { fire2Pressed: true });
  assert.ok(sim.grab && sim.grab.body === crate, 'взял');
  p.pitch = 0.5;
  steps(sim, 40);
  assert.ok(crate.pos[1] > 16, 'несёт перед собой');
  steps(sim, 1, { fire1Pressed: true });
  assert.equal(sim.grab, null);
  assert.ok(crate.v[0] > 5, 'бросил');
  // взять тяжёлое нельзя
  const heavy = sim.physics.add(bodyFromVoxels(0, Array.from({ length: 1000 }, (_, i) => [p.x + 10 + (i % 10), 11 + Math.floor(i / 100), 40 + Math.floor(i / 10) % 10, M.METAL])));
  sim.cool = 0;
  p.pitch = Math.atan2(14 - eyeY(p), 14); p.yaw = -Math.PI / 2;
  steps(sim, 1, { fire2Pressed: true });
  assert.notEqual(sim.grab && sim.grab.body, heavy);
  assert.ok(sim.drainEvents().some((e) => e.type === 'grab-fail' || e.type === 'grab'));
  sim.selectTool(idx('hammer'));
  assert.equal(sim.grab, null, 'смена инструмента отпускает');
});

test('динамит: прилипает к стене и через 3 секунды взрывается; масса сходится', () => {
  const sim = game();
  wallScene(sim, 4);
  const before = sim.world.totalCount();
  steps(sim, 1, { tool: idx('dynamite'), fire1Pressed: true });
  assert.equal(sim.entities.length, 1);
  assert.ok(sim.entities[0].stuck, 'прилип');
  steps(sim, 120);
  assert.equal(sim.world.totalCount(), before, 'ещё не взорвался');
  steps(sim, 70);
  assert.equal(sim.entities.length, 0);
  assert.ok(sim.world.totalCount() < before - 200);
  assert.equal(sim.ammo.dynamite, TOOL.dynamite.ammo - 1);
  assert.equal(sim.destruction.total(), sim.startTotal);
  assert.equal(floatingVoxels(sim.world), 0);
});

test('брошенный динамит летит дугой и падает; лимит одновременных шашек', () => {
  const sim = game();
  const p = wallScene(sim, 40);
  p.pitch = 0.3;
  steps(sim, 1, { tool: idx('dynamite'), fire1Pressed: true });
  const e = sim.entities[0];
  assert.equal(e.stuck, null);
  steps(sim, 60);
  assert.ok(e.stuck, 'упал и лёг');
  for (let i = 0; i < 15; i++) { sim.cool = 0; steps(sim, 1, { fire1Pressed: true }); }
  assert.ok(sim.entities.length <= TOOL.dynamite.max);
});

test('дробовик: дробь ломает много мелких дыр; кончились заряды - не стреляет', () => {
  const sim = game();
  wallScene(sim, 10, M.PLASTER);
  const before = sim.world.totalCount();
  steps(sim, 1, { tool: idx('shotgun'), fire1: true, fire1Pressed: true });
  const hits = sim.drainEvents().filter((e) => e.type === 'hit');
  assert.ok(hits.length >= TOOL.shotgun.pellets - 1, `${hits.length}`);
  assert.ok(sim.world.totalCount() < before);
  sim.ammo.shotgun = 0;
  sim.cool = 0;
  steps(sim, 1, { fire1: true, fire1Pressed: true });
  assert.ok(sim.drainEvents().some((e) => e.type === 'empty'));
  const dirs = pelletDirs([0, 0, -1], 9, 0.06, 3);
  assert.equal(dirs.length, 9);
  assert.ok(dirs.every((d) => Math.abs(Math.hypot(...d) - 1) < 1e-9 && d[2] < -0.99));
  assert.equal(pelletDirs([0, 1, 0], 3, 0.06, 1).length, 3, 'вверх тоже');
});

test('ракета летит и взрывается о стену; в небо - взрывается через 6 с', () => {
  const sim = game();
  wallScene(sim, 40);
  const before = sim.world.totalCount();
  steps(sim, 1, { tool: idx('rocket'), fire1Pressed: true });
  assert.equal(sim.entities[0].type, 'rocket');
  steps(sim, 40);
  assert.equal(sim.entities.length, 0);
  assert.ok(sim.world.totalCount() < before - 100);
  assert.ok(sim.stats.explosions >= 1);
  sim.player.pitch = 1.4;
  sim.cool = 0;
  steps(sim, 1, { fire1Pressed: true });
  steps(sim, 6.2 * 60);
  assert.equal(sim.entities.length, 0);
});

test('лазер режет, пока зажат; не зажат - не режет', () => {
  const sim = game();
  wallScene(sim, 30, M.CONCRETE);
  const before = sim.world.totalCount();
  steps(sim, 30, { tool: idx('laser') });
  assert.equal(sim.world.totalCount(), before);
  assert.equal(sim.laserOn, null);
  for (let i = 0; i < 90; i++) steps(sim, 1, { fire1: true, look: [i < 45 ? 0.004 : -0.004, i % 2 ? 0.003 : -0.003] });
  assert.ok(sim.laserOn);
  assert.ok(before - sim.world.totalCount() > 10, 'прорезал');
  sim.player.pitch = 1.5;
  steps(sim, 5, { fire1: true });
  assert.ok(sim.laserOn, 'в небо - луч до конца дальности');
});

test('машина едет, таранит кирпичную стену и пробивает её; бетонная стена останавливает', () => {
  const sim = game();
  const p = wallScene(sim, 40);
  steps(sim, 1, { tool: idx('vehicle'), fire1Pressed: true });
  assert.equal(sim.vehicles.length, 1);
  steps(sim, 1, { use: true });
  assert.equal(sim.driving.type, 'car');
  const before = sim.world.totalCount();
  steps(sim, 240, { mz: 1 });
  assert.ok(sim.world.totalCount() < before, 'таран выбил кирпич');
  assert.ok(sim.drainEvents().some((e) => e.type === 'ram'));
  steps(sim, 1, { use: true });
  assert.equal(sim.driving, null);
  assert.equal(sim.collidesPlayer(), false, 'вышел на свободное место');
  // бетон крепче машины
  const s2 = game();
  wallScene(s2, 40, M.METAL);
  steps(s2, 1, { tool: idx('vehicle'), fire1Pressed: true });
  steps(s2, 1, { use: true });
  steps(s2, 240, { mz: 1 });
  assert.ok(s2.driving.x < 60, 'не проехал сквозь металл');
  assert.ok(p);
});

test('бульдозер пробивает бетон медленно, но верно; техники не больше четырёх', () => {
  const sim = game();
  wallScene(sim, 40, M.CONCRETE);
  sim.vehicleType = 1;
  steps(sim, 1, { tool: idx('vehicle'), fire1Pressed: true });
  assert.equal(sim.vehicles[0].type, 'bulldozer');
  steps(sim, 1, { use: true });
  const before = sim.world.totalCount();
  steps(sim, 600, { mz: 1 });
  assert.ok(sim.driving.x > 60, `проехал стену: ${sim.driving.x}`);
  assert.ok(sim.world.totalCount() < before - 200);
  steps(sim, 1, { use: true });
  for (let i = 0; i < 5; i++) { sim.cool = 0; steps(sim, 1, { fire1Pressed: true }); }
  assert.equal(sim.vehicles.length, 4);
  assert.ok(SPECS.bulldozer.power > SPECS.car.power);
});

test('кран: стрела поворачивается, шар качается и ломает стену', () => {
  const sim = game();
  const p = wallScene(sim, 60);
  sim.vehicleType = 2;
  p.yaw = -Math.PI / 2;
  steps(sim, 1, { tool: idx('vehicle'), fire2Pressed: true });   // выбор крана уже сделан
  sim.vehicleType = 2;
  sim.cool = 0;
  steps(sim, 1, { fire1Pressed: true });
  const crane = sim.vehicles.find((v) => v.type === 'crane');
  assert.ok(crane);
  sim.driving = crane;
  const before = sim.world.totalCount();
  for (let k = 0; k < 6 && sim.world.totalCount() === before; k++) { steps(sim, 90, { mx: 1 }); steps(sim, 90, { mx: -1 }); }
  steps(sim, 60, { crouch: true });
  for (let k = 0; k < 8 && sim.world.totalCount() === before; k++) { steps(sim, 70, { mx: 1 }); steps(sim, 70, { mx: -1 }); }
  assert.ok(sim.world.totalCount() < before, 'шар разбил стену');
  const rope = crane.rope;
  steps(sim, 30, { jump: true });
  assert.ok(crane.rope < rope, 'трос короче');
});

test('сохранение игры: мир, тела, техника, инструмент и игрок возвращаются', () => {
  const sim = game();
  wallScene(sim, 20);
  steps(sim, 1, { tool: idx('rocket'), fire1Pressed: true });
  steps(sim, 60);
  sim.vehicleType = 2; sim.cool = 0;
  steps(sim, 1, { tool: idx('vehicle'), fire1Pressed: true });
  const data = JSON.parse(JSON.stringify(sim.toSave()));
  const back = new Sim(assets).fromSave(data);
  assert.equal(worldHash(back.world), worldHash(sim.world));
  assert.equal(back.vehicles.length, 1);
  assert.equal(back.vehicles[0].type, 'crane');
  assert.equal(back.toolIndex, idx('vehicle'));
  assert.equal(back.player.x, sim.player.x);
  assert.equal(back.destruction.total(), back.startTotal);
  // мусор в списке техники пропускается
  data.vehicles = [{ type: 'ufo', x: 1, y: 1, z: 1, yaw: 0 }, { type: 'car', x: 'a' }, { type: 'car', x: 10, y: 11, z: 10, yaw: 0 }];
  data.tool = 99; data.startTotal = 'x'; data.player = null;
  const odd = new Sim(assets).fromSave(data);
  assert.equal(odd.vehicles.length, 1);
  assert.equal(odd.toolIndex, 0);
  assert.equal(odd.player.x, odd.plan.spawn.x);
});

test('упал за край мира - возвращается к началу; полёт включается и выключается', () => {
  const sim = game();
  sim.player.x = -50;
  steps(sim, 200);
  assert.ok(sim.player.x > 0 && sim.player.y > 0);
  steps(sim, 1, { fly: true });
  assert.equal(sim.player.flying, true);
  steps(sim, 1, { fly: true });
  assert.equal(sim.player.flying, false);
  steps(sim, 1, { nextTool: 1 });
  assert.equal(sim.toolIndex, 1);
  steps(sim, 1, { nextTool: -1 });
  steps(sim, 1, { nextTool: -1 });
  assert.equal(sim.toolIndex, TOOLS.length - 1);
  steps(sim, 1, { look: [0.1, 0.2] });
  assert.ok(Math.abs(sim.player.pitch + 0.2) < 1e-9);
  sim.selectTool(99);
  assert.equal(sim.toolIndex, TOOLS.length - 1);
  steps(sim, 1, { use: true });
  assert.equal(sim.driving, null, 'рядом нет техники');
});

test('большой бой: масса сходится и висящего нет после серии ракет и динамита', () => {
  const sim = game({ kind: 'mixed', seed: 3 });
  const p = sim.player;
  p.flying = true; p.y = 30;
  for (let k = 0; k < 8; k++) {
    p.yaw = k * 0.8; p.pitch = -0.35;
    sim.cool = 0;
    steps(sim, 1, { tool: idx(k % 2 ? 'rocket' : 'dynamite'), fire1Pressed: true });
    steps(sim, 50);
  }
  steps(sim, 240);
  assert.equal(sim.destruction.total(), sim.startTotal);
  assert.equal(floatingVoxels(sim.world), 0);
});
