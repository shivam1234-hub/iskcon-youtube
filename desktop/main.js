'use strict';

const {
  app, BrowserWindow, Menu, clipboard, dialog, globalShortcut, ipcMain, nativeTheme, screen,
  session, shell,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const { startServer } = require('./lib/server');
const net = require('./lib/net');

const APP_NAME = 'YouTube';
// Same userData folder whether run from source or installed.
app.setName(APP_NAME);

// LOCAL TESTING ONLY: the office network re-signs TLS. Never set in a
// shipped build; nothing in the packaged app sets this variable.
if (process.env.YT_DESKTOP_INSECURE === '1') {
  app.commandLine.appendSwitch('ignore-certificate-errors');
}
// The app owns the hardware media keys itself (globalShortcut while a video
// is open, see media:hold). Chromium's own handling would also toggle the
// embed, and the two together would cancel each other out.
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
// The embed must be able to start the next video on its own (autoplay).
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const WEB_DIR = process.env.YT_BUNDLE_DIR || path.join(__dirname, 'web');
const ICON = path.join(__dirname, 'build', 'icon.png');
const isDev = !app.isPackaged;

let mainWindow = null;
let floatWindow = null;
let floatState = null; // { videoId, time, playing }
let origin = '';
const WINDOW_STATE_PATH = () => path.join(app.getPath('userData'), 'window-state.json');

// ---------------------------------------------------------------------------
// Main window

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(WINDOW_STATE_PATH(), 'utf8'));
    if (typeof s.width === 'number' && typeof s.height === 'number') {
      // Ignore a position that is no longer on any screen (monitor unplugged).
      const visible = screen.getAllDisplays().some((d) => {
        const b = d.workArea;
        return s.x >= b.x - 50 && s.y >= b.y - 50 && s.x < b.x + b.width && s.y < b.y + b.height;
      });
      return visible ? s : { width: s.width, height: s.height, maximized: s.maximized };
    }
  } catch {}
  return { width: 1360, height: 860 };
}

function saveWindowState(win) {
  if (!win || win.isDestroyed() || process.env.YT_SHOTS) return;
  try {
    fs.writeFileSync(
      WINDOW_STATE_PATH(),
      JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }),
    );
  } catch {}
}

function bgColor() {
  return nativeTheme.shouldUseDarkColors ? '#0f0f0f' : '#ffffff';
}

function guardNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url) && !url.startsWith(origin)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
}

function createWindow() {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 1000,
    minHeight: 640,
    title: APP_NAME,
    backgroundColor: bgColor(),
    show: false,
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      // Keeps the page "visible" while minimised, so a video keeps playing
      // (the embed pauses itself on a hidden page).
      backgroundThrottling: false,
    },
  });
  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => {
    if (!process.env.YT_SHOTS_HIDDEN) mainWindow.show();
  });
  guardNavigation(mainWindow);

  let t = null;
  const queueSave = () => {
    clearTimeout(t);
    t = setTimeout(() => saveWindowState(mainWindow), 400);
  };
  mainWindow.on('resize', queueSave);
  mainWindow.on('move', queueSave);
  mainWindow.on('minimize', () => mainWindow.webContents.send('app:window', 'minimized'));
  mainWindow.on('restore', () => mainWindow.webContents.send('app:window', 'restored'));
  mainWindow.on('close', () => {
    clearTimeout(t);
    saveWindowState(mainWindow);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    floatWindow?.close();
  });

  mainWindow.loadURL(`${origin}/`);
  if (process.env.YT_SHOTS) runScreenshots(mainWindow, process.env.YT_SHOTS);
}

// ---------------------------------------------------------------------------
// Mini player ("Float"): the desktop stand-in for Android picture-in-picture.
// A small always-on-top window that keeps playing over other apps.

