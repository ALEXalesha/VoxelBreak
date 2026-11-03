// Генерация мира по зерну. План (makePlan) - рельеф, дороги и список построек - считается
// целиком и сразу; чанк (generateChunk) заполняется из плана и зависит только от своих
// координат. Поэтому мир одинаков при любом порядке генерации чанков, а постройки на швах чанков
// совпадают.
import { Rng, hash32 } from './rng.js';
import { fbm2 } from './noise.js';
import { M, CARVE } from './materials.js';
import { CS, Chunk, lidx } from './world.js';
import { rotatedSize, unrotXZ } from './model.js';

export const KINDS = ['town', 'nature', 'mixed'];
export const ROAD_P = 96;      // шаг сетки дорог
export const ROAD_W = 12;      // ширина дороги
const TOWN_H = 10;             // уровень земли в городе (верхний воксель)
const BANK_H = 16;             // уровень берегов у оврага

export function makePlan({ seed = 1, kind = 'town', sx = 12, sy = 3, sz = 12 } = {}, assets) {
  seed >>>= 0;
  if (!KINDS.includes(kind)) kind = 'town';
  const nx = sx * CS, ny = sy * CS, nz = sz * CS;
  const rng = new Rng(hash32(seed, 0x51ed));
  const plan = { seed, kind, sx, sy, sz, nx, ny, nz, structures: [], props: [], spawn: null };
  // смешанный мир: город на западе, природа на востоке, полоса перехода между ними
  plan.split = kind === 'town' ? nx : kind === 'nature' ? 0 : Math.max(ROAD_P, Math.round(nx * (0.4 + rng.next() * 0.2) / ROAD_P) * ROAD_P);
  const natureW = nx - plan.split;
  plan.ravine = natureW >= 160 ? { x: plan.split + Math.floor(natureW * (0.45 + rng.next() * 0.15)), half: 14 } : null;
  plan.heights = new Int16Array(nx * nz);
  plan.tops = new Uint8Array(nx * nz);
  for (let z = 0; z < nz; z++)
    for (let x = 0; x < nx; x++) {
      const [h, top] = terrainColumn(plan, x, z);
      plan.heights[x + nx * z] = Math.min(ny - 1, h);
      plan.tops[x + nx * z] = top;
    }

  if (plan.split > 0) placeTown(plan, assets, rng.fork(1));
  if (natureW > 0) placeNature(plan, assets, rng.fork(2));
  for (const s of plan.structures) finishStructure(s);
  plan.index = indexStructures(plan);
  if (!plan.spawn) plan.spawn = spawnAt(plan, Math.floor(nx / 2), Math.floor(nz / 2));
  return plan;
}

export const heightAt = (plan, x, z) => plan.heights[Math.max(0, Math.min(plan.nx - 1, x)) + plan.nx * Math.max(0, Math.min(plan.nz - 1, z))];

function isRoad(x, z) {
  const rx = x % ROAD_P, rz = z % ROAD_P;
  return rx < ROAD_W || rz < ROAD_W;
}

function natureHeight(plan, x, z) {
  let h = 9 + Math.floor(fbm2(plan.seed, x / 70, z / 70, 4) * 24);
  if (plan.ravine) {
    const d = Math.abs(x + 0.5 - plan.ravine.x);
    if (d < 40) h = Math.round(h + (BANK_H - h) * Math.min(1, (40 - d) / 18));
    if (d < plan.ravine.half) h = Math.min(h, Math.max(4, Math.round(4 + (d - 5) * 1.6)));
  }
  return h;
}

