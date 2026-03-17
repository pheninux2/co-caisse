import { api, API_URL } from '../core/api.js';

const UserService = {
  async getAll() {
    const res = await api.fetch(`${API_URL}/users`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  },

  async me() {
    const res = await api.fetch(`${API_URL}/users/me`);
    if (!res.ok) throw new Error('Session invalide');
    return res.json();
  },

  /** Login — NE PAS utiliser apiFetch ici (401 = mauvais mdp, pas session expirée) */
  async login(username, password) {
    const res = await fetch(`${API_URL}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Identifiants incorrects');
    return data; // { token, user }
  },

  async create(data) {
    const res = await api.fetch(`${API_URL}/users`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur création utilisateur');
    return body;
  },

  async update(id, data) {
    const res = await api.fetch(`${API_URL}/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Erreur mise à jour utilisateur');
    return body;
  },

  async remove(id) {
    const res = await api.fetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Erreur suppression utilisateur');
  },
};

export { UserService };
