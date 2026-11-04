// Законы по находкам независимого ревью 04.11: каждый ловит свой дефект, найденный ревьюером.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assets, World, M } from './helpers.mjs';
import { Sim } from '../../web/js/game/sim.js';
import { TOOLS } from '../../web/js/game/tools.js';
import { SPECS, forwardOf } from '../../web/js/game/vehicles.js';
import { Physics } from '../../web/js/core/physics.js';
import { Destruction, carveWorld } from '../../web/js/core/destruction.js';
import { bodyFromVoxels } from '../../web/js/core/body.js';
import { serialize, deserialize, toB64, rle } from '../../web/js/core/save.js';
import { MeshQueue } from '../../web/js/app/meshq.js';

const require = createRequire(import.meta.url);
const { resolveAppPath } = require('../../electron/app-path.js');
const WS = require('../../electron/window-state.js');

const idx = (id) => TOOLS.findIndex((t) => t.id === id);
const game = () => new Sim(assets).newGame({ seed: 7, kind: 'town', size: [4, 2, 4] });
const steps = (sim, n, input = {}) => { for (let i = 0; i < n; i++) sim.step(i === 0 ? input : { ...input, fire1Pressed: false, fire2Pressed: false, use: false, fly: false, tool: null, look: null }); };
function flat(sx = 2, sz = 2) {
  const w = new World({ sx, sy: 1, sz });
  for (let x = 0; x < w.nx; x++) for (let z = 0; z < w.nz; z++) for (let y = 0; y < 5; y++) w.set(x, y, z, y < 2 ? M.BEDROCK : M.DIRT, true);
  return w;
}
const bar = (x0, y0, z0, sx, sy, sz, m = M.BRICK) => {
  const l = [];
  for (let x = 0; x < sx; x++) for (let y = 0; y < sy; y++) for (let z = 0; z < sz; z++) l.push([x0 + x, y0 + y, z0 + z, m]);
  return bodyFromVoxels(0, l);
};
function wall(sim, m) {
  const w = sim.world;
  for (let z = 30; z < 60; z++) for (let y = 11; y < 30; y++) for (let x = 60; x < 62; x++) w.set(x, y, z, m);
  for (let z = 30; z < 60; z++) for (let x = 0; x < 60; x++) for (let y = 11; y < 40; y++) w.set(x, y, z, 0);
  sim.physics.bodies.length = 0;
  Object.assign(sim.player, { x: 20, y: 11, z: 45, vx: 0, vy: 0, vz: 0, yaw: -Math.PI / 2, pitch: 0, flying: false });
}

test('ревью 1: машина и бульдозер не проползают сквозь неразрушимую стену и не уезжают за край мира', () => {
  for (const [type, m] of [[0, M.METAL], [1, M.BEDROCK]]) {
    const sim = game();
    wall(sim, m);
    sim.vehicleType = type;
    steps(sim, 1, { tool: idx('vehicle'), fire1Pressed: true });
    steps(sim, 1, { use: true });
    const v = sim.driving;
    const S = SPECS[v.type];
    const wallCount = () => { let n = 0; for (let z = 30; z < 60; z++) for (let y = 11; y < 30; y++) for (let x = 60; x < 62; x++) if (sim.world.get(x, y, z) === m) n++; return n; };
    const before = wallCount();
    steps(sim, 1200, { mz: 1 });
    const front = v.x + forwardOf(v)[0] * S.len / 2;
    assert.ok(front < 60.6, `${v.type}: перед машины ${front}`);
    if (m === M.BEDROCK) assert.equal(wallCount(), before, 'порода цела');
    // и назад можно отъехать
    const x = v.x;
    steps(sim, 120, { mz: -1 });
    assert.ok(v.x < x - 1, 'отъехал назад');
  }
  const sim = game();
  wall(sim, 0);
  steps(sim, 1, { tool: idx('vehicle'), fire1Pressed: true });
  steps(sim, 1, { use: true });
  sim.driving.yaw = Math.PI;
  steps(sim, 900, { mz: 1 });
  assert.ok(sim.driving.x >= 0 && sim.driving.y > 0, `не за краем: ${sim.driving.x}, ${sim.driving.y}`);
});

