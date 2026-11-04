// Снимки для README и гифка разрушения: docs/screens/*.png и destruction.gif.
// Запуск: npm run screens (Chromium без окна, WebGL программно - несколько минут).
'use strict';
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('@playwright/test');
const { PNG } = require('pngjs');
const { GIFEncoder, quantize, applyPalette } = require('gifenc');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screens');
const PORT = 4177;
const W = 960, H = 540;

async function page(browser, settings) {
  const p = await browser.newPage({ viewport: { width: W, height: H } });
  await p.addInitScript((s) => {
    Element.prototype.requestPointerLock = function () {};
    if (!sessionStorage.getItem('shot')) { localStorage.clear(); localStorage.setItem('voxelbreak:settings', JSON.stringify(s)); sessionStorage.setItem('shot', '1'); }
  }, { lang: 'en', theme: 'glass', shadows: true, distance: 'high', ...settings });
  return p;
}
async function open(p, query) {
  await p.goto(`http://127.0.0.1:${PORT}/${query}`);
  await p.waitForFunction(() => window.VoxelBreak && VoxelBreak.ready);
  await p.waitForFunction(() => VoxelBreak.meshq.pending() === 0);
}
async function play(p, opts, hideTool = true) {
  await p.evaluate(async ([o, hide]) => { VoxelBreak.startNew(o); while (VoxelBreak.state !== 'playing') await new Promise((r) => setTimeout(r, 20)); VoxelBreak.renderer.hideViewmodel = hide; }, [opts, hideTool]);
}
const settle = (p, s = 0.05) => p.evaluate((s) => VoxelBreak.advance(s), s);

