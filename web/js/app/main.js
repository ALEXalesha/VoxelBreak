// Запуск страницы: настройки, модели, мир, цикл кадра, ввод, захват мыши, сохранение.
// Параметры адреса для проверок: ?manual=1 - симуляция шагает только по advance(),
// ?seed=7&kind=town&size=small - мир для меню, ?noworker=1 - сетки без Worker.
import { Assets } from '../core/assets.js';
import { MANIFEST } from '../../assets/manifest.js';
import { BUILDERS } from '../../assets/proc/index.js';
import { glbToModel } from '../core/glb.js';
import { seedFrom } from '../core/rng.js';
import { Sim } from '../game/sim.js';
import { sanitize, frameInput } from '../game/settings.js';
import { pickLang } from '../game/i18n.js';
import { MATERIALS } from '../core/materials.js';
import { STEP } from '../core/physics.js';
import { MeshQueue } from './meshq.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { UI } from './ui.js';

export const SIZES = { small: [6, 3, 6], normal: [12, 3, 12], large: [16, 3, 16] };
const STORE = 'voxelbreak:settings', SAVE = 'voxelbreak:save';
const params = new URLSearchParams(location.search);
const MANUAL = params.has('manual');
const canvas = document.getElementById('view');

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
function loadSettings() {
  let raw = null;
  try { raw = JSON.parse(store.get(STORE) || 'null'); } catch { raw = null; }
  return sanitize(raw, pickLang(navigator.language));
}

const settings = loadSettings();
const assets = new Assets(MANIFEST, BUILDERS, {
  fetchBytes: async (src) => new Uint8Array(await (await fetch(new URL('../../assets/' + src, import.meta.url))).arrayBuffer()),
  glbToModel,
});
const meshq = new MeshQueue({ useWorker: !params.has('noworker'), inFlight: 12 });
const renderer = new Renderer(canvas, { assets, meshq });
const sound = new Sound();
const held = new Set(), pressed = new Set();
const look = [0, 0];
let wheel = 0;
let heardAt = -1;
let sim = null, state = 'boot', locked = false, wasLocked = false, last = performance.now(), acc = 0, fps = 60, camToggle = false;

const ui = new UI(settings, {
  onSettings(s) { store.set(STORE, JSON.stringify(s)); applySettings(); },
  newGame: (o) => startNew(o),
  resume: () => resume(),
  save: () => saveGame(),
  load: () => loadGame(),
  toMenu: () => toMenu(),
  continueGame: () => loadGame(),
  quit: () => window.close(),
});
ui.setQuit(/Electron/.test(navigator.userAgent));

function applySettings() {
  renderer.setQuality(settings);
  sound.setVolume(settings.volume);
  ui.toolbar(sim ? sim.toolIndex : 0);
}

function resize() {
  renderer.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
}

function setSim(next) {
  sim = next;
  renderer.setWorld(sim);
  ui.toolbar(sim.toolIndex);
}

function waitMeshes(then) {
  const t0 = performance.now();
  const total = Math.max(1, meshq.pending());
  const tick = () => {
    meshq.pump(12);
    ui.loading(1 - meshq.pending() / total);
    if (meshq.pending() === 0 || performance.now() - t0 > 8000) then();
    else setTimeout(tick, 30);
  };
  tick();
}

function startNew({ kind = 'town', size = 'normal', seed = '' } = {}) {
  state = 'loading';
  ui.show('loading');
  setTimeout(() => {
    const s = seed === '' ? (Math.random() * 4294967296) >>> 0 : seedFrom(seed);
    setSim(new Sim(assets).newGame({ seed: s, kind, size: SIZES[size] || SIZES.normal }));
    waitMeshes(() => startPlaying());
  }, 20);
}

function startPlaying() {
  renderer.orbit = null;
  state = 'playing';
  ui.hideScreens();
  document.getElementById('hud').hidden = false;
  showClickHint();
}
function showClickHint() { document.getElementById('click-to-play').hidden = MANUAL || locked || state !== 'playing'; }

function pause() {
  if (state !== 'playing') return;
  state = 'paused';
  held.clear();
  sound.setLaser(false);
  if (document.pointerLockElement) document.exitPointerLock();
  ui.show('pause');
  showClickHint();
}
function resume() {
  if (state !== 'paused' && state !== 'playing') { ui.show('menu', false); return; }
  state = 'playing';
  ui.hideScreens();
  showClickHint();
}
function toMenu() {
  state = 'menu';
  document.getElementById('hud').hidden = true;
  ui.setContinue(!!store.get(SAVE));
  ui.show('menu');
  orbitFor(sim);
  showClickHint();
}

function saveGame() {
  let ok = false;
  try { ok = store.set(SAVE, JSON.stringify(sim.toSave())); } catch { ok = false; }
  ui.toast(ok ? 'saved' : 'saveFailed');
  ui.setContinue(ok || !!store.get(SAVE));
  return ok;
}
function loadGame() {
  const text = store.get(SAVE);
  if (!text) { ui.toast('noSave'); return false; }
  try {
    setSim(new Sim(assets).fromSave(JSON.parse(text)));
  } catch (e) {
    ui.toast('loadFailed', e.message);
    return false;
  }
  state = 'loading';
  ui.show('loading');
  waitMeshes(() => startPlaying());
  return true;
}

