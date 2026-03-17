/**
 * Co-Caisse Admin — HTTP client centralisé
 * Supporte Electron (window.api preload) et navigateur direct (fetch + sessionStorage)
 */

export const API_URL = process.env.ADMIN_API_URL || 'http://localhost:5000';

export async function apiFetch(method, endpoint, body = null) {
  // Via preload Electron
  if (window.api) {
    const fn = { GET: 'get', POST: 'post', PUT: 'put', DELETE: 'delete' }[method] || 'get';
    return window.api[fn](endpoint, body);
  }
  // Fallback navigateur (webpack-dev-server)
  const token = sessionStorage.getItem('_adminToken');
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);
  const res  = await fetch(`${API_URL}${endpoint}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
