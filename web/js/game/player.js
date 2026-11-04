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
    else p.y = Math.floor(p.y + dy + p.height) - p.height - 1e-4;
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
  // обломки: невысокий кусок под ногами - ступенька, высокий - стена, которую толкают плечом
  const pushes = [];
  const H = P.HALF * 0.85;
  const FEET = [[0, 0], [-H, -H], [H, -H], [-H, H], [H, H]];
  for (const b of bodies) {
    const dxb = b.pos[0] - p.x, dzb = b.pos[2] - p.z, dyb = b.pos[1] - (p.y + p.height / 2);
    const r = b.radius + P.HALF + p.height / 2;
    if (dxb * dxb + dyb * dyb + dzb * dzb > r * r) continue;
    b.syncR();
    const inside = (x, y, z) => { const g = b.toGrid([x, y, z]); return b.at(Math.floor(g[0]), Math.floor(g[1]), Math.floor(g[2])) !== 0; };
    const feetIn = (y) => FEET.some(([ox, oz]) => inside(p.x + ox, y, p.z + oz));
    const tall = FEET.some(([ox, oz]) => inside(p.x + ox, p.y + P.STEP + 0.4, p.z + oz));
    if (!tall && p.vy <= 0.5 && feetIn(p.y + 0.05)) {
      // встать на верх куска: ближайшая свободная высота (деление пополам)
      let lo = p.y, hi = p.y + P.STEP + 0.4;
      for (let k = 0; k < 10; k++) { const mid = (lo + hi) / 2; if (feetIn(mid + 0.05)) lo = mid; else hi = mid; }
      p.y = hi; p.vy = 0; p.onGround = true;
    } else if (!tall && p.vy <= 0 && feetIn(p.y - 0.06)) { p.vy = 0; p.onGround = true; }
    for (const hy of [p.height * 0.2, p.height * 0.5, p.height * 0.85]) {
      if (!tall && hy < P.STEP + 0.4) continue;
      const hit = FEET.slice(1).find(([ox, oz]) => inside(p.x + ox * 1.15, p.y + hy, p.z + oz * 1.15));
      if (!hit) continue;
      const l = Math.hypot(dxb, dzb) || 1;
      p.x -= dxb / l * 0.3; p.z -= dzb / l * 0.3;
      const dot = (p.vx * dxb + p.vz * dzb) / l;
      if (dot > 0) { p.vx -= dxb / l * dot; p.vz -= dzb / l * dot; }
      pushes.push({ body: b, dir: [dxb / l, 0, dzb / l], at: [p.x + dxb / l * P.HALF, p.y + hy, p.z + dzb / l * P.HALF] });
      break;
    }
  }
  return pushes;
}
