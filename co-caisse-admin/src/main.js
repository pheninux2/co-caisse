/**
 * Co-Caisse Admin — Electron Main Process
 * Outil interne de gestion des licences
 */

require('dotenv').config();

const { app, BrowserWindow, ipcMain, shell, dialog, Menu } = require('electron');
const path = require('path');
const fs   = require('fs');

let isDev;
try { isDev = require('electron-is-dev'); } catch { isDev = !app.isPackaged; }

const ADMIN_API_URL = process.env.ADMIN_API_URL || 'http://localhost:5000';
let mainWindow;

// ── Fenêtre principale ────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width:           1100,
    height:          750,
    minWidth:        900,
    minHeight:       600,
    show:            false,
    backgroundColor: '#1e1e2e',
    title:           'Co-Caisse Admin — Gestion des licences',
    autoHideMenuBar: true,
    webPreferences: {
      preload:            path.join(__dirname, 'preload.js'),
      nodeIntegration:    false,
      contextIsolation:   true,
      enableRemoteModule: false,
      sandbox:            false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  const startUrl = isDev
    ? 'http://localhost:4000'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) mainWindow.webContents.openDevTools({ mode: 'detach' });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Raccourcis
  mainWindow.webContents.on('before-input-event', (_e, input) => {
    if (input.key === 'F12') mainWindow.webContents.toggleDevTools();
    if (input.key === 'F5')  mainWindow.reload();
  });
}

// ── Menu minimal ──────────────────────────────────────────────────────────────
Menu.setApplicationMenu(Menu.buildFromTemplate([
  {
    label: 'Co-Caisse Admin',
    submenu: [
      { role: 'reload',           label: 'Actualiser (F5)' },
      { type: 'separator' },
      { role: 'quit',             label: 'Quitter' },
    ],
  },
  {
    label: 'Outils',
    submenu: [
      { role: 'toggleDevTools',   label: 'DevTools (F12)' },
    ],
  },
]));

// ── Lifecycle ─────────────────────────────────────────────────────────────────
app.disableHardwareAcceleration(); // évite les crashs GPU sur certains drivers Windows
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

// ── IPC : version ─────────────────────────────────────────────────────────────
ipcMain.handle('get-version', () => app.getVersion());

// ── IPC : ouvrir lien externe (mailto:, https:) ───────────────────────────────
ipcMain.handle('open-external', async (_e, url) => {
  try {
    const allowed = ['mailto:', 'https:', 'http:'];
    if (!allowed.includes(new URL(url).protocol)) return { success: false };
    await shell.openExternal(url);
    return { success: true };
  } catch (e) {
    return { success: false, reason: e.message };
  }
});

// ── IPC : exporter la liste des licences en CSV ───────────────────────────────
ipcMain.handle('export-csv', async (_e, csvContent) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `licences-${new Date().toISOString().slice(0,10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (filePath) {
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    return { success: true, path: filePath };
  }
  return { success: false };
});

// ── IPC : API_URL accessible depuis le renderer ───────────────────────────────
ipcMain.handle('get-api-url', () => ADMIN_API_URL);

