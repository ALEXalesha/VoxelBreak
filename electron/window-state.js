// Где было окно: размер, место, развёрнуто ли. Чистые функции - проверяются без Electron.
'use strict';
const fs = require('fs');

function load(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function save(file, state) {
  try { fs.writeFileSync(file, JSON.stringify(state)); return true; } catch { return false; }
}
// areas - рабочие области экранов [{ x, y, width, height }], size - { width, height, minWidth, minHeight }
function restore(state, areas, size) {
  const out = { width: size.width, height: size.height, maximized: false };
  if (!state || typeof state !== 'object') return out;
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  if (num(state.width) && num(state.height)) {
    out.width = Math.max(size.minWidth, Math.round(state.width));
    out.height = Math.max(size.minHeight, Math.round(state.height));
  }
  out.maximized = state.maximized === true;
  if (num(state.x) && num(state.y)) {
    // окно должно хотя бы на 100×60 пикселей попадать на какой-нибудь экран
    const visible = areas.some((a) => state.x + out.width - 100 >= a.x && state.x + 100 <= a.x + a.width && state.y >= a.y - 10 && state.y + 60 <= a.y + a.height);
    if (visible) { out.x = Math.round(state.x); out.y = Math.round(state.y); }
  }
  // размер ограничивает тот экран, на котором окно, иначе основной
  const area = (out.x !== undefined && areas.find((a) => out.x >= a.x - 10 && out.x < a.x + a.width && out.y >= a.y - 10 && out.y < a.y + a.height)) || areas[0];
  if (area) { out.width = Math.min(out.width, area.width); out.height = Math.min(out.height, area.height); }
  return out;
}
function capture(win) {
  const b = win.getNormalBounds ? win.getNormalBounds() : win.getBounds();
  return { x: b.x, y: b.y, width: b.width, height: b.height, maximized: win.isMaximized() };
}
module.exports = { load, save, restore, capture };
