// Игра без окна: мир, тела, игрок, инструменты, техника и события для звука и картинки.
// Шаг фиксированный (1/60 с). Окно только читает состояние и передаёт ввод.
import { World } from '../core/world.js';
import { makePlan, generateWorld } from '../core/gen.js';
import { Physics, STEP, GRAVITY } from '../core/physics.js';
import { Destruction } from '../core/destruction.js';
import { bodyFromModel, bodyRaycast } from '../core/body.js';
import { rotateModel } from '../core/model.js';
import { serialize, deserialize } from '../core/save.js';
import { newPlayer, stepPlayer, lookDir, eyeY } from './player.js';
import { TOOLS, TOOL, VEHICLES, pelletDirs } from './tools.js';
import { newVehicle, stepVehicle, SPECS } from './vehicles.js';

export const DEFAULT_SIZE = [12, 3, 12];

export class Sim {
  constructor(assets) {
    this.assets = assets;
    this.events = [];
    this.world = null;
  }

  newGame({ seed = 1, kind = 'town', size = DEFAULT_SIZE } = {}) {
    const [sx, sy, sz] = size;
    this.plan = makePlan({ seed, kind, sx, sy, sz }, this.assets);
    this.world = generateWorld(this.plan, new World({ sx, sy, sz }));
    this.physics = new Physics(this.world);
    this.destruction = new Destruction(this.world, this.physics);
    for (const p of this.plan.props) {
      const model = rotateModel(this.assets.get(p.id, p.params, null), p.rot);
      const b = this.physics.add(bodyFromModel(0, model, p.x, p.y, p.z));
      b.sleeping = true;
      b.prop = p.id;
    }
    const s = this.plan.spawn;
    this.reset(newPlayer(s.x, s.y, s.z));
    this.player.yaw = Math.PI * 0.75;
    this.startTotal = this.destruction.total();
    return this;
  }

  reset(player) {
    this.player = player;
    this.time = 0;
    this.toolIndex = 0;
    this.cool = 0;
    this.laserAcc = 0;
    this.entities = [];
    this.vehicles = [];
    this.driving = null;
    this.grab = null;
    this.vehicleType = 0;
    this.ammo = Object.fromEntries(TOOLS.filter((t) => t.ammo).map((t) => [t.id, t.ammo]));
    this.laserOn = null;
    this.stats = { shots: 0, explosions: 0 };
  }

  get tool() { return TOOLS[this.toolIndex]; }
  emit(e) { this.events.push(e); }
  drainEvents() {
    const out = this.events.concat(this.destruction.events);
    this.events = []; this.destruction.events = [];
    return out;
  }

  selectTool(i) {
    if (i < 0 || i >= TOOLS.length || i === this.toolIndex) return;
    this.toolIndex = i;
    this.releaseGrab();
    this.emit({ type: 'tool', id: this.tool.id });
  }

  // луч из глаз: ближайшее из мира и тел
  rayHit(o, d, max) {
    const w = this.world.raycast(o[0], o[1], o[2], d[0], d[1], d[2], max);
    let best = w ? { kind: 'world', t: w.t, point: [w.px, w.py, w.pz], normal: [w.nx, w.ny, w.nz], m: w.m } : null;
    for (const b of this.physics.bodies) {
      if (this.driving && b === this.driving.body) continue;
      const h = bodyRaycast(b, o, d, best ? best.t : max);
      if (h && (!best || h.t < best.t)) best = { kind: 'body', body: b, t: h.t, point: h.point, normal: h.normal, m: h.m };
    }
    return best;
  }

  eye() { const p = this.player; return [p.x, eyeY(p), p.z]; }

