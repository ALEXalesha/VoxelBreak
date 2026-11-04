// Физика обломков. Тело касается мира и других тел своими поверхностными вокселями: каждая
// точка касания - шар радиуса 0,5 вокселя, мир и чужие тела - кубики. Касания решаются
// последовательными импульсами с трением, затем глубина выталкивается. Неподвижное засыпает
// и ничего не стоит, пока его не разбудят (удар, взрыв, пропала опора).
import { cross, dot, qmat, rotateInertia, mulMV, qnorm } from './math.js';
import { VOXEL } from './materials.js';

export const GRAVITY = 9.81 / VOXEL;      // вокселей в секунду за секунду
export const STEP = 1 / 60;
const SUBSTEPS = 2;
const ITER = 6;
const MAX_V = 70, MAX_W = 25;
const SLOP = 0.02;
const FRICTION = 0.6, RESTITUTION = 0.15;
const SLEEP_V2 = 0.3, SLEEP_W2 = 0.08, SLEEP_T = 0.6;
const REST_T = 1, REST_MOVE = 0.3, REST_TURN = Math.cos(0.08 / 2);

function sleep(b) { b.sleeping = true; b.v = [0, 0, 0]; b.w = [0, 0, 0]; b.sleepT = 0; }

export class Physics {
  constructor(world) {
    this.world = world;
    this.bodies = [];
    this.nextId = 1;
    this.time = 0;
    this.lost = 0;            // вокселей, улетевших за мир
    this.contactsLast = 0;
    this.impacts = [];        // сильные удары за шаг: для звука и пыли
    this.toWake = [];
  }

  add(body) {
    if (!body.id) body.id = this.nextId++;
    else this.nextId = Math.max(this.nextId, body.id + 1);
    body.syncR();
    this.bodies.push(body);
    return body;
  }
  remove(body) {
    const i = this.bodies.indexOf(body);
    if (i >= 0) this.bodies.splice(i, 1);
  }
  get(id) { return this.bodies.find((b) => b.id === id) || null; }
  awakeCount() { let n = 0; for (const b of this.bodies) if (!b.sleeping) n++; return n; }

  wake(b) { if (b.sleeping) { b.restT = 0; b.restPos = b.pos.slice(); b.restQ = b.q.slice(); } b.sleeping = false; b.sleepT = 0; }
  // разбудить всё, что касается ящика [x0, x1] (мировые координаты)
  wakeRegion(x0, y0, z0, x1, y1, z1) {
    for (const b of this.bodies) {
      const a = b.aabb();
      if (a[0] <= x1 + 1 && a[3] >= x0 - 1 && a[1] <= y1 + 1 && a[4] >= y0 - 1 && a[2] <= z1 + 1 && a[5] >= z0 - 1) this.wake(b);
    }
  }
  applyImpulse(b, point, J) {
    this.wake(b);
    b.syncR();
    const invI = rotateInertia(b.R, b.invI);
    b.v[0] += J[0] * b.invMass; b.v[1] += J[1] * b.invMass; b.v[2] += J[2] * b.invMass;
    const r = [point[0] - b.pos[0], point[1] - b.pos[1], point[2] - b.pos[2]];
    const dw = mulMV(invI, cross(r, J));
    b.w[0] += dw[0]; b.w[1] += dw[1]; b.w[2] += dw[2];
    clampVel(b);
  }

