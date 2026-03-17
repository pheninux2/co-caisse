// ── Store — état global partagé inter-features ───────────────────────────
// Pattern pub/sub minimal. Les features lisent/écrivent l'état partagé
// sans référencer directement l'instance CocaisseApp.

const _state = {};
const _subscribers = {}; // { key: [Function] }

const store = {
  /**
   * Lit une valeur du store.
   * @param {string} key
   * @param {*} defaultValue
   */
  get(key, defaultValue = undefined) {
    return key in _state ? _state[key] : defaultValue;
  },

  /**
   * Écrit une valeur et notifie les abonnés.
   * @param {string} key
   * @param {*} value
   */
  set(key, value) {
    _state[key] = value;
    (_subscribers[key] || []).forEach(fn => fn(value));
  },

  /**
   * S'abonne aux changements d'une clé.
   * @param {string} key
   * @param {Function} fn  — reçoit la nouvelle valeur
   * @returns {Function}   — fonction de désabonnement
   */
  subscribe(key, fn) {
    if (!_subscribers[key]) _subscribers[key] = [];
    _subscribers[key].push(fn);
    return () => {
      _subscribers[key] = _subscribers[key].filter(f => f !== fn);
    };
  },

  /** Initialise plusieurs clés d'un coup (sans notifier) */
  init(initial = {}) {
    Object.assign(_state, initial);
  },
};

export { store };
