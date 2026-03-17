import { api, API_URL } from '../core/api.js';

const TransactionService = {
  async getAll({ startDate, endDate, userId, limit } = {}) {
    const params = new URLSearchParams();
    if (startDate) params.append('start_date', startDate);
    if (endDate)   params.append('end_date',   endDate);
    if (userId)    params.append('user_id',     userId);
    if (limit)     params.append('limit',       limit);
    const url = `${API_URL}/transactions${params.toString() ? '?' + params : ''}`;
    const res = await api.fetch(url);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async get(id) {
    const res = await api.fetch(`${API_URL}/transactions/${id}`);
    if (!res.ok) throw new Error('Transaction introuvable');
    return res.json();
  },

  async create(data) {
    const res = await api.fetch(`${API_URL}/transactions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur création transaction');
    return body;
  },

  async getDailySummary(date) {
    const res = await api.fetch(`${API_URL}/transactions/summary/daily?date=${date}`);
    return res.json();
  },

  async getPeriodSummary(start, end) {
    const res = await api.fetch(`${API_URL}/transactions/summary/period?start=${start}&end=${end}`);
    return res.json();
  },

  async getPaymentMethods(startDate, endDate) {
    const res = await api.fetch(`${API_URL}/reports/payments?start_date=${startDate}&end_date=${endDate}`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },
};

export { TransactionService };
