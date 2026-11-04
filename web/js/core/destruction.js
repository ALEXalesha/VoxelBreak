// Разрушение: удар сферой по миру и по телам, отрыв висящих кусков в тела, раскол тел,
// мелочь - в пыль, горючее - во взрыв. Счёт вокселей сохраняется:
//   в мире + в телах + выбито + пыль + улетело за мир = столько, сколько было в начале.
import { MATERIALS, M } from './materials.js';
import { hash01 } from './rng.js';
import { findFloating, neighbourSeeds, gridComponents } from './connectivity.js';
import { bodyFromVoxels, Body } from './body.js';
import { mulMV, cross } from './math.js';

const STRENGTH = MATERIALS.map((m) => m.strength);
const FRAGILE = MATERIALS.map((m) => m.fragile);
const EXPLOSIVE = MATERIALS.map((m) => m.explosive);

export const MIN_BODY = 4;          // меньше - пыль
export const MAX_BODIES = 600;      // бюджет тел: сверх него мелкие тела рассыпаются в пыль
export const MAX_NEW_BODIES = 80;   // за один удар

export class Destruction {
  constructor(world, physics) {
    this.world = world;
    this.physics = physics;
    this.destroyed = 0;     // выбито ударами
    this.dust = 0;          // рассыпалось мелочью
    this.pending = [];      // взрывы горючего, ждущие своей очереди { x, y, z, r, power, t }
    this.events = [];       // для звука и частиц: { type, x, y, z, ... }
    this.seed = 1;
  }

  // r - радиус в вокселях, power - сила в центре; impulse - разлёт тел (воксель/с у центра)
  sphere(x, y, z, r, power, { impulse = 0, skipBody = null } = {}) {
    const seed = this.seed++;
    const removed = carveWorld(this.world, x, y, z, r, power, seed);
    const report = { removedWorld: removed.length, removedBodies: 0, bodies: [], dust: 0, explosive: [] };
    this.destroyed += removed.length;
    const fuel = removed.filter((v) => EXPLOSIVE[v[3]]);
    if (fuel.length) {
      const more = igniteWorld(this.world, fuel);
      this.destroyed += more.length;
      removed.push(...more);
      for (const blast of groupFuel([...fuel, ...more])) report.explosive.push(blast);
    }
    // тела в радиусе
    for (const b of this.physics.bodies.slice()) {
      if (b === skipBody) continue;
      const dx = b.pos[0] - x, dy = b.pos[1] - y, dz = b.pos[2] - z;
      if (dx * dx + dy * dy + dz * dz > (r + b.radius) ** 2) continue;
      const hit = carveBody(b, x, y, z, r, power, seed);
      if (!hit.length) continue;
      report.removedBodies += hit.length;
      this.destroyed += hit.length;
      const bfuel = hit.filter((v) => EXPLOSIVE[v[3]]);
      if (bfuel.length) {
        // горючее тела вспыхивает целиком
        const rest = takeMaterial(b, EXPLOSIVE);
        this.destroyed += rest.length;
        report.explosive.push(...groupFuel([...bfuel, ...rest]));
      }
      report.bodies.push(...this.splitBody(b));
    }
    const blast = impulse > 0 ? { x, y, z, r, impulse } : null;
    if (blast) report.bodies.push(...this.fragments(x, y, z, r, power, seed, blast, removed));
    report.bodies.push(...this.detach(removed, blast));
    if (impulse > 0) this.blastBodies(x, y, z, r, impulse);
    for (const e of report.explosive) this.pending.push({ ...e, t: 0.12 });
    report.dust = this.enforceBudget();
    this.events.push({ type: 'hit', x, y, z, r, power, removed: removed.length + report.removedBodies, mat: dominant(removed) });
    return report;
  }

  // взрыв: удар + разлёт; горючее по соседству ждёт своей очереди (цепная реакция)
  explode(x, y, z, r, power = 12) {
    this.events.push({ type: 'explosion', x, y, z, r });
    return this.sphere(x, y, z, r, power, { impulse: 18 + r * 3 });
  }

  // время идёт: взрывы горючего по очереди
  update(dt) {
    const due = [];
    for (const p of this.pending) { p.t -= dt; if (p.t <= 0) due.push(p); }
    this.pending = this.pending.filter((p) => p.t > 0);
    for (const p of due) this.explode(p.x, p.y, p.z, p.r, p.power);
    return due.length;
  }

