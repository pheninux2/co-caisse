/**
 * Co-Caisse Admin — Renderer
 * Gestion des licences — interface Vanilla JS
 */

import './styles/main.css';
import { apiFetch, API_URL } from './core/api.js';
import { LicencesMethods }   from './features/licences/licences.methods.js';
import { SmtpMethods }       from './features/smtp/smtp.methods.js';

// ─────────────────────────────────────────────────────────────────────────────
class AdminApp {

  constructor() {
    this._licences       = []; // cache local pour filtrage
    this._currentSection = 'dashboard';
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  async init() {
    // Version Electron (pas disponible hors Electron)
    if (window.electron?.getVersion) {
      try {
        const v = await window.electron.getVersion();
        const el = document.getElementById('appVersion');
        if (el) el.textContent = `v${v}`;
      } catch {}
    }

    // Si token mémorisé en mémoire preload → aller directement à l'app
    if (window.api?.hasToken && window.api.hasToken()) {
      this.showApp();
      return;
    }

    // S'assurer que l'écran login est visible au démarrage
    this._showLogin();
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async login(event) {
    event.preventDefault();
    const password = document.getElementById('loginPassword').value.trim();
    const errEl    = document.getElementById('loginError');
    errEl.classList.add('hidden');

    if (!password) {
      errEl.textContent = '❌ Mot de passe requis';
      errEl.classList.remove('hidden');
      return;
    }

    // window.api disponible (Electron) → appel via preload
    // window.api absent (navigateur direct) → appel fetch direct
    try {
      let token;
      if (window.api?.login) {
        const data = await window.api.login(password);
        token = data.token;
        window.api.setToken(token);
      } else {
        // Fallback navigateur : fetch direct
        const res  = await fetch(`${API_URL}/api/admin/auth/login`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
        token = data.token;
        // Stocker en sessionStorage pour le navigateur (pas de preload)
        sessionStorage.setItem('_adminToken', token);
      }
      this.showApp();
    } catch (e) {
      errEl.textContent = (e.message.includes('401') || e.message.includes('incorrect'))
        ? '❌ Mot de passe incorrect'
        : `❌ Erreur : ${e.message}`;
      errEl.classList.remove('hidden');
    }
  }

  // Retourne le token courant (preload ou sessionStorage fallback)
  _getToken() {
    if (window.api?.hasToken && window.api.hasToken()) return '__via_preload__';
    return sessionStorage.getItem('_adminToken') || null;
  }

  logout() {
    window.api?.clearToken();
    sessionStorage.removeItem('_adminToken');
    this._showLogin();
  }

  _showLogin() {
    const loginEl = document.getElementById('loginScreen');
    const appEl   = document.getElementById('appScreen');
    if (loginEl) { loginEl.style.display = 'flex'; loginEl.classList.remove('hidden'); }
    if (appEl)   { appEl.style.display   = 'none';  appEl.classList.add('hidden');     }
    document.getElementById('loginPassword')?.focus();
  }

  showApp() {
    const loginEl = document.getElementById('loginScreen');
    const appEl   = document.getElementById('appScreen');
    if (loginEl) { loginEl.style.display = 'none'; loginEl.classList.add('hidden');      }
    if (appEl)   { appEl.style.display   = 'flex'; appEl.classList.remove('hidden');     }
    this.showSection('dashboard');
  }

  // ── Requête API centralisée ────────────────────────────────────────────────
  _apiFetch(method, endpoint, body = null) {
    return apiFetch(method, endpoint, body);
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  showSection(name) {
    // Cacher toutes les sections
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    // Nav items
    document.querySelectorAll('.nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.section === name);
    });
    // Afficher la bonne
    const el = document.getElementById(`${name}-section`);
    if (el) el.classList.remove('hidden');
    this._currentSection = name;

    // Charger les données
    if (name === 'dashboard') this.loadDashboard();
    if (name === 'licences')  this.loadLicences();
    if (name === 'smtp')      this.loadSmtpInfo();
  }

  // ── Modals ────────────────────────────────────────────────────────────────
  openModal(id) {
    document.getElementById(id)?.classList.remove('hidden');
  }

  closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  toast(message, type = 'info', duration = 3500) {
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span>${icons[type]||'•'}</span><span style="flex:1">${message}</span>`;
    container.appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  _fmtDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
  }

  _typeBadge(type) {
    const map = { trial:'badge-amber', perpetual:'badge-blue', subscription:'badge-purple' };
    const labels = { trial:'Essai', perpetual:'Perpétuelle', subscription:'Abonnement' };
    return `<span class="badge ${map[type]||'badge-gray'}">${labels[type]||type}</span>`;
  }

  _statusBadge(status) {
    const map    = { active:'badge-green', expired:'badge-red', suspended:'badge-gray' };
    const labels = { active:'Active', expired:'Expirée', suspended:'Suspendue' };
    return `<span class="badge ${map[status]||'badge-gray'}">${labels[status]||status}</span>`;
  }
}

// ── Extensions prototype ───────────────────────────────────────────────────────
Object.assign(AdminApp.prototype, LicencesMethods);
Object.assign(AdminApp.prototype, SmtpMethods);

// ── Boot ──────────────────────────────────────────────────────────────────────
const app = new AdminApp();
window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());
