// Ничего личного в файлах репозитория: адрес домашней сети, пути к папкам автора, почта,
// сервис донатов, ссылки на домашний сервер. Репозиторий уходит на GitHub открытым.
// Образцы собраны из кусков, иначе закон нашёл бы сам себя.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PATTERNS = [
  new RegExp('192\\.' + '168\\.\\d+\\.\\d+'),
  new RegExp('C:[\\\\/]+(Dri' + 've|Us' + 'ers)', 'i'),
  new RegExp('@' + 'gmail\\.com', 'i'),
  new RegExp('k' + 'o-' + 'fi\\.com', 'i'),
  new RegExp('https?://[^\\s)]*' + 'git' + 'ea', 'i'),
];

function tracked() {
  try { return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean); } catch { return []; }
}

test('в файлах репозитория нет личного: адресов, путей, почты, ссылок на домашний сервер', () => {
  const found = [];
  for (const f of tracked()) {
    if (f.startsWith('web/vendor/')) continue;
    let data;
    try { data = fs.readFileSync(path.join(ROOT, f)); } catch { continue; }
    if (data.subarray(0, 8192).includes(0)) continue;
    const text = data.toString('utf8');
    for (const re of PATTERNS) if (re.test(text)) found.push(`${f}: ${re}`);
  }
  assert.deepEqual(found, []);
});
