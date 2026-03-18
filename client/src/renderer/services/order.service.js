import { api, API_URL } from '../core/api.js';

const OrderService = {
  async getAll({ status, userId } = {}) {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (userId) params.append('user_id', userId);
    const url = `${API_URL}/orders${params.toString() ? '?' + params : ''}`;
    const res = await api.fetch(url);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async get(id) {
    const res = await api.fetch(`${API_URL}/orders/${id}`);
    if (!res.ok) throw new Error('Commande introuvable');
    return res.json();
  },

  async create(data) {
    const res = await api.fetch(`${API_URL}/orders`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) {
      const err = new Error(body.error || 'Erreur création commande');
      err.status   = res.status;
      err.conflict = body.conflict || null; // présent si 409
      throw err;
    }
    return body;
  },

  async update(id, data) {
    const res = await api.fetch(`${API_URL}/orders/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur mise à jour commande');
    return body;
  },

  async remove(id) {
    const res = await api.fetch(`${API_URL}/orders/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression commande');
  },

  async cancel(id) {
    const res = await api.fetch(`${API_URL}/orders/${id}/cancel`, { method: 'POST' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur annulation commande');
    return body;
  },

  async validate(id) {
    const res = await api.fetch(`${API_URL}/orders/${id}/validate`, { method: 'POST' });
    if (!res.ok) throw new Error('Erreur validation commande');
    return res.json();
  },

  async sendToKitchen(id) {
    const res = await api.fetch(`${API_URL}/orders/${id}/send-to-kitchen`, { method: 'POST' });
    if (!res.ok) throw new Error('Erreur envoi cuisine');
    return res.json();
  },

  async markReady(id) {
    const res = await api.fetch(`${API_URL}/orders/${id}/mark-ready`, { method: 'POST' });
    if (!res.ok) throw new Error('Erreur mark-ready');
    return res.json();
  },

  async markServed(id) {
    const res = await api.fetch(`${API_URL}/orders/${id}/mark-served`, { method: 'POST' });
    if (!res.ok) throw new Error('Erreur mark-served');
    return res.json();
  },

  async pay(id, { paymentMethod, change = 0 } = {}) {
    const res = await api.fetch(`${API_URL}/orders/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ payment_method: paymentMethod, change }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur paiement commande');
    return body; // { transaction }
  },

  async getActiveByTable(table_number) {
    const res  = await api.fetch(`${API_URL}/orders/table/${encodeURIComponent(table_number)}/active`);
    const data = await res.json();
    return data; // { active: bool, order: {...} | null }
  },

  async getAlerts() {
    const res = await api.fetch(`${API_URL}/orders/alerts/pending`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async getKitchenOrders() {
    const res = await api.fetch(`${API_URL}/orders/kitchen/active`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async addKitchenComment(id, comment) {
    const res = await api.fetch(`${API_URL}/orders/${id}/kitchen-comment`, {
      method: 'POST',
      body: JSON.stringify({ comment }),
    });
    if (!res.ok) throw new Error('Erreur sauvegarde commentaire');
    return res.json();
  },

  async takeKitchenOrder(id) {
    const res = await api.fetch(`${API_URL}/orders/${id}/kitchen-handle`, { method: 'POST' });
    if (!res.ok) throw new Error('Erreur prise en charge');
    return res.json();
  },
};

export { OrderService };
