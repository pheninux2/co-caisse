import { api, API_URL } from '../core/api.js';

const CategoryService = {
  async getAll() {
    const res = await api.fetch(`${API_URL}/categories`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async create(data) {
    const res = await api.fetch(`${API_URL}/categories`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur création catégorie');
    return body;
  },

  async update(id, data) {
    const res = await api.fetch(`${API_URL}/categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur mise à jour catégorie');
    return body;
  },

  async remove(id) {
    const res = await api.fetch(`${API_URL}/categories/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression catégorie');
  },
};

export { CategoryService };
