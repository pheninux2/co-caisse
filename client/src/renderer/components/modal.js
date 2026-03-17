// ── Modal & Confirm dialogs ───────────────────────────────────────────────
// Extrait de app.js lignes 4811-5046.

import { api } from '../core/api.js';

const Modal = {
  /** Ouvre une modal par id, la déplace dans body pour le z-order */
  open(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    // Relance l'animation à chaque ouverture
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.animation = 'none';
      void content.offsetHeight;
      content.style.animation = '';
    }
    modal.classList.remove('hidden');
  },

  /** Ferme une modal par id */
  close(id) {
    document.getElementById(id)?.classList.add('hidden');
  },

  /**
   * Modale de confirmation simple (confirmModal dans le HTML).
   * @param {string} message
   * @param {{ title?, icon?, okLabel? }} options
   * @returns {Promise<boolean>}
   */
  showConfirm(message, { title = 'Confirmation', icon = '⚠️', okLabel = 'Confirmer' } = {}) {
    return new Promise((resolve) => {
      const modal     = document.getElementById('confirmModal');
      const titleEl   = document.getElementById('confirmModalTitle');
      const iconEl    = document.getElementById('confirmModalIcon');
      const msgEl     = document.getElementById('confirmModalMessage');
      const okBtn     = document.getElementById('confirmModalOk');
      const cancelBtn = document.getElementById('confirmModalCancel');
      if (!modal) { resolve(window.confirm(message)); return; }

      if (titleEl)   titleEl.textContent = title;
      if (iconEl)    iconEl.textContent  = icon;
      if (msgEl)     msgEl.textContent   = message;
      if (okBtn)     okBtn.textContent   = okLabel;

      // Nettoyer les anciens listeners
      const newOk     = okBtn.cloneNode(true);
      const newCancel = cancelBtn.cloneNode(true);
      okBtn.replaceWith(newOk);
      cancelBtn.replaceWith(newCancel);

      this.open('confirmModal');

      newOk.addEventListener('click', () => { this.close('confirmModal'); resolve(true);  }, { once: true });
      newCancel.addEventListener('click', () => { this.close('confirmModal'); resolve(false); }, { once: true });
    });
  },

  /**
   * Modale de confirmation enrichie (confirmDialog dans le HTML).
   * @param {string} message
   * @param {{ title?, icon?, type?, confirmText?, cancelText?, confirmClass? }} options
   * @returns {Promise<boolean>}
   */
  confirm(message, options = {}) {
    if (api.isRedirecting()) return Promise.resolve(false);

    return new Promise((resolve) => {
      const dialog    = document.getElementById('confirmDialog');
      const titleEl   = document.getElementById('confirmTitle');
      const messageEl = document.getElementById('confirmMessage');
      const iconEl    = document.getElementById('confirmIcon');
      const okBtn     = document.getElementById('confirmOk');
      const cancelBtn = document.getElementById('confirmCancel');

      const {
        title        = 'Confirmation',
        icon         = '⚠️',
        type         = 'warning',
        confirmText  = 'Confirmer',
        cancelText   = 'Annuler',
        confirmClass = '',
      } = options;

      titleEl.textContent   = title;
      messageEl.textContent = message;
      iconEl.textContent    = icon;
      iconEl.className = `w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-3xl confirm-icon-${type}`;
      okBtn.textContent     = confirmText;
      cancelBtn.textContent = cancelText;

      okBtn.className = `flex-1 py-2.5 text-white rounded-xl font-medium transition ${
        type === 'danger'  ? 'bg-red-500 hover:bg-red-600'   :
        type === 'success' ? 'bg-green-500 hover:bg-green-600' :
        'bg-indigo-500 hover:bg-indigo-600'
      } ${confirmClass}`;

      const cleanup = () => {
        okBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.classList.add('hidden');
      };
      const handleConfirm = () => { cleanup(); resolve(true);  };
      const handleCancel  = () => { cleanup(); resolve(false); };

      okBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);

      if (dialog.parentElement !== document.body) document.body.appendChild(dialog);
      const content = dialog.querySelector('.modal-content');
      if (content) {
        content.style.animation = 'none';
        void content.offsetHeight;
        content.style.animation = '';
      }
      dialog.classList.remove('hidden');
    });
  },

  /** Raccourci : confirmation de suppression */
  async confirmDelete(itemName = 'cet élément') {
    return this.confirm(`Êtes-vous sûr de vouloir supprimer ${itemName} ?`, {
      title: 'Supprimer', icon: '🗑️', type: 'danger',
      confirmText: 'Supprimer', cancelText: 'Annuler',
    });
  },

  /** Raccourci : confirmation d'action générique */
  async confirmAction(message, title = 'Confirmation') {
    return this.confirm(message, {
      title, icon: '❓', type: 'info',
      confirmText: 'Oui', cancelText: 'Non',
    });
  },
};

export { Modal };
