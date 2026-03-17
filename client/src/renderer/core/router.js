
// ── Router — navigation entre sections ───────────────────────────────────
// Extrait de app.js lignes 3160-3212 (showSection).
// Le router gère la visibilité DOM et délègue les chargements de données
// via des callbacks enregistrés par app.js.

let _current = 'pos';
const _handlers = {}; // { sectionName: Function }
const _onNavigateCallbacks = [];

const router = {
  /** Section active courante */
  getCurrent() { return _current; },

  /**
   * Enregistre un handler de chargement pour une section.
   * @param {string} section
   * @param {Function} fn  — appelée sans arguments lors de la navigation
   */
  on(section, fn) {
    _handlers[section] = fn;
  },

  /**
   * Enregistre un callback appelé à chaque navigation (ex: pour mettre à jour this.currentSection).
   * @param {Function} fn  — reçoit (section) en argument
   */
  onNavigate(fn) {
    _onNavigateCallbacks.push(fn);
  },

  /**
   * Navigue vers une section.
   * @param {string} section
   * @param {{ role?: string }} context  — contexte minimal pour la vérification de rôle
   */
  navigate(section, context = {}) {
    // Vérifier les permissions via data-role du bouton nav
    const navBtn = document.querySelector(`.nav-tab[data-section="${section}"]`);
    if (navBtn) {
      const allowedRoles = (navBtn.getAttribute('data-role') || '').split(',').map(r => r.trim());
      const userRole = context.role || 'cashier';
      if (!allowedRoles.includes(userRole)) {
        console.warn(`❌ Accès refusé: ${userRole} → ${section}`);
        return false;
      }
    }

    // Cacher toutes les sections
    document.querySelectorAll('[id$="-section"]').forEach(s => s.classList.add('hidden'));

    // Afficher la section cible
    const target = document.getElementById(section + '-section');
    if (target) target.classList.remove('hidden');

    // Mettre à jour les onglets actifs (desktop + mobile)
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));
    document.querySelector(`.nav-tab[data-section="${section}"]`)?.classList.add('active');
    document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.mobile-nav-item[data-section="${section}"]`)?.classList.add('active');

    _current = section;

    // Notifier les listeners (ex: app.currentSection = section)
    _onNavigateCallbacks.forEach(fn => fn(section));

    // Déclencher le handler de données enregistré pour cette section
    if (_handlers[section]) _handlers[section]();

    return true;
  },
};

export { router };