function terrainColumn(plan, x, z) {
  const town = x < plan.split;
  if (town) {
    if (isRoad(x, z)) {
      const rx = x % ROAD_P, rz = z % ROAD_P;
      const centre = (rx === 5 || rx === 6) && rz >= ROAD_W && (z & 7) < 4 || (rz === 5 || rz === 6) && rx >= ROAD_W && (x & 7) < 4;
      return [TOWN_H, centre ? M.MARKING : M.ASPHALT];
    }
    const rx = x % ROAD_P, rz = z % ROAD_P;
    const walk = rx < ROAD_W + 2 || rz < ROAD_W + 2 || rx >= ROAD_P - 2 || rz >= ROAD_P - 2;
    return [TOWN_H, walk ? M.CONCRETE : M.GRASS];
  }
  let h = natureHeight(plan, x, z);
  const blend = x - plan.split;
  if (plan.split > 0 && blend < 32) h = Math.round(TOWN_H + (h - TOWN_H) * (blend / 32));
  let top = M.GRASS;
  if (plan.ravine && Math.abs(x + 0.5 - plan.ravine.x) < 6) top = M.SAND;
  else if (Math.abs(natureHeightSafe(plan, x + 1, z) - h) > 2 || Math.abs(natureHeightSafe(plan, x, z + 1) - h) > 2) top = M.STONE;
  return [h, top];
}
const natureHeightSafe = (plan, x, z) => (x < plan.split ? TOWN_H : natureHeight(plan, x, z));

function addStructure(plan, assets, id, params, rng, x, y, z, rot = 0) {
  const model = assets.get(id, params, rng);
  const [w, d] = rotatedSize(model, rot);
  if (x < 0 || z < 0 || x + w > plan.nx || z + d > plan.nz || y < 0 || y + model.sy > plan.ny) return null;
  const s = { id, model, x, y, z, rot, w, d };
  plan.structures.push(s);
  return s;
}

function overlaps(plan, x0, z0, x1, z1) {
  for (const s of plan.structures) if (x0 < s.x + s.w && x1 > s.x && z0 < s.z + s.d && z1 > s.z) return true;
  for (const p of plan.props) if (x0 < p.x + p.w && x1 > p.x && z0 < p.z + p.d && z1 > p.z) return true;
  return false;
}

function addProp(plan, assets, id, params, x, z, rot = 0) {
  const model = assets.get(id, params, null);
  const [w, d] = rotatedSize(model, rot);
  if (x < 0 || z < 0 || x + w > plan.nx || z + d > plan.nz || overlaps(plan, x, z, x + w, z + d)) return null;
  let y = 0;
  for (let zz = z; zz < z + d; zz++) for (let xx = x; xx < x + w; xx++) y = Math.max(y, heightAt(plan, xx, zz) + 1);
  const p = { id, params, x, y, z, rot, w, d };
  plan.props.push(p);
  return p;
}

