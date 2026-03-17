// ── HTTP client JWT centralisé ────────────────────────────────────────────
// Extrait de app.js — toute la logique auth/fetch vit ici.
// Les autres modules importent cet objet plutôt que d'accéder aux globales.

const API_URL = (typeof process !== 'undefined' && process.env && process.env.API_URL)
  ? process.env.API_URL + '/api'
  : 'http://localhost:5000/api';

let _jwtToken = null;
let _isRedirecting = false;
let _expiredHandler = null;

const api = {
  /** URL de base de l'API */
  baseUrl: API_URL,

  /** Positionne le token JWT en mémoire + localStorage */
  setToken(token) {
    _jwtToken = token;
    if (token) localStorage.setItem('jwt_token', token);
  },

  /** Efface le token */
  clearToken() {
    _jwtToken = null;
    localStorage.removeItem('jwt_token');
  },

  /** Retourne le token courant */
  getToken() {
    return _jwtToken;
  },

  /** Restaure le token depuis localStorage */
  restoreToken() {
    const saved = localStorage.getItem('jwt_token');
    if (saved) _jwtToken = saved;
    return !!saved;
  },

  /** True si un token est présent */
  hasToken() {
    return !!_jwtToken;
  },

  /** True si une redirection suite à expiration est déjà en cours */
  isRedirecting() {
    return _isRedirecting;
  },

  /** Réinitialise le flag de redirection (à appeler après showLoginScreen) */
  resetRedirectFlag() {
    _isRedirecting = false;
  },

  /**
   * Enregistre le handler appelé lors d'un 401.
   * Le handler doit nettoyer l'état app et afficher l'écran de connexion.
   * @param {Function} handler
   */
  onExpired(handler) {
    _expiredHandler = handler;
  },

  /** Construit les headers Authorization + Content-Type */
  getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (_jwtToken) headers['Authorization'] = `Bearer ${_jwtToken}`;
    return headers;
  },

  /**
   * Fetch authentifié. Intercepte les 401 et déclenche _expiredHandler.
   * @param {string} url
   * @param {RequestInit} options
   * @returns {Promise<Response>}
   */
  async fetch(url, options = {}) {
    const headers = { ...this.getAuthHeaders(), ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      this._handleTokenExpired();
      throw new Error('session_expired');
    }
    return res;
  },

  // Appelé sur tout 401. Le flag _isRedirecting garantit
  // qu'un seul traitement se déclenche même si plusieurs requêtes échouent en parallèle.
  _handleTokenExpired() {
    if (_isRedirecting) return;
    _isRedirecting = true;
    _jwtToken = null;
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('currentUser');
    if (_expiredHandler) _expiredHandler();
  },
};

export { api, API_URL };
