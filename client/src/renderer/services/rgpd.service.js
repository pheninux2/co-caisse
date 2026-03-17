import { api, API_URL } from '../core/api.js';

const RgpdService = {
  async getStatus() {
    const res = await api.fetch(`${API_URL}/rgpd/status`);
    if (!res.ok) throw new Error('Service RGPD non disponible');
    return res.json();
  },

  async getJournal() {
    const res = await api.fetch(`${API_URL}/rgpd/logs`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async preview(cutoffDate = null) {
    const url = cutoffDate
      ? `${API_URL}/rgpd/preview?cutoff_date=${encodeURIComponent(cutoffDate)}`
      : `${API_URL}/rgpd/preview`;
    const res = await api.fetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    return data;
  },

  async purge(cutoffDate = null) {
    const body = cutoffDate ? { cutoff_date: cutoffDate } : {};
    const res = await api.fetch(`${API_URL}/rgpd/purge`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data; // { status, transactions_anonymized, logs_deleted }
  },

  async searchCustomers(query) {
    const res = await api.fetch(`${API_URL}/rgpd/search-customers?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    return data; // { total, results }
  },

  async anonymizeCustomer({ customerEmail, customerName, reason }) {
    const body = { reason };
    if (customerEmail) body.customer_email = customerEmail;
    if (customerName)  body.customer_name  = customerName;
    const res = await api.fetch(`${API_URL}/rgpd/anonymize-customer`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur serveur');
    return data; // { total_affected, ... }
  },
};

export { RgpdService };
