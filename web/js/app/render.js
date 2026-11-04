// Картинка: three.js. Чанки и тела - сетки от построителя, пёстрость по вокселю - в шейдере
// по хешу координат вокселя (поэтому слитые грани не теряют узор). Частицы - один InstancedMesh.
import * as THREE from '../../vendor/three.module.js';
import { padGrid, greedyMesh } from '../core/mesher.js';
import { MATERIALS, VOXEL } from '../core/materials.js';
import { eyeY } from '../game/player.js';
import { craneTip, forwardOf } from '../game/vehicles.js';
import { CS } from '../core/world.js';

THREE.ColorManagement.enabled = false;

const DIST = { low: [70, 170], mid: [120, 300], high: [200, 460] };
const SUN = new THREE.Vector3(0.45, 1, 0.3).normalize();
// предмет в руках: положение и поворот в метрах перед глазом
const VM_POSE = {
  hammer: { p: [0.42, -0.5, -0.62], r: [1.05, 0.3, 0.25] },
  hands: { p: [0.34, -0.36, -0.5], r: [0.25, 0.1, 0] },
  dynamite: { p: [0.34, -0.34, -0.52], r: [0.6, 0.25, 0.3] },
  shotgun: { p: [0.28, -0.3, -0.42], r: [0, 0.05, 0] },
  rocket: { p: [0.3, -0.3, -0.34], r: [0, 0.06, 0] },
  laser: { p: [0.28, -0.3, -0.42], r: [0, 0.05, 0] },
  vehicle: { p: [0.3, -0.32, -0.45], r: [0.7, 0.1, 0] },
};

function voxelMaterial({ glass = false, offset = [0, 0, 0] } = {}) {
  const mat = glass
    ? new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.38, depthWrite: false })
    : new THREE.MeshLambertMaterial({ vertexColors: true });
  const uOff = { value: new THREE.Vector3(...offset) };
  mat.userData.offset = uOff;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uVoxOffset = uOff;
    sh.vertexShader = 'attribute float vary;\nvarying float vVary;\nvarying vec3 vVox;\nvarying vec3 vNrmO;\nuniform vec3 uVoxOffset;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvVox = position + uVoxOffset;\nvNrmO = normal;\nvVary = vary;');
    sh.fragmentShader = 'varying float vVary;\nvarying vec3 vVox;\nvarying vec3 vNrmO;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat vh = fract(sin(dot(floor(vVox - vNrmO * 0.5), vec3(12.9898, 78.233, 37.719))) * 43758.5453);\ndiffuseColor.rgb *= 1.0 + (vh - 0.5) * vVary * 2.2;');
  };
  mat.customProgramCacheKey = () => (glass ? 'vox-glass' : 'vox');
  return mat;
}

