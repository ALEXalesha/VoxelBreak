// Программа VoxelBreak: те же файлы web/ в окне Electron. Страница открывается по своей схеме
// app:// (на file:// в Chromium не работают модули и Worker).
//
// VB_TEST=1 - режим проверок: окно никогда не показывается, не берёт фокус и стоит за экраном,
// все разрешения (и захват мыши) запрещены. VB_QUERY - параметры адреса страницы (?seed=7...).
'use strict';
const { app, BrowserWindow, Menu, protocol, net, session, screen } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const WindowState = require('./window-state');

const TEST = process.env.VB_TEST === '1';
const WEB = path.join(__dirname, '..', 'web');
const SIZE = { width: 1280, height: 760, minWidth: 360, minHeight: 480 };
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');
let win = null;

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
if (TEST) {
  app.commandLine.appendSwitch('use-angle', 'swiftshader');
  app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
}

function serve() {
  protocol.handle('app', (req) => {
    const url = new URL(req.url);
    const file = path.normalize(path.join(WEB, decodeURIComponent(url.pathname)));
    if (!file.startsWith(WEB)) return new Response('', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function createWindow() {
  const primary = screen.getPrimaryDisplay();
  const areas = [primary, ...screen.getAllDisplays().filter((d) => d.id !== primary.id)].map((d) => d.workArea);
  const placed = WindowState.restore(WindowState.load(stateFile()), areas, SIZE);
  win = new BrowserWindow({
    ...(TEST ? { x: -20000, y: -20000 } : placed.x !== undefined ? { x: placed.x, y: placed.y } : {}),
    width: placed.width, height: placed.height, minWidth: SIZE.minWidth, minHeight: SIZE.minHeight,
    title: 'VoxelBreak',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#12101f',
    show: false,
    focusable: !TEST,
    skipTaskbar: TEST,
    paintWhenInitiallyHidden: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.loadURL('app://game/index.html' + (process.env.VB_QUERY || ''));
  if (!TEST) {
    if (placed.maximized) win.maximize();
    win.once('ready-to-show', () => win.show());
  }
  const remember = () => { if (win && !win.isDestroyed() && !win.isMinimized() && !win.isFullScreen() && !TEST) WindowState.save(stateFile(), WindowState.capture(win)); };
  for (const ev of ['resized', 'moved', 'maximize', 'unmaximize']) win.on(ev, remember);
  win.on('close', remember);
  win.on('closed', () => { win = null; });
  // F11 - во весь экран; ссылки не открываются внутри, страницу нельзя увести
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') { e.preventDefault(); win.setFullScreen(!win.isFullScreen()); }
  });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  Menu.setApplicationMenu(null);
  app.on('second-instance', () => {
    if (!win || TEST) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(() => {
    serve();
    // игре нужен только захват мыши; в проверках - ничего
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(!TEST && permission === 'pointerLock'));
    session.defaultSession.setPermissionCheckHandler((_wc, permission) => !TEST && permission === 'pointerLock');
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
