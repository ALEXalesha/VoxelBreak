// Проверка проверок: каждое правило игры по очереди ломается в копии проекта, и законы обязаны это
// заметить («мутант убит»). Исходники не меняются.
//
//   node tools/mutate.js                 все мутанты
//   VB_MUT=mesh node tools/mutate.js     только те, чьё имя подходит под регулярку
//   node tools/mutate.js --check         только проверить, что каждая поломка находится в коде ровно один раз
//   node tools/mutate.js --node          только мутанты законов node:test (быстро, идёт в CI)
//
// Сначала должны быть зелёными сами законы (npm test, npm run test:web): иначе упавший закон
// «убьёт» мутанта и без поломки.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// file - от корня; from -> to - поломка (from встречается ровно один раз);
// unit: [файл законов без .test.mjs, имя закона (регулярка)] - node:test; web - имя закона Playwright
const MUTANTS = [
  // ---------- генерация ----------
  { id: 'gen-random-seed', file: 'web/js/core/gen.js', from: 'new Rng(hash32(seed, 0x51ed))', to: 'new Rng(hash32((Math.random() * 1e9) >>> 0, 0x51ed))', unit: ['gen', 'детерминирована по зерну'] },
  { id: 'gen-cut-at-seam', file: 'web/js/core/gen.js', from: 'cz <= (s.z1 - 1) >> 5; cz++', to: 'cz <= s.z >> 5; cz++', unit: ['gen', 'через швы чанков целы'] },
  { id: 'gen-chunk-depends-on-order', file: 'web/js/core/gen.js', from: '    world.chunks[ci] = generateChunk(plan, cx, cy, cz);\n', to: '    world.chunks[ci] = generateChunk(plan, cx, cy, cz);\n    if (world.chunks[ci] && list.indexOf(ci) === 0) world.chunks[ci].data[0] = 3;\n', unit: ['gen', 'чанки на границах совпадают'] },
  // ---------- связность и разрушение ----------
  { id: 'no-detach', file: 'web/js/core/connectivity.js', from: 'if (!held) out.push(cur);', to: 'if (false) out.push(cur);', unit: ['destruction', 'висящих кусков'] },
  { id: 'low-is-anchor', file: 'web/js/core/connectivity.js', from: 'if (ANCHOR[world.get(x, y, z)]) { held = true; break; }', to: 'if (ANCHOR[world.get(x, y, z)] || y < 14) { held = true; break; }', unit: ['destruction', 'висящих кусков'] },
  { id: 'detach-loses-voxel', file: 'web/js/core/destruction.js', from: 'const b = bodyFromVoxels(0, list);', to: 'const b = bodyFromVoxels(0, list.slice(1));', unit: ['destruction', 'масса сохраняется|оторванное = исчезнувшее'] },
  { id: 'dust-not-counted', file: 'web/js/core/destruction.js', from: '{ this.dust += list.length; this.events.push(', to: '{ this.events.push(', unit: ['destruction', 'масса сохраняется|оторванное = исчезнувшее'] },
  { id: 'blast-too-wide', file: 'web/js/core/destruction.js', from: 'const rr = r * (0.85 + 0.3 * jitter);', to: 'const rr = r * (1.1 + 0.3 * jitter);', unit: ['destruction', 'взрыв радиуса R'] },
  { id: 'glass-not-fragile', file: 'web/js/core/destruction.js', from: 'const reach = FRAGILE[m] ? rr * 1.5 : rr;', to: 'const reach = rr;', unit: ['destruction', 'стекло бьётся дальше'] },
  { id: 'no-impact-break', file: 'web/js/core/destruction.js', from: 'export const BREAK_V = 14,', to: 'export const BREAK_V = 1e9,', unit: ['destruction', 'удар о землю'] },
  { id: 'no-chain-reaction', file: 'web/js/core/destruction.js', from: 'for (const e of report.explosive) this.pending.push({ ...e, t: 0.12 });', to: 'void report;', unit: ['destruction', 'цепная реакция'] },
  // ---------- сетка ----------
  { id: 'mesh-extra-faces', file: 'web/js/core/mesher.js', from: '} else if (!OPAQUE[b]) {', to: '} else if (b !== a) {', unit: ['mesh', 'без дыр и лишних граней|швы чанков'] },
  { id: 'mesh-no-glass', file: 'web/js/core/mesher.js', from: 'emit(key & 0x10000 ? out.glass : out.opaque,', to: 'if (!(key & 0x10000)) emit(out.opaque,', unit: ['mesh', 'без дыр и лишних граней'] },
  { id: 'mesh-merge-anything', file: 'web/js/core/mesher.js', from: 'if (mask[i + k + (j + h) * nu] !== key) break grow;', to: 'if (!mask[i + k + (j + h) * nu]) break grow;', unit: ['mesh', 'без дыр и лишних граней|затенение'] },
  { id: 'mesh-inside-out', file: 'web/js/core/mesher.js', from: '  if (dir < 0) tri.reverse();\n', to: '', unit: ['mesh', 'без дыр и лишних граней'] },
  // ---------- сохранение ----------
  { id: 'save-drops-chunks', file: 'web/js/core/save.js', from: 'if (c && c.modified) chunks.push', to: 'if (c && c.modified && i % 2) chunks.push', unit: ['save', 'туда-обратно'] },
  { id: 'save-loses-rotation', file: 'web/js/core/save.js', from: 'b.pos = e.p.slice(); b.q = e.q.slice();', to: 'b.pos = e.p.slice(); b.q = [0, 0, 0, 1];', unit: ['save', 'туда-обратно'] },
  // ---------- физика ----------
  { id: 'half-gravity', file: 'web/js/core/physics.js', from: 'b.v[1] -= GRAVITY * h;', to: 'b.v[1] -= GRAVITY * h * 0.5;', unit: ['physics', 'свободное падение'] },
  { id: 'no-friction', file: 'web/js/core/physics.js', from: 'const FRICTION = 0.6,', to: 'const FRICTION = 0,', unit: ['physics', 'трение'] },
  { id: 'never-sleep', file: 'web/js/core/physics.js', from: '        if (b.sleepT > SLEEP_T) sleep(b);\n', to: '', unit: ['physics', 'засыпает|сон'] },
  { id: 'more-substeps', file: 'web/js/core/physics.js', from: 'const SUBSTEPS = 2;', to: 'const SUBSTEPS = 14;', unit: ['perf', 'эталонная сцена'] },
  // ---------- игрок, инструменты, техника ----------
  { id: 'no-step-up', file: 'web/js/game/player.js', from: 'for (let s = 1; s <= P.STEP; s += 1)', to: 'for (let s = 1; s <= 1; s += 1)', unit: ['player', 'ступенька'] },
  { id: 'head-in-ceiling', file: 'web/js/game/player.js', from: 'else p.y = Math.floor(p.y + dy + p.height) - p.height - 1e-4;', to: 'else p.y = Math.ceil(p.y + dy + p.height) - p.height - 1e-4;', unit: ['player', 'прыжок'] },
  { id: 'weak-hammer', file: 'web/js/game/tools.js', from: "range: 12, radius: 1.7, power: 5.5,", to: "range: 12, radius: 1.7, power: 2.5,", unit: ['sim', 'молот'] },
  { id: 'laser-cuts-nothing', file: 'web/js/game/sim.js', from: 'this.destruction.sphere(hit.point[0] - n[0] * 0.45, hit.point[1] - n[1] * 0.45, hit.point[2] - n[2] * 0.45, t.radius, t.power);', to: 'void n;', unit: ['sim', 'лазер режет'] },
  { id: 'dynamite-never-blows', file: 'web/js/game/sim.js', from: '        if (e.fuse <= 0) {', to: '        if (e.fuse <= -100) {', unit: ['sim', 'динамит: прилипает'] },
  { id: 'pellets-one-by-one', file: 'web/js/game/sim.js', from: 'const hits = pelletDirs(dir, t.pellets, t.spread, Math.floor(this.time * 60)).map((d) => [d, this.rayHit(eye, d, t.range)]);', to: 'const hits = pelletDirs(dir, t.pellets, t.spread, Math.floor(this.time * 60)).slice(0, 2).map((d) => [d, this.rayHit(eye, d, t.range)]);', unit: ['sim', 'дробовик'] },
  { id: 'car-through-metal', file: 'web/js/game/vehicles.js', from: 'if (still.length) { v.speed = S.blade ? v.speed * 0.5 : -v.speed * 0.25; return; }', to: 'if (false) { return; }', unit: ['sim', 'машина едет'] },
  // ---------- настройки ----------
  { id: 'rebind-no-swap', file: 'web/js/game/settings.js', from: '  if (other) out[other] = bindings[action];\n', to: '', unit: ['settings', 'клавиши: занятая'], web: 'клавиши: переназначение' },
  { id: 'missing-translation', file: 'web/js/game/i18n.js', from: "    empty: 'Out of ammo',\n", to: '', unit: ['settings', 'переводы'] },
  // ---------- страница ----------
  { id: 'theme-low-contrast', file: 'web/css/style.css', from: '--accent: #4766d6;', to: '--accent: #8aa4f4;', web: 'тема «glass»' },
  // равнозначная поломка «.panel { width: 420px }» не годится: панель - элемент flex и сама сжимается
  { id: 'keys-grid-too-wide', file: 'web/css/style.css', from: '.keys { display: grid; grid-template-columns: minmax(0, 1fr) auto;', to: '.keys { display: grid; grid-template-columns: 230px 160px;', web: 'узкое окно' },
  { id: 'toolbar-names-on-narrow', file: 'web/css/style.css', from: '  #toolbar div span { display: none; }\n', to: '', web: 'узкое окно' },
  { id: 'escape-does-nothing', file: 'web/js/app/main.js', from: "  if (e.code === 'Escape') {", to: "  if (e.code === 'Escape' && false) {", web: 'пауза' },
  { id: 'no-pointer-lock', file: 'web/js/app/main.js', from: '  if (!locked) { requestLock(); return; }', to: '  if (!locked) { return; }', web: 'захват мыши только заглушкой' },
  { id: 'save-not-stored', file: 'web/js/app/main.js', from: 'try { ok = store.set(SAVE, JSON.stringify(sim.toSave())); }', to: 'try { ok = true; }', web: 'сохранение в окне' },
  { id: 'hidden-tab-runs', file: 'web/js/app/main.js', from: "document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });", to: '', web: 'пауза' },
  { id: 'no-worker', file: 'web/js/app/meshq.js', from: "this.worker = new Worker(new URL('./mesh-worker.js', import.meta.url), { type: 'module' });", to: 'this.worker = null;', web: 'меню без ошибок' },
  { id: 'title-not-set', file: 'web/js/app/ui.js', from: "    document.title = this.t('title');\n", to: "    document.title = 'x';\n", web: 'меню без ошибок' },
  { id: 'bodies-not-drawn', file: 'web/js/app/render.js', from: '    this.syncBodies(sim);\n', to: '', web: 'разрушение в окне' },
  { id: 'laser-not-drawn', file: 'web/js/app/render.js', from: '    if (sim.laserOn) {', to: '    if (sim.laserOn && false) {', web: 'инструменты' },
];

