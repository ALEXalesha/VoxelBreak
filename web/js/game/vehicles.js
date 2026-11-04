// Техника. Машина и бульдозер едут по земле, взбираются на ступеньки до 2 вокселей, а всё
// выше - таранят: удар ломает то, что слабее силы удара, и тормозит. Кран вращает стрелу,
// шар висит на тросе маятником и ломает всё, во что врезается с разгона.
// Сама техника не ломается (упрощение v1).
import { GRAVITY } from '../core/physics.js';
import { VOXEL } from '../core/materials.js';

export const SPECS = {
  car: { model: 'car', len: 16, wid: 7, hgt: 7, maxV: 15 / VOXEL, accel: 7 / VOXEL, power: 7.5, mass: 1200, turn: 1.6 },
  bulldozer: { model: 'bulldozer', len: 22, wid: 12, hgt: 12, maxV: 4 / VOXEL, accel: 3 / VOXEL, power: 13, mass: 15000, turn: 1.0, blade: true },
};
const BOOM = 48, TOWER = 41.5, BALL_R = 3;

export function newVehicle(type, x, y, z, yaw = 0) {
  if (type === 'crane') {
    const tipY = y + TOWER;
    return { type, x, y, z, yaw, rope: 22, ball: { pos: [x + BOOM, tipY - 22, z], vel: [0, 0, 0] }, hitT: 0 };
  }
  return { type, x, y, z, yaw, speed: 0, vy: 0, hitT: 0 };
}

export const forwardOf = (v) => [Math.cos(v.yaw), 0, -Math.sin(v.yaw)];
export function craneTip(v) {
  const f = forwardOf(v);
  return [v.x + f[0] * BOOM, v.y + TOWER, v.z + f[2] * BOOM];
}

// высота опоры под точкой: верх самого высокого твёрдого вокселя не выше y + up
function groundAt(world, x, y, z, up) {
  const xi = Math.floor(x), zi = Math.floor(z);
  for (let yy = Math.floor(y + up); yy >= Math.floor(y) - 6; yy--) if (world.get(xi, yy, zi)) return yy + 1;
  return -Infinity;
}

