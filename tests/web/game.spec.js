// Законы страницы: открывается без ошибок и сети, WebGL рисует, мир ломается и в окне,
// инструменты, меню, 5 тем читаемы, два языка, переназначение клавиш, узкое окно, сохранение.
'use strict';
const { test, expect } = require('@playwright/test');
const { open, play, faceHouse, worldHash, contrast } = require('./helpers');

const THEMES = ['glass', 'formal', 'light', 'night', 'warm'];

test('страница: меню без ошибок и без сети, WebGL рисует мир за меню', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#screen-menu')).toBeVisible();
  await expect(page).toHaveTitle('VoxelBreak');
  await page.waitForFunction(() => VoxelBreak.meshq.pending() === 0 && VoxelBreak.renderer.stats.chunks > 0);
  await page.evaluate(() => VoxelBreak.advance(0.1));
  const info = await page.evaluate(() => ({ chunks: VoxelBreak.renderer.stats.chunks, worker: !!VoxelBreak.meshq.worker, calls: VoxelBreak.renderer.stats.calls }));
  expect(info.chunks).toBeGreaterThan(10);
  expect(info.worker).toBe(true);
  expect(info.calls).toBeGreaterThan(10);
  // картинка не пустая: в кадре много разных цветов
  const shot = await page.screenshot();
  const { PNG } = require('pngjs');
  const png = PNG.sync.read(shot);
  const colors = new Set();
  for (let i = 0; i < png.data.length; i += 4 * 97) colors.add((png.data[i] >> 4) << 8 | (png.data[i + 1] >> 4) << 4 | (png.data[i + 2] >> 4));
  expect(colors.size).toBeGreaterThan(40);
  expect(errors).toEqual([]);
});

test('игра: новый мир, HUD, захват мыши только заглушкой', async ({ page }) => {
  const errors = await open(page);
  await play(page);
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#toolbar > div')).toHaveCount(7);
  await page.mouse.click(640, 360);
  expect(await page.evaluate(() => window.__lockCalls)).toBe(1);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
  expect(await page.evaluate(() => VoxelBreak.state)).toBe('playing');
  expect(errors).toEqual([]);
});

test('разрушение в окне: ракета ломает дом, сетки чанков перестраиваются, тела рисуются', async ({ page }) => {
  const errors = await open(page);
  await play(page);
  await faceHouse(page, 26);
  const built = await page.evaluate(() => VoxelBreak.meshq.built);
  await page.evaluate(() => VoxelBreak.advance(0.05, { tool: 4, fire1Pressed: true }));
  await page.evaluate(() => VoxelBreak.advance(1));
  for (let i = 0; i < 3; i++) await page.evaluate(() => VoxelBreak.advance(1.2, { fire1Pressed: true }));
  await page.waitForFunction((b) => VoxelBreak.meshq.pending() === 0 && VoxelBreak.meshq.built > b, built);
  const s = await page.evaluate(() => ({ destroyed: VoxelBreak.sim.destruction.destroyed, bodies: VoxelBreak.sim.physics.bodies.length,
    drawn: VoxelBreak.renderer.bodies.size, total: VoxelBreak.sim.destruction.total(), start: VoxelBreak.sim.startTotal }));
  expect(s.destroyed).toBeGreaterThan(100);
  expect(s.drawn).toBe(s.bodies);
  expect(s.total).toBe(s.start);
  expect(errors).toEqual([]);
});

test('инструменты: цифры выбирают, заряды тратятся, лазер режет, молот бьёт', async ({ page }) => {
  await open(page);
  await play(page);
  await page.evaluate(() => VoxelBreak.advance(0.05, { tool: 3 }));
  await expect(page.locator('#toolbar > div.on')).toHaveAttribute('data-tool', 'shotgun');
  await faceHouse(page, 20);
  const before = await page.evaluate(() => VoxelBreak.sim.ammo.shotgun);
  await page.evaluate(() => VoxelBreak.advance(0.05, { fire1: true, fire1Pressed: true }));
  expect(await page.evaluate(() => VoxelBreak.sim.ammo.shotgun)).toBe(before - 1);
  const d0 = await page.evaluate(() => VoxelBreak.sim.destruction.destroyed);
  await page.evaluate(() => VoxelBreak.advance(1, { tool: 5, fire1: true }));
  expect(await page.evaluate(() => !!VoxelBreak.sim.laserOn)).toBe(true);
  expect(await page.evaluate(() => VoxelBreak.renderer.beam.visible)).toBe(true);
  const d1 = await page.evaluate(() => VoxelBreak.sim.destruction.destroyed);
  expect(d1).toBeGreaterThan(d0);
  await page.evaluate(() => VoxelBreak.advance(0.05, { tool: 0 }));
  await faceHouse(page, 4);
  await page.evaluate(() => VoxelBreak.advance(0.5, { fire1: true }));
  expect(await page.evaluate(() => VoxelBreak.sim.destruction.destroyed)).toBeGreaterThan(d1);
});