test('ревью 2: спящее тело просыпается, когда тело под ним толкнули, раскололи или рассыпали', () => {
  for (const how of ['push', 'remove']) {
    const ph = new Physics(flat()), de = new Destruction(ph.world, ph);
    const board = ph.add(bar(20, 5, 20, 12, 3, 6, M.PLANK));
    const crate = ph.add(bar(24, 8, 21, 4, 4, 4));
    for (let i = 0; i < 200; i++) ph.step();
    assert.ok(board.sleeping && crate.sleeping);
    if (how === 'push') ph.applyImpulse(board, board.pos, [board.mass * 60, 0, 0]);
    else { ph.remove(board); de.dust += board.count; }
    let woke = false;
    for (let i = 0; i < 400; i++) { ph.step(); if (!crate.sleeping) woke = true; }
    assert.ok(woke, `${how}: ящик проснулся`);
    // не висит: дно на земле (5) или на доске (8) и над ней
    const bottom = crate.pos[1] - 2;
    const onBoard = ph.bodies.includes(board) && Math.abs(bottom - 8) < 0.3 && Math.abs(crate.pos[0] - board.pos[0]) < 6 + 2;
    assert.ok(Math.abs(bottom - 5) < 0.3 || onBoard, `${how}: ящик висит, дно ${bottom}`);
  }
});

test('ревью 5: динамит на теле остаётся на поверхности после откола; на разрушенной стене - падает', () => {
  const sim = game();
  wall(sim, M.BRICK);
  const b = sim.physics.add(bar(30, 20, 40, 20, 3, 3));
  b.sleeping = true;
  sim.player.x = 26; sim.player.y = 21.5 - 6.48; sim.player.z = 41.5; sim.player.yaw = -Math.PI / 2; sim.player.pitch = 0; sim.player.flying = true;
  steps(sim, 1, { tool: idx('dynamite'), fire1Pressed: true });
  const e = sim.entities[0];
  assert.ok(e.stuck && e.stuck.body === b);
  sim.destruction.sphere(48.5, 21.5, 41.5, 1.6, 20);
  steps(sim, 2);
  const body = sim.physics.bodies.find((x) => x === e.stuck.body) || b;
  const near = Math.min(...body.voxelsWorld().map((v) => Math.hypot(v[0] - e.pos[0], v[1] - e.pos[1], v[2] - e.pos[2])));
  assert.ok(near < 1.3, `шашка у поверхности: ${near}`);
  // шашка на стене: стену выбили - шашка падает
  const s2 = game();
  wall(s2, M.BRICK);
  s2.player.x = 56; s2.player.flying = true; s2.player.y = 14;
  steps(s2, 1, { tool: idx('dynamite'), fire1Pressed: true });
  const d = s2.entities[0];
  assert.ok(d.stuck && d.stuck.world);
  const y0 = d.pos[1];
  carveWorld(s2.world, d.pos[0] + 0.5, d.pos[1], d.pos[2], 3, 50);
  steps(s2, 30);
  assert.ok(d.pos[1] < y0 - 1, 'упала');
});

test('ревью 6: лазер гаснет, когда садишься в технику', () => {
  const sim = game();
  wall(sim, M.CONCRETE);
  steps(sim, 1, { tool: idx('vehicle'), fire1Pressed: true });
  steps(sim, 30, { tool: idx('laser'), fire1: true });
  assert.ok(sim.laserOn);
  steps(sim, 1, { use: true, fire1: true });
  steps(sim, 60, { fire1: true });
  assert.ok(sim.driving);
  assert.equal(sim.laserOn, null);
});

test('ревью 8: очередь сеток после смены мира не принимает ответы старого мира', () => {
  const q = new MeshQueue({ useWorker: false });
  const got = [];
  q.request('c:1', 0, new Uint8Array(27), [1, 1, 1], () => got.push('старый'));
  const stale = { id: 'c:1', version: 0, epoch: q.epoch, mesh: {} };
  q.reset();
  q.request('c:1', 0, new Uint8Array(27), [1, 1, 1], () => got.push('новый'));
  q.done(stale);
  assert.deepEqual(got, [], 'ответ старого мира выброшен');
  q.pump();
  assert.deepEqual(got, ['новый']);
});