  step(dt = STEP) {
    this.impacts.length = 0;
    const h = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) this.substep(h);
    this.time += dt;
  }

  substep(h) {
    const awake = [];
    for (const b of this.bodies) {
      if (b.sleeping) continue;
      b.v[1] -= GRAVITY * h;
      clampVel(b);
      b.syncR();
      b.invIw = rotateInertia(b.R, b.invI);
      awake.push(b);
    }
    for (const b of this.bodies) if (b.sleeping) { b.syncR(); b.invIw = null; }
    const contacts = [];
    for (const b of awake) this.worldContacts(b, contacts);
    this.bodyContacts(contacts);
    this.contactsLast = contacts.length;
    for (const c of contacts) prepare(c);
    for (let it = 0; it < ITER; it++) for (const c of contacts) solve(c);
    // глубина: выталкивание по средней нормали касаний тела
    for (const c of contacts) {
      const d = c.depth - SLOP;
      if (d <= 0) continue;
      const ma = c.a.sleeping ? 0 : c.a.invMass, mb = c.b && !c.b.sleeping ? c.b.invMass : 0;
      const sum = ma + mb;
      if (sum <= 0) continue;
      push(c.a, c.n, d * ma / sum);
      if (c.b && mb) push(c.b, c.n, -d * mb / sum);
    }
    for (const b of awake) {
      if (b.pushN) {
        const k = 0.7 / b.pushN;
        b.pos[0] += b.push[0] * k; b.pos[1] += b.push[1] * k; b.pos[2] += b.push[2] * k;
        b.pushN = 0; b.push[0] = b.push[1] = b.push[2] = 0;
      }
      b.pos[0] += b.v[0] * h; b.pos[1] += b.v[1] * h; b.pos[2] += b.v[2] * h;
      const [wx, wy, wz] = b.w, q = b.q;
      const dq = [wx * q[3] + wy * q[2] - wz * q[1], -wx * q[2] + wy * q[3] + wz * q[0], wx * q[1] - wy * q[0] + wz * q[3], -wx * q[0] - wy * q[1] - wz * q[2]];
      q[0] += 0.5 * h * dq[0]; q[1] += 0.5 * h * dq[1]; q[2] += 0.5 * h * dq[2]; q[3] += 0.5 * h * dq[3];
      qnorm(q);
      if (b.touching) { b.w[0] *= 0.985; b.w[1] *= 0.985; b.w[2] *= 0.985; b.restTouch = true; }
      b.touching = false;
      const v2 = dot(b.v, b.v), w2 = dot(b.w, b.w);
      if (v2 < SLEEP_V2 && w2 < SLEEP_W2) {
        b.sleepT += h;
        if (b.sleepT > SLEEP_T) sleep(b);
      } else b.sleepT = 0;
      // качается на месте: за секунду почти не сдвинулся - тоже спать (бюджет кадра)
      b.restT += h;
      if (b.restT >= REST_T) {
        const moved = Math.hypot(b.pos[0] - b.restPos[0], b.pos[1] - b.restPos[1], b.pos[2] - b.restPos[2]);
        const turned = Math.abs(b.q[0] * b.restQ[0] + b.q[1] * b.restQ[1] + b.q[2] * b.restQ[2] + b.q[3] * b.restQ[3]);
        if (moved < REST_MOVE && turned > REST_TURN && b.restTouch) sleep(b);
        b.restT = 0; b.restTouch = false; b.restPos = b.pos.slice(); b.restQ = b.q.slice();
      }
    }
    for (const b of this.toWake) this.wake(b);
    this.toWake.length = 0;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      if (b.pos[1] < -64) { this.lost += b.count; this.bodies.splice(i, 1); }
    }
  }

  worldContacts(b, out) {
    const world = this.world, R = b.R, S = b.samples, p = b.pos;
    let any = false;
    for (let i = 0; i < S.length; i += 3) {
      const lx = S[i], ly = S[i + 1], lz = S[i + 2];
      const wx = R[0] * lx + R[1] * ly + R[2] * lz + p[0];
      const wy = R[3] * lx + R[4] * ly + R[5] * lz + p[1];
      const wz = R[6] * lx + R[7] * ly + R[8] * lz + p[2];
      const c = sphereVsCubes(wx, wy, wz, (x, y, z) => world.get(x, y, z));
      if (!c) continue;
      any = true;
      out.push(contact(b, null, c, wx, wy, wz));
    }
    if (any) b.touching = true;
  }

  bodyContacts(out) {
    const list = this.bodies.map((b) => ({ b, box: b.aabb() })).sort((x, y) => x.box[0] - y.box[0] || x.b.id - y.b.id);
    for (let i = 0; i < list.length; i++) {
      const A = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const B = list[j];
        if (B.box[0] > A.box[3]) break;
        if (A.b.sleeping && B.b.sleeping) continue;
        if (B.box[1] > A.box[4] || B.box[4] < A.box[1] || B.box[2] > A.box[5] || B.box[5] < A.box[2]) continue;
        // точки тела поменьше против сетки тела побольше
        const [s, g] = A.b.count <= B.b.count ? [A.b, B.b] : [B.b, A.b];
        this.pairContacts(s, g, out);
      }
    }
  }

  pairContacts(s, g, out) {
    const R = s.R, S = s.samples, p = s.pos, G = g.R, gp = g.pos, com = g.com;
    let any = false;
    const at = (x, y, z) => g.at(x, y, z);
    for (let i = 0; i < S.length; i += 3) {
      const lx = S[i], ly = S[i + 1], lz = S[i + 2];
      const wx = R[0] * lx + R[1] * ly + R[2] * lz + p[0];
      const wy = R[3] * lx + R[4] * ly + R[5] * lz + p[1];
      const wz = R[6] * lx + R[7] * ly + R[8] * lz + p[2];
      const dx = wx - gp[0], dy = wy - gp[1], dz = wz - gp[2];
      const gx = G[0] * dx + G[3] * dy + G[6] * dz + com[0];
      const gy = G[1] * dx + G[4] * dy + G[7] * dz + com[1];
      const gz = G[2] * dx + G[5] * dy + G[8] * dz + com[2];
      const c = sphereVsCubes(gx, gy, gz, at);
      if (!c) continue;
      // нормаль из сетки g в мир
      const n = [G[0] * c[0] + G[1] * c[1] + G[2] * c[2], G[3] * c[0] + G[4] * c[1] + G[5] * c[2], G[6] * c[0] + G[7] * c[1] + G[8] * c[2]];
      any = true;
      // спящее тело держит как опора; сильный удар его будит
      if (g.sleeping || s.sleeping) {
        const sleeper = g.sleeping ? g : s, mover = g.sleeping ? s : g;
        const rel = -dot(mover.v, n) * (mover === s ? 1 : -1);
        if (rel > 2.5) { this.toWake.push(sleeper); this.impacts.push({ x: wx, y: wy, z: wz, speed: rel }); }
      }
      out.push(contact(s, g, [n[0], n[1], n[2], c[3]], wx, wy, wz));
    }
    if (any) { s.touching = true; g.touching = true; }
  }
}

