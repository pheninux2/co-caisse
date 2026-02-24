/**
 * Co-Caisse Admin — Electron Preload
 *
 * Expose window.api  → requêtes HTTP vers le serveur Express admin
 * Expose window.electron → actions Electron (export CSV, open-external, version)
 *
 * SÉCURITÉ :
 *   - Token JWT stocké EN MÉMOIRE dans cette closure — jamais localStorage
 *   - nodeIntegration: false / contextIsolation: true
 */

const { contextBridge, ipcRenderer } = require('electron');

// ── Token JWT en mémoire ──────────────────────────────────────────────────────
let _token = null;

// ── API_URL injecté par webpack DefinePlugin ──────────────────────────────────
const API_URL = (typeof process !== 'undefined' && process.env && process.env.ADMIN_API_URL)
  ? process.env.ADMIN_API_URL
  : 'http://localhost:5000';

// ── Requête HTTP générique ────────────────────────────────────────────────────
async function apiRequest(method, endpoint, body = null) {
  const url     = `${API_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json' };

  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const options = { method: method.toUpperCase(), headers };
  if (body && !['GET', 'HEAD'].includes(method.toUpperCase())) {
    options.body = JSON.stringify(body);
  }

  const res  = await fetch(url, options);
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const err  = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.data   = data;
    throw err;
  }
  return data;
}

// ── Exposition vers le renderer ───────────────────────────────────────────────
contextBridge.exposeInMainWorld('electron', {
  getVersion:   ()            => ipcRenderer.invoke('get-version'),
  openExternal: (url)         => ipcRenderer.invoke('open-external', url),
  exportCsv:    (csvContent)  => ipcRenderer.invoke('export-csv', csvContent),
  getApiUrl:    ()            => ipcRenderer.invoke('get-api-url'),
});

contextBridge.exposeInMainWorld('api', {
  // ── Token ──────────────────────────────────────────────────────────────────
  setToken:  (t) => { _token = t; },
  clearToken: () => { _token = null; },
  hasToken:   () => Boolean(_token),

  // ── Auth admin ─────────────────────────────────────────────────────────────
  login: (password) => apiRequest('POST', '/api/admin/auth/login', { password }),

  // ── Licences ───────────────────────────────────────────────────────────────
  getLicences:       ()       => apiRequest('GET',  '/api/admin/licences'),
  getModules:        ()       => apiRequest('GET',  '/api/admin/licences/modules'),
  generateLicence:   (body)   => apiRequest('POST', '/api/admin/licences/generate', body),
  suspendLicence:    (id)     => apiRequest('PUT',  `/api/admin/licences/${id}/suspend`),
  reactivateLicence: (id)     => apiRequest('PUT',  `/api/admin/licences/${id}/reactivate`),
  extendLicence:     (id, b)  => apiRequest('PUT',  `/api/admin/licences/${id}/extend`, b),
  updateModules:     (id, b)  => apiRequest('PUT',  `/api/admin/licences/${id}/modules`, b),
  getLicenceEvents:  (id)     => apiRequest('GET',  `/api/admin/licences/${id}/events`),
  resendLicence:     (id)     => apiRequest('POST', `/api/admin/licences/${id}/resend`),

  // ── Générique ──────────────────────────────────────────────────────────────
  get:    (endpoint)        => apiRequest('GET',    endpoint),
  post:   (endpoint, body)  => apiRequest('POST',   endpoint, body),
  put:    (endpoint, body)  => apiRequest('PUT',    endpoint, body),
  delete: (endpoint)        => apiRequest('DELETE', endpoint),
});

