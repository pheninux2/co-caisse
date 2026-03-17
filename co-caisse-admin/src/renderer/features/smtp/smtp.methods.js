/**
 * Co-Caisse Admin — Méthodes SMTP
 * Appliqué via Object.assign(AdminApp.prototype, SmtpMethods)
 */

import { API_URL } from '../../core/api.js';

export const SmtpMethods = {

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
  },

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
  },

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
  },
};
