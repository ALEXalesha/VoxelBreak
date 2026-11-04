// Путь файла для адреса app://game/...: только внутри папки web/, иначе null.
// Отдельно от main.js, чтобы проверять без Electron.
'use strict';
const path = require('path');

function resolveAppPath(root, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return null; }
  if (rel.includes('\0')) return null;
  const file = path.resolve(root, '.' + path.sep + rel);
  const inside = path.relative(root, file);
  if (!inside || inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return file;
}
module.exports = { resolveAppPath };