function clampVel(b) {
  const v2 = dot(b.v, b.v);
  if (v2 > MAX_V * MAX_V) { const k = MAX_V / Math.sqrt(v2); b.v[0] *= k; b.v[1] *= k; b.v[2] *= k; }
  const w2 = dot(b.w, b.w);
  if (w2 > MAX_W * MAX_W) { const k = MAX_W / Math.sqrt(w2); b.w[0] *= k; b.w[1] *= k; b.w[2] *= k; }
}

function push(b, n, d) {
  if (!b.push) { b.push = [0, 0, 0]; b.pushN = 0; }
  b.push[0] += n[0] * d; b.push[1] += n[1] * d; b.push[2] += n[2] * d;
  b.pushN++;
}

// шар радиуса 0,5 с центром (x, y, z) против единичных кубиков решётки get: [nx, ny, nz, глубина]
// или null. Нормаль смотрит из кубиков к шару.
export function sphereVsCubes(x, y, z, get) {
  const x0 = Math.floor(x - 0.5), y0 = Math.floor(y - 0.5), z0 = Math.floor(z - 0.5);
  let sx = 0, sy = 0, sz = 0, depth = 0;
  for (let vy = y0; vy <= y0 + 1; vy++)
    for (let vz = z0; vz <= z0 + 1; vz++)
      for (let vx = x0; vx <= x0 + 1; vx++) {
        if (!get(vx, vy, vz)) continue;
        const cx = x < vx ? vx : x > vx + 1 ? vx + 1 : x;
        const cy = y < vy ? vy : y > vy + 1 ? vy + 1 : y;
        const cz = z < vz ? vz : z > vz + 1 ? vz + 1 : z;
        const dx = x - cx, dy = y - cy, dz = z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= 0.25) continue;
        let nx, ny, nz, dep;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          nx = dx / d; ny = dy / d; nz = dz / d; dep = 0.5 - d;
        } else {
          // центр внутри кубика: наружу через ближайшую открытую грань
          let best = Infinity;
          nx = 0; ny = 1; nz = 0;
          const faces = [[0, 1, 0, vy + 1 - y], [0, -1, 0, y - vy], [1, 0, 0, vx + 1 - x], [-1, 0, 0, x - vx], [0, 0, 1, vz + 1 - z], [0, 0, -1, z - vz]];
          for (const [fx, fy, fz, dist] of faces) {
            if (dist < best && !get(vx + fx, vy + fy, vz + fz)) { best = dist; nx = fx; ny = fy; nz = fz; }
          }
          if (best === Infinity) best = vy + 1 - y;
          dep = 0.5 + best;
        }
        sx += nx * dep; sy += ny * dep; sz += nz * dep;
        if (dep > depth) depth = dep;
      }
  if (depth <= 0) return null;
  const l = Math.hypot(sx, sy, sz);
  if (l < 1e-9) return [0, 1, 0, depth];
  return [sx / l, sy / l, sz / l, depth];
}

