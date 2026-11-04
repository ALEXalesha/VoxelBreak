// Законы генерации: детерминизм по зерну, независимость от порядка чанков, ничего не висит,
// постройки на месте, модели связны.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assets, smallWorld, worldHash, floatingVoxels, World, M } from './helpers.mjs';
import { makePlan, generateWorld, generateChunk, heightAt, KINDS } from '../../web/js/core/gen.js';
import { Rng } from '../../web/js/core/rng.js';
import { VoxelModel, rotXZ, unrotXZ } from '../../web/js/core/model.js';
import { Assets } from '../../web/js/core/assets.js';
import { MANIFEST } from '../../web/assets/manifest.js';
import { BUILDERS } from '../../web/assets/proc/index.js';

test('генерация детерминирована по зерну: то же зерно - тот же мир, другое - другой', () => {
  for (const kind of KINDS) {
    const a = smallWorld({ seed: 11, kind, sx: 6, sz: 6 });
    const b = smallWorld({ seed: 11, kind, sx: 6, sz: 6 });
    const c = smallWorld({ seed: 12, kind, sx: 6, sz: 6 });
    assert.equal(worldHash(a.world), worldHash(b.world), kind);
    assert.notEqual(worldHash(a.world), worldHash(c.world), kind);
    assert.deepEqual(a.plan.props, b.plan.props);
    assert.deepEqual(a.plan.spawn, b.plan.spawn);
  }
});

test('чанки на границах совпадают: мир одинаков при любом порядке генерации чанков', () => {
  for (const kind of KINDS) {
    const plan = makePlan({ seed: 5, kind, sx: 6, sy: 2, sz: 6 }, assets);
    const a = generateWorld(plan, new World({ sx: 6, sy: 2, sz: 6 }));
    const order = [...a.chunks.keys()];
    const rng = new Rng(3);
    for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
    const b = generateWorld(plan, new World({ sx: 6, sy: 2, sz: 6 }), order);
    assert.equal(worldHash(a), worldHash(b), kind);
    // и отдельный чанк, построенный в одиночку, равен своему месту в целом мире
    for (const ci of order.slice(0, 10)) {
      const cx = ci % 6, cz = Math.floor(ci / 6) % 6, cy = Math.floor(ci / 36);
      const one = generateChunk(plan, cx, cy, cz);
      assert.deepEqual(one ? one.data : null, a.chunks[ci] ? a.chunks[ci].data : null);
    }
  }
});

test('постройки через швы чанков целы: каждый воксель дома на своём месте в мире', () => {
  const { plan, world } = smallWorld({ seed: 9, kind: 'town', sx: 6, sy: 2, sz: 6 });
  const houses = plan.structures.filter((s) => s.id === 'house');
  const crossing = houses.filter((s) => (s.x >> 5) !== ((s.x1 - 1) >> 5) || (s.z >> 5) !== ((s.z1 - 1) >> 5));
  assert.ok(crossing.length > 0, 'есть дома на швах');
  for (const s of crossing) {
    const others = plan.structures.filter((o) => o !== s && o.x < s.x1 && o.x1 > s.x && o.z < s.z1 && o.z1 > s.z);
    let checked = 0;
    for (let y = 0; y < s.model.sy; y++)
      for (let lz = 0; lz < s.model.sz; lz++)
        for (let lx = 0; lx < s.model.sx; lx++) {
          const v = s.model.get(lx, y, lz);
          if (!v || v === 255) continue;
          const [ox, oz] = rotXZ(lx, lz, s.model.sx, s.model.sz, s.rot);
          const wx = s.x + ox, wz = s.z + oz, wy = s.y + y;
          if (others.some((o) => wx >= o.x && wx < o.x1 && wz >= o.z && wz < o.z1 && wy >= o.y && wy < o.y1)) continue;
          assert.equal(world.get(wx, wy, wz), v, `дом ${s.x},${s.z}: воксель ${wx},${wy},${wz}`);
          checked++;
        }
    assert.ok(checked > 1000);
  }
});

test('после генерации ничего не висит в воздухе: каждый воксель связан с коренной породой', () => {
  for (const kind of KINDS) {
    for (const seed of [1, 2]) {
      const { world } = smallWorld({ seed, kind, sx: 6, sy: 2, sz: 6 });
      assert.equal(floatingVoxels(world), 0, `${kind} ${seed}`);
    }
  }
});

