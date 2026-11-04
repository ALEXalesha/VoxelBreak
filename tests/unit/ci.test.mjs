// Закон проверок на GitHub: CI на ubuntu с node 24 гоняет покрытие с порогами, мутантов, страницу
// и программу; Pages собирает сайт из web/ без сборки.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('CI: ubuntu, node 24, покрытие с порогами, мутанты, страница и программа', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /runs-on: ubuntu-latest/);
  assert.equal((ci.match(/node-version: "24"/g) || []).length, 3);
  for (const step of ['npm run cover', 'node --test tests/unit/perf.test.mjs', 'tools/mutate.js --check', 'tools/mutate.js --node', 'npx playwright test --workers=1', 'playwright.app.config.js', 'xvfb-run']) assert.ok(ci.includes(step), step);
  const pkg = JSON.parse(read('package.json'));
  assert.match(pkg.scripts.cover, /coverage-check/);
  assert.ok(read('tools/coverage-check.js').includes('min: 90') && read('tools/coverage-check.js').includes('min: 80'));
});

test('Pages: сайт - папка web/ как есть', () => {
  const pages = read('.github/workflows/pages.yml');
  assert.match(pages, /cp -r web\/\. _site\//);
  assert.match(pages, /upload-pages-artifact/);
  assert.ok(fs.existsSync(path.join(ROOT, 'web', 'index.html')));
  assert.ok(fs.existsSync(path.join(ROOT, 'web', 'vendor', 'three.module.js')), 'three.js лежит рядом, без сети');
});