test('пауза: Esc останавливает игру, снова Esc - продолжает', async ({ page }) => {
  await open(page);
  await play(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-pause')).toBeVisible();
  expect(await page.evaluate(() => VoxelBreak.state)).toBe('paused');
  await page.keyboard.press('Escape');
  await expect(page.locator('#screen-pause')).toBeHidden();
  expect(await page.evaluate(() => VoxelBreak.state)).toBe('playing');
  // скрытая вкладка - пауза
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.evaluate(() => VoxelBreak.state)).toBe('paused');
});

test('языки: все строки переведены, переключение меняет весь текст и заголовок', async ({ page }) => {
  await open(page, '?seed=7&size=small&manual=1', { settings: { lang: 'ru' } });
  const texts = async () => page.evaluate(() => [...document.querySelectorAll('[data-i18n]')].map((e) => e.textContent));
  const ru = await texts();
  expect(ru.every((t) => t && !/^(act|tool|hint|kind|size|theme|dist|tab|veh|stat)_/.test(t))).toBe(true);
  expect(ru.join(' ')).toMatch(/Новый мир/);
  await page.click('#m-settings');
  await page.click('#s-lang button[data-v=en]');
  const en = await texts();
  expect(en.join(' ')).toMatch(/New world/);
  expect(en.join(' ')).not.toMatch(/[а-яё]/i);
  expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
  await page.reload();
  await page.waitForFunction(() => window.VoxelBreak && VoxelBreak.ready);
  expect(await page.evaluate(() => VoxelBreak.settings.lang)).toBe('en');
});

for (const theme of THEMES) {
  test(`тема «${theme}»: текст меню читается на своей подложке, снимок`, async ({ page }, info) => {
    await open(page, '?seed=7&size=small&manual=1', { settings: { theme } });
    await page.evaluate(() => VoxelBreak.advance(0.05));
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe(theme);
    const pairs = await page.evaluate(() => {
      const out = [];
      const panel = getComputedStyle(document.querySelector('#screen-menu .panel')).backgroundColor;
      for (const el of document.querySelectorAll('#screen-menu button:not([hidden]), #screen-menu h1, #screen-menu p')) {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        out.push({ text: cs.color, bg, panel, what: el.id || el.className || el.tagName });
      }
      return out;
    });
    // подложка панели с прозрачностью - проверка поверх и чёрного, и белого мира за ней
    const over = (rgba, base) => {
      const m = rgba.match(/rgba?\(([^)]+)\)/)[1].split(',').map((v) => Number(v.trim()));
      const a = m.length > 3 ? m[3] : 1;
      return `rgb(${m.slice(0, 3).map((c, i) => Math.round(c * a + base[i] * (1 - a))).join(',')})`;
    };
    for (const p of pairs) {
      for (const base of [[0, 0, 0], [255, 255, 255]]) {
        const panel = over(p.panel, base);
        const bg = over(p.bg, panel.match(/\d+/g).map(Number));
        expect(contrast(over(p.text, bg.match(/\d+/g).map(Number)), bg), `${p.what} над ${base}`).toBeGreaterThan(4.5);
      }
    }
    await info.attach(`menu-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.click('#m-settings');
    await info.attach(`settings-${theme}`, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

test('тема: выбор в настройках сохраняется и переживает перезагрузку', async ({ page }) => {
  await open(page);
  await page.click('#m-settings');
  await page.click('#s-theme button[data-v=warm]');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('warm');
  await page.reload();
  await page.waitForFunction(() => window.VoxelBreak && VoxelBreak.ready);
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('warm');
});

test('клавиши: переназначение работает в игре, занятая меняется местами, сохраняется', async ({ page }) => {
  await open(page);
  await page.click('#m-settings');
  await page.click('#s-tabs button[data-tab=keys]');
  await page.click('#s-keys button[data-action=forward]');
  await expect(page.locator('#s-keys button[data-action=forward]')).toHaveClass(/wait/);
  await page.keyboard.press('KeyI');
  await expect(page.locator('#s-keys button[data-action=forward]')).toHaveText('I');
  // назначить «назад» на I: «вперёд» получает прежнюю клавишу «назад»
  await page.click('#s-keys button[data-action=back]');
  await page.keyboard.press('KeyI');
  await expect(page.locator('#s-keys button[data-action=back]')).toHaveText('I');
  await expect(page.locator('#s-keys button[data-action=forward]')).toHaveText('S');
  // Esc отменяет ожидание и ничего не назначает
  await page.click('#s-keys button[data-action=jump]');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => VoxelBreak.settings.bindings.jump)).toBe('Space');
  await page.click('#screen-settings .back');
  await play(page);
  const z0 = await page.evaluate(() => [VoxelBreak.sim.player.x, VoxelBreak.sim.player.z]);
  await page.evaluate(() => { VoxelBreak.key('KeyS'); const input = VoxelBreak.takeInput(); VoxelBreak.advance(0.5, input); });
  const z1 = await page.evaluate(() => [VoxelBreak.sim.player.x, VoxelBreak.sim.player.z]);
  expect(Math.hypot(z1[0] - z0[0], z1[1] - z0[1])).toBeGreaterThan(3);
  await page.reload();
  await page.waitForFunction(() => window.VoxelBreak && VoxelBreak.ready);
  expect(await page.evaluate(() => VoxelBreak.settings.bindings.forward)).toBe('KeyS');
  expect(await page.evaluate(() => VoxelBreak.settings.bindings.back)).toBe('KeyI');
});

test('узкое окно 360 px: меню, настройки и HUD помещаются без прокрутки вбок', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  const fits = () => page.evaluate(() => {
    const W = innerWidth;
    // и сам элемент в окне, и его текст внутри своей рамки
    const bad = [...document.querySelectorAll('button, h1, h2, p, input, #toolbar > div')].filter((e) => e.offsetParent && (e.getBoundingClientRect().right > W + 0.5 || e.getBoundingClientRect().left < -0.5 || e.scrollWidth > e.clientWidth + 1));
    return { scroll: document.documentElement.scrollWidth <= W, bad: bad.map((e) => e.id || e.className || e.textContent).slice(0, 5) };
  });
  expect(await fits()).toEqual({ scroll: true, bad: [] });
  for (const tab of ['general', 'graphics', 'keys']) {
    await page.evaluate(() => VoxelBreak.ui.show('settings'));
    await page.click(`#s-tabs button[data-tab=${tab}]`);
    expect(await fits()).toEqual({ scroll: true, bad: [] });
  }
  await page.evaluate(() => VoxelBreak.ui.show('new'));
  expect(await fits()).toEqual({ scroll: true, bad: [] });
  await play(page);
  await page.evaluate(() => VoxelBreak.advance(0.05));
  expect(await fits()).toEqual({ scroll: true, bad: [] });
});

