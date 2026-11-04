// Меню, настройки, HUD. Все строки - из i18n по data-i18n, тема - атрибут на <html>.
import { translator } from '../game/i18n.js';
import { ACTIONS, rebind, defaultBindings, keyLabel } from '../game/settings.js';
import { TOOLS, VEHICLES } from '../game/tools.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(settings, handlers) {
    this.s = settings;
    this.h = handlers;           // { onSettings(s), newGame(opts), resume(), save(), load(), toMenu(), continueGame(), quit() }
    this.screen = null;
    this.stack = [];
    this.waitKey = null;
    this.newOpts = { kind: 'town', size: 'normal' };
    this.t = translator(settings.lang);
    this.bind();
    this.apply();
  }

  apply() {
    const s = this.s;
    this.t = translator(s.lang);
    document.documentElement.lang = s.lang;
    document.documentElement.dataset.theme = s.theme;
    document.title = this.t('title');
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = this.t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = this.t(el.dataset.i18nPlaceholder);
    this.seg('s-lang', s.lang); this.seg('s-theme', s.theme);
    this.seg('s-shadows', s.shadows ? 'on' : 'off'); this.seg('s-distance', s.distance);
    this.seg('n-kind', this.newOpts.kind); this.seg('n-size', this.newOpts.size);
    $('s-sens').value = s.sens; $('s-invert').checked = s.invertY; $('s-volume').value = s.volume; $('s-fov').value = s.fov;
    this.renderKeys();
    this.toolbar();
  }

  seg(id, v) { for (const b of $(id).querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v); }

  changed() { this.apply(); this.h.onSettings(this.s); }

  bind() {
    const segBind = (id, fn) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (b && b.dataset.v) { fn(b.dataset.v); this.changed(); } });
    segBind('s-lang', (v) => { this.s.lang = v; });
    segBind('s-theme', (v) => { this.s.theme = v; });
    segBind('s-shadows', (v) => { this.s.shadows = v === 'on'; });
    segBind('s-distance', (v) => { this.s.distance = v; });
    segBind('n-kind', (v) => { this.newOpts.kind = v; });
    segBind('n-size', (v) => { this.newOpts.size = v; });
    $('s-sens').addEventListener('input', (e) => { this.s.sens = Number(e.target.value); this.h.onSettings(this.s); });
    $('s-volume').addEventListener('input', (e) => { this.s.volume = Number(e.target.value); this.h.onSettings(this.s); });
    $('s-fov').addEventListener('input', (e) => { this.s.fov = Number(e.target.value); this.h.onSettings(this.s); });
    $('s-invert').addEventListener('change', (e) => { this.s.invertY = e.target.checked; this.h.onSettings(this.s); });
    $('s-reset-keys').addEventListener('click', () => { this.s.bindings = defaultBindings(); this.changed(); });
    $('s-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) this.tab(b.dataset.tab); });
    $('m-new').addEventListener('click', () => this.show('new'));
    $('m-continue').addEventListener('click', () => this.h.continueGame());
    $('m-settings').addEventListener('click', () => this.show('settings'));
    $('m-about').addEventListener('click', () => this.show('about'));
    $('m-quit').addEventListener('click', () => this.h.quit());
    $('n-create').addEventListener('click', () => this.h.newGame({ ...this.newOpts, seed: $('n-seed').value.trim() }));
    $('p-resume').addEventListener('click', () => this.h.resume());
    $('p-save').addEventListener('click', () => this.h.save());
    $('p-load').addEventListener('click', () => this.h.load());
    $('p-settings').addEventListener('click', () => this.show('settings'));
    $('p-menu').addEventListener('click', () => this.h.toMenu());
    for (const b of document.querySelectorAll('.screen .back')) b.addEventListener('click', () => this.back());
    // переназначение: следующая нажатая клавиша или кнопка мыши
    window.addEventListener('keydown', (e) => {
      if (!this.waitKey) return;
      e.preventDefault(); e.stopPropagation();
      if (e.code !== 'Escape') this.s.bindings = rebind(this.s.bindings, this.waitKey, e.code);
      this.waitKey = null;
      this.changed();
    }, true);
    $('s-keys').addEventListener('mousedown', (e) => {
      if (!this.waitKey || !e.target.closest('button.wait')) return;
      e.preventDefault();
      this.s.bindings = rebind(this.s.bindings, this.waitKey, 'Mouse' + e.button);
      this.waitKey = null;
      this.changed();
    });
    $('s-keys').addEventListener('contextmenu', (e) => e.preventDefault());
  }

  tab(name) {
    for (const b of $('s-tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === name);
    for (const el of document.querySelectorAll('#screen-settings .tab')) el.hidden = el.dataset.tab !== name;
  }

  renderKeys() {
    const box = $('s-keys');
    box.textContent = '';
    for (const a of ACTIONS) {
      const label = document.createElement('span');
      label.textContent = this.t('act_' + a);
      const btn = document.createElement('button');
      btn.dataset.action = a;
      btn.textContent = this.waitKey === a ? this.t('pressKey') : keyLabel(this.s.bindings[a], this.s.lang);
      if (this.waitKey === a) btn.classList.add('wait');
      btn.addEventListener('click', (e) => {
        if (this.waitKey === a) return;
        e.stopPropagation();
        this.waitKey = a;
        this.renderKeys();
      });
      box.append(label, btn);
    }
  }

  show(name, push = true) {
    if (push && this.screen && this.screen !== name) this.stack.push(this.screen);
    this.screen = name;
    for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== 'screen-' + name;
    if (name === 'settings') this.tab('general');
    if (name === 'menu') this.stack = [];
    const first = name && document.querySelector(`#screen-${name} button.primary`);
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }
  hideScreens() { this.screen = null; this.stack = []; for (const el of document.querySelectorAll('.screen')) el.hidden = true; }
  back() {
    this.waitKey = null;
    const prev = this.stack.pop();
    if (prev) this.show(prev, false); else this.h.resume();
  }

  setContinue(on) { $('m-continue').hidden = !on; }
  setQuit(on) { $('m-quit').hidden = !on; }
  loading(f) { $('load-bar').style.width = Math.round(f * 100) + '%'; }

  toolbar(active = 0) {
    const bar = $('toolbar');
    bar.textContent = '';
    TOOLS.forEach((tool, i) => {
      const d = document.createElement('div');
      d.dataset.tool = tool.id;
      const key = document.createElement('b');
      key.textContent = keyLabel(this.s.bindings['tool' + (i + 1)], this.s.lang);
      const name = document.createElement('span');
      name.textContent = this.t('tool_' + tool.id);
      const ammo = document.createElement('i');
      d.append(key, name, ammo);
      if (i === active) d.classList.add('on');
      bar.append(d);
    });
  }

  hud(sim, fps) {
    const t = this.t;
    $('s-destroyed').textContent = `${t('stat_destroyed')}: ${(sim.destruction.destroyed + sim.destruction.dust).toLocaleString(this.s.lang)}`;
    $('s-bodies').textContent = `${t('stat_bodies')}: ${sim.physics.bodies.length} (${sim.physics.awakeCount()} ${t('stat_awake')})`;
    $('s-fps').textContent = `${Math.round(fps)} ${t('fps')}`;
    const tool = sim.tool;
    const hint = sim.driving ? t(sim.driving.type === 'crane' ? 'craneHelp' : 'driving')
      : tool.id === 'vehicle' ? `${t('veh_' + VEHICLES[sim.vehicleType])}: ${t('hint_vehicle')}` : t('hint_' + tool.id);
    $('hud-hint').textContent = hint;
    $('hud-flags').textContent = sim.player.flying ? t('flying') : '';
    const cells = $('toolbar').children;
    for (let i = 0; i < cells.length; i++) {
      cells[i].classList.toggle('on', i === sim.toolIndex);
      const id = TOOLS[i].id;
      cells[i].querySelector('i').textContent = sim.ammo[id] != null ? ' ' + sim.ammo[id] : '';
    }
  }

  toast(key, extra = '') {
    const el = $('toast');
    el.textContent = this.t(key) + (extra ? ': ' + extra : '');
    el.hidden = false;
    clearTimeout(this.toastT);
    this.toastT = setTimeout(() => { el.hidden = true; }, 2200);
  }
}
