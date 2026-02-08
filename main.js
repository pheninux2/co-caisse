const { app, BrowserWindow, Menu, ipcMain, screen } = require('electron');
const path = require('path');

let isDev;
try {
  isDev = require('electron-is-dev');
} catch (e) {
  isDev = !app.isPackaged;
}

let mainWindow;

function createWindow() {
  // Obtenir la taille de l'écran pour une meilleure ergonomie
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(1400, width),
    height: Math.min(900, height),
    minWidth: 800,
    minHeight: 600,
    show: false, // Attendre que le contenu soit prêt
    backgroundColor: '#f3f4f6',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true
    },
    // Amélioration du titre et de l'apparence
    title: 'Co-Caisse',
    autoHideMenuBar: true, // Cacher la barre de menu par défaut
  });

  // Afficher la fenêtre quand elle est prête
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Maximiser sur les petits écrans
    if (width <= 1400 || height <= 900) {
      mainWindow.maximize();
    }
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, 'dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  // Ouvrir DevTools en mode développement
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Gérer les raccourcis clavier
  mainWindow.webContents.on('before-input-event', (event, input) => {
    // F11 pour basculer en plein écran
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
    // Ctrl+Shift+I pour DevTools même en production (pour debug)
    if (input.control && input.shift && input.key === 'I') {
      mainWindow.webContents.toggleDevTools();
    }
  });
}

// Créer un menu minimaliste
const menuTemplate = [
  {
    label: 'Co-Caisse',
    submenu: [
      { role: 'reload', label: 'Actualiser' },
      { role: 'togglefullscreen', label: 'Plein écran' },
      { type: 'separator' },
      { role: 'quit', label: 'Quitter' }
    ]
  }
];

app.on('ready', () => {
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle print requests
ipcMain.handle('print-ticket', async (event, ticketData) => {
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      nodeIntegration: true
    }
  });

  printWindow.webContents.on('did-finish-load', () => {
    printWindow.webContents.print({}, (success, failureReason) => {
      if (!success) console.log(failureReason);
      printWindow.close();
    });
  });

  printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(ticketData)}`);
});

// Handle data export
ipcMain.handle('export-data', async (event, data) => {
  const { dialog } = require('electron');
  const fs = require('fs');

  const { filePath } = await dialog.showSaveDialog({
    defaultPath: `cocaisse-export-${Date.now()}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (filePath) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return { success: true, path: filePath };
  }
  return { success: false };
});

// Handle data import
ipcMain.handle('import-data', async (event) => {
  const { dialog } = require('electron');
  const fs = require('fs');

  const { filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });

  if (filePaths && filePaths[0]) {
    const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf-8'));
    return { success: true, data };
  }
  return { success: false };
});
