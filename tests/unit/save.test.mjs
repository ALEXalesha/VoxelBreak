// Законы сохранения: туда-обратно без потерь (мир, тела, счёт, игрок), мусор - понятная ошибка.
import test from 'node:test';
import assert from 'node:assert/strict';
import { smallWorld, worldHash, assets } from './helpers.mjs';
import { Physics } from '../../web/js/core/physics.js';
import { Destruction } from '../../web/js/core/destruction.js';
import { serialize, deserialize, toText, fromText, rle, unrle, toB64, fromB64, SAVE_TAG } from '../../web/js/core/save.js';
import { Rng } from '../../web/js/core/rng.js';

function damaged() {
  const { plan, world } = smallWorld({ seed: 6, kind: 'mixed', sx: 4, sy: 2, sz: 4 });
  const physics = new Physics(world), destruction = new Destruction(world, physics);
  const rng = new Rng(2);
  for (let i = 0; i < 15; i++) destruction.explode(rng.range(8, 120), rng.range(10, 30), rng.range(8, 120), rng.range(3, 8));
  for (let i = 0; i < 50; i++) physics.step();
  return { plan, world, physics, destruction };
}

test('сохранение туда-обратно: мир, тела, счёт и игрок те же', () => {
  const g = damaged();
  assert.ok(g.physics.bodies.length > 0);
  const text = toText(serialize({ ...g, player: { x: 10.5, y: 20, z: 30, yaw: 1, pitch: -0.2 }, time: 12.5 }));
  const back = fromText(text, assets);
  assert.equal(worldHash(back.world), worldHash(g.world));
  assert.equal(back.physics.bodies.length, g.physics.bodies.length);
  g.physics.bodies.forEach((b, i) => {
    const c = back.physics.bodies[i];
    assert.deepEqual([c.id, c.sx, c.sy, c.sz, c.pos, c.q, c.v, c.w, c.sleeping, c.origin], [b.id, b.sx, b.sy, b.sz, b.pos, b.q, b.v, b.w, b.sleeping, b.origin]);
    assert.deepEqual(c.data, b.data);
  });
  assert.equal(back.destruction.total(), g.destruction.total());
  assert.deepEqual(back.player, { x: 10.5, y: 20, z: 30, yaw: 1, pitch: -0.2 });
  assert.equal(back.time, 12.5);
  // и дальше мир живёт одинаково
  for (let i = 0; i < 60; i++) { g.physics.step(); back.physics.step(); }
  assert.deepEqual(back.physics.bodies.map((b) => b.pos), g.physics.bodies.map((b) => b.pos));
  // в сохранение попадают только изменённые чанки
  const obj = serialize(g);
  assert.ok(obj.chunks.length > 0 && obj.chunks.length < g.world.chunks.filter(Boolean).length);
});

test('целый мир без правок сохраняется почти даром', () => {
  const { plan, world } = smallWorld({ seed: 1, sx: 4, sy: 2, sz: 4 });
  const physics = new Physics(world);
  const text = toText(serialize({ plan, world, physics, destruction: new Destruction(world, physics) }));
  assert.ok(text.length < 600, `${text.length} символов`);
  assert.equal(fromText(text, assets).player, null);
});

test('сжатие повторами и base64 обратимы на любых данных', () => {
  const rng = new Rng(4);
  for (let t = 0; t < 50; t++) {
    const n = rng.int(0, 2000);
    const a = new Uint8Array(n).map(() => (rng.chance(0.7) ? 0 : rng.int(0, 255)));
    assert.deepEqual(unrle(rle(a), n), a);
    assert.deepEqual(fromB64(toB64(a)), a);
  }
  assert.ok(rle(new Uint8Array(32768)).length < 300);
});

test('испорченное сохранение - понятная ошибка, а не полуживой мир', () => {
  const g = damaged();
  const good = serialize(g);
  const bad = (patch) => () => deserialize({ ...JSON.parse(JSON.stringify(good)), ...patch }, assets);
  assert.throws(() => fromText('{нет', assets), /не читается/);
  assert.throws(() => deserialize(null, assets), /не сохранение/);
  assert.throws(bad({ tag: 'x' }), /не сохранение/);
  assert.throws(bad({ v: 99 }), /версия/);
  assert.throws(bad({ world: { seed: 1, kind: 'луна', size: [4, 2, 4] } }), /описание мира/);
  assert.throws(bad({ world: { seed: 1, kind: 'town', size: [400, 2, 4] } }), /описание мира/);
  assert.throws(bad({ chunks: 'x' }), /чанки/);
  assert.throws(bad({ chunks: [[99999, 'AAAA']] }), /чанк/);
  assert.throws(bad({ chunks: [[0, 'AAAA']] }), /повреждены данные/);
  assert.throws(bad({ chunks: [[0, '!!!!']] }), /base64/);
  assert.throws(bad({ chunks: [[0, 'AAA']] }), /base64/);
  assert.throws(bad({ chunks: [[0, toB64(Uint8Array.from([0, 1]))]] }), /длина/);
  assert.throws(bad({ chunks: [[0, toB64(Uint8Array.from([1]))]] }), /нечётная/);
  assert.throws(bad({ chunks: [[0, toB64(rle(new Uint8Array(32768).fill(250)))]] }), /материал/);
  assert.throws(bad({ bodies: 'x' }), /тела/);
  assert.throws(bad({ bodies: [{ id: 1, s: [1, 1, 1], d: 'AQE=', o: [0, 0, 0], p: [0, 0, 0], q: [0, 0, 0], v: [0, 0, 0], w: [0, 0, 0] }] }), /тело/);
  assert.throws(bad({ bodies: [{ id: 1, s: [2, 1, 1], d: toB64(rle(new Uint8Array(2).fill(3))), o: [0, 0, 0], p: [0, 0, NaN], q: [0, 0, 0, 1], v: [0, 0, 0], w: [0, 0, 0] }] }), /тело/);
  // числа счёта и игрока - только настоящие числа
  const odd = deserialize({ ...good, stats: { destroyed: 'x' }, player: { x: 1, y: 'a', z: 3 }, nextId: 'x', time: 'x' }, assets);
  assert.equal(odd.destruction.destroyed, 0);
  assert.equal(odd.player, null);
  assert.equal(odd.time, 0);
  const noStats = deserialize({ ...good, stats: undefined, player: { x: 1, y: 2, z: 3 } }, assets);
  assert.deepEqual(noStats.player, { x: 1, y: 2, z: 3, yaw: 0, pitch: 0 });
  assert.equal(good.tag, SAVE_TAG);
});
