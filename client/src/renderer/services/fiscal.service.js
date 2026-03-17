import { api, API_URL } from '../core/api.js';

const FiscalService = {
  async getStatus() {
    const res = await api.fetch(`${API_URL}/fiscal/status`);
    if (!res.ok) return null;
    return res.json();
  },

  async verifyChain() {
    const res = await api.fetch(`${API_URL}/fiscal/verify-chain`);
    return res.json(); // { ok, total, verified, anomalies, verified_at }
  },

  async resetChain() {
    const res = await api.fetch(`${API_URL}/fiscal/reset-chain`, { method: 'POST' });
    return res.json(); // { success, message }
  },

  async getClosureStatus() {
    const res = await api.fetch(`${API_URL}/fiscal/closure-status`);
    if (!res.ok) return null;
    return res.json();
  },

  async closeDay() {
    const res = await api.fetch(`${API_URL}/fiscal/close-day`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la clôture');
    return data;
  },

  async getClosuresHistory() {
    const res = await api.fetch(`${API_URL}/fiscal/closures`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async getClosure(id) {
    const res = await api.fetch(`${API_URL}/fiscal/closures/${id}`);
    if (!res.ok) throw new Error('Clôture introuvable');
    return res.json();
  },

  async exportClosure(id) {
    const res = await api.fetch(`${API_URL}/fiscal/closures/${id}/export`);
    return res.json();
  },
};

export { FiscalService };
