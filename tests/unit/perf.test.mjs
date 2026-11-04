// Закон бюджета: эталонная сцена (обычный город, зерно 7) - снос первого этажа самого большого
// дома и два больших взрыва. Пороги с запасом на машину CI; VB_PERF_SCALE множит их (медленнее машина -
// больше число). После всего мир успокаивается: обломки засыпают и шаг почти ничего не стоит.
import test from 'node:test';
import assert from 'node:assert/strict';
import { assets } from './helpers.mjs';
import { Sim } from '../../web/js/game/sim.js';
import { greedyMesh } from '../../web/js/core/mesher.js';
import { MAX_BODIES } from '../../web/js/core/destruction.js';

const K = Number(process.env.VB_PERF_SCALE || 1);
const LIMIT = { blast: 300 * K, frame: 40 * K, avg: 8 * K, settled: 1.0 * K, mesh: 30 * K };

function demolish(sim) {
  const hs = sim.plan.structures.filter((s) => s.id === 'house').sort((a, b) => b.model.count() - a.model.count());
  const h = hs[0], h2 = hs[1], de = sim.destruction;
  for (let x = h.x; x <= h.x1; x += 3) for (let z = h.z; z <= h.z1; z += 3) de.sphere(x + 0.5, h.y + 3.5, z + 0.5, 2.6, 20);
  de.explode(h.x + h.w / 2, h.y + 16, h.z + h.d / 2, 10, 14);
  de.explode(h2.x + h2.w / 2, h2.y + 4, h2.z + h2.d / 2, 12, 14);
}

test('эталонная сцена с большим разрушением: взрыв и каждый кадр в пороге, потом всё засыпает', () => {
  // прогрев: тот же код на малом мире, чтобы мерить работу, а не компиляцию
  const warm = new Sim(assets).newGame({ seed: 7, kind: 'town', size: [6, 3, 6] });
  demolish(warm);
  for (let i = 0; i < 200; i++) warm.step({});

  const sim = new Sim(assets).newGame({ seed: 7, kind: 'town', size: [12, 3, 12] });
  const bodies0 = sim.physics.bodies.length;
  let t = performance.now();
  demolish(sim);
  const blast = performance.now() - t;
  assert.ok(sim.physics.bodies.length > bodies0 + 40, `разрушение настоящее: ${sim.physics.bodies.length - bodies0} новых тел`);
  const frames = [];
  for (let i = 0; i < 480; i++) { t = performance.now(); sim.step({}); frames.push(performance.now() - t); }
  const max = Math.max(...frames), avg = frames.reduce((a, b) => a + b) / frames.length;
  const settled = frames.slice(-60).reduce((a, b) => a + b) / 60;
  console.log(`снос ${blast.toFixed(0)} мс, кадр: худший ${max.toFixed(1)} мс, средний ${avg.toFixed(2)} мс, в покое ${settled.toFixed(2)} мс; тел ${sim.physics.bodies.length}`);
  assert.ok(blast < LIMIT.blast, `снос ${blast} мс`);
  assert.ok(max < LIMIT.frame, `худший кадр ${max} мс`);
  assert.ok(avg < LIMIT.avg, `средний кадр ${avg} мс`);
  assert.equal(sim.physics.awakeCount(), 0, 'через 8 с всё уснуло');
  assert.ok(settled < LIMIT.settled, `кадр в покое ${settled} мс`);
  assert.ok(sim.physics.bodies.length <= MAX_BODIES);
  assert.equal(sim.destruction.total(), sim.startTotal);
  // сетки изменённых чанков строятся быстро
  let worst = 0;
  for (const ci of sim.world.takeDirty()) {
    const c = sim.world.chunks[ci];
    if (!c) continue;
    t = performance.now();
    greedyMesh(sim.world.padded(c.cx, c.cy, c.cz), [32, 32, 32]);
    worst = Math.max(worst, performance.now() - t);
  }
  assert.ok(worst < LIMIT.mesh, `сетка чанка ${worst} мс`);
});