// input: { mz (газ), mx (руль), jump (тормоз / трос вверх), crouch (трос вниз) }
export function stepVehicle(sim, v, input, dt) {
  if (v.type === 'crane') return stepCrane(sim, v, input, dt);
  const S = SPECS[v.type];
  const world = sim.world;
  const thr = input ? input.mz || 0 : 0, steer = input ? input.mx || 0 : 0;
  if (input && input.jump) v.speed *= Math.max(0, 1 - 4 * dt);
  v.speed += thr * S.accel * dt;
  v.speed *= 1 - 0.6 * dt;
  v.speed = Math.max(-S.maxV * 0.4, Math.min(S.maxV, v.speed));
  if (Math.abs(v.speed) > 0.5) v.yaw -= steer * S.turn * dt * Math.sign(v.speed) * Math.min(1, Math.abs(v.speed) / 10);
  const f = forwardOf(v), side = [-f[2], 0, f[0]];
  const nx = v.x + f[0] * v.speed * dt, nz = v.z + f[2] * v.speed * dt;
  // земля под колёсами: углы и середина
  const pts = [];
  for (const a of [-0.45, 0, 0.45]) for (const b of [-0.4, 0.4]) pts.push([nx + f[0] * S.len * a + side[0] * S.wid * b, nz + f[2] * S.len * a + side[2] * S.wid * b]);
  let ground = -Infinity;
  for (const [px, pz] of pts) ground = Math.max(ground, groundAt(world, px, v.y, pz, 2.2));
  // таран: что впереди выше ступеньки
  const base = Math.max(ground, v.y);
  const hit = frontVoxels(world, v, S, nx, nz, base);
  v.hitT = Math.max(0, v.hitT - dt);
  if (hit.length && Math.abs(v.speed) > 0.5) {
    const speedK = Math.min(1, Math.abs(v.speed) / S.maxV);
    const power = S.blade ? S.power * (0.6 + 0.4 * speedK) : S.power * speedK;
    if (v.hitT <= 0) {
      // удар по всей ширине: свой шар на каждую полосу перед машиной
      const bins = new Map();
      for (const [x, y, z] of hit) {
        const lat = Math.floor(((x + 0.5 - nx) * side[0] + (z + 0.5 - nz) * side[2] + S.wid / 2) / 3.5);
        const key = lat * 64 + Math.floor((y - base) / 3.5);
        const g = bins.get(key) || { x: 0, y: 0, z: 0, n: 0 };
        g.x += x + 0.5; g.y += y + 0.5; g.z += z + 0.5; g.n++;
        bins.set(key, g);
      }
      let removed = 0, cx = 0, cy = 0, cz = 0;
      for (const g of [...bins.keys()].sort((a, b) => a - b).map((k) => bins.get(k))) {
        cx = g.x / g.n; cy = g.y / g.n; cz = g.z / g.n;
        removed += sim.destruction.sphere(cx, cy, cz, 3.0, power, { impulse: Math.abs(v.speed) * 0.6 }).removedWorld;
      }
      sim.emit({ type: 'ram', x: cx, y: cy, z: cz, speed: Math.abs(v.speed), vehicle: v.type, removed });
      v.hitT = S.blade ? 0.12 : 0.08;
    }
    const still = frontVoxels(world, v, S, nx, nz, base);
    if (still.length) { v.speed = S.blade ? v.speed * 0.5 : -v.speed * 0.25; return; }
    v.speed *= S.blade ? 0.85 : 0.7;
  }
  v.x = nx; v.z = nz;
  // тела на пути толкаются
  for (const b of sim.physics.bodies) {
    const dx = b.pos[0] - (v.x + f[0] * S.len * 0.5), dz = b.pos[2] - (v.z + f[2] * S.len * 0.5), dy = b.pos[1] - (v.y + S.hgt / 2);
    if (Math.hypot(dx, dy, dz) > b.radius + S.wid * 0.6 || Math.abs(v.speed) < 1) continue;
    const j = Math.min(b.mass * 30, S.mass * Math.abs(v.speed) * 0.08);
    sim.physics.applyImpulse(b, [b.pos[0] - dx * 0.3, b.pos[1], b.pos[2] - dz * 0.3], [f[0] * j * Math.sign(v.speed), j * 0.15, f[2] * j * Math.sign(v.speed)]);
    v.speed *= 1 - Math.min(0.3, b.mass / S.mass);
  }
  // по вертикали: на опору или вниз
  if (ground >= v.y - 0.01 && ground !== -Infinity) { v.y = ground; v.vy = 0; }
  else { v.vy -= GRAVITY * dt; v.y = Math.max(ground === -Infinity ? -100 : ground, v.y + v.vy * dt); if (ground !== -Infinity && v.y <= ground) v.vy = 0; }
}