  step(input = {}, dt = STEP) {
    const p = this.player;
    if (input.look) {
      p.yaw -= input.look[0];
      p.pitch = Math.max(-1.55, Math.min(1.55, p.pitch - input.look[1]));
    }
    if (input.tool != null) this.selectTool(input.tool);
    if (input.nextTool) this.selectTool((this.toolIndex + input.nextTool + TOOLS.length) % TOOLS.length);
    if (input.use) this.toggleVehicle();
    if (input.fly && !this.driving) { p.flying = !p.flying; p.vy = 0; this.emit({ type: 'fly', on: p.flying }); }

    if (this.driving) {
      stepVehicle(this, this.driving, input, dt);
      const v = this.driving;
      p.x = v.x; p.y = v.y + 4; p.z = v.z; p.vx = p.vy = p.vz = 0;
    } else {
      const pushes = stepPlayer(this.world, p, input, dt, this.physics.bodies);
      for (const k of pushes) this.physics.applyImpulse(k.body, k.at, [k.dir[0] * 60 * dt * Math.min(k.body.mass, 400), 0, k.dir[2] * 60 * dt * Math.min(k.body.mass, 400)]);
      if (p.y < -40) { const s = this.plan.spawn; p.x = s.x; p.y = s.y + 2; p.z = s.z; p.vy = 0; }
      this.useTool(input, dt);
    }
    for (const v of this.vehicles) if (v !== this.driving) stepVehicle(this, v, null, dt);
    this.updateEntities(dt);
    this.updateGrab(dt);
    this.destruction.update(dt);
    this.physics.step(dt);
    this.time += dt;
  }

  useTool(input, dt) {
    const t = this.tool;
    this.cool = Math.max(0, this.cool - dt);
    const eye = this.eye(), dir = lookDir(this.player);
    this.laserOn = null;
    if (t.id === 'laser') {
      if (!input.fire1) return;
      this.laserAcc += dt * t.rate;
      const hit = this.rayHit(eye, dir, t.range);
      this.laserOn = { from: eye, to: hit ? hit.point : eye.map((c, k) => c + dir[k] * t.range) };
      while (this.laserAcc >= 1) {
        this.laserAcc -= 1;
        if (!hit) break;
        const n = hit.normal;
        this.destruction.sphere(hit.point[0] - n[0] * 0.45, hit.point[1] - n[1] * 0.45, hit.point[2] - n[2] * 0.45, t.radius, t.power);
      }
      return;
    }
    if (t.id === 'hands') {
      if (input.fire2Pressed) {
        if (this.grab) this.releaseGrab(); else this.tryGrab(eye, dir);
      }
      if (input.fire1Pressed && this.cool <= 0) {
        this.cool = t.cooldown;
        if (this.grab) {
          const b = this.grab.body;
          this.releaseGrab();
          this.physics.applyImpulse(b, b.pos, dir.map((c) => c * Math.min(b.mass, t.grabMass) * 40 / Math.sqrt(Math.max(1, b.mass / 200))));
          this.emit({ type: 'throw' });
          return;
        }
        const hit = this.rayHit(eye, dir, t.range);
        if (hit && hit.kind === 'body') {
          const j = Math.min(hit.body.mass, 2000) * t.push / Math.sqrt(Math.max(1, hit.body.mass / 100));
          this.physics.applyImpulse(hit.body, hit.point, dir.map((c) => c * j));
          this.emit({ type: 'push', x: hit.point[0], y: hit.point[1], z: hit.point[2] });
        }
      }
      return;
    }
    const wants = t.id === 'hammer' || t.id === 'shotgun' ? input.fire1 : input.fire1Pressed;
    if (t.id === 'vehicle' && input.fire2Pressed) { this.vehicleType = (this.vehicleType + 1) % VEHICLES.length; this.emit({ type: 'vehicle-type', id: VEHICLES[this.vehicleType] }); }
    if (!wants || this.cool > 0) return;
    if (t.ammo && this.ammo[t.id] <= 0) { this.emit({ type: 'empty', tool: t.id }); this.cool = 0.3; return; }
    this.cool = t.cooldown;
    if (t.ammo) this.ammo[t.id]--;
    this.stats.shots++;
    if (t.id === 'hammer') {
      this.emit({ type: 'swing' });
      const hit = this.rayHit(eye, dir, t.range);
      if (!hit) return;
      const n = hit.normal;
      this.destruction.sphere(hit.point[0] - n[0] * 0.6, hit.point[1] - n[1] * 0.6, hit.point[2] - n[2] * 0.6, t.radius, t.power);
      if (hit.kind === 'body' && this.physics.bodies.includes(hit.body)) this.physics.applyImpulse(hit.body, hit.point, dir.map((c) => c * Math.min(hit.body.mass, 600) * t.push * 0.1));
    } else if (t.id === 'shotgun') {
      this.emit({ type: 'shot', x: eye[0], y: eye[1], z: eye[2] });
      // все дробины летят разом: сначала попадания, потом разрушение
      const hits = pelletDirs(dir, t.pellets, t.spread, Math.floor(this.time * 60)).map((d) => [d, this.rayHit(eye, d, t.range)]);
      for (const [d, hit] of hits) {
        if (!hit) continue;
        const n = hit.normal;
        this.destruction.sphere(hit.point[0] - n[0] * 0.5, hit.point[1] - n[1] * 0.5, hit.point[2] - n[2] * 0.5, t.radius, t.power);
        if (hit.kind === 'body' && this.physics.bodies.includes(hit.body)) this.physics.applyImpulse(hit.body, hit.point, d.map((c) => c * Math.min(hit.body.mass, 300) * t.push * 0.1));
      }
    } else if (t.id === 'dynamite') {
      if (this.entities.filter((e) => e.type === 'dynamite').length >= t.max) { this.ammo.dynamite++; return; }
      const hit = this.rayHit(eye, dir, t.range);
      const e = { type: 'dynamite', pos: eye.map((c, k) => c + dir[k] * 1.5), vel: dir.map((c) => c * 22), fuse: t.fuse, stuck: null };
      if (hit && hit.t < 5) stick(e, hit);
      this.entities.push(e);
      this.emit({ type: 'place' });
    } else if (t.id === 'rocket') {
      this.entities.push({ type: 'rocket', pos: eye.map((c, k) => c + dir[k] * 2), vel: dir.map((c) => c * t.speed), life: 6 });
      this.emit({ type: 'launch', x: eye[0], y: eye[1], z: eye[2] });
    } else if (t.id === 'vehicle') {
      this.spawnVehicle(VEHICLES[this.vehicleType]);
    }
  }