function orbitFor(s) {
  const w = s.world;
  renderer.orbit = { x: s.player.x, y: s.player.y + 18, z: s.player.z, r: Math.min(90, w.nx * 0.3), t: 0 };
}

// ---------- ввод ----------
window.addEventListener('keydown', (e) => {
  if (ui.waitKey) return;
  if (e.code === 'Escape') {
    if (state === 'playing') pause();
    else if (state === 'paused' && ui.screen === 'pause') resume();
    else if (ui.screen && ui.screen !== 'menu' && ui.screen !== 'loading') ui.back();
    return;
  }
  if (state !== 'playing') return;
  if (e.target && e.target.tagName === 'INPUT') return;
  if (!e.repeat) pressed.add(e.code);
  held.add(e.code);
  if (['Space', 'Tab'].includes(e.code) || e.code.startsWith('Arrow')) e.preventDefault();
});
window.addEventListener('keyup', (e) => held.delete(e.code));
window.addEventListener('blur', () => held.clear());
canvas.addEventListener('mousedown', (e) => {
  sound.unlock();
  if (state !== 'playing') return;
  if (!locked) { requestLock(); return; }
  held.add('Mouse' + e.button); pressed.add('Mouse' + e.button);
});
window.addEventListener('mouseup', (e) => held.delete('Mouse' + e.button));
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { if (state === 'playing') wheel += Math.sign(e.deltaY); }, { passive: true });
window.addEventListener('mousemove', (e) => {
  if (!locked || state !== 'playing') return;
  const k = 0.0022 * settings.sens;
  look[0] += e.movementX * k;
  look[1] += e.movementY * k * (settings.invertY ? -1 : 1);
});
function requestLock() {
  try {
    const r = canvas.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
  } catch { /* браузер не дал - играем без захвата */ }
}
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) wasLocked = true;
  else if (wasLocked && state === 'playing') pause();
  showClickHint();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('resize', resize);
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });

// ---------- кадр ----------
function stepOnce(input) {
  sim.step(input, STEP);
}
function takeInput() {
  const input = frameInput(settings.bindings, held, pressed, [look[0], look[1]]);
  if (wheel) input.nextTool = wheel;
  look[0] = look[1] = 0; wheel = 0;
  pressed.clear();
  return input;
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps += ((dt > 0 ? 1 / dt : 60) - fps) * 0.05;
  if (!sim) return;
  if (!MANUAL) {
    if (state === 'playing') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 4) {
        const input = n === 0 ? takeInput() : frameInput(settings.bindings, held, new Set(), null);
        if (input.camera) { camToggle = !camToggle; renderer.thirdPerson = camToggle; }
        stepOnce(input);
        acc -= STEP; n++;
      }
      if (n === 4) acc = 0;
    } else if (state === 'menu' || state === 'paused') {
      if (state === 'menu') { acc += dt; while (acc >= STEP) { sim.step({}, STEP); acc -= STEP; } }
    }
  }
  if (renderer.orbit) renderer.orbit.t += dt * 0.06;
  if (state === 'loading') { meshq.pump(); return; }
  draw(dt);
}

function draw(dt) {
  const events = sim.drainEvents();
  renderer.frame(sim, dt, events);
  const ear = sim.eye();
  sound.events(events, ear, (m) => (MATERIALS[m] ? MATERIALS[m].name : ''));
  // удары - только свежие: на паузе и при частоте экрана выше 60 Гц шаг тот же, стук не повторяется
  if (sim.time !== heardAt) { sound.impacts(sim.physics.impacts, ear); heardAt = sim.time; }
  sound.setLaser(state === 'playing' && !!sim.laserOn);
  if (state === 'playing') ui.hud(sim, fps);
}

// ---------- для проверок (Playwright) ----------
window.VoxelBreak = {
  get sim() { return sim; }, get state() { return state; }, get screen() { return ui.screen; },
  settings, ui, renderer, meshq, sound, SIZES,
  // шагнуть симуляцию на seconds с вводом (действия по именам), как в настоящем кадре
  advance(seconds, actions = {}) {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) {
      const input = { ...frameInput(settings.bindings, new Set(), new Set(), null), ...actions };
      if (i > 0) { input.fire1Pressed = false; input.fire2Pressed = false; input.use = false; input.fly = false; input.tool = actions.tool ?? null; input.look = null; }
      stepOnce(input);
    }
    draw(STEP);
    return steps;
  },
  key(code, down = true) { if (down) { held.add(code); pressed.add(code); } else held.delete(code); },
  takeInput, startNew, startPlaying, pause, resume, toMenu, saveGame, loadGame,
  ready: false,
};

async function boot() {
  resize();
  applySettings();
  await assets.preload();
  const size = SIZES[params.get('size')] || SIZES.small;
  const seed = params.has('seed') ? seedFrom(params.get('seed')) : Math.floor(Date.now() / 86400000);
  setSim(new Sim(assets).newGame({ seed, kind: params.get('kind') || 'town', size }));
  state = 'menu';
  ui.setContinue(!!store.get(SAVE));
  ui.show('menu');
  orbitFor(sim);
  requestAnimationFrame(frame);
  window.VoxelBreak.ready = true;
}
boot();