test('ревью 9: app:// не выпускает за пределы web/, даже в соседнюю папку на «web»', () => {
  const root = path.resolve('/app/web');
  assert.equal(resolveAppPath(root, '/index.html'), path.join(root, 'index.html'));
  assert.equal(resolveAppPath(root, '/js/app/main.js'), path.join(root, 'js', 'app', 'main.js'));
  for (const bad of ['/..%2Fweb-secret%2Fkey.txt', '/..%2F..%2Fetc%2Fpasswd', '/%2e%2e/LICENSE', '/', '/x%00y', '/%E0%A4%A']) assert.equal(resolveAppPath(root, bad), null, bad);
});

test('ревью 10: событие удара после взрыва - про выбитые воксели и их материал', () => {
  const w = flat(3, 3);
  for (let x = 30; x < 60; x++) for (let z = 30; z < 60; z++) for (let y = 5; y < 20; y++) w.set(x, y, z, M.BRICK);
  const de = new Destruction(w, new Physics(w));
  const rep = de.explode(45, 19, 45, 6);
  const hit = de.events.find((e) => e.type === 'hit');
  assert.equal(hit.mat, M.BRICK);
  assert.equal(hit.removed, rep.removedWorld + rep.removedBodies);
  assert.ok(rep.bodies.length > 0, 'скорлупа откололась');
});

test('ревью 11: стекло бьётся до полутора радиусов от края разброса', () => {
  const w = flat(2, 2);
  for (let x = 0; x < 64; x++) w.set(x, 10, 10, M.GLASS);
  let far = 0;
  for (let seed = 0; seed < 40; seed++) {
    const ww = flat(2, 2);
    for (let x = 0; x < 64; x++) ww.set(x, 10, 10, M.GLASS);
    for (const v of carveWorld(ww, 32, 10.5, 10.5, 8, 60, seed)) far = Math.max(far, Math.abs(v[0] + 0.5 - 32));
  }
  assert.ok(far > 12.6, `стекло до 1,725 r = 13,8: ${far}`);
  assert.ok(w);
});

test('ревью 12: сохранение отвергает повтор id тел, пустые и огромные тела', () => {
  const sim = game();
  const ph = sim.physics;
  const good = serialize({ plan: sim.plan, world: sim.world, physics: ph, destruction: sim.destruction });
  const body = good.bodies[0];
  const bad = (bodies) => () => deserialize({ ...good, bodies }, assets);
  assert.throws(bad([body, body]), /повтор/);
  assert.throws(bad([{ ...body, s: [2, 2, 2], d: toB64(rle(new Uint8Array(8))) }]), /пустое/);
  assert.throws(bad([{ ...body, s: [512, 512, 512] }]), /тело/);
});

test('ревью 13: заряды переживают сохранение', () => {
  const sim = game();
  sim.ammo.rocket = 3; sim.ammo.shotgun = 7;
  const back = new Sim(assets).fromSave(JSON.parse(JSON.stringify(sim.toSave())));
  assert.equal(back.ammo.rocket, 3);
  assert.equal(back.ammo.shotgun, 7);
  const data = sim.toSave(); data.ammo = { rocket: -5, shotgun: 'x', laser: 9 };
  const odd = new Sim(assets).fromSave(JSON.parse(JSON.stringify(data)));
  assert.equal(odd.ammo.rocket, 0);
  assert.equal(odd.ammo.shotgun, TOOLS.find((t) => t.id === 'shotgun').ammo);
  assert.equal(odd.ammo.laser, undefined);
});

test('ревью 14: окно на втором экране сохраняет размер по своему экрану', () => {
  const areas = [{ x: 0, y: 0, width: 1280, height: 720 }, { x: 1280, y: 0, width: 2560, height: 1400 }];
  const r = WS.restore({ x: 1400, y: 50, width: 2000, height: 1200 }, areas, { width: 1280, height: 760, minWidth: 360, minHeight: 480 });
  assert.deepEqual([r.x, r.width, r.height], [1400, 2000, 1200]);
});

test('ревью 15: быстрая прокрутка колеса не теряет выбор инструмента', () => {
  const sim = game();
  steps(sim, 1, { nextTool: -9 });
  assert.equal(sim.toolIndex, ((-9 % TOOLS.length) + TOOLS.length) % TOOLS.length);
  steps(sim, 1, { nextTool: 15 });
  assert.ok(sim.toolIndex >= 0 && sim.toolIndex < TOOLS.length);
});