  spawnVehicle(type) {
    const p = this.player, f = [-Math.sin(p.yaw), -Math.cos(p.yaw)];
    const dist = type === 'crane' ? 20 : 16;
    const x = p.x + f[0] * dist, z = p.z + f[1] * dist;
    let y = Math.floor(p.y) + 8;
    while (y > 0 && !this.world.get(Math.floor(x), y - 1, Math.floor(z))) y--;
    const v = newVehicle(type, x, y, z, Math.atan2(-f[1], f[0]));
    if (type !== 'crane') v.model = SPECS[type].model;
    this.vehicles.push(v);
    if (this.vehicles.length > 4) this.vehicles.shift();
    this.emit({ type: 'spawn', vehicle: type });
    return v;
  }

  // сесть в ближайшую технику или выйти
  toggleVehicle() {
    const p = this.player;
    if (this.driving) {
      const v = this.driving;
      this.driving = null;
      p.x = v.x - Math.sin(v.yaw) * 10; p.z = v.z - Math.cos(v.yaw) * 10;
      p.y = v.y + 2;
      for (let k = 0; k < 40 && this.collidesPlayer(); k++) p.y += 1;
      this.emit({ type: 'exit' });
      return;
    }
    let best = null, bd = 30;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < bd) { bd = d; best = v; }
    }
    if (best) { this.driving = best; this.releaseGrab(); this.emit({ type: 'enter', vehicle: best.type }); }
  }
  collidesPlayer() {
    const p = this.player;
    for (let y = Math.floor(p.y); y < p.y + p.height; y++) if (this.world.get(Math.floor(p.x), y, Math.floor(p.z))) return true;
    return false;
  }

  tryGrab(eye, dir) {
    const hit = this.rayHit(eye, dir, TOOL.hands.range);
    if (!hit || hit.kind !== 'body' || hit.body.mass > TOOL.hands.grabMass) { this.emit({ type: 'grab-fail' }); return; }
    this.grab = { body: hit.body, dist: Math.max(6, hit.t) };
    this.physics.wake(hit.body);
    this.emit({ type: 'grab' });
  }
  releaseGrab() { this.grab = null; }
  updateGrab(dt) {
    const g = this.grab;
    if (!g) return;
    const b = g.body;
    if (!this.physics.bodies.includes(b)) { this.grab = null; return; }
    const eye = this.eye(), dir = lookDir(this.player);
    const target = eye.map((c, k) => c + dir[k] * (g.dist + b.radius * 0.5));
    this.physics.wake(b);
    for (let k = 0; k < 3; k++) b.v[k] = (target[k] - b.pos[k]) * 10;
    b.v[1] += GRAVITY * dt;
    for (let k = 0; k < 3; k++) b.w[k] *= 0.8;
  }

  updateEntities(dt) {
    const keep = [];
    for (const e of this.entities) {
      if (e.type === 'dynamite') {
        e.fuse -= dt;
        if (e.stuck && e.stuck.body) {
          const b = e.stuck.body;
          if (this.physics.bodies.includes(b)) { b.syncR(); e.pos = b.toWorld(e.stuck.local); } else e.stuck = null;
        }
        if (!e.stuck) {
          e.vel[1] -= GRAVITY * dt;
          const sp = Math.hypot(...e.vel), d = e.vel.map((c) => c / (sp || 1));
          const hit = sp > 0 ? this.rayHit(e.pos, d, sp * dt + 0.3) : null;
          if (hit) stick(e, hit); else for (let k = 0; k < 3; k++) e.pos[k] += e.vel[k] * dt;
          if (e.pos[1] < -40) continue;
        }
        if (e.fuse <= 0) {
          const t = TOOL.dynamite;
          this.destruction.explode(e.pos[0], e.pos[1], e.pos[2], t.radius, t.power);
          this.stats.explosions++;
          continue;
        }
      } else if (e.type === 'rocket') {
        e.life -= dt;
        e.vel[1] -= GRAVITY * 0.05 * dt;
        const sp = Math.hypot(...e.vel), d = e.vel.map((c) => c / sp);
        const hit = this.rayHit(e.pos, d, sp * dt);
        if (hit || e.life <= 0) {
          const at = hit ? hit.point : e.pos;
          const t = TOOL.rocket;
          this.destruction.explode(at[0], at[1], at[2], t.radius, t.power);
          this.stats.explosions++;
          continue;
        }
        for (let k = 0; k < 3; k++) e.pos[k] += e.vel[k] * dt;
      }
      keep.push(e);
    }
    this.entities = keep;
  }

  // для сохранения
  toSave() {
    const p = this.player;
    const data = serialize({ plan: this.plan, world: this.world, physics: this.physics, destruction: this.destruction,
      player: { x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, flying: p.flying }, time: this.time });
    data.vehicles = this.vehicles.map((v) => ({ type: v.type, x: v.x, y: v.y, z: v.z, yaw: v.yaw, rope: v.rope }));
    data.tool = this.toolIndex;
    data.startTotal = this.startTotal;
    return data;
  }

  fromSave(obj) {
    const g = deserialize(obj, this.assets);
    Object.assign(this, { plan: g.plan, world: g.world, physics: g.physics, destruction: g.destruction });
    const s = g.player || this.plan.spawn;
    const p = newPlayer(s.x, s.y, s.z);
    p.yaw = s.yaw || 0; p.pitch = s.pitch || 0;
    p.flying = !!(obj.player && obj.player.flying);
    this.reset(p);
    this.time = g.time;
    for (const v of Array.isArray(obj.vehicles) ? obj.vehicles.slice(0, 4) : []) {
      if (!VEHICLES.includes(v.type) || ![v.x, v.y, v.z, v.yaw].every(Number.isFinite)) continue;
      const nv = newVehicle(v.type, v.x, v.y, v.z, v.yaw);
      if (v.type === 'crane' && Number.isFinite(v.rope)) nv.rope = v.rope;
      if (v.type !== 'crane') nv.model = SPECS[v.type].model;
      this.vehicles.push(nv);
    }
    if (Number.isInteger(obj.tool) && obj.tool >= 0 && obj.tool < TOOLS.length) this.toolIndex = obj.tool;
    this.startTotal = Number.isFinite(obj.startTotal) ? obj.startTotal : this.destruction.total();
    return this;
  }
}

function stick(e, hit) {
  const n = hit.normal;
  e.pos = [hit.point[0] + n[0] * 0.3, hit.point[1] + n[1] * 0.3, hit.point[2] + n[2] * 0.3];
  e.vel = [0, 0, 0];
  if (hit.kind === 'body') { hit.body.syncR(); e.stuck = { body: hit.body, local: localOf(hit.body, e.pos) }; }
  else e.stuck = { world: true };
}
function localOf(b, p) {
  const g = b.toGrid(p);
  return [g[0] - b.com[0], g[1] - b.com[1], g[2] - b.com[2]];
}