  // скорлупа взрыва: слабое на краю воронки откалывается кусками по 2-3 вокселя и разлетается.
  // Отколотое уходит из мира в тела (счёт массы не меняется), соседи потом проверяются на опору.
  fragments(cx, cy, cz, r, power, seed, blast, removed) {
    const world = this.world;
    const R = r * 1.45, cell = 3;
    const groups = new Map();
    for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.ceil(cy + R); y++)
      for (let z = Math.floor(cz - R); z <= Math.ceil(cz + R); z++)
        for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
          const m = world.get(x, y, z);
          if (!m || !world.inside(x, y, z) || STRENGTH[m] > power * 0.45) continue;
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
          if (d > R * (0.85 + 0.15 * hash01(seed, x, z, y))) continue;
          const gx = Math.floor((x + (seed % 3)) / cell), gy = Math.floor(y / cell), gz = Math.floor((z + (seed % 2)) / cell);
          if (hash01(seed + 7, gx, gy, gz) > 0.6) continue;
          const k = `${gx},${gy},${gz}`;
          if (!groups.has(k)) groups.set(k, []);
          groups.get(k).push([x, y, z, m]);
        }
    const out = [];
    for (const k of [...groups.keys()].sort()) {
      if (out.length >= MAX_NEW_BODIES) break;
      const list = groups.get(k);
      // кусок должен быть связным: каждая связная часть - своё тело
      const body = bodyFromVoxels(0, list);
      for (const comp of gridComponents(body.data, body.sx, body.sy, body.sz)) {
        const part = comp.map((i) => {
          const lx = i % body.sx, lz = Math.floor(i / body.sx) % body.sz, ly = Math.floor(i / (body.sx * body.sz));
          return [body.origin[0] + lx, body.origin[1] + ly, body.origin[2] + lz, body.data[i]];
        });
        for (const [x, y, z] of part) { world.set(x, y, z, 0); removed.push([x, y, z, 0]); }
        if (part.length < 2) { this.dust += part.length; continue; }
        const b = bodyFromVoxels(0, part);
        kick(b, blast);
        this.physics.add(b);
        out.push(b);
      }
    }
    return out;
  }

  // висящие куски мира -> тела
  detach(removed, blast) {
    const world = this.world;
    if (!removed.length) return [];
    const seeds = neighbourSeeds(world, removed);
    const comps = findFloating(world, seeds);
    const out = [];
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const [x, y, z] of removed) { lo = [Math.min(lo[0], x), Math.min(lo[1], y), Math.min(lo[2], z)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y), Math.max(hi[2], z)]; }
    const { nx, nz } = world, plane = nx * nz;
    comps.sort((a, b) => b.size - a.size);
    for (const comp of comps) {
      const list = [];
      for (const k of comp) {
        const x = k % nx, z = Math.floor(k / nx) % nz, y = Math.floor(k / plane);
        list.push([x, y, z, world.get(x, y, z)]);
        world.set(x, y, z, 0);
        lo = [Math.min(lo[0], x), Math.min(lo[1], y), Math.min(lo[2], z)]; hi = [Math.max(hi[0], x), Math.max(hi[1], y), Math.max(hi[2], z)];
      }
      if (list.length < MIN_BODY || out.length >= MAX_NEW_BODIES) { this.dust += list.length; this.events.push({ type: 'dust', x: list[0][0], y: list[0][1], z: list[0][2], n: list.length, mat: list[0][3] }); continue; }
      const b = bodyFromVoxels(0, list);
      if (blast) kick(b, blast);
      this.physics.add(b);
      out.push(b);
    }
    this.physics.wakeRegion(lo[0], lo[1], lo[2], hi[0] + 1, hi[1] + 1, hi[2] + 1);
    return out;
  }

  // тело после правки сетки: пустое - убрать, одно целое - ужать, несколько кусков - раздать
  splitBody(b) {
    const comps = gridComponents(b.data, b.sx, b.sy, b.sz);
    const ph = this.physics;
    if (!comps.length) { ph.remove(b); return []; }
    b.syncR();
    const made = [];
    const sorted = comps.sort((p, q) => q.length - p.length);
    const plane = b.sx * b.sz;
    for (let ci = 0; ci < sorted.length; ci++) {
      const list = sorted[ci];
      if (list.length < MIN_BODY) { this.dust += list.length; for (const i of list) b.data[i] = 0; continue; }
      if (ci === 0) continue;   // самый большой кусок остаётся этим телом
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -1, y1 = -1, z1 = -1;
      for (const i of list) {
        const x = i % b.sx, z = Math.floor(i / b.sx) % b.sz, y = Math.floor(i / plane);
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
      }
      const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1;
      const data = new Uint8Array(sx * sy * sz);
      for (const i of list) {
        const x = i % b.sx, z = Math.floor(i / b.sx) % b.sz, y = Math.floor(i / plane);
        data[(x - x0) + sx * ((z - z0) + sz * (y - y0))] = b.data[i];
        b.data[i] = 0;
      }
      const nb = new Body(0, sx, sy, sz, data, [b.origin[0] + x0, b.origin[1] + y0, b.origin[2] + z0]);
      placeLike(nb, b, [x0, y0, z0]);
      ph.add(nb);
      made.push(nb);
    }
    if (sorted[0].length < MIN_BODY) { ph.remove(b); return made; }
    cropBody(b);
    ph.wake(b);
    return made;
  }

  // взрывная волна толкает тела
  blastBodies(x, y, z, r, impulse) {
    const R = r * 2.2;
    for (const b of this.physics.bodies) {
      const d = [b.pos[0] - x, b.pos[1] - y + 0.5, b.pos[2] - z];
      const l = Math.hypot(d[0], d[1], d[2]) || 1;
      if (l > R + b.radius * 0.5) continue;
      const f = Math.max(0, 1 - l / (R + b.radius * 0.5)) * impulse;
      const dv = f / Math.max(1, Math.sqrt(b.count / 20));
      b.v[0] += d[0] / l * dv; b.v[1] += d[1] / l * dv + dv * 0.3; b.v[2] += d[2] / l * dv;
      b.w[0] += (hash01(b.id, 1) - 0.5) * dv * 0.3; b.w[2] += (hash01(b.id, 2) - 0.5) * dv * 0.3;
      this.physics.wake(b);
    }
  }

  // бюджет: слишком много тел - самые мелкие рассыпаются в пыль
  enforceBudget() {
    const ph = this.physics;
    if (ph.bodies.length <= MAX_BODIES) return 0;
    const order = ph.bodies.slice().sort((a, b) => a.count - b.count || a.id - b.id);
    let n = 0;
    for (const b of order.slice(0, ph.bodies.length - MAX_BODIES)) { ph.remove(b); this.dust += b.count; n += b.count; }
    return n;
  }

  total() {
    let n = this.world.totalCount();
    for (const b of this.physics.bodies) n += b.count;
    return n + this.destroyed + this.dust + this.physics.lost;
  }
}

