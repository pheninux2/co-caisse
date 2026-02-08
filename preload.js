const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  printTicket: (ticketData) => ipcRenderer.invoke('print-ticket', ticketData),
  exportData: (data) => ipcRenderer.invoke('export-data', data),
  importData: () => ipcRenderer.invoke('import-data'),
  getAppVersion: () => require('electron').app.getVersion()
});

