// Законы страницы: Chromium без окна, WebGL программно (swiftshader), один поток.
// VB_WEB - другая папка web/ (tools/mutate.js гоняет законы на сломанных копиях).
const os = require('os');
const path = require('path');
const { defineConfig } = require('@playwright/test');

const PORT = Number(process.env.VB_PORT || 4173);
module.exports = defineConfig({
  testDir: './tests/web',
  workers: 1,
  fullyParallel: true,
  timeout: 120000,
  expect: { timeout: 20000 },
  reporter: [['list']],
  outputDir: path.join(os.tmpdir(), 'voxelbreak-playwright'),
  webServer: {
    command: `node tools/serve.js ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
    env: { VB_WEB: process.env.VB_WEB || '' },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}/`,
    headless: true,
    viewport: { width: 1280, height: 720 },
    locale: 'ru-RU',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
});