function openFloat({ videoId, start, title }) {
  if (typeof videoId !== 'string' || !/^[\w-]{6,20}$/.test(videoId)) return;
  const q = new URLSearchParams({
    v: videoId,
    t: String(Math.max(0, Math.floor(Number(start) || 0))),
    title: String(title || '').slice(0, 200),
  });
  floatState = { videoId, time: Number(start) || 0, playing: true };
  if (floatWindow && !floatWindow.isDestroyed()) {
    floatWindow.loadURL(`${origin}/__float.html?${q}`);
    floatWindow.show();
    return;
  }
  const wa = screen.getDisplayMatching(mainWindow?.getBounds() ?? { x: 0, y: 0, width: 1, height: 1 }).workArea;
  const w = 480;
  const h = 300;
  floatWindow = new BrowserWindow({
    width: w,
    height: h,
    x: wa.x + wa.width - w - 24,
    y: wa.y + wa.height - h - 24,
    minWidth: 320,
    minHeight: 210,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    title: title ? `${title} - ${APP_NAME}` : APP_NAME,
    backgroundColor: '#000000',
    icon: ICON,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  // 16:9 video plus the 30px title strip.
  floatWindow.setAspectRatio(16 / 9, { width: 0, height: 30 });
  floatWindow.setAlwaysOnTop(true, 'floating');
  guardNavigation(floatWindow);
  floatWindow.loadURL(`${origin}/__float.html?${q}`);
  floatWindow.on('closed', () => {
    floatWindow = null;
    const s = floatState;
    floatState = null;
    if (mainWindow && s) mainWindow.webContents.send('float:closed', s);
  });
}

// ---------------------------------------------------------------------------
// Media keys, held only while a watch screen is open (like the phone app's
// media session), so the app doesn't steal them from other players otherwise.

let mediaHeld = false;
function holdMediaKeys(hold) {
  if (hold === mediaHeld) return;
  mediaHeld = hold;
  const keys = { MediaPlayPause: 'playPause', MediaNextTrack: 'next', MediaPreviousTrack: 'previous', MediaStop: 'pause' };
  for (const [accel, cmd] of Object.entries(keys)) {
    if (hold) {
      try {
        globalShortcut.register(accel, () => {
          // With the mini player open, the keys drive that one.
          const target = floatWindow && !floatWindow.isDestroyed() ? floatWindow : mainWindow;
          target?.webContents.send('media:key', cmd);
        });
      } catch {}
    } else {
      try {
        globalShortcut.unregister(accel);
      } catch {}
    }
  }
}

// ---------------------------------------------------------------------------
// Menu

function buildMenu() {
  const view = [
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];
  if (isDev) view.push({ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' });
  const template = [
    { label: '&File', submenu: [{ role: 'quit', label: 'Exit' }] },
    { label: '&Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '&View', submenu: view },
    {
      label: '&Help',
      submenu: [
        {
          label: `About ${APP_NAME}`,
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: `About ${APP_NAME}`,
              message: APP_NAME,
              detail: `Version ${app.getVersion()}`,
              buttons: ['OK'],
            }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------------------
// IPC

function registerIpc() {
  ipcMain.on('desktop:info', (e) => {
    e.returnValue = { version: app.getVersion(), platform: process.platform };
  });
  ipcMain.handle('net:request', (_e, req) => net.request(req));
  ipcMain.handle('clipboard:write', (_e, text) => {
    if (typeof text === 'string') clipboard.writeText(text.slice(0, 5000));
  });
  ipcMain.handle('media:hold', (_e, hold) => holdMediaKeys(!!hold));
  ipcMain.handle('float:open', (_e, opts) => openFloat(opts || {}));
  ipcMain.handle('float:close', () => floatWindow?.close());
  ipcMain.on('float:state', (_e, s) => {
    if (floatState && s && typeof s === 'object') {
      if (typeof s.time === 'number') floatState.time = s.time;
      if (typeof s.playing === 'boolean') floatState.playing = s.playing;
      if (s.ended) mainWindow?.webContents.send('float:ended', { ...floatState });
    }
  });
  ipcMain.handle('float:backToApp', () => {
    floatWindow?.close();
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  ipcMain.handle('window:focus', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
}

// ---------------------------------------------------------------------------
// Screenshot harness (development only): YT_SHOTS=<plan.json>.
// Each step: { name, path, w, h, theme: 'light'|'dark', wait, js }.

async function runScreenshots(win, planPath) {
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  const outDir = process.env.YT_SHOT_DIR || path.dirname(planPath);
  fs.mkdirSync(outDir, { recursive: true });
  const log = fs.createWriteStream(path.join(outDir, 'console.log'), { flags: 'a' });
  win.webContents.on('console-message', (e) => {
    const { level, message, sourceId, lineNumber } = e;
    log.write(`[${level}] ${message} (${sourceId}:${lineNumber})\n`);
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await sleep(1500);
  for (const step of plan) {
    try {
      if (step.theme) nativeTheme.themeSource = step.theme;
      if (step.w && step.h) win.setContentSize(step.w, step.h);
      if (step.path) {
        if (step.reload) await win.loadURL(`${origin}${step.path}`);
        else {
          // In-app navigation, like a click (keeps app state).
          await win.webContents.executeJavaScript(
            `window.__nav ? window.__nav(${JSON.stringify(step.path)}) : (location.href=${JSON.stringify(step.path)})`,
          );
        }
      }
      await sleep(step.wait ?? 3000);
      if (step.js) {
        const r = await win.webContents.executeJavaScript(step.js);
        if (r !== undefined) log.write(`[js ${step.name}] ${JSON.stringify(r)}\n`);
        await sleep(step.after ?? 800);
      }
      if (step.name) {
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, `${step.name}.png`), img.toPNG());
        log.write(`[shot] ${step.name}\n`);
      }
      if (step.float && floatWindow) {
        await sleep(step.floatWait ?? 6000);
        const img = await floatWindow.webContents.capturePage();
        fs.writeFileSync(path.join(outDir, `${step.float}.png`), img.toPNG());
      }
    } catch (err) {
      log.write(`[error ${step.name}] ${err && err.message}\n`);
    }
  }
  log.end();
  app.quit();
}

// ---------------------------------------------------------------------------
// Boot

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    if (!fs.existsSync(path.join(WEB_DIR, 'index.html'))) {
      dialog.showErrorBox('Web bundle missing', `No web export at:\n${WEB_DIR}\n\nRun "npm run export" in desktop/.`);
      app.quit();
      return;
    }
    ({ origin } = await startServer({
      webDir: WEB_DIR,
      extraFiles: { '/__float.html': path.join(__dirname, 'float.html') },
    }));

    // The player may go fullscreen and copy links; nothing needs the camera,
    // microphone or location.
    const allowed = new Set(['fullscreen', 'clipboard-sanitized-write', 'clipboard-read']);
    session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));

    if (process.platform === 'darwin' && app.dock) app.dock.setIcon(ICON);
    registerIpc();
    buildMenu();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}
