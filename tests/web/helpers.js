// Общее для законов страницы. Захват мыши подменён счётчиком: настоящий захват в тестах
// не нужен и на Windows держал бы курсор пользователя.
'use strict';

async function open(page, query = '?seed=7&size=small&manual=1', { settings = null, clear = true } = {}) {
  const errors = [];
  await page.addInitScript(([settings, clear]) => {
    window.__lockCalls = 0;
    Element.prototype.requestPointerLock = function () { window.__lockCalls++; return Promise.resolve(); };
    document.exitPointerLock = function () {};
    if (clear && !sessionStorage.getItem('vb-test')) {
      localStorage.clear();
      if (settings) localStorage.setItem('voxelbreak:settings', JSON.stringify(settings));
      sessionStorage.setItem('vb-test', '1');
    }
  }, [settings, clear]);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(r.url()) && !/^(data|blob):/.test(r.url())) errors.push('network: ' + r.url()); });
  await page.goto(query);
  await page.waitForFunction(() => window.VoxelBreak && window.VoxelBreak.ready, null, { timeout: 60000 });
  return errors;
}

async function play(page, opts = { kind: 'town', size: 'small', seed: '7' }) {
  await page.evaluate(async (o) => {
    VoxelBreak.startNew(o);
    while (VoxelBreak.state !== 'playing') await new Promise((r) => setTimeout(r, 20));
  }, opts);
}

// встать перед ближайшим домом и смотреть на его середину
async function faceHouse(page, dist = 30) {
  return page.evaluate((dist) => {
    const sim = VoxelBreak.sim, P = sim.player;
    const h = sim.plan.structures.filter((s) => s.id === 'house').sort((a, b) => Math.hypot(a.x - P.x, a.z - P.z) - Math.hypot(b.x - P.x, b.z - P.z))[0];
    const tx = h.x + h.w / 2, tz = h.z + h.d / 2, ty = h.y + 8;
    P.flying = true; P.x = tx; P.z = h.z - dist; P.y = 14;
    const dx = tx - P.x, dz = tz - P.z, dy = ty - (P.y + 6.48);
    P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
    return { x: h.x, z: h.z, w: h.w, d: h.d };
  }, dist);
}

const worldHash = (page) => page.evaluate(() => {
  let h = 2166136261;
  VoxelBreak.sim.world.chunks.forEach((c, i) => { h = Math.imul(h ^ i, 16777619); if (c) for (let k = 0; k < c.data.length; k += 3) h = Math.imul(h ^ c.data[k], 16777619); });
  return h >>> 0;
});

// яркость и контраст цветов CSS
function lum(css) {
  const m = String(css).match(/rgba?\(([^)]+)\)/);
  const [r, g, b] = m[1].split(',').map((v) => Number(v.trim()) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

module.exports = { open, play, faceHouse, worldHash, contrast, lum };