// твёрдые воксели в коробе перед машиной (выше ступеньки)
function frontVoxels(world, v, S, x, z, base) {
  const f = forwardOf(v), side = [-f[2], 0, f[0]];
  const out = [];
  const seen = new Set();
  for (let a = S.len * 0.5 - 1; a <= S.len * 0.5 + 0.5; a += 0.5)
    for (let b = -S.wid / 2 + 0.5; b <= S.wid / 2 - 0.5; b += 0.5)
      for (let h = 2.2; h < S.hgt; h += 1) {
        const px = Math.floor(x + f[0] * a + side[0] * b), py = Math.floor(base + h), pz = Math.floor(z + f[2] * a + side[2] * b);
        const k = `${px},${py},${pz}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (world.get(px, py, pz)) out.push([px, py, pz]);
      }
  return out;
}

function stepCrane(sim, v, input, dt) {
  const world = sim.world;
  if (input) {
    v.yaw -= (input.mx || 0) * 0.7 * dt;
    v.rope = Math.max(4, Math.min(TOWER + 2, v.rope + ((input.crouch ? 1 : 0) - (input.jump ? 1 : 0) + (input.mz ? -input.mz : 0)) * 10 * dt));
  }
  const tip = craneTip(v);
  const b = v.ball;
  b.vel[1] -= GRAVITY * dt;
  for (let k = 0; k < 3; k++) { b.vel[k] *= 1 - 0.05 * dt; b.pos[k] += b.vel[k] * dt; }
  // трос: не длиннее заданного
  const d = [b.pos[0] - tip[0], b.pos[1] - tip[1], b.pos[2] - tip[2]];
  const l = Math.hypot(d[0], d[1], d[2]);
  if (l > v.rope) {
    const n = d.map((c) => c / l);
    for (let k = 0; k < 3; k++) b.pos[k] = tip[k] + n[k] * v.rope;
    const out = b.vel[0] * n[0] + b.vel[1] * n[1] + b.vel[2] * n[2];
    if (out > 0) for (let k = 0; k < 3; k++) b.vel[k] -= n[k] * out;
  }
  // удар шара
  v.hitT = Math.max(0, v.hitT - dt);
  let sx = 0, sy = 0, sz = 0, n = 0;
  const r = BALL_R;
  for (let y = Math.floor(b.pos[1] - r - 0.5); y <= Math.floor(b.pos[1] + r + 0.5); y++)
    for (let z = Math.floor(b.pos[2] - r - 0.5); z <= Math.floor(b.pos[2] + r + 0.5); z++)
      for (let x = Math.floor(b.pos[0] - r - 0.5); x <= Math.floor(b.pos[0] + r + 0.5); x++)
        if (world.get(x, y, z) && Math.hypot(x + 0.5 - b.pos[0], y + 0.5 - b.pos[1], z + 0.5 - b.pos[2]) <= r + 0.6) { sx += x + 0.5; sy += y + 0.5; sz += z + 0.5; n++; }
  if (n) {
    const c = [sx / n, sy / n, sz / n];
    const nrm = [b.pos[0] - c[0], b.pos[1] - c[1], b.pos[2] - c[2]];
    const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
    for (let k = 0; k < 3; k++) nrm[k] /= nl;
    const into = -(b.vel[0] * nrm[0] + b.vel[1] * nrm[1] + b.vel[2] * nrm[2]);
    const speed = Math.hypot(...b.vel);
    if (into > 4 && v.hitT <= 0) {
      const rep = sim.destruction.sphere(b.pos[0] - nrm[0] * 1.5, b.pos[1] - nrm[1] * 1.5, b.pos[2] - nrm[2] * 1.5, r + 1.2, Math.min(15, 3 + into * 0.35), { impulse: into * 0.8 });
      sim.emit({ type: 'ram', x: c[0], y: c[1], z: c[2], speed, vehicle: 'crane', removed: rep.removedWorld });
      v.hitT = 0.1;
      for (let k = 0; k < 3; k++) b.vel[k] *= 0.65;
    }
    // вытолкнуть шар и погасить скорость внутрь
    if (into > 0) for (let k = 0; k < 3; k++) b.vel[k] += nrm[k] * into * 1.2;
    for (let k = 0; k < 3; k++) b.pos[k] += nrm[k] * 0.15;
  }
  for (const body of sim.physics.bodies) {
    const dx = body.pos[0] - b.pos[0], dy = body.pos[1] - b.pos[1], dz = body.pos[2] - b.pos[2];
    const dist = Math.hypot(dx, dy, dz);
    if (dist > body.radius + r || dist < 1e-6) continue;
    const speed = Math.hypot(...b.vel);
    if (speed < 2) continue;
    const j = Math.min(body.mass * 25, 4000 * speed * 0.05);
    sim.physics.applyImpulse(body, b.pos, [dx / dist * j, dy / dist * j, dz / dist * j]);
  }
}
