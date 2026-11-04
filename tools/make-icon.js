// Значок программы кодом: те же кубики, что в favicon.svg. Пишет assets/icon.png (256×256)
// и assets/icon.ico (PNG внутри ICO). Запуск: npm run icon
'use strict';
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const S = 256, k = S / 32;
const RECTS = [
  [0, 0, 32, 32, '#12101f'],
  [3, 11, 12, 12, '#c44a38'], [15, 11, 12, 12, '#a8a8a0'], [9, 3, 8, 8, '#e0a526'],
  [21, 2, 5, 5, '#c44a38'], [25, 8, 4, 4, '#a8a8a0'], [3, 23, 24, 6, '#565a62'],
];
const png = new PNG({ width: S, height: S });
for (const [x, y, w, h, hex] of RECTS) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  for (let py = Math.round(y * k); py < Math.round((y + h) * k); py++)
    for (let px = Math.round(x * k); px < Math.round((x + w) * k); px++) {
      const i = (py * S + px) * 4;
      // светлый верхний край и тёмный нижний у каждого кубика - объём
      const edge = py - y * k < k ? 1.18 : (y + h) * k - py <= k ? 0.78 : 1;
      png.data[i] = Math.min(255, c[0] * edge); png.data[i + 1] = Math.min(255, c[1] * edge); png.data[i + 2] = Math.min(255, c[2] * edge); png.data[i + 3] = 255;
    }
}
const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });
const bytes = PNG.sync.write(png);
fs.writeFileSync(path.join(out, 'icon.png'), bytes);
const head = Buffer.alloc(22);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(1, 4);
head.writeUInt8(0, 6); head.writeUInt8(0, 7); head.writeUInt8(0, 8); head.writeUInt8(0, 9);
head.writeUInt16LE(1, 10); head.writeUInt16LE(32, 12); head.writeUInt32LE(bytes.length, 14); head.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(out, 'icon.ico'), Buffer.concat([head, bytes]));
console.log('assets/icon.png, assets/icon.ico');