function contact(a, b, c, wx, wy, wz) {
  const nx = c[0], ny = c[1], nz = c[2];
  const px = wx - nx * 0.5, py = wy - ny * 0.5, pz = wz - nz * 0.5;
  return {
    a, b, n: [nx, ny, nz], depth: c[3],
    ra: [px - a.pos[0], py - a.pos[1], pz - a.pos[2]],
    rb: b ? [px - b.pos[0], py - b.pos[1], pz - b.pos[2]] : null,
    jn: 0, jt1: 0, jt2: 0, kn: 0, k1: 0, k2: 0, target: 0, da: false, db: false, J: null,
  };
}

// J: для каждого направления (n, t1, t2) по 13 чисел:
// d (3), ra×d (3), Ia·(ra×d) (3), rb×d... заменено на (3+3) только при теле b - см. ниже
const STRIDE = 15;   // d(3) raXd(3) IraXd(3) rbXd(3) IrbXd(3)

function prepare(c) {
  const n = c.n;
  let t1x, t1y, t1z;
  if (Math.abs(n[0]) < 0.6) { t1x = 0; t1y = n[2]; t1z = -n[1]; } else { t1x = -n[2]; t1y = 0; t1z = n[0]; }
  const l = Math.hypot(t1x, t1y, t1z);
  t1x /= l; t1y /= l; t1z /= l;
  const t2x = n[1] * t1z - n[2] * t1y, t2y = n[2] * t1x - n[0] * t1z, t2z = n[0] * t1y - n[1] * t1x;
  const a = c.a, b = c.b;
  c.da = !a.sleeping;
  c.db = !!b && !b.sleeping;
  const J = c.J = new Float64Array(STRIDE * 3);
  const dirs = [n[0], n[1], n[2], t1x, t1y, t1z, t2x, t2y, t2z];
  const ra = c.ra, rb = c.rb, Ia = a.invIw, Ib = c.db ? b.invIw : null;
  const ks = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const o = k * STRIDE;
    const dx = dirs[k * 3], dy = dirs[k * 3 + 1], dz = dirs[k * 3 + 2];
    J[o] = dx; J[o + 1] = dy; J[o + 2] = dz;
    let kk = 0;
    if (c.da) {
      const cx = ra[1] * dz - ra[2] * dy, cy = ra[2] * dx - ra[0] * dz, cz = ra[0] * dy - ra[1] * dx;
      J[o + 3] = cx; J[o + 4] = cy; J[o + 5] = cz;
      J[o + 6] = Ia[0] * cx + Ia[1] * cy + Ia[2] * cz; J[o + 7] = Ia[3] * cx + Ia[4] * cy + Ia[5] * cz; J[o + 8] = Ia[6] * cx + Ia[7] * cy + Ia[8] * cz;
      kk += a.invMass + cx * J[o + 6] + cy * J[o + 7] + cz * J[o + 8];
    }
    if (b) {
      const cx = rb[1] * dz - rb[2] * dy, cy = rb[2] * dx - rb[0] * dz, cz = rb[0] * dy - rb[1] * dx;
      J[o + 9] = cx; J[o + 10] = cy; J[o + 11] = cz;
      if (c.db) {
        J[o + 12] = Ib[0] * cx + Ib[1] * cy + Ib[2] * cz; J[o + 13] = Ib[3] * cx + Ib[4] * cy + Ib[5] * cz; J[o + 14] = Ib[6] * cx + Ib[7] * cy + Ib[8] * cz;
        kk += b.invMass + cx * J[o + 12] + cy * J[o + 13] + cz * J[o + 14];
      }
    }
    ks[k] = kk;
  }
  c.kn = ks[0]; c.k1 = ks[1]; c.k2 = ks[2];
  c.t1 = [t1x, t1y, t1z]; c.t2 = [t2x, t2y, t2z];
  const vn = relVel(c, 0);
  c.target = vn < -3 ? -RESTITUTION * vn : 0;
}

