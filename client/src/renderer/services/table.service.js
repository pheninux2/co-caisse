import { api, API_URL } from '../core/api.js';

const TableService = {
  async getLayout() {
    const res = await api.fetch(`${API_URL}/tables/layout`);
    return res.json(); // { floor_plan, tables }
  },

  async getStatus() {
    const res = await api.fetch(`${API_URL}/tables/status`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async getBackground() {
    const res = await api.fetch(`${API_URL}/tables/background`);
    return res.json(); // { image, filename }
  },

  /** Multipart upload — utilise fetch natif pour ne pas forcer Content-Type: application/json */
  async uploadBackground(file) {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch(`${API_URL}/tables/background`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${api.getToken()}` },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur upload image de fond');
    return data; // { filename }
  },

  async removeBackground() {
    const res = await api.fetch(`${API_URL}/tables/background`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression image de fond');
  },

  async getDrawing() {
    const res = await api.fetch(`${API_URL}/tables/drawing`);
    const data = await res.json();
    return data.elements || [];
  },

  async saveDrawing(elements) {
    const res = await api.fetch(`${API_URL}/tables/drawing`, {
      method: 'PUT',
      body: JSON.stringify({ elements }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur sauvegarde dessin');
    return data; // { count }
  },

  async create(data) {
    const res = await api.fetch(`${API_URL}/tables`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur création table');
    return body;
  },

  async update(id, data) {
    const res = await api.fetch(`${API_URL}/tables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur mise à jour table');
    return body;
  },

  async remove(id) {
    const res = await api.fetch(`${API_URL}/tables/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur suppression table');
    return data;
  },
};

export { TableService };
