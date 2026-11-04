// Законы программы на Electron. VB_TEST=1: окно не показывается и не берёт фокус.
// Один поток: одна программа за раз. На Linux нужен экран: xvfb-run -a npm run test:app.
const os = require('os');
const path = require('path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/app',
  workers: 1,
  fullyParallel: false,
  timeout: 600000,
  reporter: [['list']],
  outputDir: path.join(os.tmpdir(), 'voxelbreak-playwright-app'),
});