function geometryOf(part) {
  if (!part.indices.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(part.normals, 3, false));
  g.setAttribute('color', new THREE.BufferAttribute(part.colors, 3, true));
  g.setAttribute('vary', new THREE.BufferAttribute(part.vary, 1, true));
  g.setIndex(new THREE.BufferAttribute(part.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function shift(part, [ox, oy, oz]) {
  const p = part.positions;
  for (let i = 0; i < p.length; i += 3) { p[i] += ox; p[i + 1] += oy; p[i + 2] += oz; }
  return part;
}

// модель (VoxelModel) -> Group с сеткой; scale - размер вокселя модели в вокселях мира
export function modelMesh(model, mats, scale = 1) {
  const m = greedyMesh(padGrid(model.data, model.sx, model.sy, model.sz), [model.sx, model.sy, model.sz]);
  const group = new THREE.Group();
  const inner = new THREE.Group();
  inner.position.set(-model.pivot[0], -model.pivot[1], -model.pivot[2]);
  for (const [part, mat] of [[m.opaque, mats.opaque], [m.glass, mats.glass]]) {
    const g = geometryOf(part);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = mesh.receiveShadow = mat === mats.opaque;
    inner.add(mesh);
  }
  group.add(inner);
  group.scale.setScalar(scale);
  return group;
}

export class Renderer {
  constructor(canvas, { assets, meshq }) {
    this.assets = assets;
    this.mq = meshq;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.2, 600);
    this.camera.rotation.order = 'YXZ';
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(60, 1, 0.05, 40);
    this.thirdPerson = false;
    this.stats = { chunks: 0, bodies: 0, calls: 0, frame: 0 };

    const skyTop = new THREE.Color(0x5d8fd6), skyLow = new THREE.Color(0xcfe0ee);
    this.fogColor = skyLow;
    this.scene.fog = new THREE.Fog(skyLow, 120, 300);
    const skyGeo = new THREE.SphereGeometry(1, 24, 12);
    this.sky = new THREE.Mesh(skyGeo, new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: skyTop }, low: { value: skyLow }, sun: { value: SUN } },
      vertexShader: 'varying vec3 vd; void main(){ vd = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 low; uniform vec3 sun; varying vec3 vd; void main(){ vec3 d = normalize(vd); float h = clamp(d.y * 1.6 + 0.1, 0.0, 1.0); vec3 c = mix(low, top, h); float s = pow(max(dot(d, sun), 0.0), 220.0); gl_FragColor = vec4(c + vec3(1.0, 0.92, 0.7) * s * 1.5, 1.0); }',
    }));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    this.scene.add(this.sky);

    this.hemi = new THREE.HemisphereLight(0xdfeaff, 0x7a6450, 0.85);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 1.05);
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -110; sc.right = 110; sc.top = 110; sc.bottom = -110; sc.near = 1; sc.far = 500;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    this.scene.add(this.sun, this.sun.target);
    this.vmScene.add(new THREE.HemisphereLight(0xdfeaff, 0x7a6450, 0.9));
    const vmSun = new THREE.DirectionalLight(0xfff0d8, 0.9);
    vmSun.position.set(0.4, 1, 0.6);
    this.vmScene.add(vmSun);

    this.mats = { opaque: voxelMaterial(), glass: voxelMaterial({ glass: true }) };
    this.chunks = new Map();
    this.bodies = new Map();
    this.models = new Map();
    this.vehicleObjs = new Map();
    this.entityObjs = [];
    this.initEffects();
    this.viewmodels = {};
    this.vmTool = null;
    this.swingT = 0;
    this.kickT = 0;
    this.shake = 0;
    this.setQuality({ shadows: true, distance: 'mid', fov: 75 });
  }

  setQuality({ shadows, distance, fov }) {
    this.gl.shadowMap.enabled = !!shadows;
    this.sun.castShadow = !!shadows;
    const [near, far] = DIST[distance] || DIST.mid;
    this.scene.fog.near = near; this.scene.fog.far = far;
    this.camera.far = far + 60;
    this.camera.fov = fov || 75;
    this.camera.updateProjectionMatrix();
    this.sky.scale.setScalar(far + 20);
    this.mats.opaque.needsUpdate = true;
  }

  resize(w, h) {
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = this.camera.aspect;
    this.vmCamera.updateProjectionMatrix();
  }

  // новый мир: убрать всё старое, поставить все чанки в очередь
  setWorld(sim) {
    for (const c of this.chunks.values()) this.dropChunk(c);
    this.chunks.clear();
    for (const b of this.bodies.values()) this.scene.remove(b.group);
    this.bodies.clear();
    for (const v of this.vehicleObjs.values()) this.scene.remove(v.group);
    this.vehicleObjs.clear();
    this.sim = sim;
    const w = sim.world;
    const p = sim.player;
    const ids = [...w.chunks.keys()].filter((i) => w.chunks[i]);
    const dist = (ci) => {
      const cx = ci % w.sx, cz = Math.floor(ci / w.sx) % w.sz;
      return Math.hypot(cx * CS + 16 - p.x, cz * CS + 16 - p.z);
    };
    ids.sort((a, b) => dist(a) - dist(b));
    for (const ci of ids) this.requestChunk(ci);
    w.dirty.clear();
  }

  requestChunk(ci) {
    const w = this.sim.world;
    const c = w.chunks[ci];
    const cx = ci % w.sx, cz = Math.floor(ci / w.sx) % w.sz, cy = Math.floor(ci / (w.sx * w.sz));
    if (!c) { this.applyChunk(ci, null, -1); return; }
    const origin = [cx * CS, cy * CS, cz * CS];
    this.mq.request('c:' + ci, c.version, w.padded(cx, cy, cz), [CS, CS, CS], (mesh) => this.applyChunk(ci, mesh, origin));
  }

  applyChunk(ci, mesh, origin) {
    const old = this.chunks.get(ci);
    if (old) this.dropChunk(old);
    if (!mesh) { this.chunks.delete(ci); return; }
    const rec = { meshes: [] };
    for (const [part, mat] of [[mesh.opaque, this.mats.opaque], [mesh.glass, this.mats.glass]]) {
      const g = geometryOf(shift(part, origin));
      if (!g) continue;
      const m = new THREE.Mesh(g, mat);
      m.castShadow = m.receiveShadow = mat === this.mats.opaque;
      m.matrixAutoUpdate = false;
      this.scene.add(m);
      rec.meshes.push(m);
    }
    this.chunks.set(ci, rec);
  }
  dropChunk(rec) { for (const m of rec.meshes) { this.scene.remove(m); m.geometry.dispose(); } }

  syncBodies(sim) {
    const alive = new Set();
    for (const b of sim.physics.bodies) {
      alive.add(b.id);
      let r = this.bodies.get(b.id);
      if (!r || r.version !== b.version) {
        if (r) { this.scene.remove(r.group); disposeGroup(r.group); }
        const m = greedyMesh(padGrid(b.data, b.sx, b.sy, b.sz), [b.sx, b.sy, b.sz]);
        const group = new THREE.Group();
        const inner = new THREE.Group();
        const mats = { opaque: voxelMaterial({ offset: b.origin }), glass: voxelMaterial({ glass: true, offset: b.origin }) };
        for (const [part, mat] of [[m.opaque, mats.opaque], [m.glass, mats.glass]]) {
          const g = geometryOf(part);
          if (!g) continue;
          const mesh = new THREE.Mesh(g, mat);
          mesh.castShadow = mesh.receiveShadow = mat === mats.opaque;
          inner.add(mesh);
        }
        inner.position.set(-b.com[0], -b.com[1], -b.com[2]);
        group.add(inner);
        this.scene.add(group);
        r = { group, version: b.version };
        this.bodies.set(b.id, r);
      }
      r.group.position.set(b.pos[0], b.pos[1], b.pos[2]);
      r.group.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    }
    for (const [id, r] of this.bodies) if (!alive.has(id)) { this.scene.remove(r.group); disposeGroup(r.group); this.bodies.delete(id); }
  }

  model(id, params = {}, scale = 1) {
    const key = id + JSON.stringify(params);
    if (!this.models.has(key)) this.models.set(key, this.assets.get(id, params, null));
    return modelMesh(this.models.get(key), this.mats, scale);
  }

  syncVehicles(sim) {
    const alive = new Set(sim.vehicles);
    for (const v of sim.vehicles) {
      let o = this.vehicleObjs.get(v);
      if (!o) {
        const group = new THREE.Group();
        if (v.type === 'crane') {
          const tower = this.model('crane');
          tower.children[0].position.y = 0;
          group.add(tower);
          const boom = this.model('boom', { length: 48 });
          boom.children[0].position.set(0, -1.5, -1.5);
          o = { group, boom, ball: this.model('ball'), rope: new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x222222 })) };
          this.scene.add(boom, o.ball, o.rope);
        } else {
          const mdl = this.model(v.model || v.type, v.type === 'car' ? { color: 'red' } : {});
          group.add(mdl);
          o = { group };
        }
        this.scene.add(group);
        this.vehicleObjs.set(v, o);
      }
      o.group.position.set(v.x, v.y, v.z);
      o.group.rotation.set(0, v.yaw, 0);
      if (v.type === 'crane') {
        const tip = craneTip(v);
        o.boom.position.set(v.x, v.y + 41.5, v.z);
        o.boom.rotation.set(0, v.yaw, 0);
        o.ball.position.set(...v.ball.pos);
        o.rope.geometry.setFromPoints([new THREE.Vector3(...tip), new THREE.Vector3(...v.ball.pos)]);
      }
    }
    for (const [v, o] of this.vehicleObjs) if (!alive.has(v)) {
      this.scene.remove(o.group); if (o.boom) this.scene.remove(o.boom, o.ball, o.rope);
      this.vehicleObjs.delete(v);
    }
  }

  syncEntities(sim) {
    while (this.entityObjs.length < sim.entities.length) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.6), new THREE.MeshLambertMaterial({ color: 0xc8341e }));
      this.scene.add(g);
      this.entityObjs.push(g);
    }
    this.entityObjs.forEach((o, i) => {
      const e = sim.entities[i];
      o.visible = !!e;
      if (!e) return;
      o.position.set(...e.pos);
      if (e.type === 'rocket') { o.lookAt(e.pos[0] + e.vel[0], e.pos[1] + e.vel[1], e.pos[2] + e.vel[2]); o.material.color.setHex(0x5a7a3a); this.spawn(e.pos, [0, 2, 0], 0.6, 0x999999, 0.6); }
      else { o.material.color.setHex(Math.floor(e.fuse * 6) % 2 ? 0xff5030 : 0xc8341e); }
    });
  }

  // ---------- частицы и вспышки ----------
  initEffects() {
    const N = 2500;
    this.pMax = N;
    this.particles = [];
    this.pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), N);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.count = 0;
    this.pMesh.frustumCulled = false;
    this.scene.add(this.pMesh);
    this.flash = new THREE.PointLight(0xffaa55, 0, 90, 1.5);
    this.scene.add(this.flash);
    this.fireballs = [];
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      this.scene.add(m);
      this.fireballs.push({ m, t: 1, r: 1 });
    }
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1, 6, 1, true), new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.visible = false;
    this.scene.add(this.beam);
    this.tmp = new THREE.Object3D();
    this.tmpColor = new THREE.Color();
  }

  spawn(pos, vel, life, color, size = 0.5) {
    if (this.particles.length >= this.pMax) this.particles.shift();
    this.particles.push({ p: [...pos], v: [...vel], life, t: 0, c: color, s: size });
  }

  effects(events) {
    for (const e of events) {
      if (e.type === 'hit' && e.removed > 0) {
        const col = MATERIALS[e.mat] ? (MATERIALS[e.mat].color[0] << 16) | (MATERIALS[e.mat].color[1] << 8) | MATERIALS[e.mat].color[2] : 0x888888;
        const n = Math.min(40, 4 + e.removed);
        for (let i = 0; i < n; i++) this.spawn([e.x + rnd() * e.r, e.y + rnd() * e.r, e.z + rnd() * e.r], [rnd() * 14, Math.random() * 14, rnd() * 14], 0.8 + Math.random() * 0.8, col, 0.35 + Math.random() * 0.3);
      } else if (e.type === 'dust') {
        const col = MATERIALS[e.mat] ? (MATERIALS[e.mat].color[0] << 16) | (MATERIALS[e.mat].color[1] << 8) | MATERIALS[e.mat].color[2] : 0x888888;
        for (let i = 0; i < Math.min(6, e.n); i++) this.spawn([e.x + 0.5, e.y + 0.5, e.z + 0.5], [rnd() * 4, Math.random() * 3, rnd() * 4], 1.2, col, 0.5);
      } else if (e.type === 'explosion') {
        const fb = this.fireballs.find((f) => f.t >= 1) || this.fireballs[0];
        fb.t = 0; fb.r = e.r; fb.m.position.set(e.x, e.y, e.z); fb.m.visible = true;
        this.flash.position.set(e.x, e.y + 2, e.z);
        this.flash.intensity = 60;
        for (let i = 0; i < 40; i++) this.spawn([e.x + rnd() * e.r * 0.5, e.y + rnd() * e.r * 0.5, e.z + rnd() * e.r * 0.5], [rnd() * 6, 4 + Math.random() * 8, rnd() * 6], 1.5 + Math.random() * 1.5, i % 3 ? 0x6a6a6a : 0x2e2e2e, 1.2 + Math.random());
        const d = this.camera.position.distanceTo(new THREE.Vector3(e.x, e.y, e.z));
        this.shake = Math.max(this.shake, Math.min(1, e.r * 6 / Math.max(10, d)));
      } else if (e.type === 'swing') this.swingT = 1;
      else if (e.type === 'shot' || e.type === 'launch') this.kickT = 1;
    }
  }

  updateEffects(dt) {
    const keep = [];
    for (const q of this.particles) {
      q.t += dt;
      if (q.t >= q.life) continue;
      q.v[1] -= 30 * dt * (q.s > 1 ? -0.1 : 1);
      for (let k = 0; k < 3; k++) q.p[k] += q.v[k] * dt;
      keep.push(q);
    }
    this.particles = keep;
    const n = Math.min(this.pMax, keep.length);
    for (let i = 0; i < n; i++) {
      const q = keep[i];
      const s = q.s * (1 - q.t / q.life * 0.6);
      this.tmp.position.set(q.p[0], q.p[1], q.p[2]);
      this.tmp.scale.setScalar(s);
      this.tmp.rotation.set(q.t * 3, q.t * 2, 0);
      this.tmp.updateMatrix();
      this.pMesh.setMatrixAt(i, this.tmp.matrix);
      this.pMesh.setColorAt(i, this.tmpColor.setHex(q.c));
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;
    for (const f of this.fireballs) {
      if (f.t >= 1) { f.m.visible = false; continue; }
      f.t = Math.min(1, f.t + dt * 2.2);
      f.m.scale.setScalar(f.r * (0.4 + f.t * 1.2));
      f.m.material.opacity = 1 - f.t;
    }
    this.flash.intensity *= Math.pow(0.02, dt);
  }

  setTool(id) {
    if (this.vmTool === id) return;
    if (this.viewmodel) this.vmScene.remove(this.viewmodel);
    if (!this.viewmodels[id]) this.viewmodels[id] = this.model('item.' + id, {}, (this.assets.entry('item.' + id).scale || 0.12) * VOXEL);
    this.viewmodel = this.viewmodels[id];
    this.vmScene.add(this.viewmodel);
    this.vmTool = id;
  }

  // кадр
  frame(sim, dt, events) {
    if (sim !== this.sim) this.setWorld(sim);
    for (const ci of sim.world.takeDirty()) this.requestChunk(ci);
    this.mq.pump();
    this.syncBodies(sim);
    this.syncVehicles(sim);
    this.syncEntities(sim);
    this.effects(events);
    this.updateEffects(dt);

    const p = sim.player, cam = this.camera;
    if (this.orbit) {
      const o = this.orbit;
      cam.position.set(o.x + Math.cos(o.t) * o.r, o.y + 10, o.z + Math.sin(o.t) * o.r);
      cam.lookAt(o.x, o.y - 12, o.z);
    } else if (sim.driving) {
      const v = sim.driving;
      if (v.type === 'crane') {
        const tip = craneTip(v);
        cam.position.set(v.x - forwardOf(v)[0] * 14, v.y + 46, v.z - forwardOf(v)[2] * 14);
        cam.lookAt(tip[0] * 0.5 + v.ball.pos[0] * 0.5, v.ball.pos[1], tip[2] * 0.5 + v.ball.pos[2] * 0.5);
      } else {
        const f = forwardOf(v);
        cam.position.set(v.x - f[0] * 30, v.y + 14, v.z - f[2] * 30);
        cam.lookAt(v.x + f[0] * 10, v.y + 4, v.z + f[2] * 10);
      }
    } else {
      cam.rotation.set(p.pitch, p.yaw, 0);
      cam.position.set(p.x, eyeY(p), p.z);
      if (this.thirdPerson) {
        const back = new THREE.Vector3(0, 0, 1).applyEuler(cam.rotation).multiplyScalar(18);
        cam.position.add(back);
      }
    }
    if (this.shake > 0.01) {
      cam.position.x += rnd() * this.shake * 0.6; cam.position.y += rnd() * this.shake * 0.6;
      this.shake *= Math.pow(0.03, dt);
    }
    this.sky.position.copy(cam.position);
    // тень за игроком, с шагом в тексель (без мерцания)
    const step = 220 / 2048;
    const tx = Math.round(p.x / step) * step, tz = Math.round(p.z / step) * step;
    this.sun.target.position.set(tx, p.y, tz);
    this.sun.position.set(tx + SUN.x * 250, p.y + SUN.y * 250, tz + SUN.z * 250);
    // лазер
    if (sim.laserOn) {
      const a = new THREE.Vector3(...sim.laserOn.from).add(new THREE.Vector3(0.6, -0.8, 0).applyEuler(cam.rotation)), b = new THREE.Vector3(...sim.laserOn.to);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      this.beam.position.copy(mid);
      this.beam.scale.set(1, a.distanceTo(b), 1);
      this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      this.beam.visible = true;
      if (Math.random() < 0.5) this.spawn(sim.laserOn.to, [rnd() * 6, Math.random() * 6, rnd() * 6], 0.3, 0xffd070, 0.25);
    } else this.beam.visible = false;
    // предмет в руках
    this.setTool(sim.tool.id);
    const vm = this.viewmodel;
    this.swingT = Math.max(0, this.swingT - dt * 4);
    this.kickT = Math.max(0, this.kickT - dt * 5);
    const bob = Math.sin(sim.time * 9) * Math.min(1, Math.hypot(p.vx, p.vz) / 18) * 0.03;
    const pose = VM_POSE[sim.tool.id] || VM_POSE.shotgun;
    const sw = Math.sin(this.swingT * Math.PI);
    vm.position.set(pose.p[0] - sw * 0.12, pose.p[1] + bob + this.kickT * 0.04 - sw * 0.05, pose.p[2] + this.kickT * 0.1 - sw * 0.2);
    vm.rotation.set(pose.r[0] - sw * 1.6 + this.kickT * 0.3, pose.r[1] + sw * 0.3, pose.r[2]);
    vm.visible = !sim.driving && !this.thirdPerson && !this.orbit;
    this.vmCamera.fov = 60;

    const gl = this.gl;
    gl.clear();
    gl.render(this.scene, cam);
    this.stats.calls = gl.info.render.calls;
    gl.clearDepth();
    gl.render(this.vmScene, this.vmCamera);
    this.stats.chunks = this.chunks.size;
    this.stats.bodies = this.bodies.size;
    this.stats.frame++;
  }
}

function disposeGroup(g) {
  g.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
}
const rnd = () => Math.random() * 2 - 1;