function copyProject(dir) {
  for (const p of ['web', 'tests', 'electron', 'tools']) fs.cpSync(path.join(ROOT, p), path.join(dir, p), { recursive: true });
  for (const f of ['package.json', 'playwright.config.js']) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(dir, 'node_modules'), 'dir');
}

function run(m, dir) {
  if (m.unit) {
    const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--test-name-pattern', m.unit[1], `tests/unit/${m.unit[0]}.test.mjs`], { cwd: dir, encoding: 'utf8', timeout: 900000 });
    if (r.status !== 0 || !m.web) return r.status;
  }
  const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  const r = spawnSync(process.execPath, [cli, 'test', '-g', m.web, '--workers=1', '--reporter=line', '--retries=0'], { cwd: dir, env: { ...process.env, VB_PORT: '4199' }, encoding: 'utf8', timeout: 1800000 });
  return r.status;
}

if (process.argv.includes('--check')) {
  let bad = 0;
  for (const m of MUTANTS) {
    const n = fs.readFileSync(path.join(ROOT, m.file), 'utf8').split(m.from).length - 1;
    if (n !== 1) { bad++; console.log(`${m.id}: найдено ${n}`); }
  }
  const ids = new Set(MUTANTS.map((m) => m.id));
  if (ids.size !== MUTANTS.length) { bad++; console.log('повторяются имена мутантов'); }
  console.log(`мутантов ${MUTANTS.length}, не на месте ${bad}`);
  process.exit(bad ? 1 : 0);
}

