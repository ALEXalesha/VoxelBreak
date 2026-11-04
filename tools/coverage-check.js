// Пороги покрытия по ветвям (после npm run cover): ядро web/js/core >= 90 %, весь код без окон
// (ядро, игра, модели кодом) >= 80 %. Окно (web/js/app) проверяется Playwright, не здесь.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const GROUPS = [
  { name: 'ядро (web/js/core)', test: (f) => f.includes('/web/js/core/'), min: 90 },
  { name: 'без окон (core + game + assets)', test: (f) => /\/web\/(js\/core|js\/game|assets)\//.test(f), min: 80 },
];

const summary = JSON.parse(fs.readFileSync(path.join(ROOT, 'coverage', 'coverage-summary.json'), 'utf8'));
let bad = 0;
for (const g of GROUPS) {
  let covered = 0, total = 0, lines = 0, linesTotal = 0;
  const files = [];
  for (const [file, s] of Object.entries(summary)) {
    if (file === 'total' || !g.test(file.replace(/\\/g, '/'))) continue;
    covered += s.branches.covered; total += s.branches.total;
    lines += s.lines.covered; linesTotal += s.lines.total;
    files.push([path.relative(ROOT, file), s.branches.pct]);
  }
  const pct = total ? (covered / total) * 100 : 100;
  const ok = pct >= g.min;
  if (!ok) bad++;
  console.log(`${ok ? 'да ' : 'НЕТ'} ${g.name}: ветви ${pct.toFixed(1)} % (${covered}/${total}), строки ${(lines / linesTotal * 100).toFixed(1)} %, порог ${g.min} %`);
  for (const [f, p] of files.sort((a, b) => a[1] - b[1]).slice(0, 4)) console.log(`      слабее всего: ${f} ${p} %`);
}
process.exit(bad ? 1 : 0);