test('сохранение в окне: сохранить, доломать, загрузить - мир как при сохранении', async ({ page }) => {
  const errors = await open(page);
  await play(page);
  await faceHouse(page, 26);
  await page.evaluate(() => VoxelBreak.advance(1.5, { tool: 4, fire1Pressed: true }));
  const saved = await worldHash(page);
  const bodies = await page.evaluate(() => VoxelBreak.sim.physics.bodies.length);
  expect(await page.evaluate(() => VoxelBreak.saveGame())).toBe(true);
  await expect(page.locator('#toast')).toBeVisible();
  await page.evaluate(() => VoxelBreak.advance(1.5, { fire1Pressed: true }));
  expect(await worldHash(page)).not.toBe(saved);
  expect(await page.evaluate(() => VoxelBreak.loadGame())).toBe(true);
  await page.waitForFunction(() => VoxelBreak.state === 'playing');
  expect(await worldHash(page)).toBe(saved);
  expect(await page.evaluate(() => VoxelBreak.sim.physics.bodies.length)).toBe(bodies);
  // меню предлагает продолжить
  await page.evaluate(() => VoxelBreak.toMenu());
  await expect(page.locator('#m-continue')).toBeVisible();
  // испорченное сохранение - сообщение, а не падение
  await page.evaluate(() => localStorage.setItem('voxelbreak:save', '{"tag":"voxelbreak-save","v":1}'));
  expect(await page.evaluate(() => VoxelBreak.loadGame())).toBe(false);
  await expect(page.locator('#toast')).toContainText(/загрузить|load/i);
  expect(errors).toEqual([]);
});

