const { app, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      sandbox: true
    }
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

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