// относительная скорость точки касания вдоль направления k (0 - нормаль, 1, 2 - касательные)
function relVel(c, k) {
  const J = c.J, o = k * STRIDE, a = c.a;
  let v = a.v[0] * J[o] + a.v[1] * J[o + 1] + a.v[2] * J[o + 2];
  if (c.da) v += a.w[0] * J[o + 3] + a.w[1] * J[o + 4] + a.w[2] * J[o + 5];
  if (c.b) {
    const b = c.b;
    v -= b.v[0] * J[o] + b.v[1] * J[o + 1] + b.v[2] * J[o + 2] + b.w[0] * J[o + 9] + b.w[1] * J[o + 10] + b.w[2] * J[o + 11];
  }
  return v;
}

function impulse(c, k, j) {
  const J = c.J, o = k * STRIDE;
  if (c.da) {
    const a = c.a, m = a.invMass * j;
    a.v[0] += J[o] * m; a.v[1] += J[o + 1] * m; a.v[2] += J[o + 2] * m;
    a.w[0] += J[o + 6] * j; a.w[1] += J[o + 7] * j; a.w[2] += J[o + 8] * j;
  }
  if (c.db) {
    const b = c.b, m = b.invMass * j;
    b.v[0] -= J[o] * m; b.v[1] -= J[o + 1] * m; b.v[2] -= J[o + 2] * m;
    b.w[0] -= J[o + 12] * j; b.w[1] -= J[o + 13] * j; b.w[2] -= J[o + 14] * j;
  }
}

function solve(c) {
  if (c.kn <= 0) return;
  let j = (c.target - relVel(c, 0)) / c.kn;
  const old = c.jn;
  c.jn = old + j > 0 ? old + j : 0;
  j = c.jn - old;
  if (j) impulse(c, 0, j);
  const lim = FRICTION * c.jn;
  if (c.k1 > 0) {
    const o1 = c.jt1;
    let v = o1 - relVel(c, 1) / c.k1;
    v = v < -lim ? -lim : v > lim ? lim : v;
    c.jt1 = v;
    if (v !== o1) impulse(c, 1, v - o1);
  }
  if (c.k2 > 0) {
    const o2 = c.jt2;
    let v = o2 - relVel(c, 2) / c.k2;
    v = v < -lim ? -lim : v > lim ? lim : v;
    c.jt2 = v;
    if (v !== o2) impulse(c, 2, v - o2);
  }
}

export { qmat };