function dominant(list) {
  const n = new Map();
  for (const v of list) n.set(v[3], (n.get(v[3]) || 0) + 1);
  let best = 0, bm = 0;
  for (const [m, c] of n) if (c > best) { best = c; bm = m; }
  return bm;
}

// выбить воксели мира в шаре; край неровный (по зерну), стекло бьётся в полтора раза дальше
export function carveWorld(world, cx, cy, cz, r, power, seed = 0) {
  const out = [];
  const R = r * 1.5;
  const x0 = Math.floor(cx - R), x1 = Math.ceil(cx + R), y0 = Math.max(0, Math.floor(cy - R)), y1 = Math.ceil(cy + R), z0 = Math.floor(cz - R), z1 = Math.ceil(cz + R);
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const m = world.get(x, y, z);
        if (!m || !world.inside(x, y, z)) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy, z + 0.5 - cz);
        if (!hits(m, d, r, power, hash01(seed, x, y, z))) continue;
        world.set(x, y, z, 0);
        out.push([x, y, z, m]);
      }
  return out;
}

function hits(m, d, r, power, jitter) {
  const rr = r * (0.85 + 0.3 * jitter);
  const reach = FRAGILE[m] ? rr * 1.5 : rr;
  if (d > reach) return false;
  const f = d <= rr * 0.5 ? 1 : Math.max(0.3, 1 - (d - rr * 0.5) / (rr * 0.5) * 0.7);
  return power * f * (FRAGILE[m] ? 3 : 1) >= STRENGTH[m];
}

// то же для тела: центр удара переводится в сетку тела
export function carveBody(b, cx, cy, cz, r, power, seed = 0) {
  b.syncR();
  const g = b.toGrid([cx, cy, cz]);
  const R = r * 1.5;
  const out = [];
  for (let y = Math.max(0, Math.floor(g[1] - R)); y <= Math.min(b.sy - 1, Math.ceil(g[1] + R)); y++)
    for (let z = Math.max(0, Math.floor(g[2] - R)); z <= Math.min(b.sz - 1, Math.ceil(g[2] + R)); z++)
      for (let x = Math.max(0, Math.floor(g[0] - R)); x <= Math.min(b.sx - 1, Math.ceil(g[0] + R)); x++) {
        const i = b.idx(x, y, z);
        const m = b.data[i];
        if (!m) continue;
        const d = Math.hypot(x + 0.5 - g[0], y + 0.5 - g[1], z + 0.5 - g[2]);
        if (!hits(m, d, r, power, hash01(seed, b.origin[0] + x, b.origin[1] + y, b.origin[2] + z))) continue;
        b.data[i] = 0;
        out.push([...b.toWorld([x + 0.5 - b.com[0], y + 0.5 - b.com[1], z + 0.5 - b.com[2]]), m]);
      }
  return out;
}

