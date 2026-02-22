/**
 * Co-Caisse — Electron Main Process
 * Version : 2.0.0
 *
 * dotenv.config() est appelé en PREMIER pour que process.env.API_URL
 * soit disponible dès le démarrage, avant tout autre code.
 */

// ── dotenv doit être le premier require ───────────────────────────────────────
require('dotenv').config();

const { app, BrowserWindow, Menu, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');

let isDev;
try {
  isDev = require('electron-is-dev');
} catch {
  isDev = !app.isPackaged;
}

// API_URL lu depuis .env (client/.env en dev, variable système en prod)
const API_URL = process.env.API_URL || 'http://localhost:5000';

let mainWindow;

// ── Création de la fenêtre principale ─────────────────────────────────────────
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width:           Math.min(1400, width),
    height:          Math.min(900, height),
    minWidth:        800,
    minHeight:       600,
    show:            false,
    backgroundColor: '#f3f4f6',
    title:           'Co-Caisse',
    autoHideMenuBar: true,
    webPreferences: {
      preload:            path.join(__dirname, 'preload.js'),
      nodeIntegration:    false,   // ← sécurité : jamais true
      contextIsolation:   true,    // ← obligatoire pour contextBridge
      enableRemoteModule: false,
      sandbox:            false,   // false requis pour que preload puisse utiliser require
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (width <= 1400 || height <= 900) mainWindow.maximize();
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, 'dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => { mainWindow = null; });

  // Raccourcis clavier
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F11') mainWindow.setFullScreen(!mainWindow.isFullScreen());
    if (input.control && input.shift && input.key === 'I') {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

// ── Menu minimal ──────────────────────────────────────────────────────────────
const menuTemplate = [
  {
    label: 'Co-Caisse',
    submenu: [
      { role: 'reload',            label: 'Actualiser'   },
      { role: 'togglefullscreen',  label: 'Plein écran'  },
      { type: 'separator' },
      { role: 'quit',              label: 'Quitter'      },
    ],
  },
];

// ── Événements app ─────────────────────────────────────────────────────────────
app.on('ready', () => {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createWindow();
});

// ── IPC : version de l'application ───────────────────────────────────────────
// Appelé depuis preload via ipcRenderer.invoke('get-version')
ipcMain.handle('get-version', () => app.getVersion());

// ── IPC : impression du ticket ────────────────────────────────────────────────
ipcMain.handle('print-ticket', async (_event, ticketHtml) => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
    },
  });

  await printWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(ticketHtml)}`
  );

  return new Promise((resolve) => {
    printWindow.webContents.print(
      { silent: false, printBackground: true },
      (success, reason) => {
        if (!success) console.warn('[PRINT]', reason);
        printWindow.close();
        resolve({ success, reason: reason || null });
      }
    );
  });
});

// ── IPC : export de données ───────────────────────────────────────────────────
ipcMain.handle('export-data', async (_event, data) => {
  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `cocaisse-export-${Date.now()}.json`,
    filters:     [{ name: 'JSON', extensions: ['json'] }],
  });

  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, path: filePath };
  }
  return { success: false };
});

// ── IPC : import de données ───────────────────────────────────────────────────
ipcMain.handle('import-data', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (filePaths && filePaths[0]) {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    return { success: true, data };
  }
  return { success: false };
});

