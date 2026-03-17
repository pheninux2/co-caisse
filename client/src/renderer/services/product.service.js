import { api, API_URL } from '../core/api.js';

const ProductService = {
  async getAll() {
    const res = await api.fetch(`${API_URL}/products`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async create(data) {
    const res = await api.fetch(`${API_URL}/products`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur création produit');
    return body;
  },

  async update(id, data) {
    const res = await api.fetch(`${API_URL}/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur mise à jour produit');
    return body;
  },

  async remove(id) {
    const res = await api.fetch(`${API_URL}/products/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression produit');
  },
};

export { ProductService };
