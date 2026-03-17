import { api, API_URL } from '../core/api.js';

const SettingsService = {
  async get() {
    const res = await api.fetch(`${API_URL}/settings`);
    if (!res.ok) throw new Error('Erreur chargement paramètres');
    return res.json();
  },

  async save(settings) {
    const res = await api.fetch(`${API_URL}/settings`, {
      method: 'POST',
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
    return res.json();
  },

  /** Public — pas d'authentification requise */
  async getBusinessConfig() {
    const res = await fetch(`${API_URL}/config/business`);
    if (!res.ok) throw new Error('Config non disponible');
    return res.json();
  },

  async saveBusinessConfig(data) {
    const res = await api.fetch(`${API_URL}/config/business`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur serveur');
    return body; // { config }
  },
};

export { SettingsService };
