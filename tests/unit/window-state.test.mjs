// Законы места окна программы: мусор - умолчания, окно за пределами экранов - в середину.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const WS = require('../../electron/window-state.js');

const SIZE = { width: 1280, height: 760, minWidth: 360, minHeight: 480 };
const AREAS = [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: 1920, y: 0, width: 1280, height: 1000 }];

test('место окна: мусор - умолчание, мелкое - до минимума, за экраном - без места', () => {
  assert.deepEqual(WS.restore(null, AREAS, SIZE), { width: 1280, height: 760, maximized: false });
  assert.deepEqual(WS.restore({ width: 100, height: 'x' }, AREAS, SIZE), { width: 1280, height: 760, maximized: false });
  assert.deepEqual(WS.restore({ width: 100, height: 100, x: 10, y: 10, maximized: true }, AREAS, SIZE), { width: 360, height: 480, maximized: true, x: 10, y: 10 });
  assert.equal(WS.restore({ width: 800, height: 600, x: 5000, y: 10 }, AREAS, SIZE).x, undefined);
  assert.equal(WS.restore({ width: 800, height: 600, x: 2000, y: 10 }, AREAS, SIZE).x, 2000, 'второй экран');
  assert.equal(WS.restore({ width: 5000, height: 5000 }, AREAS, SIZE).width, 1920, 'не больше экрана');
  assert.deepEqual(WS.restore({ width: 900, height: 700 }, [], SIZE), { width: 900, height: 700, maximized: false });
});

test('место окна: запись и чтение файла, сбой записи не роняет', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vb-ws-')), 's.json');
  assert.equal(WS.load(f), null);
  assert.equal(WS.save(f, { x: 1 }), true);
  assert.deepEqual(WS.load(f), { x: 1 });
  assert.equal(WS.save(path.join(f, 'нет', 'x.json'), {}), false);
  const fake = { getNormalBounds: () => ({ x: 1, y: 2, width: 3, height: 4 }), isMaximized: () => true };
  assert.deepEqual(WS.capture(fake), { x: 1, y: 2, width: 3, height: 4, maximized: true });
  const old = { getBounds: () => ({ x: 5, y: 6, width: 7, height: 8 }), isMaximized: () => false };
  assert.deepEqual(WS.capture(old), { x: 5, y: 6, width: 7, height: 8, maximized: false });
});