// камера: игрок летит в точке и смотрит на цель
const look = (p, at, to) => p.evaluate(([at, to]) => {
  const P = VoxelBreak.sim.player;
  P.flying = true; P.x = at[0]; P.y = at[1]; P.z = at[2]; P.vx = P.vy = P.vz = 0;
  const dx = to[0] - P.x, dy = to[1] - (P.y + 6.48), dz = to[2] - P.z;
  P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
}, [at, to]);

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  try {
    for (const theme of ['glass', 'light']) {
      const p = await page(browser, { theme, lang: theme === 'light' ? 'ru' : 'en' });
      await open(p, '?seed=11&size=normal&manual=1');
      await p.evaluate(() => { VoxelBreak.renderer.orbit.t = 0.9; });
      await settle(p);
      await p.screenshot({ path: path.join(OUT, `menu-${theme}.png`) });
      await p.close();
    }

    let p = await page(browser, {});
    await open(p, '?seed=11&size=small&manual=1');
    await play(p, { kind: 'town', size: 'normal', seed: '11' }, false);
    const street = await p.evaluate(() => { const s = VoxelBreak.sim.plan.spawn; return [s.x, s.y, s.z]; });
    await look(p, [street[0] - 2, street[1] + 3, street[2] + 70], [street[0] + 30, street[1] + 6, street[2] - 20]);
    await settle(p);
    await p.screenshot({ path: path.join(OUT, 'town.png') });
    await p.close();

    p = await page(browser, {});
    await open(p, '?seed=11&size=small&manual=1');
    await play(p, { kind: 'nature', size: 'normal', seed: '4' });
    const br = await p.evaluate(() => { const S = VoxelBreak.sim; const b = S.plan.structures.find((s) => s.id === 'bridge'); return b ? [b.x, b.y, b.z, b.w, b.d, S.plan.ravine.x] : null; });
    if (br) await look(p, [br[5] - 6, br[1] + 24, br[2] - 46], [br[0] + br[3] / 2, br[1] + 8, br[2] + br[4] / 2]);
    await p.evaluate(() => VoxelBreak.advance(0.05, { tool: 4 }));
    await p.screenshot({ path: path.join(OUT, 'nature.png') });
    await p.close();

    // гифка: дом рушится от ракет и динамита
    p = await page(browser, {});
    await p.setViewportSize({ width: 480, height: 270 });
    await open(p, '?seed=7&size=small&manual=1');
    await play(p, { kind: 'town', size: 'small', seed: '7' });
    const h = await p.evaluate(() => {
      const S = VoxelBreak.sim, P = S.player;
      const hs = S.plan.structures.filter((s) => s.id === 'house').sort((a, b) => b.model.count() - a.model.count());
      const h = hs[0];
      return { x: h.x, y: h.y, z: h.z, w: h.w, d: h.d, sy: h.model.sy, rot: h.rot, px: P.x };
    });
    const cx = h.x + h.w / 2, cz = h.z + h.d / 2;
    const front = h.rot === 2 ? h.z + h.d + 34 : h.z - 34;
    await look(p, [cx - 20, h.y + 10, front], [cx, h.y + h.sy * 0.4, cz]);
    const enc = GIFEncoder();
    const frame = async (delay = 66) => {
      const png = PNG.sync.read(await p.screenshot());
      const palette = quantize(png.data, 128);
      enc.writeFrame(applyPalette(png.data, palette), png.width, png.height, { palette, delay });
    };
    for (let i = 0; i < 6; i++) { await settle(p, 1 / 15); await frame(); }
    // ракеты по низу дома и взрывы внутри
    const shots = [[h.x + 3, h.y + 3], [h.x + h.w - 3, h.y + 3], [cx, h.y + 4], [cx - 6, h.y + 14], [cx + 6, h.y + 3]];
    for (const [tx, ty] of shots) {
      await p.evaluate(([tx, ty, tz]) => {
        const P = VoxelBreak.sim.player;
        const dx = tx - P.x, dy = ty - (P.y + 6.48), dz = tz - P.z;
        P.yaw = Math.atan2(-dx, -dz); P.pitch = Math.atan2(dy, Math.hypot(dx, dz));
        VoxelBreak.sim.cool = 0;
        VoxelBreak.advance(1 / 15, { tool: 4, fire1Pressed: true });
      }, [tx, ty, h.rot === 2 ? h.z + h.d - 1 : h.z + 1]);
      for (let i = 0; i < 5; i++) { await settle(p, 1 / 15); await frame(); }
    }
    // заряды по всему первому этажу: верх теряет опору, падает и раскалывается об землю
    await p.evaluate(([x, y, z, w, d]) => { const de = VoxelBreak.sim.destruction; for (let a = x; a <= x + w; a += 3) for (let b = z; b <= z + d; b += 3) de.sphere(a + 0.5, y + 3.5, b + 0.5, 2.6, 20); de.explode(x + w / 2, y + 4, z + d / 2, 6); }, [h.x, h.y, h.z, h.w, h.d]);
    await look(p, [cx - 40, h.y + 20, front + (h.rot === 2 ? 6 : -6)], [cx, h.y + 10, cz]);
    for (let i = 0; i < 40; i++) {
      await settle(p, 1 / 15);
      await frame();
      if (i === 12 && process.env.VB_SHOT_DEBUG) await p.screenshot({ path: path.join(process.env.VB_SHOT_DEBUG, 'collapse.png') });
    }
    enc.finish();
    fs.writeFileSync(path.join(OUT, 'destruction.gif'), enc.bytes());
    await p.setViewportSize({ width: W, height: H });
    await look(p, [cx - 44, h.y + 24, front + (h.rot === 2 ? 8 : -8)], [cx, h.y + 4, cz]);
    await settle(p, 2);
    await p.screenshot({ path: path.join(OUT, 'debris.png') });
    console.log('тел:', await p.evaluate(() => VoxelBreak.sim.physics.bodies.length));
    await p.close();
  } finally {
    await browser.close();
    server.kill();
  }
  for (const f of fs.readdirSync(OUT)) console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024), 'КБ');
}
main().catch((e) => { console.error(e); process.exit(1); });