test('без Worker сетки строятся на месте, мир тот же', async ({ page }) => {
  const errors = await open(page, '?seed=7&size=small&manual=1&noworker=1');
  await page.waitForFunction(() => { VoxelBreak.advance(0.02); return VoxelBreak.meshq.pending() === 0; }, null, { polling: 100 });
  expect(await page.evaluate(() => VoxelBreak.meshq.worker)).toBeNull();
  expect(await page.evaluate(() => VoxelBreak.renderer.stats.chunks)).toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

test('техника: машина появляется, в неё садятся и едут, кран качает шар', async ({ page }) => {
  await open(page);
  await play(page);
  // свободная дорога: припаркованные машины убраны, едем вдоль дороги
  await page.evaluate(() => { const S = VoxelBreak.sim; S.physics.bodies.length = 0; S.player.yaw = Math.PI / 2; });
  await page.evaluate(() => VoxelBreak.advance(0.1, { tool: 6, fire1Pressed: true }));
  expect(await page.evaluate(() => VoxelBreak.sim.vehicles.length)).toBe(1);
  await page.evaluate(() => VoxelBreak.advance(0.05, { use: true }));
  expect(await page.evaluate(() => VoxelBreak.sim.driving && VoxelBreak.sim.driving.type)).toBe('car');
  const x0 = await page.evaluate(() => VoxelBreak.sim.driving.x);
  await page.evaluate(() => VoxelBreak.advance(1.5, { mz: 1 }));
  expect(Math.abs(await page.evaluate(() => VoxelBreak.sim.driving.x) - x0)).toBeGreaterThan(5);
  expect(await page.evaluate(() => VoxelBreak.renderer.vehicleObjs.size)).toBe(1);
  await page.evaluate(() => VoxelBreak.advance(0.05, { use: true }));
  expect(await page.evaluate(() => VoxelBreak.sim.driving)).toBeNull();
  await page.evaluate(() => VoxelBreak.advance(1.2, { fire2Pressed: true }));
  await page.evaluate(() => VoxelBreak.advance(1.2, { fire2Pressed: true }));
  expect(await page.evaluate(() => VoxelBreak.sim.vehicleType)).toBe(2);
  await page.evaluate(() => VoxelBreak.advance(1.1, { fire1Pressed: true }));
  const crane = await page.evaluate(() => VoxelBreak.sim.vehicles.find((v) => v.type === 'crane').ball.pos[0]);
  await page.evaluate(() => { VoxelBreak.sim.driving = VoxelBreak.sim.vehicles.find((v) => v.type === 'crane'); VoxelBreak.advance(1, { mx: 1 }); });
  expect(Math.abs(await page.evaluate(() => VoxelBreak.sim.vehicles.find((v) => v.type === 'crane').ball.pos[0]) - crane)).toBeGreaterThan(0.5);
});

test('вид от третьего лица: персонаж со скелетом виден и шагает', async ({ page }) => {
  const errors = await open(page);
  await play(page);
  expect(await page.evaluate(() => !!VoxelBreak.renderer.character && VoxelBreak.renderer.character.root.visible)).toBe(false);
  await page.evaluate(() => { VoxelBreak.renderer.thirdPerson = true; VoxelBreak.advance(0.05); });
  const info = await page.evaluate(() => {
    const c = VoxelBreak.renderer.character;
    let bones = 0, meshes = 0;
    c.root.traverse((o) => { if (o.isBone) bones++; if (o.isMesh) meshes++; });
    return { visible: c.root.visible, bones, meshes, vm: VoxelBreak.renderer.viewmodel.visible };
  });
  expect(info).toEqual({ visible: true, bones: 7, meshes: 7, vm: false });
  const leg = () => page.evaluate(() => VoxelBreak.renderer.character.bones['leg.L'].rotation.x);
  const a = await leg();
  await page.evaluate(() => VoxelBreak.advance(0.3, { mz: 1 }));
  const b = await leg();
  expect(Math.abs(b - a)).toBeGreaterThan(0.05);
  expect(errors).toEqual([]);
});

test('смена мира: старые тела и кран не остаются, геометрия не копится, трос не отсекается', async ({ page }) => {
  await open(page);
  await play(page);
  await page.evaluate(() => VoxelBreak.advance(0.1));
  const base = await page.evaluate(() => VoxelBreak.renderer.scene.children.length);
  await page.evaluate(() => { const S = VoxelBreak.sim; S.vehicleType = 2; VoxelBreak.advance(0.1, { tool: 6, fire1Pressed: true }); });
  const rope = await page.evaluate(() => [...VoxelBreak.renderer.vehicleObjs.values()][0].rope.frustumCulled);
  expect(rope).toBe(false);
  const counts = [];
  for (let i = 0; i < 3; i++) {
    await play(page, { kind: 'town', size: 'small', seed: '7' });
    await page.evaluate(() => VoxelBreak.advance(0.1));
    counts.push(await page.evaluate(() => ({ children: VoxelBreak.renderer.scene.children.length, geo: VoxelBreak.renderer.gl.info.memory.geometries })));
  }
  expect(counts[0].children).toBe(base);
  expect(counts[2].children).toBe(counts[0].children);
  expect(counts[2].geo).toBeLessThanOrEqual(counts[0].geo + 5);
  expect(await page.evaluate(() => VoxelBreak.renderer.vehicleObjs.size)).toBe(0);
});