function placeTown(plan, assets, rng) {
  const P = ROAD_P, W = ROAD_W;
  const STYLES = ['brick', 'plaster', 'wood'];
  const COLORS = ['red', 'blue', 'yellow', 'white', 'green'];
  for (let bz = 0; bz + P <= plan.nz; bz += P)
    for (let bx = 0; bx + P <= plan.split; bx += P) {
      // кварталы 2×2 участка по 40×40 вокселей
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const lx = bx + W + 2 + i * 40, lz = bz + W + 2 + j * 40;
          const r = rng.fork(hash32(bx, bz, i, j));
          if (r.chance(0.12)) {           // пустырь: деревья и ящики
            for (let k = 0; k < 3; k++) {
              const tx = lx + r.int(4, 30), tz = lz + r.int(4, 30);
              if (!overlaps(plan, tx, tz, tx + 12, tz + 12)) addStructure(plan, assets, 'tree', { kind: 'oak', height: r.int(10, 15) }, r.fork(k), tx, TOWN_H + 1, tz);
            }
            addProp(plan, assets, 'crate', { size: 5 }, lx + r.int(2, 30), lz + r.int(2, 30));
            continue;
          }
          const w = r.int(20, 30), d = r.int(16, 24);
          const floors = r.chance(0.2) ? 3 : r.chance(0.55) ? 2 : 1;
          const rot = j === 0 ? 0 : 2;
          const hx = lx + Math.floor((38 - (w + 2)) / 2) + r.int(-2, 2);
          const hz = j === 0 ? lz + 3 : lz + 38 - (d + 2) - 3;
          addStructure(plan, assets, 'house', { w, d, floors, style: r.pick(STYLES), roof: r.chance(0.7) ? 'gable' : 'flat' }, r.fork(9), hx, TOWN_H, hz, rot);
          // забор по задней стороне участка
          const fz = j === 0 ? lz + 38 : lz - 1;
          if (r.chance(0.7)) addStructure(plan, assets, 'fence', { length: 36 }, null, lx + 1, TOWN_H + 1, Math.min(fz, plan.nz - 1), 0);
          // дерево и бочки во дворе
          const tz = j === 0 ? lz + 26 : lz + 2;
          const tx = r.chance(0.5) ? lx + 1 : lx + 26;
          if (!overlaps(plan, tx, tz, tx + 12, tz + 12)) addStructure(plan, assets, 'tree', { kind: r.chance(0.3) ? 'pine' : 'oak', height: r.int(10, 16) }, r.fork(7), tx, TOWN_H + 1, tz);
          if (r.chance(0.45)) {
            const ex = lx + (tx === lx + 1 ? 30 : 3), ez = j === 0 ? lz + 30 : lz + 4;
            for (let k = 0, n = r.int(2, 4); k < n; k++) addProp(plan, assets, 'barrel', {}, ex + (k % 2) * 6, ez + Math.floor(k / 2) * 6);
          }
          if (r.chance(0.35)) addProp(plan, assets, 'crate', { size: 5 }, lx + r.int(2, 8), j === 0 ? lz + 31 : lz + 2);
        }
      // машины у края дорог и фонари
      for (let k = W + 4; k + 16 < P - 2; k += 26) {
        const r = rng.fork(hash32(bx, bz, k, 77));
        if (r.chance(0.45)) addProp(plan, assets, 'car', { color: r.pick(COLORS) }, bx + k, bz + W - 8, 0);
        if (r.chance(0.45)) addProp(plan, assets, 'car', { color: r.pick(COLORS) }, bx + W - 8, bz + k, 1);
      }
      for (let k = W + 8; k < P - 4; k += 28) {
        addStructure(plan, assets, 'pole', { height: 28, lamp: true }, null, bx + k, TOWN_H + 1, bz + W, 0);
        addStructure(plan, assets, 'pole', { height: 28, lamp: false }, null, bx + W, TOWN_H + 1, bz + k, 1);
      }
    }
  const c = Math.floor(Math.min(plan.split, plan.nx) / 2 / ROAD_P) * ROAD_P;
  plan.spawn = spawnAt(plan, Math.max(6, c + 6), Math.floor(plan.nz / 2 / ROAD_P) * ROAD_P + 6);
}

function placeNature(plan, assets, rng) {
  const x0 = plan.split + (plan.split > 0 ? 34 : 0);
  if (plan.ravine) {
    const len = plan.ravine.half * 2 + 36;
    const bz = Math.floor(plan.nz / 2) - 6;
    const bx = Math.round(plan.ravine.x - len / 2);
    const depth = BANK_H + 1 - 5;
    addStructure(plan, assets, 'bridge', { length: len, width: 12, depth, material: rng.chance(0.5) ? 'wood' : 'concrete' }, null, bx, 5, bz, 0);
    plan.spawn = spawnAt(plan, bx - 10, bz + 6);
    addProp(plan, assets, 'car', { color: 'blue' }, bx - 26, bz + 2, 0);
    for (let k = 0; k < 3; k++) addProp(plan, assets, 'barrel', {}, bx - 14, bz - 14 + k * 6);
  }
  for (let z = 0; z + 20 <= plan.nz; z += 20)
    for (let x = x0; x + 20 <= plan.nx; x += 20) {
      const r = rng.fork(hash32(x, z, 3));
      const dense = fbm2(plan.seed ^ 0x77, x / 90, z / 90, 2);
      const px = x + r.int(0, 8), pz = z + r.int(0, 8);
      if (plan.ravine && Math.abs(px + 6 - plan.ravine.x) < plan.ravine.half + 10) continue;
      if (plan.spawn && Math.abs(px - plan.spawn.x) < 14 && Math.abs(pz - plan.spawn.z) < 14) continue;
      if (overlaps(plan, px, pz, px + 14, pz + 14)) continue;
      const h = heightAt(plan, px + 6, pz + 6);
      if (r.chance(0.18)) {
        let low = Infinity;
        for (let dz = 0; dz < 15; dz++) for (let dx = 0; dx < 15; dx++) low = Math.min(low, heightAt(plan, px + dx, pz + dz));
        addStructure(plan, assets, 'rock', { size: r.int(3, 7) }, r.fork(1), px, Math.max(2, low - 1), pz);
      } else if (r.next() < 0.25 + dense * 0.7) {
        let low = Infinity;
        for (let dz = 4; dz < 9; dz++) for (let dx = 4; dx < 9; dx++) low = Math.min(low, heightAt(plan, px + dx, pz + dz));
        addStructure(plan, assets, 'tree', { kind: h > 20 || r.chance(0.3) ? 'pine' : 'oak', height: r.int(11, 19) }, r.fork(2), px, low + 1, pz);
      }
    }
}

