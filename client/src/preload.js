/**
 * Co-Caisse — Electron Preload
 * Version : 2.0.0
 *
 * Bridge sécurisé entre le renderer (Vanilla JS) et le main process / l'API REST.
 *
 * Expose window.electron  → actions Electron (print, export, import, version)
 * Expose window.api       → requêtes HTTP vers le serveur Express
 *                           avec injection automatique du token JWT en mémoire
 *
 * SÉCURITÉ :
 *   - Le token JWT est stocké en mémoire dans cette closure — jamais en localStorage
 *   - nodeIntegration: false dans la fenêtre principale
 *   - contextIsolation: true → seules les méthodes exposées via contextBridge sont accessibles
 */

const { contextBridge, ipcRenderer } = require('electron');

// ── Token JWT — stocké EN MÉMOIRE dans la closure du preload ─────────────────
// Inaccessible depuis le renderer DOM (pas de localStorage, pas de window.token)
let _jwtToken = null;

// ── API_URL — injecté par webpack DefinePlugin en mode web,
//              ou lu depuis process.env en mode Electron
const API_URL =
  (typeof process !== 'undefined' && process.env && process.env.API_URL)
    ? process.env.API_URL
    : 'http://localhost:5000';

// ── Requête HTTP vers l'API Express ──────────────────────────────────────────
async function apiRequest(method, endpoint, body = null) {
  const url     = `${API_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };

  // Injection automatique du token JWT si disponible
  if (_jwtToken) {
    headers['Authorization'] = `Bearer ${_jwtToken}`;
  }

  const options = { method: method.toUpperCase(), headers };
  if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data     = await response.json().catch(() => ({}));

  if (!response.ok) {
    const err     = new Error(data.error || `HTTP ${response.status}`);
    err.status    = response.status;
    err.data      = data;
    throw err;
  }

  return data;
}

// ── Exposition vers le renderer ───────────────────────────────────────────────
contextBridge.exposeInMainWorld('electron', {
  // Impression du ticket de caisse
  printTicket: (ticketHtml) => ipcRenderer.invoke('print-ticket', ticketHtml),

  // Export / import de données (déclenche un dialog natif)
  exportData:  (data)       => ipcRenderer.invoke('export-data', data),
  importData:  ()           => ipcRenderer.invoke('import-data'),

  // Version de l'application (via ipcMain.handle, pas app.getVersion() direct)
  getAppVersion: () => ipcRenderer.invoke('get-version'),
});

contextBridge.exposeInMainWorld('api', {
  // ── Requête générique ───────────────────────────────────────────────────────
  request: (method, endpoint, body) => apiRequest(method, endpoint, body),

  // ── Gestion du token ────────────────────────────────────────────────────────
  // Appelé après un login réussi pour stocker le token en mémoire
  setToken: (token) => { _jwtToken = token; },

  // Appelé à la déconnexion
  clearToken: () => { _jwtToken = null; },

  // Vérifie si un token est présent (sans l'exposer)
  hasToken: () => Boolean(_jwtToken),

  // ── Auth ────────────────────────────────────────────────────────────────────
  login:   (username, password) =>
    apiRequest('POST', '/api/users/login', { username, password }),

  // ── Raccourcis sémantiques (optionnels — le renderer peut aussi utiliser request()) ──
  get:     (endpoint)       => apiRequest('GET',    endpoint),
  post:    (endpoint, body) => apiRequest('POST',   endpoint, body),
  put:     (endpoint, body) => apiRequest('PUT',    endpoint, body),
  delete:  (endpoint)       => apiRequest('DELETE', endpoint),
});

