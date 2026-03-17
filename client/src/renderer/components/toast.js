// ── Toast notifications ───────────────────────────────────────────────────
// Extrait de app.js lignes 4882-4951.
// Import api pour vérifier si une redirection est en cours (silence toasts).

import { api } from '../core/api.js';

const Toast = {
  /** Supprime immédiatement toutes les notifications visibles */
  clearAll() {
    const container = document.getElementById('toastContainer');
    if (container) container.innerHTML = '';
  },

  /**
   * Crée et affiche une notification toast.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} duration  ms avant fermeture automatique (0 = permanent)
   * @returns {HTMLElement|undefined}
   */
  show(message, type = 'info', duration = 3000) {
    if (api.isRedirecting()) return;

    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons  = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const titles = { success: 'Succès', error: 'Erreur', warning: 'Attention', info: 'Information' };

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <div class="toast-content">
        <p class="toast-title">${titles[type] || titles.info}</p>
        <p class="toast-message">${message}</p>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;

    container.appendChild(el);

    if (duration > 0) {
      setTimeout(() => {
        el.classList.add('toast-exit');
        setTimeout(() => el.remove(), 300);
      }, duration);
    }

    return el;
  },

  success(message, duration = 3000) { return this.show(message, 'success', duration); },
  error(message, duration = 4000)   { return this.show(message, 'error',   duration); },
  warning(message, duration = 3500) { return this.show(message, 'warning', duration); },
  info(message, duration = 3000)    { return this.show(message, 'info',    duration); },
};

export { Toast };