// горючее мира, связанное с вспыхнувшим, сгорает целиком
function igniteWorld(world, fuel) {
  const out = [];
  const stack = fuel.map(([x, y, z]) => [x, y, z]);
  while (stack.length) {
    const [x, y, z] = stack.pop();
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const m = world.get(x + dx, y + dy, z + dz);
      if (!EXPLOSIVE[m] || !world.inside(x + dx, y + dy, z + dz)) continue;
      world.set(x + dx, y + dy, z + dz, 0);
      out.push([x + dx, y + dy, z + dz, m]);
      stack.push([x + dx, y + dy, z + dz]);
    }
  }
  return out;
}

function takeMaterial(b, flags) {
  const out = [];
  for (let y = 0; y < b.sy; y++)
    for (let z = 0; z < b.sz; z++)
      for (let x = 0; x < b.sx; x++) {
        const i = b.idx(x, y, z);
        if (!flags[b.data[i]]) continue;
        out.push([...b.toWorld([x + 0.5 - b.com[0], y + 0.5 - b.com[1], z + 0.5 - b.com[2]]), b.data[i]]);
        b.data[i] = 0;
      }
  return out;
}

// горючее в один взрыв на каждые ~8 вокселей кучи (одна бочка - один взрыв)
function groupFuel(list) {
  const groups = [];
  for (const v of list) {
    const g = groups.find((q) => Math.hypot(q.x / q.n - v[0], q.y / q.n - v[1], q.z / q.n - v[2]) < 6);
    if (g) { g.x += v[0]; g.y += v[1]; g.z += v[2]; g.n++; } else groups.push({ x: v[0], y: v[1], z: v[2], n: 1 });
  }
  return groups.map((g) => ({ x: g.x / g.n + 0.5, y: g.y / g.n + 0.5, z: g.z / g.n + 0.5, r: Math.min(9, 3 + Math.cbrt(g.n) * 1.3), power: 11 }));
}

// новое тело из куска сетки старого: там же в мире, с той же скоростью точки
function placeLike(nb, old, off) {
  const R = old.R;
  const lc = [off[0] + nb.com[0] - old.com[0], off[1] + nb.com[1] - old.com[1], off[2] + nb.com[2] - old.com[2]];
  const wc = mulMV(R, lc);
  nb.pos = [old.pos[0] + wc[0], old.pos[1] + wc[1], old.pos[2] + wc[2]];
  nb.q = old.q.slice();
  const wv = cross(old.w, wc);
  nb.v = [old.v[0] + wv[0], old.v[1] + wv[1], old.v[2] + wv[2]];
  nb.w = old.w.slice();
  nb.syncR();
}

// ужать сетку тела до занятых вокселей, не сдвинув их в мире
export function cropBody(b) {
  let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -1, y1 = -1, z1 = -1;
  for (let y = 0; y < b.sy; y++)
    for (let z = 0; z < b.sz; z++)
      for (let x = 0; x < b.sx; x++)
        if (b.data[b.idx(x, y, z)]) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z); }
  const oldCom = b.com.slice();
  const sx = x1 - x0 + 1, sy = y1 - y0 + 1, sz = z1 - z0 + 1;
  if (sx !== b.sx || sy !== b.sy || sz !== b.sz) {
    const data = new Uint8Array(sx * sy * sz);
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++) data[x + sx * (z + sz * y)] = b.data[b.idx(x + x0, y + y0, z + z0)];
    b.sx = sx; b.sy = sy; b.sz = sz; b.data = data;
    b.origin = [b.origin[0] + x0, b.origin[1] + y0, b.origin[2] + z0];
  }
  b.recompute();
  b.syncR();
  const shift = mulMV(b.R, [x0 + b.com[0] - oldCom[0], y0 + b.com[1] - oldCom[1], z0 + b.com[2] - oldCom[2]]);
  b.pos = [b.pos[0] + shift[0], b.pos[1] + shift[1], b.pos[2] + shift[2]];
}

function kick(b, blast) {
  const d = [b.pos[0] - blast.x, b.pos[1] - blast.y, b.pos[2] - blast.z];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  const f = blast.impulse * Math.max(0.2, 1 - l / (blast.r * 2.5)) / Math.max(1, Math.sqrt(b.count / 30));
  b.v = [d[0] / l * f, d[1] / l * f + f * 0.4, d[2] / l * f];
  b.w = [(hash01(b.origin[0], b.origin[1], 3) - 0.5) * 6, (hash01(b.origin[2], 4) - 0.5) * 6, (hash01(b.origin[1], 5) - 0.5) * 6];
}

export { M };
