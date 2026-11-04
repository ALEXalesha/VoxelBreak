// Законы программы на Electron: окно невидимо и без фокуса, игра открывается по app:// с Worker,
// захвата мыши нет, настройки и сохранение переживают перезапуск, уйти со страницы нельзя,
// 20 запусков подряд без роста памяти.
'use strict';
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

async function launch(dataDir, query = '?seed=7&size=small&manual=1') {
  const app = await electron.launch({
    executablePath: require('electron'),
    args: [ROOT, '--user-data-dir=' + dataDir, '--no-sandbox'],
    env: { ...process.env, VB_TEST: '1', VB_QUERY: query },
  });
  const win = await app.firstWindow();
  await win.addInitScript(() => { Element.prototype.requestPointerLock = function () { window.__lockCalls = (window.__lockCalls || 0) + 1; }; });
  await win.waitForFunction(() => window.VoxelBreak && window.VoxelBreak.ready, null, { timeout: 120000 });
  return { app, win };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'voxelbreak-app-'));

test('окно невидимо и без фокуса, игра открыта по app:// с Worker, захвата мыши нет', async () => {
  const { app, win } = await launch(tmp());
  try {
    const w = await app.evaluate(({ BrowserWindow }) => {
      const b = BrowserWindow.getAllWindows()[0];
      return { visible: b.isVisible(), focusable: b.isFocusable(), bounds: b.getBounds(), menu: b.isMenuBarVisible() };
    });
    expect(w.visible).toBe(false);
    expect(w.focusable).toBe(false);
    expect(w.bounds.x).toBeLessThan(-10000);
    expect(w.menu).toBe(false);
    expect(await win.title()).toBe('VoxelBreak');
    expect(win.url()).toMatch(/^app:\/\/game\/index\.html/);
    await win.waitForFunction(() => VoxelBreak.meshq.pending() === 0 && VoxelBreak.renderer.stats.chunks > 0, null, { timeout: 120000 });
    expect(await win.evaluate(() => !!VoxelBreak.meshq.worker)).toBe(true);
    await win.evaluate(async () => { VoxelBreak.startNew({ kind: 'town', size: 'small', seed: '3' }); while (VoxelBreak.state !== 'playing') await new Promise((r) => setTimeout(r, 20)); });
    await win.evaluate(() => VoxelBreak.advance(0.5, { tool: 4, fire1Pressed: true }));
    expect(await win.evaluate(() => VoxelBreak.state)).toBe('playing');
    expect(await win.evaluate(() => document.pointerLockElement)).toBeNull();
    expect(await win.evaluate(() => document.getElementById('m-quit').hidden)).toBe(false);
  } finally {
    await app.close();
  }
});

test('настройки и сохранение мира переживают перезапуск программы', async () => {
  const dir = tmp();
  const first = await launch(dir);
  let hash;
  try {
    await first.win.click('#m-settings');
    await first.win.click('#s-lang button[data-v=en]');
    await first.win.click('#s-theme button[data-v=night]');
    await first.win.evaluate(async () => { VoxelBreak.startNew({ kind: 'nature', size: 'small', seed: '5' }); while (VoxelBreak.state !== 'playing') await new Promise((r) => setTimeout(r, 20)); });
    await first.win.evaluate(() => { const P = VoxelBreak.sim.player; P.pitch = -0.4; VoxelBreak.advance(1.5, { tool: 4, fire1Pressed: true }); });
    expect(await first.win.evaluate(() => VoxelBreak.saveGame())).toBe(true);
    hash = await first.win.evaluate(() => VoxelBreak.sim.destruction.destroyed);
  } finally {
    await first.app.close();
  }
  const second = await launch(dir);
  try {
    expect(await second.win.evaluate(() => document.documentElement.dataset.theme)).toBe('night');
    await expect(second.win.locator('#m-new')).toHaveText('New world');
    await expect(second.win.locator('#m-continue')).toBeVisible();
    await second.win.click('#m-continue');
    await second.win.waitForFunction(() => VoxelBreak.state === 'playing', null, { timeout: 120000 });
    expect(await second.win.evaluate(() => VoxelBreak.sim.destruction.destroyed)).toBe(hash);
  } finally {
    await second.app.close();
  }
});

test('ссылки и переходы не уводят со страницы игры', async () => {
  const { app, win } = await launch(tmp());
  try {
    const before = win.url();
    await win.evaluate(() => { location.href = 'https://example.com/'; });
    await win.waitForTimeout(500);
    expect(win.url()).toBe(before);
    expect(await win.evaluate(() => window.open('https://example.com/') === null)).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
    // файлы вне web/ не отдаются, даже через закодированный «..»
    expect(await win.evaluate(async () => (await fetch('app://game/..%2fLICENSE')).status)).toBe(403);
    expect(await win.evaluate(async () => (await fetch('app://game/favicon.svg')).status)).toBe(200);
  } finally {
    await app.close();
  }
});

test('20 запусков подряд: память не растёт', async () => {
  const dir = tmp();
  const mem = [];
  for (let i = 0; i < 20; i++) {
    const { app, win } = await launch(dir);
    try {
      await win.waitForFunction(() => VoxelBreak.meshq.pending() === 0, null, { timeout: 120000 });
      await win.evaluate(() => VoxelBreak.advance(0.5));
      const kb = await app.evaluate(({ app: a }) => a.getAppMetrics().reduce((n, m) => n + m.memory.workingSetSize, 0));
      mem.push(kb);
    } finally {
      await app.close();
    }
  }
  const first = mem.slice(0, 5).reduce((a, b) => a + b) / 5, last = mem.slice(-5).reduce((a, b) => a + b) / 5;
  console.log('память, МБ:', mem.map((k) => Math.round(k / 1024)).join(' '));
  expect(last).toBeLessThan(first * 1.25);
});
