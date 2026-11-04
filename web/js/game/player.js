// Игрок: ящик 0,6 × 1,8 м, шаги по осям с подъёмом на ступеньку до 0,5 м, прыжок, бег,
// присед, полёт. Обломки толкаются плечом и держат как пол.
import { VOXEL } from '../core/materials.js';
import { GRAVITY } from '../core/physics.js';

export const P = {
  HALF: 0.3 / VOXEL, HEIGHT: 1.8 / VOXEL, CROUCH_H: 1.2 / VOXEL, EYE: 1.62 / VOXEL, CROUCH_EYE: 1.05 / VOXEL,
  WALK: 4.5 / VOXEL, RUN: 7.5 / VOXEL, CROUCH_SPEED: 2 / VOXEL, FLY: 12 / VOXEL,
  JUMP: Math.sqrt(2 * GRAVITY * (1.15 / VOXEL)), STEP: 2.05, ACCEL: 14, AIR: 2.5,
};

export function newPlayer(x, y, z) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0, onGround: false, flying: false, crouch: false, height: P.HEIGHT, fallSpeed: 0 };
}

export const eyeY = (p) => p.y + (p.crouch ? P.CROUCH_EYE : P.EYE);

// направление взгляда
export function lookDir(p) {
  const cp = Math.cos(p.pitch);
  return [-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp];
}

function blocked(world, x0, y0, z0, x1, y1, z1) {
  for (let y = Math.floor(y0); y <= Math.floor(y1 - 1e-6); y++)
    for (let z = Math.floor(z0); z <= Math.floor(z1 - 1e-6); z++)
      for (let x = Math.floor(x0); x <= Math.floor(x1 - 1e-6); x++) if (world.get(x, y, z)) return true;
  return false;
}
const boxOf = (p, x = p.x, y = p.y, z = p.z) => [x - P.HALF, y, z - P.HALF, x + P.HALF, y + p.height, z + P.HALF];

export function collides(world, p, x = p.x, y = p.y, z = p.z) {
  const b = boxOf(p, x, y, z);
  return blocked(world, b[0], b[1], b[2], b[3], b[4], b[5]);
}

// input: { mx, mz (-1..1 вперёд/вбок), jump, run, crouch, up, down }
export function stepPlayer(world, p, input, dt, bodies = []) {
  const wantCrouch = !!input.crouch && !p.flying;
  if (wantCrouch !== p.crouch) {
    const h = wantCrouch ? P.CROUCH_H : P.HEIGHT;
    const was = p.height;
    p.height = h;
    if (!wantCrouch && collides(world, p)) p.height = was;       // встать некуда - сидим
    else p.crouch = wantCrouch;
  }
  const speed = p.flying ? P.FLY * (input.run ? 2 : 1) : p.crouch ? P.CROUCH_SPEED : input.run ? P.RUN : P.WALK;
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  let mx = input.mx || 0, mz = input.mz || 0;
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }
  const tx = (-sin * mz + cos * mx) * speed, tz = (-cos * mz - sin * mx) * speed;
  const k = Math.min(1, (p.onGround || p.flying ? P.ACCEL : P.AIR) * dt);
  p.vx += (tx - p.vx) * k;
  p.vz += (tz - p.vz) * k;
  if (p.flying) {
    const ty = ((input.up ? 1 : 0) - (input.down ? 1 : 0)) * speed;
    p.vy += (ty - p.vy) * k;
  } else {
    if (input.jump && p.onGround) { p.vy = P.JUMP; p.onGround = false; }
    p.vy -= GRAVITY * dt;
    if (p.vy < -80) p.vy = -80;
  }
  const wasGround = p.onGround;
  // по вертикали
  const dy = p.vy * dt;
  p.onGround = false;
  if (!collides(world, p, p.x, p.y + dy, p.z)) p.y += dy;
  else {
    if (dy < 0) { p.y = Math.floor(p.y + dy) + 1; if (collides(world, p)) p.y = Math.ceil(p.y); p.onGround = true; p.fallSpeed = -p.vy; }
    else p.y = Math.ceil(p.y + dy + p.height) - p.height - 1e-4;
    p.vy = 0;
  }
  // по горизонтали с подъёмом на ступеньку
  for (const axis of ['x', 'z']) {
    const d = (axis === 'x' ? p.vx : p.vz) * dt;
    if (!d) continue;
    const nx = axis === 'x' ? p.x + d : p.x, nz = axis === 'z' ? p.z + d : p.z;
    if (!collides(world, p, nx, p.y, nz)) { p.x = nx; p.z = nz; continue; }
    let stepped = false;
    if ((wasGround || p.onGround) && !p.flying) {
      for (let s = 1; s <= P.STEP; s += 1) {
        const up = Math.floor(p.y) + s;
        if (!collides(world, p, nx, up, nz)) { p.x = nx; p.z = nz; p.y = up; stepped = true; break; }
      }
    }
    if (!stepped) { if (axis === 'x') p.vx = 0; else p.vz = 0; }
  }
  // обломки: держат как пол, толкаются плечом
  const pushes = [];
  for (const b of bodies) {
    const dxb = b.pos[0] - p.x, dzb = b.pos[2] - p.z, dyb = b.pos[1] - (p.y + p.height / 2);
    const r = b.radius + P.HALF + p.height / 2;
    if (dxb * dxb + dyb * dyb + dzb * dzb > r * r) continue;
    b.syncR();
    let lift = 0;
    for (const [ox, oz] of [[0, 0], [-P.HALF, -P.HALF], [P.HALF, -P.HALF], [-P.HALF, P.HALF], [P.HALF, P.HALF]]) {
      for (let s = 0; s <= 2; s++) {
        const g = b.toGrid([p.x + ox * 0.9, p.y + s * 0.5 + 0.01, p.z + oz * 0.9]);
        if (b.at(Math.floor(g[0]), Math.floor(g[1]), Math.floor(g[2]))) lift = Math.max(lift, s * 0.5 + 0.5);
      }
    }
    if (lift && p.vy <= 0.5) { p.y += Math.min(lift, 1.2); p.vy = 0; p.onGround = true; }
    for (const hy of [p.height * 0.45, p.height * 0.8]) {
      const g = b.toGrid([p.x, p.y + hy, p.z]);
      if (!b.at(Math.floor(g[0]), Math.floor(g[1]), Math.floor(g[2]))) continue;
      const l = Math.hypot(dxb, dzb) || 1;
      p.x -= dxb / l * 0.25; p.z -= dzb / l * 0.25;
      pushes.push({ body: b, dir: [dxb / l, 0, dzb / l], at: [p.x, p.y + hy, p.z] });
    }
  }
  return pushes;
}