function spawnAt(plan, x, z) {
  x = Math.max(1, Math.min(plan.nx - 2, x)); z = Math.max(1, Math.min(plan.nz - 2, z));
  return { x: x + 0.5, y: heightAt(plan, x, z) + 1, z: z + 0.5 };
}

function finishStructure(s) {
  s.x1 = s.x + s.w; s.y1 = s.y + s.model.sy; s.z1 = s.z + s.d;
}

function indexStructures(plan) {
  const index = new Map();
  plan.structures.forEach((s, n) => {
    for (let cz = s.z >> 5; cz <= (s.z1 - 1) >> 5; cz++)
      for (let cx = s.x >> 5; cx <= (s.x1 - 1) >> 5; cx++) {
        const k = cx + plan.sx * cz;
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(n);
      }
  });
  return index;
}

// один чанк из плана; вернёт чанк или null, если он пустой
export function generateChunk(plan, cx, cy, cz) {
  const c = new Chunk(cx, cy, cz);
  const d = c.data;
  const X0 = cx * CS, Y0 = cy * CS, Z0 = cz * CS;
  for (let z = 0; z < CS; z++)
    for (let x = 0; x < CS; x++) {
      const k = X0 + x + plan.nx * (Z0 + z);
      const h = plan.heights[k], top = plan.tops[k];
      const y1 = Math.min(CS, h + 1 - Y0);
      for (let y = 0; y < y1; y++) {
        const wy = Y0 + y;
        d[lidx(x, y, z)] = wy < 2 ? M.BEDROCK : wy === h ? top : wy < h - 3 ? M.STONE : M.DIRT;
      }
    }
  for (const n of plan.index.get(cx + plan.sx * cz) || []) {
    const s = plan.structures[n];
    const ya = Math.max(s.y, Y0), yb = Math.min(s.y1, Y0 + CS);
    if (ya >= yb) continue;
    const xa = Math.max(s.x, X0), xb = Math.min(s.x1, X0 + CS);
    const za = Math.max(s.z, Z0), zb = Math.min(s.z1, Z0 + CS);
    const mdl = s.model;
    for (let wy = ya; wy < yb; wy++)
      for (let wz = za; wz < zb; wz++)
        for (let wx = xa; wx < xb; wx++) {
          const [lx, lz] = unrotXZ(wx - s.x, wz - s.z, mdl.sx, mdl.sz, s.rot);
          const v = mdl.data[lx + mdl.sx * (lz + mdl.sz * (wy - s.y))];
          if (v === 0) continue;
          d[lidx(wx - X0, wy - Y0, wz - Z0)] = v === CARVE ? 0 : v;
        }
  }
  let count = 0;
  for (let i = 0; i < d.length; i++) if (d[i]) count++;
  c.count = count;
  return count ? c : null;
}

export function generateWorld(plan, world, order = null) {
  const list = order || [...world.chunks.keys()];
  for (const ci of list) {
    const cx = ci % world.sx, cz = Math.floor(ci / world.sx) % world.sz, cy = Math.floor(ci / (world.sx * world.sz));
    world.chunks[ci] = generateChunk(plan, cx, cy, cz);
    world.dirty.add(ci);
  }
  return world;
}