const filter = process.env.VB_MUT ? new RegExp(process.env.VB_MUT) : null;
const onlyNode = process.argv.includes('--node');
const list = MUTANTS.filter((m) => (!filter || filter.test(m.id)) && (!onlyNode || m.unit));
const rows = [];
let bad = 0;
for (const m of list) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voxelbreak-mut-'));
  try {
    copyProject(dir);
    const file = path.join(dir, m.file);
    const text = fs.readFileSync(file, 'utf8');
    const n = text.split(m.from).length - 1;
    if (n !== 1) { rows.push([m.id, `НЕ НАЙДЕНО (${n})`]); bad++; console.log(rows[rows.length - 1].join(': ')); continue; }
    fs.writeFileSync(file, text.replace(m.from, m.to));
    const t0 = Date.now();
    const status = run(m, dir);
    const killed = status !== 0;
    if (!killed) bad++;
    rows.push([m.id, `${killed ? 'убит' : 'ВЫЖИЛ'} (${m.unit && (!m.web || onlyNode) ? 'node' : m.unit ? 'node+страница' : 'страница'}, ${Math.round((Date.now() - t0) / 1000)} с)`]);
    console.log(rows[rows.length - 1].join(': '));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
console.log(`\nмутантов ${list.length}, убито ${list.length - bad}`);
for (const [id, res] of rows) if (!/^убит/.test(res)) console.log('  ' + id + ': ' + res);
process.exit(bad ? 1 : 0);
