// Законы настроек и переводов: мусор из хранилища обрезается, клавиши меняются местами,
// Esc занят паузой, каждая строка есть на обоих языках.
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitize, defaultSettings, defaultBindings, rebind, actionFor, keyLabel, frameInput, ACTIONS, THEMES } from '../../web/js/game/settings.js';
import { STRINGS, LANGS, translator, pickLang } from '../../web/js/game/i18n.js';
import { TOOLS, VEHICLES } from '../../web/js/game/tools.js';

test('настройки: мусор и чужие значения -> умолчания и пределы', () => {
  assert.deepEqual(sanitize(null, 'en'), defaultSettings('en'));
  assert.deepEqual(sanitize('x'), defaultSettings('ru'));
  const s = sanitize({ lang: 'fr', theme: 'pink', sens: 99, fov: 10, volume: -1, invertY: 'yes', shadows: false, distance: 'far', bindings: { forward: 'Escape', back: 'KeyZ', jump: 42, nope: 'KeyQ' } });
  assert.equal(s.lang, 'ru'); assert.equal(s.theme, 'glass'); assert.equal(s.sens, 4); assert.equal(s.fov, 50); assert.equal(s.volume, 0);
  assert.equal(s.invertY, false); assert.equal(s.shadows, false); assert.equal(s.distance, 'mid');
  assert.equal(s.bindings.forward, 'KeyW', 'Esc нельзя'); assert.equal(s.bindings.back, 'KeyZ'); assert.equal(s.bindings.jump, 'Space');
  assert.equal(s.bindings.nope, undefined);
  const clash = sanitize({ bindings: { forward: 'KeyS' } });
  assert.deepEqual(clash.bindings, defaultBindings(), 'повтор клавиши - назад к умолчанию');
  for (const t of THEMES) assert.equal(sanitize({ theme: t }).theme, t);
  assert.equal(sanitize({ sens: 'x' }).sens, 1);
});

test('клавиши: занятая меняется местами, Esc и мусор не назначаются, у каждого действия своя', () => {
  const b = defaultBindings();
  const r = rebind(b, 'forward', 'KeyS');
  assert.equal(r.forward, 'KeyS'); assert.equal(r.back, 'KeyW');
  assert.equal(new Set(ACTIONS.map((a) => r[a])).size, ACTIONS.length);
  assert.equal(rebind(b, 'forward', 'Escape'), b);
  assert.equal(rebind(b, 'нет', 'KeyQ'), b);
  assert.equal(rebind(b, 'jump', 'Mouse1').jump, 'Mouse1');
  assert.equal(actionFor(b, 'KeyE'), 'use');
  assert.equal(actionFor(b, 'KeyZ'), null);
  assert.equal(b.forward, 'KeyW', 'исходные не меняются');
});

test('подписи клавиш на двух языках', () => {
  assert.equal(keyLabel('KeyW'), 'W'); assert.equal(keyLabel('Digit3'), '3'); assert.equal(keyLabel('Mouse0', 'ru'), 'ЛКМ');
  assert.equal(keyLabel('Mouse2', 'en'), 'RMB'); assert.equal(keyLabel('Space', 'ru'), 'Пробел'); assert.equal(keyLabel('Numpad4'), 'Num 4');
  assert.equal(keyLabel('F5'), 'F5'); assert.equal(keyLabel(''), '-'); assert.equal(keyLabel('ShiftLeft'), 'Shift');
});

test('ввод кадра: зажатые и нажатые кнопки -> движение, действия, инструмент', () => {
  const b = defaultBindings();
  const i = frameInput(b, new Set(['KeyW', 'KeyD', 'ShiftLeft', 'Mouse0']), new Set(['Mouse0', 'Digit3', 'KeyE']), [1, 2]);
  assert.deepEqual([i.mz, i.mx, i.run, i.fire1, i.fire1Pressed, i.tool, i.use, i.fly], [1, 1, true, true, true, 2, true, false]);
  assert.deepEqual(i.look, [1, 2]);
  const j = frameInput(b, new Set(['KeyS', 'KeyA', 'KeyC']), new Set());
  assert.deepEqual([j.mz, j.mx, j.crouch, j.down, j.tool], [-1, -1, true, true, null]);
});

test('переводы: одинаковые ключи на обоих языках, ни одной пустой строки, есть всё для меню', () => {
  const ru = Object.keys(STRINGS.ru).sort(), en = Object.keys(STRINGS.en).sort();
  assert.deepEqual(ru, en);
  for (const l of LANGS) for (const [k, v] of Object.entries(STRINGS[l])) assert.ok(typeof v === 'string' && v.trim(), `${l}.${k}`);
  for (const l of LANGS) {
    const t = translator(l);
    for (const a of ACTIONS) assert.notEqual(t('act_' + a), 'act_' + a);
    for (const tool of TOOLS) { assert.notEqual(t('tool_' + tool.id), 'tool_' + tool.id); assert.notEqual(t('hint_' + tool.id), 'hint_' + tool.id); }
    for (const v of VEHICLES) assert.notEqual(t('veh_' + v), 'veh_' + v);
    for (const th of THEMES) assert.notEqual(t('theme_' + th), 'theme_' + th);
  }
  assert.ok(!/[а-яё]/i.test(Object.values(STRINGS.en).join(' ')), 'в английском нет кириллицы');
  assert.equal(translator('de')('play'), STRINGS.en.play);
  assert.equal(translator('ru')('нет-такого'), 'нет-такого');
  assert.equal(pickLang('ru-RU'), 'ru'); assert.equal(pickLang('en-US'), 'en'); assert.equal(pickLang(undefined), 'en');
  assert.match(STRINGS.ru.authorship, /Claude \(Anthropic\) в Claude Code; идеи, проверка и решения - Алексея/);
  assert.match(STRINGS.ru.fan, /Фан-игра/);
});