test('город: дома, заборы, фонари, машины и бочки на месте; дороги из асфальта', () => {
  const { plan, world } = smallWorld({ seed: 3, kind: 'town', sx: 6, sz: 6 });
  const ids = new Set(plan.structures.map((s) => s.id));
  for (const id of ['house', 'pole']) assert.ok(ids.has(id), id);
  const props = new Set(plan.props.map((p) => p.id));
  assert.ok(props.has('car'));
  assert.equal(world.get(3, 10, 50), M.ASPHALT);
  assert.equal(world.get(3, 11, 50), 0);
  const house = plan.structures.find((s) => s.id === 'house');
  let bricks = 0;
  for (let y = house.y; y < house.y1; y++) for (let x = house.x; x < house.x1; x++) if (world.get(x, y, house.z + 1)) bricks++;
  assert.ok(bricks > 100, 'стена дома стоит в мире');
  for (const p of plan.props) assert.equal(p.y, heightAt(plan, p.x, p.z) + 1, 'предмет стоит на земле');
  assert.ok(plan.spawn.y > 10 && world.get(Math.floor(plan.spawn.x), Math.floor(plan.spawn.y), Math.floor(plan.spawn.z)) === 0);
});

test('природа: овраг с мостом, деревья и скалы', () => {
  const plan = makePlan({ seed: 4, kind: 'nature', sx: 8, sy: 2, sz: 8 }, assets);
  assert.ok(plan.ravine);
  assert.ok(plan.structures.some((s) => s.id === 'bridge'));
  assert.ok(plan.structures.some((s) => s.id === 'tree'));
  assert.ok(heightAt(plan, Math.floor(plan.ravine.x), 10) <= 5, 'дно оврага низко');
  const mixed = makePlan({ seed: 4, kind: 'mixed', sx: 8, sy: 2, sz: 8 }, assets);
  assert.ok(mixed.split > 0 && mixed.split < mixed.nx);
  assert.equal(makePlan({ seed: 4, kind: 'нет', sx: 2, sy: 1, sz: 2 }, assets).kind, 'town');
});

test('модели кодом: связны, стоят на низу, повороты обратимы', () => {
  const rng = new Rng(1);
  for (const id of Object.keys(MANIFEST.models)) {
    const m = assets.get(id, {}, rng);
    assert.ok(m instanceof VoxelModel, id);
    assert.ok(m.count() > 0, id);
    const copy = new VoxelModel(m.sx, m.sy, m.sz, m.data.slice());
    assert.equal(copy.keepConnected((x, y) => y === 0), 0, `${id}: всё держится за низ`);
  }
  for (const rot of [0, 1, 2, 3])
    for (let x = 0; x < 5; x++)
      for (let z = 0; z < 3; z++) {
        const [wx, wz] = rotXZ(x, z, 5, 3, rot);
        assert.deepEqual(unrotXZ(wx, wz, 5, 3, rot), [x, z]);
      }
  const m = new VoxelModel(3, 3, 3);
  m.set(1, 2, 1, M.STONE); m.set(9, 9, 9, M.STONE);
  assert.equal(m.get(9, 9, 9), 0);
  assert.equal(m.keepConnected((x, y) => y === 0), 1, 'висящий воксель убран');
});

test('загрузчик моделей: нет модели - понятная ошибка; файл без загрузчика - ошибка', async () => {
  assert.throws(() => assets.get('нет'), /нет модели/);
  const a = new Assets({ voxel: 0.25, models: { x: { src: 'proc:нет' }, y: { src: 'models/y.glb' } } }, BUILDERS);
  assert.throws(() => a.get('x'), /нет построителя/);
  assert.throws(() => a.get('y'), /не загружена/);
  await assert.rejects(a.preload(), /загрузчика файлов нет/);
  const seen = [];
  const b = new Assets({ voxel: 0.25, models: { y: { src: 'models/y.glb', solid: true } } }, BUILDERS, {
    fetchBytes: async (src) => { seen.push(src); return new Uint8Array(4); },
    glbToModel: (bytes, opts) => { seen.push(opts); return new VoxelModel(1, 1, 1); },
  });
  await b.preload();
  await b.preload();
  assert.equal(b.get('y').sx, 1);
  assert.deepEqual(seen, ['models/y.glb', { voxel: 0.25, solid: true, scale: 1 }]);
  assert.equal(b.has('y'), true);
  assert.equal(b.has('z'), false);
});
