// Сохранение мира. Мир заново строится из зерна, поверх кладутся только изменённые чанки
// (сжатые повторами), тела и счёт. Чтение проверяет всё: испорченный файл даёт ошибку,
// а не полуживой мир.
import { World, CS3 } from './world.js';
import { makePlan, generateWorld, KINDS } from './gen.js';
import { Physics } from './physics.js';
import { Destruction } from './destruction.js';
import { Body } from './body.js';
import { MATERIALS } from './materials.js';

export const SAVE_VERSION = 1;
export const SAVE_TAG = 'voxelbreak-save';
const MAX_BODY_CELLS = 1 << 22;   // 4 млн клеток на тело - больше мир не даёт

// повторы: [число 1..255, значение] ...
export function rle(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length;) {
    const v = bytes[i];
    let n = 1;
    while (n < 255 && i + n < bytes.length && bytes[i + n] === v) n++;
    out.push(n, v);
    i += n;
  }
  return Uint8Array.from(out);
}
export function unrle(bytes, length) {
  const out = new Uint8Array(length);
  let o = 0;
  if (bytes.length % 2) throw new Error('повреждены данные: нечётная длина');
  for (let i = 0; i < bytes.length; i += 2) {
    const n = bytes[i], v = bytes[i + 1];
    if (!n || o + n > length) throw new Error('повреждены данные: длина не сходится');
    out.fill(v, o, o + n);
    o += n;
  }
  if (o !== length) throw new Error('повреждены данные: не хватает');
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64I = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;
export function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    s += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)];
    s += i + 1 < bytes.length ? B64[((b & 15) << 2) | ((c ?? 0) >> 6)] : '=';
    s += i + 2 < bytes.length ? B64[c & 63] : '=';
  }
  return s;
}
export function fromB64(s) {
  if (typeof s !== 'string' || s.length % 4) throw new Error('повреждены данные: не base64');
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array(s.length / 4 * 3 - pad);
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (s[i + k] === '=' ? 0 : B64I[s.charCodeAt(i + k)] ?? -1));
    if (v.some((x) => x < 0)) throw new Error('повреждены данные: не base64');
    const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
    if (o < out.length) out[o++] = n >> 16;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const vec = (v, n) => Array.isArray(v) && v.length === n && v.every(num);

export function serialize({ plan, world, physics, destruction, player = null, time = 0 }) {
  const chunks = [];
  world.chunks.forEach((c, i) => { if (c && c.modified) chunks.push([i, toB64(rle(c.data))]); });
  const bodies = physics.bodies.map((b) => ({
    id: b.id, s: [b.sx, b.sy, b.sz], d: toB64(rle(b.data)), o: b.origin, p: b.pos, q: b.q, v: b.v, w: b.w, z: b.sleeping ? 1 : 0,
    t: [b.sleepT, b.restT, ...b.restPos, ...b.restQ],
  }));
  return {
    tag: SAVE_TAG, v: SAVE_VERSION,
    world: { seed: plan.seed, kind: plan.kind, size: [world.sx, world.sy, world.sz] },
    chunks, bodies, nextId: physics.nextId,
    stats: { destroyed: destruction.destroyed, dust: destruction.dust, lost: physics.lost },
    player, time,
  };
}

// разобрать и проверить; бросает Error с понятной причиной
export function deserialize(obj, assets) {
  if (!obj || obj.tag !== SAVE_TAG) throw new Error('это не сохранение VoxelBreak');
  if (obj.v !== SAVE_VERSION) throw new Error(`неизвестная версия сохранения ${obj.v}`);
  const W = obj.world || {};
  if (!num(W.seed) || !KINDS.includes(W.kind) || !vec(W.size, 3) || !W.size.every((n) => Number.isInteger(n) && n >= 1 && n <= 32)) throw new Error('повреждено описание мира');
  const [sx, sy, sz] = W.size;
  const plan = makePlan({ seed: W.seed, kind: W.kind, sx, sy, sz }, assets);
  const world = generateWorld(plan, new World({ sx, sy, sz }));
  if (!Array.isArray(obj.chunks)) throw new Error('повреждены чанки');
  for (const entry of obj.chunks) {
    if (!Array.isArray(entry) || !Number.isInteger(entry[0]) || entry[0] < 0 || entry[0] >= world.chunks.length) throw new Error('повреждён чанк');
    const data = unrle(fromB64(entry[1]), CS3);
    checkMaterials(data);
    const ci = entry[0];
    const cx = ci % sx, cz = Math.floor(ci / sx) % sz, cy = Math.floor(ci / (sx * sz));
    let c = world.chunks[ci];
    if (!c) { world.set(cx * 32, cy * 32, cz * 32, 1); c = world.chunks[ci]; }
    c.data.set(data);
    c.count = data.reduce((n, m) => n + (m ? 1 : 0), 0);
    c.modified = true;
    c.version++;
    world.dirty.add(ci);
  }
  const physics = new Physics(world);
  if (!Array.isArray(obj.bodies)) throw new Error('повреждены тела');
  const ids = new Set();
  for (const e of obj.bodies) {
    if (!e || !Number.isInteger(e.id) || e.id < 1 || !vec(e.s, 3) || !e.s.every((n) => Number.isInteger(n) && n >= 1 && n <= 512)
      || e.s[0] * e.s[1] * e.s[2] > MAX_BODY_CELLS
      || !vec(e.o, 3) || !vec(e.p, 3) || !vec(e.q, 4) || !vec(e.v, 3) || !vec(e.w, 3)) throw new Error('повреждено тело');
    if (ids.has(e.id)) throw new Error(`повтор тела ${e.id}`);
    ids.add(e.id);
    const data = unrle(fromB64(e.d), e.s[0] * e.s[1] * e.s[2]);
    checkMaterials(data);
    if (!data.some((m) => m)) throw new Error(`пустое тело ${e.id}`);
    const b = new Body(e.id, e.s[0], e.s[1], e.s[2], data, e.o);
    b.pos = e.p.slice(); b.q = e.q.slice(); b.v = e.v.slice(); b.w = e.w.slice(); b.sleeping = e.z === 1;
    if (vec(e.t, 9)) { b.sleepT = e.t[0]; b.restT = e.t[1]; b.restPos = e.t.slice(2, 5); b.restQ = e.t.slice(5, 9); }
    else { b.restPos = b.pos.slice(); b.restQ = b.q.slice(); }
    physics.add(b);
  }
  if (num(obj.nextId)) physics.nextId = Math.max(physics.nextId, obj.nextId);
  const destruction = new Destruction(world, physics);
  const st = obj.stats || {};
  destruction.destroyed = num(st.destroyed) ? st.destroyed : 0;
  destruction.dust = num(st.dust) ? st.dust : 0;
  physics.lost = num(st.lost) ? st.lost : 0;
  const p = obj.player;
  const player = p && num(p.x) && num(p.y) && num(p.z) ? { x: p.x, y: p.y, z: p.z, yaw: num(p.yaw) ? p.yaw : 0, pitch: num(p.pitch) ? p.pitch : 0 } : null;
  return { plan, world, physics, destruction, player, time: num(obj.time) ? obj.time : 0 };
}

function checkMaterials(data) {
  for (const m of data) if (m >= MATERIALS.length) throw new Error('повреждены данные: неизвестный материал');
}

export const toText = (obj) => JSON.stringify(obj);
export function fromText(text, assets) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('файл сохранения не читается'); }
  return deserialize(obj, assets);
}
