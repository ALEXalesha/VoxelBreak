// Настройки и клавиши. Всё, что приходит из хранилища, проверяется и обрезается до допустимого.
import { LANGS } from './i18n.js';

export const THEMES = ['glass', 'formal', 'light', 'night', 'warm'];
export const DISTANCES = ['low', 'mid', 'high'];
export const ACTIONS = ['forward', 'back', 'left', 'right', 'jump', 'crouch', 'run', 'use', 'fly', 'camera', 'fire1', 'fire2',
  'tool1', 'tool2', 'tool3', 'tool4', 'tool5', 'tool6', 'tool7'];
export const RESERVED = ['Escape'];   // пауза - всегда Esc

export function defaultBindings() {
  return {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', crouch: 'KeyC', run: 'ShiftLeft',
    use: 'KeyE', fly: 'KeyF', camera: 'KeyV', fire1: 'Mouse0', fire2: 'Mouse2',
    tool1: 'Digit1', tool2: 'Digit2', tool3: 'Digit3', tool4: 'Digit4', tool5: 'Digit5', tool6: 'Digit6', tool7: 'Digit7',
  };
}

export function defaultSettings(lang = 'ru') {
  return { v: 1, lang, theme: 'glass', sens: 1, invertY: false, fov: 75, shadows: true, distance: 'mid', volume: 0.7, bindings: defaultBindings() };
}

const clamp = (v, a, b, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d);
const validCode = (c) => typeof c === 'string' && /^[A-Za-z][A-Za-z0-9]{0,24}$/.test(c) && !RESERVED.includes(c);

export function sanitize(raw, lang = 'ru') {
  const d = defaultSettings(lang);
  if (!raw || typeof raw !== 'object') return d;
  const s = {
    v: 1,
    lang: LANGS.includes(raw.lang) ? raw.lang : d.lang,
    theme: THEMES.includes(raw.theme) ? raw.theme : d.theme,
    sens: clamp(raw.sens, 0.1, 4, d.sens),
    invertY: raw.invertY === true,
    fov: Math.round(clamp(raw.fov, 50, 110, d.fov)),
    shadows: raw.shadows !== false,
    distance: DISTANCES.includes(raw.distance) ? raw.distance : d.distance,
    volume: clamp(raw.volume, 0, 1, d.volume),
    bindings: d.bindings,
  };
  // клавиши: только известные действия, без повторов (повтор - назад к умолчанию)
  if (raw.bindings && typeof raw.bindings === 'object') {
    const b = { ...d.bindings };
    for (const a of ACTIONS) if (validCode(raw.bindings[a])) b[a] = raw.bindings[a];
    const used = new Map();
    let clash = false;
    for (const a of ACTIONS) { if (used.has(b[a])) clash = true; used.set(b[a], a); }
    s.bindings = clash ? d.bindings : b;
  }
  return s;
}

// назначить клавишу действию; занятая другим действием - меняются местами
export function rebind(bindings, action, code) {
  if (!ACTIONS.includes(action) || !validCode(code)) return bindings;
  const out = { ...bindings };
  const other = ACTIONS.find((a) => a !== action && out[a] === code);
  if (other) out[other] = bindings[action];
  out[action] = code;
  return out;
}

// код клавиши -> действие
export function actionFor(bindings, code) {
  for (const a of ACTIONS) if (bindings[a] === code) return a;
  return null;
}

// подпись клавиши для экрана
export function keyLabel(code, lang = 'ru') {
  if (!code) return '-';
  const mouse = { Mouse0: lang === 'ru' ? 'ЛКМ' : 'LMB', Mouse1: lang === 'ru' ? 'СКМ' : 'MMB', Mouse2: lang === 'ru' ? 'ПКМ' : 'RMB' };
  if (mouse[code]) return mouse[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  const names = { Space: lang === 'ru' ? 'Пробел' : 'Space', ShiftLeft: 'Shift', ShiftRight: 'R-Shift', ControlLeft: 'Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'Alt', AltRight: 'R-Alt', Tab: 'Tab', Enter: 'Enter',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backspace: '⌫', CapsLock: 'Caps' };
  return names[code] || code;
}

// ввод одного кадра из нажатых кнопок: held - множество зажатых кодов, pressed - нажатые в этом кадре
export function frameInput(bindings, held, pressed, look = null) {
  const on = (a) => held.has(bindings[a]);
  const hit = (a) => pressed.has(bindings[a]);
  let tool = null;
  for (let i = 1; i <= 7; i++) if (hit('tool' + i)) tool = i - 1;
  return {
    mz: (on('forward') ? 1 : 0) - (on('back') ? 1 : 0),
    mx: (on('right') ? 1 : 0) - (on('left') ? 1 : 0),
    jump: on('jump'), up: on('jump'), crouch: on('crouch'), down: on('crouch'), run: on('run'),
    fire1: on('fire1'), fire2: on('fire2'), fire1Pressed: hit('fire1'), fire2Pressed: hit('fire2'),
    use: hit('use'), fly: hit('fly'), camera: hit('camera'), tool, look,
  };
}
