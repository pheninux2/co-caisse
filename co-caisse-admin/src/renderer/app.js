/**
 * Co-Caisse Admin — Renderer
 * Gestion des licences — interface Vanilla JS
 */

import './styles/main.css';

const API_URL = process.env.ADMIN_API_URL || 'http://localhost:5000';

// ─────────────────────────────────────────────────────────────────────────────
class AdminApp {

  constructor() {
    this._licences     = []; // cache local pour filtrage
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

  // ── Requête API centralisée (Electron preload ou fetch direct navigateur) ─
  async _apiFetch(method, endpoint, body = null) {
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

  // ── TABLEAU DE BORD ───────────────────────────────────────────────────────
  async loadDashboard() {
    try {
      const data = await this._apiFetch('GET', '/api/admin/licences');
      const licences = data.licences || [];

      const stats = { active: 0, trial: 0, perpetual: 0, expired: 0, suspended: 0 };
      licences.forEach(l => {
        if (l.status === 'active' && l.type === 'trial')  stats.trial++;
        else if (l.status === 'active')                   stats.active++;
        if (l.type === 'perpetual')                       stats.perpetual++;
        if (l.status === 'expired')                       stats.expired++;
        if (l.status === 'suspended')                     stats.suspended++;
      });

      this._setText('statActive',    stats.active);
      this._setText('statTrial',     stats.trial);
      this._setText('statPerpetual', stats.perpetual);
      this._setText('statExpired',   stats.expired);
      this._setText('statSuspended', stats.suspended);
      this._setText('statTotal',     licences.length);

      const recent = [...licences].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
      document.getElementById('recentLicences').innerHTML = this._renderMiniTable(recent);

      const soon = licences.filter(l => {
        if (!l.expires_at || l.status !== 'active') return false;
        const days = Math.ceil((new Date(l.expires_at) - Date.now()) / 86400000);
        return days >= 0 && days <= 30;
      }).sort((a,b) => new Date(a.expires_at) - new Date(b.expires_at));

      document.getElementById('expiringSoon').innerHTML = soon.length
        ? this._renderMiniTable(soon)
        : '<p class="empty-state">✅ Aucune licence n\'expire dans les 30 prochains jours</p>';

    } catch (e) {
      this.toast(`Erreur chargement dashboard : ${e.message}`, 'error');
    }
  }

  _renderMiniTable(licences) {
    if (!licences.length) return '<p class="empty-state">Aucune licence</p>';
    return `<table class="table">
      <thead><tr><th>Client</th><th>Type</th><th>Statut</th><th>Expiration</th></tr></thead>
      <tbody>${licences.map(l => `
        <tr>
          <td><strong>${this._esc(l.client_name)}</strong><br><small style="color:var(--text3)">${this._esc(l.client_email||'')}</small></td>
          <td>${this._typeBadge(l.type)}</td>
          <td>${this._statusBadge(l.status)}</td>
          <td style="color:var(--text3)">${l.expires_at ? this._fmtDate(l.expires_at) : '—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;
  }

  // ── LISTE DES LICENCES ────────────────────────────────────────────────────
  async loadLicences() {
    try {
      const data = await this._apiFetch('GET', '/api/admin/licences');
      this._licences = data.licences || [];
      this._renderLicences(this._licences);
    } catch (e) {
      this.toast(`Erreur : ${e.message}`, 'error');
    }
  }

  filterLicences() {
    const search = document.getElementById('searchInput').value.toLowerCase();
    const type   = document.getElementById('filterType').value;
    const status = document.getElementById('filterStatus').value;

    const filtered = this._licences.filter(l => {
      const matchSearch = !search ||
        l.client_name.toLowerCase().includes(search) ||
        l.licence_key.toLowerCase().includes(search) ||
        (l.client_email||'').toLowerCase().includes(search);
      const matchType   = !type   || l.type === type;
      const matchStatus = !status || l.status === status;
      return matchSearch && matchType && matchStatus;
    });

    this._renderLicences(filtered);
  }

  _renderLicences(licences) {
    const tbody = document.getElementById('licencesBody');
    if (!licences.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">Aucune licence trouvée</td></tr>';
      return;
    }

    const modules = l => {
      const mods = Array.isArray(l.modules)
        ? l.modules
        : JSON.parse(l.modules || '[]');
      return mods.map(m => `<span class="mod-tag">${m}</span>`).join(' ');
    };

    tbody.innerHTML = licences.map(l => `
      <tr>
        <td>
          <strong>${this._esc(l.client_name)}</strong><br>
          <small style="color:var(--text3)">${this._esc(l.client_email||'')}</small>
        </td>
        <td><code class="key-mono">${this._esc(l.licence_key)}</code></td>
        <td>${this._typeBadge(l.type)}</td>
        <td>${this._statusBadge(l.status)}</td>
        <td>${modules(l)}</td>
        <td style="color:var(--text3)">${l.expires_at ? this._fmtDate(l.expires_at) : '—'}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn" title="Historique" onclick="app.showEvents('${l.id}')">📋</button>
            <button class="action-btn" title="Renvoyer email" onclick="app.resendEmail('${l.id}', '${this._esc(l.client_name)}')">📧</button>
            ${l.expires_at ? `<button class="action-btn" title="Étendre" onclick="app.openExtend('${l.id}', '${l.expires_at}')">📅</button>` : ''}
            ${l.status === 'active'    ? `<button class="action-btn danger"  title="Suspendre"  onclick="app.suspendLicence('${l.id}', '${this._esc(l.client_name)}')">⏸</button>` : ''}
            ${l.status === 'suspended' ? `<button class="action-btn success" title="Réactiver"  onclick="app.reactivateLicence('${l.id}', '${this._esc(l.client_name)}')">▶️</button>` : ''}
          </div>
        </td>
      </tr>
    `).join('');
  }

  // ── GÉNÉRER UNE LICENCE ───────────────────────────────────────────────────
  onTypeChange() {
    const type = document.getElementById('genType').value;
    const durationRow   = document.getElementById('durationRow');
    const customDateRow = document.getElementById('customDateRow');
    durationRow.style.display   = type === 'subscription' ? '' : 'none';
    customDateRow.style.display = 'none';
  }

  onDurationChange() {
    const val = document.getElementById('genDuration').value;
    document.getElementById('customDateRow').classList.toggle('hidden', val !== 'custom');
  }

  async generateLicence(event) {
    event.preventDefault();
    const btn   = document.getElementById('genSubmitBtn');
    const errEl = document.getElementById('genError');
    const resEl = document.getElementById('genResult');
    errEl.classList.add('hidden');
    resEl.classList.add('hidden');
    btn.disabled = true;
    btn.textContent = '⏳ Génération en cours...';

    try {
      const type = document.getElementById('genType').value;

      let expiresAt = null;
      if (type === 'subscription') {
        const duration = document.getElementById('genDuration').value;
        if (duration === 'custom') {
          expiresAt = document.getElementById('genExpiresAt').value;
        } else {
          const now = new Date();
          if (duration === '1m') now.setMonth(now.getMonth() + 1);
          if (duration === '6m') now.setMonth(now.getMonth() + 6);
          if (duration === '1y') now.setFullYear(now.getFullYear() + 1);
          expiresAt = now.toISOString().slice(0, 10);
        }
      }

      const modules = ['caisse'];
      document.querySelectorAll('.mod-check:checked').forEach(cb => modules.push(cb.value));

      const payload = {
        clientName:  document.getElementById('genClientName').value.trim(),
        clientEmail: document.getElementById('genEmail').value.trim(),
        type,
        modules,
        expiresAt,
        notes: document.getElementById('genNotes').value.trim(),
      };

      const data = await this._apiFetch('POST', '/api/admin/licences/generate', payload);

      document.getElementById('genKeyDisplay').textContent = data.licence_key;
      resEl.classList.remove('hidden');
      this.toast(`✅ Licence générée pour ${payload.clientName}`, 'success');

    } catch (e) {
      errEl.textContent = `❌ ${e.message}`;
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = '🔑 Générer et envoyer par email';
    }
  }

  copyKey() {
    const key = document.getElementById('genKeyDisplay').textContent;
    navigator.clipboard.writeText(key).then(() => {
      this.toast('📋 Clé copiée dans le presse-papiers !', 'success');
    });
  }

  resetForm() {
    document.getElementById('generateForm').reset();
    document.getElementById('genResult').classList.add('hidden');
    document.getElementById('genError').classList.add('hidden');
    document.getElementById('durationRow').style.display   = 'none';
    document.getElementById('customDateRow').classList.add('hidden');
  }

  // ── ACTIONS SUR UNE LICENCE ───────────────────────────────────────────────
  async suspendLicence(id, name) {
    if (!confirm(`Suspendre la licence de "${name}" ?`)) return;
    try {
      await this._apiFetch('PUT', `/api/admin/licences/${id}/suspend`);
      this.toast(`⏸ Licence de ${name} suspendue`, 'success');
      this.loadLicences();
    } catch (e) { this.toast(`Erreur : ${e.message}`, 'error'); }
  }

  async reactivateLicence(id, name) {
    if (!confirm(`Réactiver la licence de "${name}" ?`)) return;
    try {
      await this._apiFetch('PUT', `/api/admin/licences/${id}/reactivate`);
      this.toast(`▶️ Licence de ${name} réactivée`, 'success');
      this.loadLicences();
    } catch (e) { this.toast(`Erreur : ${e.message}`, 'error'); }
  }

  async resendEmail(id, name) {
    if (!confirm(`Renvoyer la clé par email à "${name}" ?`)) return;
    try {
      await this._apiFetch('POST', `/api/admin/licences/${id}/resend`);
      this.toast(`📧 Email renvoyé à ${name}`, 'success');
    } catch (e) { this.toast(`Erreur envoi email : ${e.message}`, 'error'); }
  }

  openExtend(id, currentExpiry) {
    document.getElementById('extendLicenceId').value = id;
    const dt = document.getElementById('extendDate');
    dt.value = currentExpiry ? currentExpiry.slice(0,10) : '';
    this.openModal('extendModal');
  }

  async confirmExtend() {
    const id   = document.getElementById('extendLicenceId').value;
    const date = document.getElementById('extendDate').value;
    if (!date) { this.toast('Veuillez choisir une date', 'error'); return; }
    try {
      await this._apiFetch('PUT', `/api/admin/licences/${id}/extend`, { expiresAt: date });
      this.toast('📅 Expiration mise à jour', 'success');
      this.closeModal('extendModal');
      this.loadLicences();
    } catch (e) { this.toast(`Erreur : ${e.message}`, 'error'); }
  }

  // ── HISTORIQUE ────────────────────────────────────────────────────────────
  async showEvents(id) {
    this.openModal('eventsModal');
    const el = document.getElementById('eventsContent');
    el.innerHTML = '<p style="color:var(--text3);text-align:center;padding:1rem">Chargement...</p>';

    try {
      const data   = await this._apiFetch('GET', `/api/admin/licences/${id}/events`);
      const events = data.events || [];

      if (!events.length) {
        el.innerHTML = '<p class="empty-state">Aucun événement enregistré</p>';
        return;
      }

      const ICONS = { activated:'✅', trial_started:'🚀', generated:'🔑', expired:'❌', suspended:'⏸', reactivated:'▶️', renewed:'🔄', resent:'📧', extended:'📅' };

      el.innerHTML = `<div style="display:flex;flex-direction:column;gap:.5rem">
        ${events.map(e => `
          <div style="display:flex;gap:.75rem;align-items:flex-start;padding:.6rem .875rem;background:var(--bg3);border-radius:8px">
            <span style="font-size:1.1rem;margin-top:.1rem">${ICONS[e.event_type]||'•'}</span>
            <div style="flex:1">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-weight:600;font-size:.8rem">${e.event_type}</span>
                <span style="font-size:.7rem;color:var(--text3)">${this._fmtDate(e.created_at)}</span>
              </div>
              ${e.metadata ? `<p style="font-size:.7rem;color:var(--text3);margin-top:.2rem">${JSON.stringify(e.metadata)}</p>` : ''}
            </div>
          </div>`).join('')}
      </div>`;
    } catch (e) {
      el.innerHTML = `<p style="color:var(--red);text-align:center">${e.message}</p>`;
    }
  }

  // ── SMTP ──────────────────────────────────────────────────────────────────
  loadSmtpInfo() {
    const apiUrl = typeof process !== 'undefined' ? (process.env?.ADMIN_API_URL || 'http://localhost:5000') : 'http://localhost:5000';
    document.getElementById('smtpConfigDisplay').innerHTML = [
      `SMTP_HOST = <span style="color:#a5b4fc">${typeof process !== 'undefined' ? (process.env?.SMTP_HOST || '(non défini)') : '(voir server/.env)'}</span>`,
      `SMTP_PORT = <span style="color:#a5b4fc">${typeof process !== 'undefined' ? (process.env?.SMTP_PORT || '587') : '587'}</span>`,
      `SMTP_USER = <span style="color:#a5b4fc">${typeof process !== 'undefined' ? (process.env?.SMTP_USER || '(non défini)') : '(voir server/.env)'}</span>`,
      `SMTP_PASS = <span style="color:#6366f1">••••••••</span>`,
      `SMTP_FROM = <span style="color:#a5b4fc">${typeof process !== 'undefined' ? (process.env?.SMTP_FROM || '(non défini)') : '(voir server/.env)'}</span>`,
      ``,
      `API_URL   = <span style="color:#22c55e">${apiUrl}</span>`,
    ].join('<br>');
  }

  async testSmtp() {
    const btn = document.getElementById('smtpTestBtn');
    const res = document.getElementById('smtpTestResult');
    btn.disabled = true;
    btn.textContent = '⏳ Test en cours...';
    res.className = 'hidden';

    try {
      await this._apiFetch('POST', '/api/admin/smtp/test', {});
      res.className = '';
      res.innerHTML = `<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:.75rem 1rem;color:#4ade80;font-size:.82rem">
        ✅ Connexion SMTP établie avec succès !
      </div>`;
    } catch (e) {
      res.className = '';
      res.innerHTML = `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:.75rem 1rem;color:#f87171;font-size:.82rem">
        ❌ Erreur SMTP : ${e.message}<br>
        <small style="color:var(--text3);margin-top:.4rem;display:block">Vérifiez SMTP_HOST, SMTP_USER, SMTP_PASS dans server/.env</small>
      </div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '🔌 Tester la connexion SMTP';
    }
  }

  async sendTestEmail() {
    const to  = document.getElementById('smtpTestEmail').value.trim();
    const btn = document.getElementById('smtpSendBtn');
    const res = document.getElementById('smtpSendResult');

    if (!to) { this.toast('Entrez une adresse email', 'error'); return; }

    btn.disabled = true;
    btn.textContent = '⏳ Envoi...';
    res.className = 'hidden';

    try {
      await this._apiFetch('POST', '/api/admin/smtp/send-test', { to });
      res.className = '';
      res.innerHTML = `<div style="background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);border-radius:8px;padding:.75rem 1rem;color:#4ade80;font-size:.82rem">
        📨 Email de test envoyé à <strong>${to}</strong> !<br>
        <small style="color:var(--text3)">Vérifiez votre boîte de réception (et les spams).</small>
      </div>`;
      this.toast(`📨 Email envoyé à ${to}`, 'success');
    } catch (e) {
      res.className = '';
      res.innerHTML = `<div style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.3);border-radius:8px;padding:.75rem 1rem;color:#f87171;font-size:.82rem">
        ❌ Échec envoi : ${e.message}
      </div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = '📨 Envoyer';
    }
  }

  // ── EXPORT CSV ────────────────────────────────────────────────────────────
  async exportCsv() {
    try {
      const data     = await this._apiFetch('GET', '/api/admin/licences');
      const licences = data.licences || [];

      const header = 'Client,Email,Clé,Type,Statut,Modules,Expiration,Créée le';
      const rows   = licences.map(l => {
        const mods = Array.isArray(l.modules) ? l.modules.join('|') : l.modules;
        return [
          `"${l.client_name}"`,
          `"${l.client_email||''}"`,
          l.licence_key,
          l.type,
          l.status,
          `"${mods}"`,
          l.expires_at ? this._fmtDate(l.expires_at) : '',
          this._fmtDate(l.created_at),
        ].join(',');
      });

      const csv = [header, ...rows].join('\n');

      if (window.electron?.exportCsv) {
        const result = await window.electron.exportCsv(csv);
        if (result.success) this.toast(`📥 Exporté : ${result.path}`, 'success');
      } else {
        const a = Object.assign(document.createElement('a'), {
          href:     `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
          download: `licences-${new Date().toISOString().slice(0,10)}.csv`,
        });
        a.click();
      }
    } catch (e) { this.toast(`Erreur export : ${e.message}`, 'error'); }
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

// ── Boot ──────────────────────────────────────────────────────────────────────
const app = new AdminApp();
window.app = app;
document.addEventListener('DOMContentLoaded', () => app.init());

