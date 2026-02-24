// Import styles
import './styles/main.css';

// API_URL injecté par webpack DefinePlugin depuis client/.env
const API_URL = (typeof process !== 'undefined' && process.env && process.env.API_URL)
  ? process.env.API_URL + '/api'
  : 'http://localhost:5000/api';

// Token JWT stocké en mémoire (complément du localStorage pour la persistance)
let _jwtToken = null;

class CocaisseApp {
  constructor() {
    this.currentUser = null;
    this.currentSection = 'pos';
    this.products = [];
    this.categories = [];
    this.cart = [];
    this.currentDiscount = 0;
    this.settings = {};
    this.calculator = { value: '0', operation: null, operand: null };
    this.heldCarts = [];
    this.orders = [];
    this.currentOrderFilter = 'all';
    this.alerts = [];
    this.alertsRaw = [];
    this.alertPollingInterval = null;
    this.alertDisplayInterval = null;
    this.lastAlertSound = 0;
    this.notifiedAlerts = new Set();
    this.notifiedLevels = new Map(); // garde le niveau déjà notifié par id
    this.dismissedAlerts = new Map();

    this.init();
  }

  // ── Auth headers JWT ─────────────────────────────────────────────────────
  getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (_jwtToken) headers['Authorization'] = `Bearer ${_jwtToken}`;
    return headers;
  }

  // ── Fetch authentifié ────────────────────────────────────────────────────
  async apiFetch(url, options = {}) {
    const headers = { ...this.getAuthHeaders(), ...(options.headers || {}) };
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      // Lire le message serveur si disponible
      const body = await res.json().catch(() => ({}));
      const msg  = body.error || 'Session expirée — veuillez vous reconnecter';
      this.toastError(msg);
      setTimeout(() => this.logout(), 1500); // laisser le toast s'afficher
      throw new Error(msg);
    }
    return res;
  }

  async init() {
    console.log('✅ Co-Caisse application initialized');

    // Charger les paramètres sauvegardés
    const savedSettings = localStorage.getItem('cocaisse_settings');
    if (savedSettings) {
      this.settings = JSON.parse(savedSettings);
    }

    // ── 1. Vérification licence AVANT tout ──────────────────────────────
    const licenceOk = await this._checkLicence();
    if (!licenceOk) return; // l'écran licence est affiché, on s'arrête

    // ── 2. Restaurer la session JWT ──────────────────────────────────────
    const savedToken = localStorage.getItem('jwt_token');
    const savedUser  = localStorage.getItem('currentUser');

    if (savedToken && savedUser) {
      try {
        _jwtToken = savedToken;

        const checkRes = await this.apiFetch(`${API_URL}/users/me`, {
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${_jwtToken}`,
          },
        });

        if (checkRes.ok) {
          const freshUser = await checkRes.json();
          this.currentUser = freshUser;
          localStorage.setItem('currentUser', JSON.stringify(freshUser));
          console.log('👤 Session restaurée:', freshUser.username, '(' + freshUser.role + ')');
          this.showMainApp();
        } else if (checkRes.status === 401) {
          console.log('⚠️ Token expiré, reconnexion requise');
          localStorage.removeItem('jwt_token');
          localStorage.removeItem('currentUser');
          _jwtToken = null;
          this.showLoginScreen();
        } else {
          console.warn('⚠️ Serveur inaccessible, session locale conservée');
          this.currentUser = JSON.parse(savedUser);
          this.showMainApp();
        }
      } catch (e) {
        console.warn('⚠️ Serveur inaccessible:', e.message);
        try {
          this.currentUser = JSON.parse(savedUser);
          this.showMainApp();
        } catch {
          localStorage.removeItem('jwt_token');
          localStorage.removeItem('currentUser');
          _jwtToken = null;
          this.showLoginScreen();
        }
      }
    } else {
      console.log('🔐 Aucun utilisateur connecté');
      this.showLoginScreen();
    }
  }

  // ── Vérification de la licence au démarrage ───────────────────────────────
  // Retourne true  → la licence est OK, on peut continuer
  // Retourne false → l'écran licence est affiché, init s'arrête
  async _checkLicence() {
    try {
      const res  = await fetch(`${API_URL}/licences/status`);
      const data = await res.json();

      this.licenceStatus = data; // stocker pour usage ultérieur

      // ── Cas 1 : Aucune licence ───────────────────────────────────────
      if (!data.hasLicence) {
        this._showLicenceScreen('welcome');
        return false;
      }

      // ── Cas 2 : Trial expiré ─────────────────────────────────────────
      if (!data.valid && data.type === 'trial') {
        this._showLicenceScreen('trial_expired');
        return false;
      }

      // ── Cas 3 : Licence expirée / suspendue ──────────────────────────
      if (!data.valid) {
        this._showLicenceScreen('expired');
        return false;
      }

      // ── Cas 4 : Trial actif → bandeau discret ────────────────────────
      if (data.valid && data.type === 'trial') {
        this._showTrialBanner(data.daysRemaining);
      }

      // ── Cas 5 : Licence active → badge dans le header ────────────────
      this._updateLicenceBadge(data);
      return true;

    } catch (e) {
      // Serveur inaccessible → on laisse passer (fail open)
      console.warn('[licence] Serveur inaccessible — bypass licence check');
      return true;
    }
  }

  // ── Affiche l'écran licence avec le bon contenu ───────────────────────────
  _showLicenceScreen(mode) {
    const screen  = document.getElementById('licenceScreen');
    const content = document.getElementById('licenceContent');
    if (!screen || !content) return;

    if (mode === 'welcome') {
      content.innerHTML = `
        <p class="text-gray-600 mb-6 text-sm leading-relaxed">
          Bienvenue ! Démarrez votre essai gratuit de <strong>7 jours</strong><br>
          ou entrez votre clé de licence si vous en avez une.
        </p>
        <div class="space-y-3">
          <button onclick="app.startTrial()"
            class="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition shadow-md">
            🚀 Démarrer l'essai gratuit 7 jours
          </button>
          <button onclick="app._showLicenceScreen('activate')"
            class="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition">
            🔑 Entrer une clé de licence
          </button>
        </div>
        <p class="text-xs text-gray-400 mt-4">Module caisse inclus pendant l'essai</p>
      `;
    } else if (mode === 'trial_expired') {
      content.innerHTML = `
        <div class="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-3xl">⏰</span>
        </div>
        <h2 class="text-xl font-bold text-gray-800 mb-2">Essai expiré</h2>
        <p class="text-gray-600 mb-6 text-sm leading-relaxed">
          Votre essai gratuit de 7 jours est terminé.<br>
          Activez votre licence pour continuer à utiliser Co-Caisse.
        </p>
        <div class="space-y-3">
          <button onclick="app._showLicenceScreen('activate')"
            class="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition shadow-md">
            🔑 Activer ma licence
          </button>
          <button onclick="app._openMail('Activation licence Co-Caisse', 'Bonjour,\n\nJe souhaite activer ma licence Co-Caisse.\n\nMerci.')"
            class="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition text-sm">
            📧 Contacter le support
          </button>
        </div>
      `;
    } else if (mode === 'expired') {
      content.innerHTML = `
        <div class="w-14 h-14 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span class="text-3xl">⚠️</span>
        </div>
        <h2 class="text-xl font-bold text-gray-800 mb-2">Licence expirée</h2>
        <p class="text-gray-600 mb-6 text-sm leading-relaxed">
          Votre licence a expiré ou a été suspendue.<br>
          Contactez-nous pour la renouveler.
        </p>
        <div class="space-y-3">
          <button onclick="app._showLicenceScreen('activate')"
            class="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition shadow-md">
            🔑 Entrer une nouvelle clé
          </button>
          <button onclick="app._openMail('Renouvellement licence Co-Caisse', 'Bonjour,\n\nMa licence Co-Caisse a expiré. Je souhaite la renouveler.\n\nMerci.')"
            class="w-full py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition text-sm">
            📧 Contacter le support
          </button>
        </div>
      `;
    } else if (mode === 'activate') {
      content.innerHTML = `
        <h2 class="text-xl font-bold text-gray-800 mb-4">Activer une licence</h2>
        <div class="mb-3 text-left">
          <label class="block text-xs font-semibold text-gray-600 mb-1">Clé de licence <span class="text-red-500">*</span></label>
          <input type="text" id="licenceKeyInput"
            placeholder="CCZ-XXXX-XXXX-XXXX"
            class="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm font-mono tracking-wider uppercase"
            oninput="this.value = this.value.toUpperCase()">
        </div>
        <div class="mb-4 text-left">
          <label class="block text-xs font-semibold text-gray-600 mb-2">Modules inclus dans votre licence <span class="text-red-500">*</span></label>
          <p class="text-xs text-gray-400 mb-2">Cochez exactement les modules indiqués dans votre email de licence.</p>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg cursor-not-allowed opacity-60 text-xs text-gray-500">
              <input type="checkbox" checked disabled class="accent-indigo-500"> 🛒 Caisse <em>(inclus)</em>
            </label>
            <label class="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 transition text-xs">
              <input type="checkbox" id="mod_cuisine" value="cuisine" class="accent-indigo-500"> 🍳 Cuisine
            </label>
            <label class="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 transition text-xs">
              <input type="checkbox" id="mod_commandes" value="commandes" class="accent-indigo-500"> 📋 Commandes
            </label>
            <label class="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 transition text-xs">
              <input type="checkbox" id="mod_historique" value="historique" class="accent-indigo-500"> 📜 Historique
            </label>
            <label class="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 transition text-xs">
              <input type="checkbox" id="mod_statistiques" value="statistiques" class="accent-indigo-500"> 📊 Statistiques
            </label>
            <label class="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 transition text-xs">
              <input type="checkbox" id="mod_gestion" value="gestion" class="accent-indigo-500"> 📦 Gestion
            </label>
          </div>
        </div>
        <div class="space-y-3">
          <button onclick="app.activateLicenceKey()"
            class="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition shadow-md">
            ✅ Activer
          </button>
        </div>
        <div id="licenceActivateError" class="hidden mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs"></div>
      `;
    }

    screen.classList.remove('hidden');
  }

  // ── Affiche le bandeau trial ──────────────────────────────────────────────
  _showTrialBanner(daysRemaining) {
    const banner = document.getElementById('trialBanner');
    const text   = document.getElementById('trialBannerText');
    if (!banner || !text) return;

    const label = daysRemaining === 1
      ? '⏳ Essai gratuit — 1 jour restant'
      : `⏳ Essai gratuit — ${daysRemaining} jours restants`;

    text.textContent = label;
    banner.classList.remove('hidden');

    // Décale le header de l'app pour ne pas qu'il soit masqué
    const header = document.querySelector('#app header');
    if (header) header.style.marginTop = '28px';
  }

  // ── Masque le bandeau trial ────────────────────────────────────────────────
  _hideTrialBanner() {
    const banner = document.getElementById('trialBanner');
    if (!banner) return;
    banner.classList.add('hidden');
    const header = document.querySelector('#app header');
    if (header) header.style.marginTop = '';
  }

  // ── Affiche le badge de licence dans le header ────────────────────────────
  _updateLicenceBadge(status) {
    const badge = document.getElementById('licenceBadge');
    if (!badge || !status) return;

    const configs = {
      perpetual:    { label: '✓ Perpétuelle',  cls: 'bg-green-100 text-green-700'  },
      subscription: { label: '◆ Abonnement',   cls: 'bg-blue-100 text-blue-700'    },
      trial:        { label: '⏱ Essai',        cls: 'bg-amber-100 text-amber-700'  },
    };

    const cfg = configs[status.type] || { label: '✓ Activée', cls: 'bg-gray-100 text-gray-600' };
    badge.textContent = cfg.label;
    badge.className   = `text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.cls}`;
    badge.classList.remove('hidden');
  }

  // ── Démarre l'essai gratuit ───────────────────────────────────────────────
  async startTrial() {
    const btn = document.querySelector('#licenceContent button');
    if (btn) { btn.disabled = true; btn.textContent = 'Démarrage...'; }

    try {
      const res  = await fetch(`${API_URL}/licences/trial`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json();

      if (data.success) {
        this.licenceStatus = await (await fetch(`${API_URL}/licences/status`)).json();
        this._showTrialBanner(data.daysRemaining);
        document.getElementById('licenceScreen').classList.add('hidden');
        this.showLoginScreen();
      } else {
        this._showLicenceError(data.error || 'Impossible de démarrer l\'essai');
      }
    } catch (e) {
      this._showLicenceError('Erreur serveur — réessayez');
    }
  }

  // ── Active une clé de licence ─────────────────────────────────────────────
  async activateLicenceKey() {
    const input = document.getElementById('licenceKeyInput');
    const key   = input?.value?.trim();

    if (!key || key.length < 14) {
      this._showLicenceError('Clé invalide — format attendu : CCZ-XXXX-XXXX-XXXX');
      return;
    }

    // Collecter les modules cochés
    const moduleCheckboxes = document.querySelectorAll('#licenceContent input[type="checkbox"]:not(:disabled):checked');
    const selectedModules  = ['caisse', ...Array.from(moduleCheckboxes).map(cb => cb.value)];

    const btn = document.querySelector('#licenceContent button');
    if (btn) { btn.disabled = true; btn.textContent = 'Activation...'; }

    try {
      const res  = await fetch(`${API_URL}/licences/activate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key, modules: selectedModules }),
      });
      const data = await res.json();

      if (data.success) {
        this.licenceStatus = data.status;
        document.getElementById('licenceScreen').classList.add('hidden');

        if (data.status?.type === 'trial') {
          this._showTrialBanner(data.status.daysRemaining);
        } else {
          // Licence perpetual ou subscription → cacher le bandeau essai
          this._hideTrialBanner();
        }

        this._updateLicenceBadge(data.status);
        this.showLoginScreen();
        this.toastSuccess('Licence activée avec succès !');
      } else {
        if (btn) { btn.disabled = false; btn.textContent = '✅ Activer'; }
        this._showLicenceError(data.error || 'Activation échouée');
      }
    } catch (e) {
      if (btn) { btn.disabled = false; btn.textContent = '✅ Activer'; }
      this._showLicenceError('Erreur serveur — réessayez');
    }
  }

  // ── Affiche une erreur dans l'écran licence ───────────────────────────────
  _showLicenceError(message) {
    const el = document.getElementById('licenceActivateError');
    if (el) {
      el.textContent = '⚠️ ' + message;
      el.classList.remove('hidden');
    } else {
      this.toastError(message);
    }
  }

  // ── Ouvre le client mail (compatible Electron + navigateur) ──────────────
  // Dans Electron, window.open('mailto:') ouvre Google. On passe par
  // l'API shell.openExternal via preload si disponible, sinon on affiche
  // l'adresse dans un toast pour que l'utilisateur la copie.
  _openMail(subject = '', body = '') {
    const email   = 'contact@co-caisse.fr';
    const encoded = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    // Electron via preload bridge
    if (window.electron && typeof window.electron.openExternal === 'function') {
      window.electron.openExternal(encoded);
      return;
    }

    // Navigateur standard
    const a = document.createElement('a');
    a.href   = encoded;
    a.target = '_blank';
    a.rel    = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Affiche aussi l'adresse en toast au cas où rien ne s'ouvre
    this.toastInfo(`📧 ${email} — copiez cette adresse si le client mail ne s'ouvre pas`);
  }

  showLoginScreen() {
    const loginScreen = document.getElementById('loginScreen');
    const appDiv = document.getElementById('app');

    if (loginScreen) loginScreen.classList.remove('hidden');
    if (appDiv) appDiv.classList.add('hidden');
  }

  showMainApp() {
    const loginScreen = document.getElementById('loginScreen');
    const appDiv = document.getElementById('app');

    if (loginScreen) loginScreen.classList.add('hidden');
    if (appDiv) appDiv.classList.remove('hidden');

    // S'assurer que licenceStatus est disponible pour filterMenuByRole
    if (!this.licenceStatus) {
      fetch(`${API_URL}/licences/status`)
        .then(r => r.json())
        .then(data => {
          this.licenceStatus = data;
          this.filterMenuByRole(); // re-filtre avec les modules réels
        })
        .catch(() => {}); // fail open si serveur inaccessible
    }

    // Filtrer les onglets selon le rôle (calcule aussi _defaultSection)
    this.filterMenuByRole();

    // Initialiser l'app principal
    this.setupEventListeners();
    this.loadData();
    this.updateClock();
    setInterval(() => this.updateClock(), 1000);

    // Mettre à jour l'affichage de l'utilisateur
    const userDisplay = document.getElementById('currentUser');
    if (userDisplay) {
      userDisplay.textContent = this.currentUser?.username || 'Admin';
    }

    // Afficher la section par défaut calculée par filterMenuByRole
    this.showSection(this._defaultSection || 'pos');

    // Démarrer le polling des alertes (toutes les 30 secondes)
    this.startAlertPolling();
  }

  filterMenuByRole() {
    const userRole      = this.currentUser?.role || 'cashier';
    const activeModules = this.licenceStatus?.modules || [];
    // Si pas de donnée licence (serveur inaccessible) → on considère tout actif
    const licenceValid  = !this.licenceStatus || this.licenceStatus.valid !== false;

    // Catalogue des modules avec description pour l'onglet "🔒 Plus"
    const MODULE_CATALOG = {
      caisse:       { label: 'Caisse',       icon: '🛒', desc: 'Encaissement, panier, tickets de caisse' },
      cuisine:      { label: 'Cuisine',      icon: '🍳', desc: 'Affichage commandes en cuisine, statuts' },
      commandes:    { label: 'Commandes',    icon: '📋', desc: 'Gestion commandes en salle, suivi statuts' },
      historique:   { label: 'Historique',   icon: '📜', desc: 'Historique des transactions, export' },
      statistiques: { label: 'Statistiques', icon: '📊', desc: 'Rapports de ventes, analytics' },
      gestion:      { label: 'Gestion',      icon: '📦', desc: 'Produits, catégories, utilisateurs, paramètres' },
    };

    const lockedModules = [];

    // ── Réinitialiser la visibilité de tous les onglets nav ──────────────
    // (nécessaire pour le re-login sans rechargement de page)
    document.querySelectorAll('.nav-tab, .mobile-nav-item').forEach(item => {
      item.classList.remove('hidden');
    });

    // ── Filtrage des onglets (desktop + mobile) ──────────────────────────
    const filterTab = (item) => {
      const allowedRoles   = (item.getAttribute('data-role') || '').split(',').map(r => r.trim());
      const requiredModule = item.getAttribute('data-module');
      const section        = item.getAttribute('data-section');

      // Onglet "locked" → géré séparément
      if (section === 'locked') return;

      // 1. Filtre par rôle — si data-role absent, accessible à tous
      const roleOk = !item.getAttribute('data-role') || allowedRoles.includes(userRole);

      // 2. Filtre par module
      //    - admin → voit tout sans restriction
      //    - modules vides / licence invalide → fail open (pas de restriction)
      //    - sinon : l'onglet visible seulement si module actif sur la licence
      let moduleOk = true;
      if (userRole !== 'admin' && licenceValid && requiredModule && activeModules.length > 0) {
        moduleOk = activeModules.includes(requiredModule);
        if (!moduleOk && roleOk) {
          const mod = MODULE_CATALOG[requiredModule];
          if (mod && !lockedModules.find(m => m.id === requiredModule)) {
            lockedModules.push({ id: requiredModule, ...mod });
          }
        }
      }

      // Masquer si non autorisé (classList plutôt que remove — permettre re-login)
      if (!roleOk || !moduleOk) {
        item.classList.add('hidden');
      }
    };

    document.querySelectorAll('.nav-tab').forEach(filterTab);
    document.querySelectorAll('.mobile-nav-item').forEach(filterTab);

    // ── Onglet 🔒 Plus de fonctionnalités ───────────────────────────────
    // Visibilité basée uniquement sur la LICENCE (indépendant du rôle) :
    // visible si au moins 1 module (hors caisse) n'est pas dans la licence.
    const lockedBtn       = document.getElementById('lockedModulesBtn');
    const lockedMobileBtn = document.getElementById('lockedModulesMobileBtn');

    const licenceMissing = activeModules.length > 0
      ? Object.keys(MODULE_CATALOG)
          .filter(id => id !== 'caisse' && !activeModules.includes(id))
          .map(id => ({ id, ...MODULE_CATALOG[id] }))
      : [];

    if (licenceMissing.length > 0) {
      this._lockedModules = licenceMissing;
      lockedBtn?.classList.remove('hidden');
      lockedMobileBtn?.classList.remove('hidden');
    } else {
      this._lockedModules = [];
      lockedBtn?.classList.add('hidden');
      lockedMobileBtn?.classList.add('hidden');
    }

    // ── Boutons export/import : admin seulement ──────────────────────────
    document.querySelectorAll('.export-btn, .import-btn').forEach(btn => {
      btn.style.display = userRole === 'admin' ? '' : 'none';
    });

    // ── Bouton stats : admin/manager seulement ───────────────────────────
    const statsBtn = document.getElementById('statsBtn');
    if (statsBtn) {
      statsBtn.style.display = ['admin', 'manager'].includes(userRole) ? '' : 'none';
    }

    // ── Bouton alertes : admin, cashier, cook ────────────────────────────
    const alertsBtn = document.getElementById('alertsPanelBtn');
    if (alertsBtn) {
      alertsBtn.style.display = ['admin', 'cashier', 'cook'].includes(userRole) ? '' : 'none';
    }

    // ── Section par défaut selon le rôle ─────────────────────────────────
    const defaultSections = {
      admin:   'pos',
      manager: 'dashboard',
      cashier: 'pos',
      cook:    'kitchen',
    };
    this._defaultSection = defaultSections[userRole] || 'pos';

    console.log(`✅ Menu filtré — rôle: ${userRole} | modules actifs: [${activeModules.join(', ')}] | verrouillés: [${lockedModules.map(m=>m.id).join(', ')}]`);
  }

  // ── Onglet 🔒 Plus de fonctionnalités ──────────────────────────────────────
  showLockedModules() {
    // Catalogue complet de tous les modules
    const MODULE_CATALOG = {
      caisse:       { label: 'Caisse',       icon: '🛒', desc: 'Encaissement, panier, tickets de caisse' },
      cuisine:      { label: 'Cuisine',      icon: '👨‍🍳', desc: 'Affichage commandes en cuisine, gestion des statuts' },
      commandes:    { label: 'Commandes',    icon: '📋', desc: 'Prise de commandes en salle, suivi en temps réel' },
      historique:   { label: 'Historique',   icon: '📜', desc: 'Historique des transactions, export des données' },
      statistiques: { label: 'Statistiques', icon: '📊', desc: 'Rapports de ventes, analytics, tableau de bord' },
      gestion:      { label: 'Gestion',      icon: '📦', desc: 'Produits, catégories, utilisateurs, paramètres' },
    };

    // Modules actifs sur cette licence
    const activeModules = this.licenceStatus?.modules || [];

    // Tous les modules NON activés sur la licence (peu importe le rôle)
    const locked = Object.entries(MODULE_CATALOG)
      .filter(([id]) => id !== 'caisse' && !activeModules.includes(id))
      .map(([id, info]) => ({ id, ...info }));

    if (locked.length === 0) {
      this.toastSuccess('Tous les modules sont déjà activés sur votre licence !');
      return;
    }

    const content = locked.map(mod => `
      <div class="flex items-start gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-indigo-200 transition">
        <div class="w-12 h-12 bg-gradient-to-br from-gray-200 to-gray-300 rounded-xl flex items-center justify-center text-2xl flex-shrink-0">
          ${mod.icon}
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <h3 class="font-semibold text-gray-800">${mod.label}</h3>
            <span class="text-xs px-2 py-0.5 bg-gray-200 text-gray-500 rounded-full">🔒 Non activé</span>
          </div>
          <p class="text-sm text-gray-500 mb-2">${mod.desc}</p>
          <button onclick="app._openMail('Activation module ${mod.label}', 'Bonjour,\\n\\nJe souhaite activer le module \\'${mod.label}\\' sur ma licence Co-Caisse.\\n\\nMerci.')"
             class="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-semibold underline cursor-pointer bg-transparent border-0 p-0">
            📧 Demander l'activation de ce module →
          </button>
        </div>
      </div>
    `).join('');

    const dialog = document.getElementById('confirmDialog');
    if (!dialog) return;

    dialog.innerHTML = `
      <div class="modal-backdrop" onclick="app.closeModal('confirmDialog')"></div>
      <div class="modal-content max-w-lg w-full">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-xl font-bold text-gray-800">🔒 Modules disponibles</h2>
          <button onclick="app.closeModal('confirmDialog')" class="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 text-lg leading-none">✕</button>
        </div>
        <p class="text-sm text-gray-500 mb-4">
          Ces modules ne sont pas inclus dans votre licence actuelle.<br>
          Contactez-nous pour les activer.
        </p>
        <div class="space-y-3 max-h-[420px] overflow-y-auto pr-1">
          ${content}
        </div>
        <div class="mt-4 pt-4 border-t border-gray-100 text-center">
          <button onclick="app._openMail('Upgrade licence Co-Caisse', 'Bonjour,\\n\\nJe souhaite obtenir des informations sur l\\'upgrade de ma licence Co-Caisse.\\n\\nMerci.')"
             class="inline-flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold rounded-xl transition shadow-md text-sm cursor-pointer border-0">
            📧 Contacter Co-Caisse pour un devis
          </button>
        </div>
      </div>
    `;

    this.openModal('confirmDialog');
  }

  async handleLogin(event) {
    event.preventDefault();
    console.log('🔐 Tentative de connexion...');

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
      // Ne pas utiliser apiFetch ici — un 401 sur login = mauvais mdp, pas session expirée
      const response = await fetch(`${API_URL}/users/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();

        // Stocker le token JWT en mémoire et en localStorage pour la persistance
        _jwtToken = data.token;
        localStorage.setItem('jwt_token',    data.token);
        localStorage.setItem('currentUser',  JSON.stringify(data.user));

        this.currentUser = data.user;
        console.log('✅ Connexion réussie:', data.user.username, '(' + data.user.role + ')');

        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';

        this.showMainApp();
        this.toastSuccess(`Bienvenue ${data.user.username} !`);
      } else {
        const err = await response.json().catch(() => ({}));
        this.toastError(err.error || 'Identifiants incorrects');
      }
    } catch (error) {
      console.error('Erreur de connexion:', error);
      this.toastError('Erreur réseau — vérifiez la connexion au serveur');
    }
  }

  setupEventListeners() {
    // Mobile menu button
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
      this.openMobileMenu();
    });

    // Alerts panel button
    document.getElementById('alertsPanelBtn')?.addEventListener('click', () => {
      this.showAlertsPanel();
    });

    // Statistics button
    document.getElementById('statsBtn')?.addEventListener('click', () => {
      this.showOrdersStatistics();
    });

    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      this.logout();
    });

    // Search products
    document.getElementById('searchInput')?.addEventListener('input', (e) => {
      this.searchProducts(e.target.value);
    });

    // Payment methods
    document.querySelectorAll('.payment-method').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.payment-method').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.updateChangeSection();
      });
    });

    // Amount received
    document.getElementById('amountReceived')?.addEventListener('input', () => {
      this.calculateChange();
    });

    // Product search in management
    document.getElementById('productsSearch')?.addEventListener('input', (e) => {
      this.filterProducts(e.target.value);
    });
  }

  // ===== MOBILE MENU =====
  openMobileMenu() {
    document.getElementById('mobileDrawer')?.classList.remove('hidden');
  }

  closeMobileMenu() {
    document.getElementById('mobileDrawer')?.classList.add('hidden');
  }

  // ===== CART MANAGEMENT =====
  addToCart(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    const existingItem = this.cart.find(item => item.id === productId);

    if (existingItem) {
      existingItem.quantity++;
    } else {
      this.cart.push({
        ...product,
        quantity: 1,
        discount: 0
      });
    }

    this.updateCartDisplay();
  }

  removeFromCart(productId) {
    this.cart = this.cart.filter(item => item.id !== productId);
    this.updateCartDisplay();
  }

  updateCartItemQty(productId, quantity) {
    const item = this.cart.find(i => i.id === productId);
    if (item) {
      item.quantity = Math.max(1, parseInt(quantity) || 1);
      this.updateCartDisplay();
    }
  }

  async clearCart() {
    if (this.cart.length === 0) return;
    const confirmed = await this.confirm('Vider le panier ?', {
      title: 'Vider le panier',
      icon: '🗑️',
      type: 'warning',
      confirmText: 'Vider',
      cancelText: 'Annuler'
    });
    if (confirmed) {
      this.cart = [];
      this.currentDiscount = 0;
      this.updateCartDisplay();
      this.toastInfo('Panier vidé');
    }
  }

  holdCart() {
    if (this.cart.length === 0) {
      this.toastWarning('Le panier est vide');
      return;
    }
    this.heldCarts.push({
      items: [...this.cart],
      discount: this.currentDiscount,
      timestamp: new Date()
    });
    this.cart = [];
    this.currentDiscount = 0;
    this.updateCartDisplay();
    this.updateHeldCartsButton();
    this.toastSuccess(`Panier mis en attente (${this.heldCarts.length} en attente)`);
  }

  // Afficher le modal des paniers en attente
  showHeldCarts() {
    if (this.heldCarts.length === 0) {
      this.toastInfo('Aucun panier en attente');
      return;
    }

    const modal = document.createElement('div');
    modal.id = 'heldCartsModal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
        <div class="p-4 border-b border-gray-200 flex items-center justify-between">
          <h3 class="font-bold text-lg text-gray-800">⏸️ Paniers en attente (${this.heldCarts.length})</h3>
          <button onclick="app.closeHeldCartsModal()" class="p-2 hover:bg-gray-100 rounded-lg transition">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          ${this.heldCarts.map((cart, index) => {
            const total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
            const timeAgo = this.formatTimeAgo(cart.timestamp);
            return `
              <div class="border border-gray-200 rounded-xl p-3 hover:border-indigo-300 hover:bg-indigo-50/50 transition cursor-pointer" onclick="app.retrieveHeldCart(${index})">
                <div class="flex items-center justify-between mb-2">
                  <span class="font-semibold text-gray-800">Panier #${index + 1}</span>
                  <span class="text-xs text-gray-500">${timeAgo}</span>
                </div>
                <div class="text-sm text-gray-600 mb-2">
                  ${cart.items.slice(0, 3).map(item => `<span class="inline-block bg-gray-100 px-2 py-0.5 rounded text-xs mr-1 mb-1">${item.name} ×${item.quantity}</span>`).join('')}
                  ${cart.items.length > 3 ? `<span class="text-xs text-gray-400">+${cart.items.length - 3} autres</span>` : ''}
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-gray-500">${itemCount} article(s)</span>
                  <span class="font-bold text-indigo-600">${total.toFixed(2)} €</span>
                </div>
                ${cart.discount > 0 ? `<div class="text-xs text-green-600 mt-1">Remise: -${cart.discount.toFixed(2)} €</div>` : ''}
              </div>
            `;
          }).join('')}
        </div>
        <div class="p-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <p class="text-xs text-gray-500 text-center">Cliquez sur un panier pour le récupérer</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }

  // Fermer le modal
  closeHeldCartsModal() {
    const modal = document.getElementById('heldCartsModal');
    if (modal) modal.remove();
  }

  // Récupérer un panier en attente
  async retrieveHeldCart(index) {
    if (index < 0 || index >= this.heldCarts.length) return;

    // Si le panier actuel n'est pas vide, demander confirmation
    if (this.cart.length > 0) {
      const confirmed = await this.confirm('Le panier actuel n\'est pas vide. Voulez-vous le remplacer par le panier en attente?', {
        title: 'Remplacer le panier',
        icon: '🔄',
        type: 'warning',
        confirmText: 'Remplacer',
        cancelText: 'Annuler'
      });
      if (!confirmed) return;
    }

    const heldCart = this.heldCarts[index];
    this.cart = [...heldCart.items];
    this.currentDiscount = heldCart.discount;

    // Supprimer le panier de la liste des paniers en attente
    this.heldCarts.splice(index, 1);

    this.updateCartDisplay();
    this.updateHeldCartsButton();
    this.closeHeldCartsModal();

    this.toastSuccess('Panier récupéré !');
  }

  // Mettre à jour le bouton des paniers en attente
  updateHeldCartsButton() {
    const btn = document.getElementById('heldCartsBtn');
    const badge = document.getElementById('heldCartsBadge');

    if (badge) {
      badge.textContent = this.heldCarts.length;
      badge.style.display = this.heldCarts.length > 0 ? '' : 'none';
    }
  }

  // Formater le temps écoulé
  formatTimeAgo(date) {
    const now = new Date();
    const diff = Math.floor((now - new Date(date)) / 1000);

    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    return `Il y a ${Math.floor(diff / 86400)} j`;
  }

  updateCartDisplay() {
    const cartItems = document.getElementById('cartItems');
    const cartCount = document.getElementById('cartCount');

    if (!cartItems) return;

    const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    if (cartCount) cartCount.textContent = totalItems;

    if (this.cart.length === 0) {
      cartItems.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Panier vide</p>';
    } else {
      cartItems.innerHTML = this.cart.map(item => `
        <div class="cart-item">
          <div class="flex-1 min-w-0">
            <p class="font-semibold text-sm text-gray-800 truncate">${item.name}</p>
            <p class="text-xs text-gray-500">${item.price.toFixed(2)} € × ${item.quantity}</p>
          </div>
          <div class="flex items-center gap-1">
            <button onclick="app.updateCartItemQty('${item.id}', ${item.quantity - 1})" class="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-600 text-sm font-bold">−</button>
            <span class="w-6 text-center text-sm font-medium">${item.quantity}</span>
            <button onclick="app.updateCartItemQty('${item.id}', ${item.quantity + 1})" class="w-6 h-6 flex items-center justify-center bg-gray-100 hover:bg-gray-200 rounded text-gray-600 text-sm font-bold">+</button>
          </div>
          <p class="font-bold text-sm text-indigo-600 min-w-[60px] text-right">${(item.price * item.quantity).toFixed(2)} €</p>
          <button onclick="app.removeFromCart('${item.id}')" class="text-red-400 hover:text-red-600 ml-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
      `).join('');
    }

    this.updateTotals();
  }

  updateTotals() {
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.20;
    const discount = this.currentDiscount;
    const total = subtotal + tax - discount;

    document.getElementById('subtotal').textContent = subtotal.toFixed(2).replace('.', ',') + ' €';
    document.getElementById('taxAmount').textContent = tax.toFixed(2).replace('.', ',') + ' €';
    document.getElementById('totalAmount').textContent = total.toFixed(2).replace('.', ',') + ' €';

    const discountRow = document.getElementById('discountRow');
    const discountDisplay = document.getElementById('discountDisplay');
    if (discountRow && discountDisplay) {
      if (discount > 0) {
        discountRow.style.display = '';
        discountDisplay.textContent = '-' + discount.toFixed(2).replace('.', ',') + ' €';
      } else {
        discountRow.style.display = 'none';
      }
    }

    this.calculateChange();
  }

  updateChangeSection() {
    const selected = document.querySelector('.payment-method.active');
    const changeSection = document.getElementById('changeSection');

    if (changeSection) {
      if (selected?.dataset.method === 'cash') {
        changeSection.style.display = '';
      } else {
        changeSection.style.display = 'none';
      }
    }
  }

  calculateChange() {
    const amountInput = document.getElementById('amountReceived');
    const changeAmount = document.getElementById('changeAmount');

    if (!amountInput || !changeAmount) return;

    const amountReceived = parseFloat(amountInput.value || 0);
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal * 1.20 - this.currentDiscount;
    const change = amountReceived - total;

    changeAmount.textContent = change.toFixed(2).replace('.', ',') + ' €';
    changeAmount.className = change >= 0
      ? 'font-bold text-green-600'
      : 'font-bold text-red-600';
  }

  // ===== DATA MANAGEMENT =====
  async loadData() {
    try {
      await Promise.all([
        this.loadCategories(),
        this.loadProducts(),
        this.loadDashboard(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  async loadCategories() {
    try {
      const response = await this.apiFetch(`${API_URL}/categories`);
      const data = await response.json();
      this.categories = Array.isArray(data) ? data : [];
      this.renderCategories();
      this.renderCategoryFilter();
    } catch (error) {
      console.error('Error loading categories:', error);
      this.categories = [];
    }
  }

  async loadProducts() {
    try {
      const response = await this.apiFetch(`${API_URL}/products`);
      const data = await response.json();
      this.products = Array.isArray(data) ? data : [];
      this.renderProducts();
      this.filterProducts('');
    } catch (error) {
      console.error('Error loading products:', error);
      this.products = [];
    }
  }

  renderCategories() {
    const categoriesGrid = document.getElementById('categoriesGrid');
    if (!categoriesGrid) return;

    if (this.categories.length === 0) {
      categoriesGrid.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Aucune catégorie</p>';
      return;
    }

    categoriesGrid.innerHTML = this.categories.map(cat => `
      <div class="category-card-item" style="border-left: 4px solid ${cat.color || '#6366f1'}">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm" style="background-color: ${cat.color || '#6366f1'}">
            ${cat.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p class="font-semibold text-sm text-gray-800">${cat.name}</p>
            <p class="text-xs text-gray-500">${this.products.filter(p => p.category_id === cat.id).length} produits</p>
          </div>
        </div>
        <div class="flex gap-1">
          <button onclick="app.openCategoryDialog('${cat.id}')" class="action-btn action-btn-edit">✏️</button>
          <button onclick="app.deleteCategory('${cat.id}')" class="action-btn action-btn-delete">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  renderCategoryFilter() {
    const categoriesList = document.getElementById('categoriesList');
    if (!categoriesList) return;

    categoriesList.innerHTML = `
      <button class="category-btn active" onclick="app.filterByCategory('')">Tous</button>
      ${this.categories.map(cat => `
        <button class="category-btn" onclick="app.filterByCategory('${cat.id}')" style="--cat-color: ${cat.color || '#6366f1'}">
          ${cat.name}
        </button>
      `).join('')}
    `;
  }

  renderProducts(filter = '') {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;

    let filtered = this.products.filter(p => p.active !== false);

    if (filter) {
      filtered = filtered.filter(p => p.category_id === filter);
    }

    if (filtered.length === 0) {
      productsList.innerHTML = '<p class="col-span-full text-gray-400 text-center py-8">Aucun produit</p>';
      return;
    }

    productsList.innerHTML = filtered.map(product => `
      <div class="product-card" onclick="app.addToCart('${product.id}')">
        ${product.image_url 
          ? `<img src="${product.image_url}" alt="${product.name}" class="product-card-img">` 
          : `<div class="w-full aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg mb-1.5 flex items-center justify-center text-2xl">📦</div>`
        }
        <p class="product-card-name">${product.name}</p>
        <p class="product-card-price">${product.price.toFixed(2)} €</p>
      </div>
    `).join('');
  }

  filterByCategory(categoryId) {
    // Update active state
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    event?.target?.classList.add('active');

    this.renderProducts(categoryId);
  }

  searchProducts(query) {
    const productsList = document.getElementById('productsList');
    if (!productsList) return;

    if (!query.trim()) {
      this.renderProducts();
      return;
    }

    const filtered = this.products.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.barcode && p.barcode.includes(query)) ||
      p.description?.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
      productsList.innerHTML = '<p class="col-span-full text-gray-400 text-center py-8">Aucun produit trouvé</p>';
      return;
    }

    productsList.innerHTML = filtered.map(product => `
      <div class="product-card" onclick="app.addToCart('${product.id}')">
        ${product.image_url 
          ? `<img src="${product.image_url}" alt="${product.name}" class="product-card-img">` 
          : `<div class="w-full aspect-square bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg mb-1.5 flex items-center justify-center text-2xl">📦</div>`
        }
        <p class="product-card-name">${product.name}</p>
        <p class="product-card-price">${product.price.toFixed(2)} €</p>
      </div>
    `).join('');
  }

  filterProducts(query) {
    const table = document.getElementById('productsTable');
    if (!table) return;

    let filtered = this.products;
    if (query) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query.toLowerCase())
      );
    }

    if (filtered.length === 0) {
      table.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-400">Aucun produit</td></tr>';
      return;
    }

    table.innerHTML = filtered.map(product => `
      <tr>
        <td class="px-3 py-2">
          <div class="flex items-center gap-2">
            ${product.image_url 
              ? `<img src="${product.image_url}" alt="${product.name}" class="w-8 h-8 rounded-lg object-cover">` 
              : `<div class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-sm">📦</div>`
            }
            <span class="font-medium">${product.name}</span>
          </div>
        </td>
        <td class="px-3 py-2 hidden sm:table-cell text-gray-500">${this.categories.find(c => c.id === product.category_id)?.name || '-'}</td>
        <td class="px-3 py-2 text-right font-semibold text-indigo-600">${product.price.toFixed(2)} €</td>
        <td class="px-3 py-2 text-center hidden md:table-cell">
          <span class="badge ${product.stock > 10 ? 'bg-green-100 text-green-700' : product.stock > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${product.stock || 0}</span>
        </td>
        <td class="px-3 py-2 text-center">
          <button onclick="app.openProductDialog('${product.id}')" class="action-btn action-btn-edit">✏️</button>
          <button onclick="app.deleteProduct('${product.id}')" class="action-btn action-btn-delete">🗑️</button>
        </td>
      </tr>
    `).join('');
  }

  async loadDashboard() {
    const modules         = this.licenceStatus?.modules || [];
    // fail open si licence non chargée (licenceStatus null)
    const hasHistorique   = !this.licenceStatus || modules.includes('historique');
    const hasStatistiques = !this.licenceStatus || modules.includes('statistiques');

    try {
      if (hasHistorique) {
        const today    = new Date().toISOString().split('T')[0];
        const response = await this.apiFetch(`${API_URL}/transactions/summary/daily?date=${today}`);
        const summary  = await response.json();

        document.getElementById('dailySales').textContent        = ((summary && summary.total_amount)     || 0).toFixed(2) + ' €';
        document.getElementById('dailyTransactions').textContent = (summary && summary.transaction_count) || 0;
        document.getElementById('dailyTax').textContent          = ((summary && summary.total_tax)        || 0).toFixed(2) + ' €';
        document.getElementById('dailyDiscount').textContent     = ((summary && summary.total_discount)   || 0).toFixed(2) + ' €';

        await this.loadRecentTransactions();
      } else {
        const recentContainer = document.getElementById('recentTransactions');
        if (recentContainer) recentContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Module Historique non activé</p>';
      }

      if (hasStatistiques) {
        await this.loadPaymentMethodsChart();
      } else {
        const chartContainer = document.getElementById('paymentMethodsChart');
        if (chartContainer) chartContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Module Statistiques non activé</p>';
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  }

  // Charger la répartition des moyens de paiement pour le dashboard
  async loadPaymentMethodsChart() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await this.apiFetch(`${API_URL}/reports/payments?start_date=${today}&end_date=${today}`);
      const data = await response.json();
      const paymentData = Array.isArray(data) ? data : [];

      const container = document.getElementById('paymentMethodsChart');
      if (!container) return;

      if (paymentData.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Aucune donnée</p>';
        return;
      }

      const total = paymentData.reduce((sum, p) => sum + (p.total || 0), 0);

      const paymentIcons = {
        'cash': '💵',
        'card': '💳'
      };

      const paymentLabels = {
        'cash': 'Espèces',
        'card': 'Carte'
      };

      container.innerHTML = `
        <div class="space-y-3">
          ${paymentData.map(payment => {
            const percentage = total > 0 ? (payment.total / total * 100) : 0;
            return `
              <div class="space-y-1">
                <div class="flex items-center justify-between text-sm">
                  <span class="flex items-center gap-2">
                    <span class="text-lg">${paymentIcons[payment.payment_method] || '💰'}</span>
                    <span class="font-medium text-gray-700">${paymentLabels[payment.payment_method] || payment.payment_method}</span>
                  </span>
                  <span class="font-bold text-indigo-600">${(payment.total || 0).toFixed(2)} €</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500 ${payment.payment_method === 'cash' ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-blue-400 to-blue-600'}"
                       style="width: ${percentage}%"></div>
                </div>
                <div class="flex items-center justify-between text-xs text-gray-500">
                  <span>${payment.count || 0} transaction(s)</span>
                  <span>${percentage.toFixed(1)}%</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (error) {
      console.error('Error loading payment methods chart:', error);
    }
  }

  async loadRecentTransactions() {
    try {
      const response = await this.apiFetch(`${API_URL}/transactions?limit=5`);
      const data = await response.json();
      const transactions = Array.isArray(data) ? data : [];

      const container = document.getElementById('recentTransactions');
      if (!container) return;

      if (transactions.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4">Aucune transaction</p>';
        return;
      }

      container.innerHTML = transactions.map(t => `
        <div class="transaction-item">
          <div>
            <p class="font-semibold text-sm text-gray-800">${t.receipt_number}</p>
            <p class="text-xs text-gray-500">${new Date(t.transaction_date).toLocaleString('fr-FR')}</p>
          </div>
          <div class="text-right">
            <p class="font-bold text-indigo-600">${t.total.toFixed(2)} €</p>
            <p class="text-xs text-gray-500">${t.payment_method === 'cash' ? '💵' : '💳'} ${t.payment_method}</p>
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error('Error loading recent transactions:', error);
    }
  }

  async loadTransactions() {
    try {
      const startDate = document.getElementById('startDate')?.value;
      const endDate = document.getElementById('endDate')?.value;
      const cashierId = document.getElementById('filterCashier')?.value;

      let url = `${API_URL}/transactions`;
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (cashierId) params.append('user_id', cashierId);
      if (params.toString()) url += '?' + params.toString();

      const response = await this.apiFetch(url);
      const data = await response.json();
      const transactions = Array.isArray(data) ? data : [];

      const table = document.getElementById('transactionsTable');
      if (!table) return;

      if (transactions.length === 0) {
        table.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-400">Aucune transaction</td></tr>';
        // Réinitialiser les stats de caissier
        const cashierStatsEl = document.getElementById('cashierDailyStats');
        if (cashierStatsEl) cashierStatsEl.classList.add('hidden');
        return;
      }

      table.innerHTML = transactions.map(t => `
        <tr class="hover:bg-indigo-50 cursor-pointer" onclick="app.showTransactionDetail('${t.id}')">
          <td class="px-3 py-2">
            <p class="font-medium text-gray-800">${new Date(t.transaction_date).toLocaleDateString('fr-FR')}</p>
            <p class="text-xs text-gray-500">${new Date(t.transaction_date).toLocaleTimeString('fr-FR')}</p>
          </td>
          <td class="px-3 py-2 hidden sm:table-cell">
            <span class="text-gray-600 font-mono text-xs">${t.receipt_number}</span>
          </td>
          <td class="px-3 py-2 hidden lg:table-cell">
            <div class="flex items-center gap-2">
              <div class="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                ${(t.cashier_name || 'U').charAt(0).toUpperCase()}
              </div>
              <span class="text-sm text-gray-700">${t.cashier_name || 'Inconnu'}</span>
            </div>
          </td>
          <td class="px-3 py-2 text-right font-bold text-indigo-600">${t.total.toFixed(2)} €</td>
          <td class="px-3 py-2 text-center hidden md:table-cell">
            <span class="badge ${t.payment_method === 'cash' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">
              ${t.payment_method === 'cash' ? '💵 Espèces' : '💳 Carte'}
            </span>
          </td>
          <td class="px-3 py-2 text-center">
            <button onclick="event.stopPropagation(); app.viewReceipt('${t.id}')" class="action-btn action-btn-edit" title="Voir le reçu">🧾</button>
          </td>
        </tr>
      `).join('');

      // Calculer et afficher les statistiques du caissier si filtré
      if (cashierId) {
        await this.loadCashierDailyStats(cashierId, startDate, endDate, transactions);
      } else {
        const cashierStatsEl = document.getElementById('cashierDailyStats');
        if (cashierStatsEl) cashierStatsEl.classList.add('hidden');
      }

      // Charger les statistiques par période
      await this.loadPeriodStats();

      // Charger la liste des caissiers pour le filtre
      await this.loadCashiersFilter();
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  }


  // Charger les statistiques journalières d'un caissier
  async loadCashierDailyStats(cashierId, startDate, endDate, transactions) {
    const cashierStatsEl = document.getElementById('cashierDailyStats');
    if (!cashierStatsEl) return;

    // Calculer les stats à partir des transactions déjà chargées
    const totalSales = transactions.reduce((sum, t) => sum + (t.total || 0), 0);
    const totalTransactions = transactions.length;
    const totalTax = transactions.reduce((sum, t) => sum + (t.tax || 0), 0);
    const totalDiscount = transactions.reduce((sum, t) => sum + (t.discount || 0), 0);

    // Récupérer le nom du caissier
    const cashierName = transactions.length > 0 ? transactions[0].cashier_name : 'Caissier';

    // Grouper par jour
    const dailyStats = {};
    transactions.forEach(t => {
      const day = new Date(t.transaction_date).toLocaleDateString('fr-FR');
      if (!dailyStats[day]) {
        dailyStats[day] = {
          date: day,
          count: 0,
          total: 0,
          tax: 0,
          discount: 0
        };
      }
      dailyStats[day].count++;
      dailyStats[day].total += t.total || 0;
      dailyStats[day].tax += t.tax || 0;
      dailyStats[day].discount += t.discount || 0;
    });

    const sortedDays = Object.values(dailyStats).sort((a, b) => {
      const dateA = a.date.split('/').reverse().join('-');
      const dateB = b.date.split('/').reverse().join('-');
      return dateB.localeCompare(dateA);
    });

    cashierStatsEl.classList.remove('hidden');
    cashierStatsEl.innerHTML = `
      <div class="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl shadow-lg p-6 mb-4">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          <span>👤</span>
          <span>Statistiques de ${cashierName}</span>
        </h3>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white/10 backdrop-blur rounded-lg p-3">
            <p class="text-xs opacity-80 mb-1">Ventes totales</p>
            <p class="text-2xl font-bold">${totalSales.toFixed(2)} €</p>
          </div>
          <div class="bg-white/10 backdrop-blur rounded-lg p-3">
            <p class="text-xs opacity-80 mb-1">Transactions</p>
            <p class="text-2xl font-bold">${totalTransactions}</p>
          </div>
          <div class="bg-white/10 backdrop-blur rounded-lg p-3">
            <p class="text-xs opacity-80 mb-1">TVA collectée</p>
            <p class="text-2xl font-bold">${totalTax.toFixed(2)} €</p>
          </div>
          <div class="bg-white/10 backdrop-blur rounded-lg p-3">
            <p class="text-xs opacity-80 mb-1">Remises</p>
            <p class="text-2xl font-bold">${totalDiscount.toFixed(2)} €</p>
          </div>
        </div>

        ${sortedDays.length > 0 ? `
          <div class="mt-6">
            <h4 class="text-sm font-semibold mb-3 opacity-90">📊 Détail par jour</h4>
            <div class="space-y-2 max-h-60 overflow-y-auto">
              ${sortedDays.map(day => `
                <div class="bg-white/10 backdrop-blur rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p class="font-semibold">${day.date}</p>
                    <p class="text-xs opacity-80">${day.count} transaction(s)</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-lg">${day.total.toFixed(2)} €</p>
                    <p class="text-xs opacity-80">TVA: ${day.tax.toFixed(2)} € | Remise: ${day.discount.toFixed(2)} €</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Charger la liste des caissiers pour le filtre
  async loadCashiersFilter() {
    try {
      const filterSelect = document.getElementById('filterCashier');
      if (!filterSelect) return;

      const response = await this.apiFetch(`${API_URL}/users`);
      const users = await response.json();

      const currentValue = filterSelect.value;
      filterSelect.innerHTML = `
        <option value="">Tous les caissiers</option>
        ${users.map(user => `
          <option value="${user.id}" ${currentValue === user.id ? 'selected' : ''}>
            ${user.username} (${user.role})
          </option>
        `).join('')}
      `;
    } catch (error) {
      console.error('Error loading cashiers filter:', error);
    }
  }

  // Charger les statistiques par période
  async loadPeriodStats() {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // Lundi de la semaine courante (getDay() : 0=dim, 1=lun … 6=sam)
      // (getDay() || 7) → dimanche devient 7, donc lundi = date - 6
      const weekStart = new Date(today);
      const dayOfWeek = today.getDay() || 7; // 1=lun … 7=dim
      weekStart.setDate(today.getDate() - dayOfWeek + 1);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      console.log(`[PeriodStats] Semaine : ${weekStartStr} → ${todayStr}`);

      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = monthStart.toISOString().split('T')[0];

      const yearStart = new Date(today.getFullYear(), 0, 1);
      const yearStartStr = yearStart.toISOString().split('T')[0];

      const [todayRes, weekRes, monthRes, yearRes] = await Promise.all([
        this.apiFetch(`${API_URL}/transactions/summary/period?start=${todayStr}&end=${todayStr}`),
        this.apiFetch(`${API_URL}/transactions/summary/period?start=${weekStartStr}&end=${todayStr}`),
        this.apiFetch(`${API_URL}/transactions/summary/period?start=${monthStartStr}&end=${todayStr}`),
        this.apiFetch(`${API_URL}/transactions/summary/period?start=${yearStartStr}&end=${todayStr}`)
      ]);

      const [todayData, weekData, monthData, yearData] = await Promise.all([
        todayRes.json(), weekRes.json(), monthRes.json(), yearRes.json()
      ]);

      const statToday = document.getElementById('statToday');
      const statWeek = document.getElementById('statWeek');
      const statMonth = document.getElementById('statMonth');
      const statYear = document.getElementById('statYear');

      if (statToday) statToday.textContent = (todayData.total || 0).toFixed(2) + ' €';
      if (statWeek) statWeek.textContent = (weekData.total || 0).toFixed(2) + ' €';
      if (statMonth) statMonth.textContent = (monthData.total || 0).toFixed(2) + ' €';
      if (statYear) statYear.textContent = (yearData.total || 0).toFixed(2) + ' €';
    } catch (error) {
      console.error('Error loading period stats:', error);
    }
  }


  // Afficher le détail d'une transaction
  async showTransactionDetail(transactionId) {
    try {
      const response = await this.apiFetch(`${API_URL}/transactions/${transactionId}`);
      const t = await response.json();

      const items = typeof t.items === 'string' ? JSON.parse(t.items) : t.items;

      const content = document.getElementById('transactionDetailContent');
      content.innerHTML = `
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div class="bg-gray-50 p-3 rounded-xl">
            <p class="text-xs text-gray-500">N° Reçu</p>
            <p class="font-bold text-gray-800">${t.receipt_number}</p>
          </div>
          <div class="bg-gray-50 p-3 rounded-xl">
            <p class="text-xs text-gray-500">Date & Heure</p>
            <p class="font-bold text-gray-800">${new Date(t.transaction_date).toLocaleString('fr-FR')}</p>
          </div>
          <div class="bg-indigo-50 p-3 rounded-xl">
            <p class="text-xs text-indigo-600">Caissier</p>
            <div class="flex items-center gap-2 mt-1">
              <div class="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
                ${(t.cashier_name || 'U').charAt(0).toUpperCase()}
              </div>
              <span class="font-bold text-indigo-700">${t.cashier_name || 'Inconnu'}</span>
            </div>
          </div>
          <div class="bg-green-50 p-3 rounded-xl">
            <p class="text-xs text-green-600">Paiement</p>
            <p class="font-bold text-green-700">${t.payment_method === 'cash' ? '💵 Espèces' : '💳 Carte'}</p>
          </div>
        </div>
        
        <div class="border border-gray-200 rounded-xl overflow-hidden mb-4">
          <div class="bg-gray-50 px-3 py-2 border-b border-gray-200">
            <p class="font-semibold text-gray-700 text-sm">Articles (${items.length})</p>
          </div>
          <div class="divide-y divide-gray-100 max-h-48 overflow-y-auto">
            ${items.map(item => `
              <div class="flex items-center justify-between px-3 py-2">
                <div>
                  <p class="font-medium text-gray-800">${item.name}</p>
                  <p class="text-xs text-gray-500">${item.quantity} × ${item.price.toFixed(2)} €</p>
                </div>
                <p class="font-bold text-indigo-600">${item.total.toFixed(2)} €</p>
              </div>
            `).join('')}
          </div>
        </div>
        
        <div class="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-4 rounded-xl">
          <div class="flex justify-between text-sm opacity-90 mb-1">
            <span>Sous-total HT</span>
            <span>${t.subtotal.toFixed(2)} €</span>
          </div>
          <div class="flex justify-between text-sm opacity-90 mb-1">
            <span>TVA (20%)</span>
            <span>${t.tax.toFixed(2)} €</span>
          </div>
          ${t.discount > 0 ? `
            <div class="flex justify-between text-sm opacity-90 mb-1">
              <span>Remise</span>
              <span>-${t.discount.toFixed(2)} €</span>
            </div>
          ` : ''}
          <div class="flex justify-between font-bold text-lg pt-2 border-t border-white/30 mt-2">
            <span>TOTAL</span>
            <span>${t.total.toFixed(2)} €</span>
          </div>
          ${t.change > 0 ? `
            <div class="flex justify-between text-sm opacity-90 mt-2">
              <span>Rendu</span>
              <span>${t.change.toFixed(2)} €</span>
            </div>
          ` : ''}
        </div>
      `;

      this.currentTransactionId = transactionId;
      this.openModal('transactionDetailModal');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  // Imprimer le reçu de la transaction actuelle
  async printTransactionReceipt() {
    if (this.currentTransactionId) {
      await this.viewReceipt(this.currentTransactionId);
    }
  }

  // Exporter un rapport par période
  async exportReport(period) {
    try {
      const today = new Date();
      let startDate, endDate = today.toISOString().split('T')[0];
      let periodName;

      switch(period) {
        case 'week':
          const weekStart = new Date(today);
          const dow = today.getDay() || 7;
          weekStart.setDate(today.getDate() - dow + 1);
          startDate = weekStart.toISOString().split('T')[0];
          periodName = 'Semaine';
          break;
        case 'month':
          startDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
          periodName = 'Mois';
          break;
        case 'year':
          startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
          periodName = 'Année';
          break;
        default:
          return;
      }

      // Récupérer les transactions
      const response = await this.apiFetch(`${API_URL}/transactions?start_date=${startDate}&end_date=${endDate}`);
      const transactions = await response.json();

      // Récupérer les stats
      const statsRes = await this.apiFetch(`${API_URL}/transactions/summary/period?start=${startDate}&end=${endDate}`);
      const stats = await statsRes.json();

      // Générer le rapport
      const report = {
        periode: periodName,
        dateDebut: startDate,
        dateFin: endDate,
        genere: new Date().toISOString(),
        resume: {
          nombreTransactions: stats.count || 0,
          totalVentes: stats.total || 0,
          totalTVA: stats.tax || 0,
          totalRemises: stats.discount || 0,
          ventesEspeces: stats.cash_total || 0,
          ventesCarte: stats.card_total || 0
        },
        transactions: transactions.map(t => ({
          date: t.transaction_date,
          numero: t.receipt_number,
          caissier: t.cashier_name,
          total: t.total,
          paiement: t.payment_method
        }))
      };

      // Télécharger le rapport
      const dataStr = JSON.stringify(report, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rapport-${period}-${startDate}.json`;
      link.click();

      this.toastSuccess(`Rapport ${periodName} exporté !`);
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  // ===== DIALOGS & MODALS =====
  showSection(section) {
    // Vérifier les permissions
    const navBtn = document.querySelector(`.nav-tab[data-section="${section}"]`);
    if (navBtn) {
      const allowedRoles = (navBtn.getAttribute('data-role') || '').split(',').map(r => r.trim());
      const userRole = this.currentUser?.role || 'cashier';

      if (!allowedRoles.includes(userRole)) {
        console.warn(`❌ Accès refusé: ${userRole} ne peut pas accéder à ${section}`);
        this.toastError('Vous n\'avez pas accès à cette section');
        return;
      }
    }

    // Cacher toutes les sections
    document.querySelectorAll('[id$="-section"]').forEach(s => s.classList.add('hidden'));

    // Afficher la section sélectionnée
    const targetSection = document.getElementById(section + '-section');
    if (targetSection) {
      targetSection.classList.remove('hidden');
    }

    // Mettre à jour les onglets actifs
    document.querySelectorAll('.nav-tab').forEach(item => item.classList.remove('active'));
    document.querySelector(`.nav-tab[data-section="${section}"]`)?.classList.add('active');

    document.querySelectorAll('.mobile-nav-item').forEach(item => item.classList.remove('active'));
    document.querySelector(`.mobile-nav-item[data-section="${section}"]`)?.classList.add('active');

    this.currentSection = section;

    // Actions spécifiques par section
    if (section === 'dashboard') this.loadDashboard();
    if (section === 'orders') this.loadOrders();
    if (section === 'kitchen') this.loadKitchenOrders();
    if (section === 'products') this.filterProducts('');
    if (section === 'history') this.loadTransactions();
    if (section === 'settings') {
      this.loadUsers();
      this.loadSettingsData();
    }
    if (section === 'admin') this.loadAdminPanel();
  }

  openProductDialog(productId = null) {
    document.getElementById('productId').value = productId || '';

    // Reset image preview
    const preview = document.getElementById('productImagePreview');
    if (preview) preview.innerHTML = '📦';
    document.getElementById('productImageData').value = '';

    if (productId) {
      const product = this.products.find(p => p.id === productId);
      if (product) {
        document.getElementById('productName').value = product.name;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productCategory').value = product.category_id;
        document.getElementById('productPrice').value = product.price;
        document.getElementById('productCost').value = product.cost || '';
        document.getElementById('productTax').value = product.tax_rate || 20;
        document.getElementById('productBarcode').value = product.barcode || '';
        document.getElementById('productStock').value = product.stock || 0;

        // Show existing image
        if (product.image_url) {
          preview.innerHTML = `<img src="${product.image_url}" alt="${product.name}" class="w-full h-full object-cover rounded-xl">`;
          document.getElementById('productImageData').value = product.image_url;
        }
      }
    } else {
      document.getElementById('productName').value = '';
      document.getElementById('productDescription').value = '';
      document.getElementById('productPrice').value = '';
      document.getElementById('productCost').value = '';
      document.getElementById('productTax').value = '20';
      document.getElementById('productBarcode').value = '';
      document.getElementById('productStock').value = '';
    }

    const select = document.getElementById('productCategory');
    select.innerHTML = '<option value="">Sélectionner une catégorie</option>' +
      this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    if (productId) {
      const product = this.products.find(p => p.id === productId);
      if (product) select.value = product.category_id;
    }

    this.openModal('productModal');
  }

  // Prévisualisation de l'image du produit
  previewProductImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.toastWarning('Veuillez sélectionner une image');
      return;
    }

    // Limite de taille: 2MB
    if (file.size > 2 * 1024 * 1024) {
      this.toastWarning('L\'image est trop volumineuse (max 2MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = document.getElementById('productImagePreview');
      preview.innerHTML = `<img src="${e.target.result}" alt="Aperçu produit" class="w-full h-full object-cover rounded-xl">`;
      document.getElementById('productImageData').value = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  async saveProduct(event) {
    event.preventDefault();
    const productId = document.getElementById('productId').value;
    const data = {
      name: document.getElementById('productName').value,
      description: document.getElementById('productDescription').value,
      category_id: document.getElementById('productCategory').value,
      price: parseFloat(document.getElementById('productPrice').value),
      cost: parseFloat(document.getElementById('productCost').value) || null,
      tax_rate: parseFloat(document.getElementById('productTax').value),
      barcode: document.getElementById('productBarcode').value,
      stock: parseInt(document.getElementById('productStock').value) || 0,
      image_url: document.getElementById('productImageData').value || null
    };

    try {
      const url = productId ? `${API_URL}/products/${productId}` : `${API_URL}/products`;
      const method = productId ? 'PUT' : 'POST';

      await this.apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      await this.loadProducts();
      this.closeModal('productModal');
      this.toastSuccess('Produit enregistré');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  async deleteProduct(productId) {
    const confirmed = await this.confirmDelete('ce produit');
    if (!confirmed) return;

    try {
      await this.apiFetch(`${API_URL}/products/${productId}`, { method: 'DELETE' });
      await this.loadProducts();
      this.toastSuccess('Produit supprimé');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  openCategoryDialog(categoryId = null) {
    document.getElementById('categoryId').value = categoryId || '';

    if (categoryId) {
      const category = this.categories.find(c => c.id === categoryId);
      if (category) {
        document.getElementById('categoryName').value = category.name;
        document.getElementById('categoryDescription').value = category.description || '';
        document.getElementById('categoryColor').value = category.color || '#6366f1';
      }
    } else {
      document.getElementById('categoryName').value = '';
      document.getElementById('categoryDescription').value = '';
      document.getElementById('categoryColor').value = '#6366f1';
    }

    this.openModal('categoryModal');
  }

  async saveCategory(event) {
    event.preventDefault();
    const categoryId = document.getElementById('categoryId').value;
    const data = {
      name: document.getElementById('categoryName').value,
      description: document.getElementById('categoryDescription').value,
      color: document.getElementById('categoryColor').value
    };

    try {
      const url = categoryId ? `${API_URL}/categories/${categoryId}` : `${API_URL}/categories`;
      const method = categoryId ? 'PUT' : 'POST';

      await this.apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      await this.loadCategories();
      this.closeModal('categoryModal');
      this.toastSuccess('Catégorie enregistrée');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  async deleteCategory(categoryId) {
    const confirmed = await this.confirmDelete('cette catégorie');
    if (!confirmed) return;

    try {
      await this.apiFetch(`${API_URL}/categories/${categoryId}`, { method: 'DELETE' });
      await this.loadCategories();
      this.toastSuccess('Catégorie supprimée');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  openUserDialog(userId = null) {
    document.getElementById('userId').value = userId || '';
    document.getElementById('username').value = '';
    document.getElementById('userEmail').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = '';
    this.openModal('userModal');
  }

  async saveUser(event) {
    event.preventDefault();
    const userId = document.getElementById('userId').value;
    const data = {
      username: document.getElementById('username').value,
      email: document.getElementById('userEmail').value,
      password: document.getElementById('userPassword').value,
      role: document.getElementById('userRole').value
    };

    try {
      const url = userId ? `${API_URL}/users/${userId}` : `${API_URL}/users`;
      const method = userId ? 'PUT' : 'POST';

      await this.apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      await this.loadUsers();
      this.closeModal('userModal');
      this.toastSuccess('Utilisateur enregistré');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  async loadUsers() {
    try {
      const response = await this.apiFetch(`${API_URL}/users`);
      const users = await response.json();

      const container = document.getElementById('usersTable');
      if (!container) return;

      if (users.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Aucun utilisateur</p>';
        return;
      }

      container.innerHTML = users.map(user => `
        <div class="user-card">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
              ${user.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <p class="font-semibold text-gray-800">${user.username}</p>
              <p class="text-xs text-gray-500">${user.email || 'Pas d\'email'}</p>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <span class="badge badge-${user.role}">${user.role}</span>
            <button onclick="app.deleteUser('${user.id}')" class="action-btn action-btn-delete">🗑️</button>
          </div>
        </div>
      `).join('');
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async deleteUser(userId) {
    const confirmed = await this.confirmDelete('cet utilisateur');
    if (!confirmed) return;

    try {
      await this.apiFetch(`${API_URL}/users/${userId}`, { method: 'DELETE' });
      await this.loadUsers();
      this.toastSuccess('Utilisateur supprimé');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  openDiscountDialog() {
    document.getElementById('discountAmount').value = '';
    document.getElementById('discountPercent').value = '';
    document.getElementById('discountReason').value = '';
    this.openModal('discountModal');
  }

  applyDiscount() {
    const amount = parseFloat(document.getElementById('discountAmount').value || 0);
    const percent = parseFloat(document.getElementById('discountPercent').value || 0);

    if (amount > 0) {
      this.currentDiscount = amount;
    } else if (percent > 0) {
      const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      this.currentDiscount = subtotal * (percent / 100);
    }

    this.updateTotals();
    this.closeModal('discountModal');
  }

  // Bug 2 — supprime la remise en cours
  removeDiscount() {
    this.currentDiscount = 0;
    this.updateTotals();
    this.toastInfo('Remise supprimée');
  }

  openCalculator() {
    this.calculator = { value: '0', operation: null, operand: null };
    document.getElementById('calcDisplay').value = '0';
    this.openModal('calculatorModal');
  }

  calcInput(digit) {
    const display = document.getElementById('calcDisplay');
    if (this.calculator.value === '0' && digit !== '.') {
      this.calculator.value = digit;
    } else if (digit === '.' && !this.calculator.value.includes('.')) {
      this.calculator.value += digit;
    } else if ('+-*/'.includes(digit)) {
      this.calculator.operand = parseFloat(this.calculator.value);
      this.calculator.operation = digit;
      this.calculator.value = '';
    } else {
      this.calculator.value += digit;
    }
    display.value = this.calculator.value || '0';
  }

  calcClear() {
    this.calculator = { value: '0', operation: null, operand: null };
    document.getElementById('calcDisplay').value = '0';
  }

  calcEqual() {
    if (this.calculator.operation && this.calculator.operand !== null) {
      const current = parseFloat(this.calculator.value);
      let result = this.calculator.operand;

      switch (this.calculator.operation) {
        case '+': result += current; break;
        case '-': result -= current; break;
        case '*': result *= current; break;
        case '/': result /= current; break;
      }

      this.calculator.value = result.toString();
      document.getElementById('calcDisplay').value = result;
      this.calculator.operation = null;
    }
  }

  // ===== PAYMENT & RECEIPT =====
  async processPayment() {
    const selectedMethod = document.querySelector('.payment-method.active');
    if (!selectedMethod) {
      this.toastWarning('Veuillez sélectionner un moyen de paiement');
      return;
    }

    if (this.cart.length === 0) {
      this.toastWarning('Le panier est vide');
      return;
    }

    const paymentMethod = selectedMethod.dataset.method;
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.20;
    const discount = this.currentDiscount;
    const total = subtotal + tax - discount;
    const change = paymentMethod === 'cash'
      ? parseFloat(document.getElementById('amountReceived')?.value || 0) - total
      : 0;

    if (paymentMethod === 'cash' && change < 0) {
      this.toastWarning('Montant insuffisant');
      return;
    }

    const transaction = {
      items: this.cart.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      })),
      subtotal: parseFloat(subtotal.toFixed(2)),
      tax: parseFloat(tax.toFixed(2)),
      discount: parseFloat(discount.toFixed(2)),
      total: parseFloat(total.toFixed(2)),
      payment_method: paymentMethod,
      change: parseFloat(change.toFixed(2))
    };

    try {
      const response = await this.apiFetch(`${API_URL}/transactions`, {
        method: 'POST',
        body: JSON.stringify(transaction)
      });

      const result = await response.json();
      this.showReceipt(result);
      this.cart = [];
      this.currentDiscount = 0;
      document.getElementById('amountReceived').value = '';
      this.updateCartDisplay();
      await this.loadDashboard();
      this.toastSuccess('Paiement effectué avec succès !');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  showReceipt(transaction) {
    const receiptContent = document.getElementById('receiptContent');
    const companyName = this.settings.company_name || 'Co-Caisse';
    const companyAddress = this.settings.company_address || '';
    const companyPhone = this.settings.company_phone || '';

    const items = typeof transaction.items === 'string' ? JSON.parse(transaction.items) : transaction.items;
    const transactionDate = new Date(transaction.transaction_date);

    const paymentMethods = {
      'cash': 'ESPÈCES',
      'card': 'CARTE BANCAIRE'
    };

    const centerText = (text, width = 36) => {
      const padding = Math.max(0, width - text.length);
      return ' '.repeat(Math.floor(padding / 2)) + text;
    };

    const separator = '════════════════════════════════════';
    const dash = '────────────────────────────────────';

    let receipt = `
${centerText(companyName.toUpperCase())}
${companyAddress ? centerText(companyAddress) : ''}
${companyPhone ? centerText('Tél: ' + companyPhone) : ''}

${dash}
${centerText('REÇU DE CAISSE')}
${dash}

Date: ${transactionDate.toLocaleDateString('fr-FR')}
Heure: ${transactionDate.toLocaleTimeString('fr-FR')}
N°: ${transaction.receipt_number}

${separator}

`;

    items.forEach(item => {
      receipt += `${item.name}\n`;
      receipt += `  ${item.quantity} x ${item.price.toFixed(2)}€ = ${item.total.toFixed(2)}€\n`;
    });

    receipt += `
${dash}

Sous-total HT:        ${transaction.subtotal.toFixed(2)}€
TVA (20%):            ${transaction.tax.toFixed(2)}€`;

    if (transaction.discount > 0) {
      receipt += `\nRemise:              -${transaction.discount.toFixed(2)}€`;
    }

    receipt += `

${separator}
TOTAL:                ${transaction.total.toFixed(2)}€
${separator}

Paiement: ${paymentMethods[transaction.payment_method] || transaction.payment_method}`;

    if (transaction.change > 0) {
      receipt += `\nRendu:                ${transaction.change.toFixed(2)}€`;
    }

    receipt += `

${dash}
${centerText(this.settings.receipt_footer || 'Merci de votre visite !')}
${dash}
`;

    receiptContent.textContent = receipt;
    this.openModal('receiptModal');
  }

  printReceipt() {
    const content = document.getElementById('receiptContent').textContent;

    if (window.electron) {
      window.electron.printTicket(`<pre style="font-family: monospace; font-size: 10pt;">${content}</pre>`);
    } else {
      const printWindow = window.open('', '', 'height=600,width=400');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Reçu</title>
          <style>
            body { font-family: 'Courier New', monospace; margin: 10px; font-size: 11pt; }
            pre { white-space: pre-wrap; margin: 0; }
          </style>
        </head>
        <body>
          <pre>${content}</pre>
          <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  }

  async viewReceipt(transactionId) {
    try {
      const response = await this.apiFetch(`${API_URL}/transactions/${transactionId}`);
      const transaction = await response.json();
      this.showReceipt(transaction);
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  // ===== SETTINGS =====
  async saveSettings() {
    try {
      const settings = {
        company_name: document.getElementById('companyName')?.value,
        company_address: document.getElementById('companyAddress')?.value,
        company_phone: document.getElementById('companyPhone')?.value,
        company_email: document.getElementById('companyEmail')?.value,
        tax_number: document.getElementById('taxNumber')?.value,
        default_tax_rate: parseFloat(document.getElementById('defaultTaxRate')?.value) || 20,
        receipt_header: document.getElementById('receiptHeader')?.value,
        receipt_footer: document.getElementById('receiptFooter')?.value,
        alert_enabled: document.getElementById('alertEnabled')?.checked ? 1 : 0,
        alert_sound_enabled: document.getElementById('alertSoundEnabled')?.checked ? 1 : 0,
        alert_draft_minutes: parseInt(document.getElementById('alertDraftMinutes')?.value) || 15,
        alert_kitchen_minutes: parseInt(document.getElementById('alertKitchenMinutes')?.value) || 20,
        alert_ready_minutes: parseInt(document.getElementById('alertReadyMinutes')?.value) || 5,
        alert_served_minutes: parseInt(document.getElementById('alertServedMinutes')?.value) || 30,
        alert_remind_after_dismiss: parseInt(document.getElementById('alertRemindAfterDismiss')?.value) || 10
      };

      // Sauvegarder dans l'API
      const response = await this.apiFetch(`${API_URL}/settings`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
        body: JSON.stringify(settings)
      });

      if (!response.ok) throw new Error('Erreur lors de la sauvegarde');

      this.settings = settings;
      localStorage.setItem('cocaisse_settings', JSON.stringify(settings));
      this.toastSuccess('Paramètres enregistrés');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.toastError('Erreur: ' + error.message);
    }
  }

  async loadSettingsData() {
    try {
      const response = await this.apiFetch(`${API_URL}/settings`, {
        headers: this.getAuthHeaders()
      });
      const settings = await response.json();

      if (settings) {
        this.settings = settings;

        // Remplir les champs du formulaire
        if (document.getElementById('companyName')) {
          document.getElementById('companyName').value = settings.company_name || '';
          document.getElementById('companyAddress').value = settings.company_address || '';
          document.getElementById('companyPhone').value = settings.company_phone || '';
          document.getElementById('companyEmail').value = settings.company_email || '';
          document.getElementById('taxNumber').value = settings.tax_number || '';
          document.getElementById('defaultTaxRate').value = settings.default_tax_rate || 20;
          document.getElementById('receiptHeader').value = settings.receipt_header || '';
          document.getElementById('receiptFooter').value = settings.receipt_footer || '';

          // Paramètres d'alerte
          document.getElementById('alertEnabled').checked = settings.alert_enabled === 1;
          document.getElementById('alertSoundEnabled').checked = settings.alert_sound_enabled === 1;
          document.getElementById('alertDraftMinutes').value = settings.alert_draft_minutes || 15;
          document.getElementById('alertKitchenMinutes').value = settings.alert_kitchen_minutes || 20;
          document.getElementById('alertReadyMinutes').value = settings.alert_ready_minutes || 5;
          document.getElementById('alertServedMinutes').value = settings.alert_served_minutes || 30;
          document.getElementById('alertRemindAfterDismiss').value = settings.alert_remind_after_dismiss || 10;
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  }

  // ===== DATA EXPORT/IMPORT =====
  async dataExport() {
    try {
      const allData = {
        categories: this.categories,
        products: this.products,
        settings: this.settings,
        exportedAt: new Date().toISOString()
      };

      if (window.electron) {
        const result = await window.electron.exportData(allData);
        if (result.success) {
          this.toastSuccess(`Données exportées: ${result.path}`);
        }
      } else {
        const dataStr = JSON.stringify(allData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cocaisse-export-${Date.now()}.json`;
        link.click();
        this.toastSuccess('Données exportées');
      }
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  // ===== UTILITIES =====
  openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    // Garantit le z-order au-dessus de tout
    if (modal.parentElement !== document.body) document.body.appendChild(modal);
    // Reforce l'animation pour qu'elle démarre immédiatement
    const content = modal.querySelector('.modal-content');
    if (content) {
      content.style.animation = 'none';
      void content.offsetHeight;
      content.style.animation = '';
    }
    modal.classList.remove('hidden');
  }

  closeModal(id) {
    document.getElementById(id)?.classList.add('hidden');
  }

  updateClock() {
    const el = document.getElementById('currentTime');
    if (el) {
      el.textContent = new Date().toLocaleTimeString('fr-FR');
    }
  }

  // ===== TOAST NOTIFICATIONS =====
  toast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const titles = {
      success: 'Succès',
      error: 'Erreur',
      warning: 'Attention',
      info: 'Information'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <div class="toast-content">
        <p class="toast-title">${titles[type] || titles.info}</p>
        <p class="toast-message">${message}</p>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    `;

    container.appendChild(toast);

    // Auto-remove après duration
    if (duration > 0) {
      setTimeout(() => {
        toast.classList.add('toast-exit');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    return toast;
  }

  // Raccourcis pour les différents types de toast
  toastSuccess(message, duration = 3000) {
    return this.toast(message, 'success', duration);
  }

  toastError(message, duration = 4000) {
    return this.toast(message, 'error', duration);
  }

  toastWarning(message, duration = 3500) {
    return this.toast(message, 'warning', duration);
  }

  toastInfo(message, duration = 3000) {
    return this.toast(message, 'info', duration);
  }

  // ===== CONFIRM DIALOG =====
  confirm(message, options = {}) {
    return new Promise((resolve) => {
      const dialog = document.getElementById('confirmDialog');
      const titleEl = document.getElementById('confirmTitle');
      const messageEl = document.getElementById('confirmMessage');
      const iconEl = document.getElementById('confirmIcon');
      const okBtn = document.getElementById('confirmOk');
      const cancelBtn = document.getElementById('confirmCancel');

      const {
        title = 'Confirmation',
        icon = '⚠️',
        type = 'warning', // warning, danger, info, success
        confirmText = 'Confirmer',
        cancelText = 'Annuler',
        confirmClass = ''
      } = options;

      // Configuration du dialogue
      titleEl.textContent = title;
      messageEl.textContent = message;
      iconEl.textContent = icon;
      iconEl.className = `w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-3xl confirm-icon-${type}`;
      okBtn.textContent = confirmText;
      cancelBtn.textContent = cancelText;

      // Classe du bouton de confirmation
      okBtn.className = `flex-1 py-2.5 text-white rounded-xl font-medium transition ${
        type === 'danger' ? 'bg-red-500 hover:bg-red-600' : 
        type === 'success' ? 'bg-green-500 hover:bg-green-600' : 
        'bg-indigo-500 hover:bg-indigo-600'
      } ${confirmClass}`;

      // Handlers
      const handleConfirm = () => {
        cleanup();
        resolve(true);
      };

      const handleCancel = () => {
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        okBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        dialog.classList.add('hidden');
      };

      okBtn.addEventListener('click', handleConfirm);
      cancelBtn.addEventListener('click', handleCancel);

      // ── Afficher instantanément ───────────────────────────────────────────
      // 1. S'assurer que la modal est appendée au body (z-order garanti)
      if (dialog.parentElement !== document.body) {
        document.body.appendChild(dialog);
      }
      // 2. Force un reflow pour relancer l'animation à chaque ouverture
      const content = dialog.querySelector('.modal-content');
      if (content) {
        content.style.animation = 'none';
        void content.offsetHeight; // reflow
        content.style.animation = '';
      }
      dialog.classList.remove('hidden');
    });
  }

  // Raccourci pour confirmation de suppression
  async confirmDelete(itemName = 'cet élément') {
    return this.confirm(`Êtes-vous sûr de vouloir supprimer ${itemName} ?`, {
      title: 'Supprimer',
      icon: '🗑️',
      type: 'danger',
      confirmText: 'Supprimer',
      cancelText: 'Annuler'
    });
  }

  // Raccourci pour confirmation d'action
  async confirmAction(message, title = 'Confirmation') {
    return this.confirm(message, {
      title,
      icon: '❓',
      type: 'info',
      confirmText: 'Oui',
      cancelText: 'Non'
    });
  }

  async logout() {
    const confirmed = await this.confirm('Êtes-vous sûr de vouloir vous déconnecter ?', {
      title: 'Déconnexion',
      icon: '🚪',
      type: 'warning',
      confirmText: 'Se déconnecter',
      cancelText: 'Rester connecté'
    });

    if (confirmed) {
      // Nettoyer le token JWT
      _jwtToken = null;
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('currentUser');

      this.currentUser = null;
      this.cart = [];
      this.currentDiscount = 0;

      // Arrêter le polling des alertes
      if (this.alertPollingInterval) clearInterval(this.alertPollingInterval);
      if (this.alertDisplayInterval) clearInterval(this.alertDisplayInterval);

      this.showLoginScreen();
      this.toastInfo('Vous avez été déconnecté');
    }
  }
}

// ===== ORDERS MANAGEMENT =====
CocaisseApp.prototype.loadOrders = async function() {
  try {
    const status = this.currentOrderFilter === 'all' ? '' : this.currentOrderFilter;
    const userRole = this.currentUser?.role || 'cashier';

    // Construire l'URL avec les paramètres
    let url = `${API_URL}/orders`;
    const params = new URLSearchParams();

    if (status) {
      params.append('status', status);
    }

    // Si l'utilisateur n'est PAS admin, filtrer par ses propres commandes
    if (userRole !== 'admin' && this.currentUser?.id) {
      params.append('user_id', this.currentUser.id);
    }

    if (params.toString()) {
      url += '?' + params.toString();
    }

    const response = await this.apiFetch(url, {
      headers: this.getAuthHeaders()
    });
    this.orders = await response.json();
    this.renderOrders();
  } catch (error) {
    console.error('Error loading orders:', error);
    this.toastError('Erreur lors du chargement des commandes');
  }
};


CocaisseApp.prototype.renderOrders = function() {
  const container = document.getElementById('ordersList');
  if (!container) return;

  if (this.orders.length === 0) {
    container.innerHTML = '<p class="col-span-full text-gray-400 text-center py-8">Aucune commande</p>';
    return;
  }

  const statusIcons = {
    draft:      '⏳',
    in_kitchen: '🔥',
    ready:      '✨',
    served:     '🍽️',
    paid:       '💰'
  };

  const statusLabels = {
    draft:      'En attente de validation',
    in_kitchen: 'En cuisine',
    ready:      'Prête',
    served:     'Servie',
    paid:       'Payée'
  };

  const typeLabels = {
    dine_in: '🍽️ Sur place',
    takeaway: '📦 À emporter',
    delivery: '🚚 Livraison'
  };

  container.innerHTML = this.orders.map(order => {
    const items = JSON.parse(order.items || '[]');
    const itemsText = items.slice(0, 3).map(item => `${item.name} ×${item.quantity}`).join(', ');
    const moreItems = items.length > 3 ? ` +${items.length - 3} autres` : '';

    // Vérifier si l'utilisateur est admin pour afficher le créateur
    const isAdmin = this.currentUser?.role === 'admin';

    // Trouver si cette commande est en alerte (calculé par _checkAndNotify toutes les 5s)
    const alertData = this.alerts.find(a => a.id === order.id);
    const alertLevel = alertData?.alert_level || null;
    const alertClass = alertLevel === 'critical' ? 'order-card-alert-critical'
                     : alertLevel === 'warning'  ? 'order-card-alert-warning' : '';

    return `
      <div class="order-card ${alertClass}" onclick="app.viewOrderDetail('${order.id}')">
        <div class="order-card-header">
          <div>
            <p class="font-bold text-gray-800">${order.order_number}</p>
            <p class="text-xs text-gray-500">${typeLabels[order.order_type] || order.order_type}</p>
          </div>
          <span class="order-status-badge order-status-${order.status}">
            ${statusIcons[order.status]} ${statusLabels[order.status]}
          </span>
        </div>

        ${alertData ? `
          <div class="mt-2 p-2 rounded-lg ${alertLevel === 'critical' ? 'bg-red-100 border border-red-300' : 'bg-orange-100 border border-orange-300'}">
            <p class="text-xs font-semibold ${alertLevel === 'critical' ? 'text-red-700' : 'text-orange-700'}">
              ${alertLevel === 'critical' ? '🚨' : '⚠️'} En retard de ${alertData.delay_minutes} min
            </p>
          </div>
        ` : ''}

        ${order.table_number ? `
          <p class="text-sm font-medium text-gray-700 mb-2">📍 ${order.table_number}</p>
        ` : ''}

        ${order.customer_name ? `
          <p class="text-xs text-gray-600 mb-2">👤 ${order.customer_name}${order.customer_phone ? ` - ${order.customer_phone}` : ''}</p>
        ` : ''}

        ${isAdmin ? `
          <!-- Créateur de la commande (visible uniquement pour admin) -->
          <div class="flex items-center gap-2 mb-2 bg-indigo-50 p-2 rounded-lg">
            <div class="w-6 h-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
              ${(order.cashier_name || 'U').charAt(0).toUpperCase()}
            </div>
            <div class="flex-1">
              <p class="text-xs text-gray-500">Créée par</p>
              <p class="text-sm font-medium text-gray-800">${order.cashier_name || 'Inconnu'}</p>
            </div>
          </div>
        ` : ''}

        <div class="mb-3">
          <p class="text-xs text-gray-500 mb-1">Articles:</p>
          <p class="text-sm text-gray-700">${itemsText}${moreItems}</p>
        </div>

        <div class="flex items-center justify-between pt-3 border-t border-gray-100">
          <div class="text-xs text-gray-500">
            ${new Date(order.created_at).toLocaleString('fr-FR', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </div>
          <div class="font-bold text-lg text-indigo-600">${order.total.toFixed(2)} €</div>
        </div>

        ${order.notes ? `
          <p class="text-xs text-orange-600 mt-2 bg-orange-50 p-2 rounded">📝 ${order.notes}</p>
        ` : ''}
      </div>
    `;
  }).join('');
};

CocaisseApp.prototype.filterOrders = function(filter) {
  this.currentOrderFilter = filter;

  // Update active button
  document.querySelectorAll('.order-filter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector(`[data-filter="${filter}"]`)?.classList.add('active');

  this.loadOrders();
};

CocaisseApp.prototype.openOrderDialog = function(orderId = null) {
  if (this.cart.length === 0) {
    this.toastWarning('Veuillez ajouter des produits au panier');
    return;
  }

  document.getElementById('orderId').value = orderId || '';
  document.getElementById('orderType').value = 'dine_in';
  document.getElementById('orderTableNumber').value = '';
  document.getElementById('orderCustomerName').value = '';
  document.getElementById('orderCustomerPhone').value = '';
  document.getElementById('orderNotes').value = '';

  // Preview des articles
  const preview = document.getElementById('orderItemsPreview');
  if (preview && this.cart.length > 0) {
    preview.innerHTML = this.cart.map(item => `
      <div class="flex items-center justify-between text-sm py-1">
        <span class="text-gray-700">${item.name} ×${item.quantity}</span>
        <span class="font-medium text-gray-800">${(item.price * item.quantity).toFixed(2)} €</span>
      </div>
    `).join('');
  }

  this.openModal('orderModal');
};

CocaisseApp.prototype.saveOrder = async function(event) {
  event.preventDefault();

  try {
    const orderId = document.getElementById('orderId').value;
    const table_number = document.getElementById('orderTableNumber').value;
    const order_type = document.getElementById('orderType').value;
    const customer_name = document.getElementById('orderCustomerName').value;
    const customer_phone = document.getElementById('orderCustomerPhone').value;
    const notes = document.getElementById('orderNotes').value;

    if (this.cart.length === 0) {
      this.toastWarning('Le panier est vide');
      return;
    }

    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.20;
    const discount = this.currentDiscount;
    const total = subtotal + tax - discount;

    const orderData = {
      table_number,
      order_type,
      items: this.cart.map(item => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.price * item.quantity
      })),
      subtotal,
      tax,
      discount,
      total,
      customer_name,
      customer_phone,
      notes
    };

    const method = orderId ? 'PUT' : 'POST';
    const url = orderId ? `${API_URL}/orders/${orderId}` : `${API_URL}/orders`;

    const response = await this.apiFetch(url, {
      method,
      headers: this.getAuthHeaders(),
      body: JSON.stringify(orderData)
    });

    if (!response.ok) throw new Error('Erreur lors de l\'enregistrement');

    const order = await response.json();

    this.closeModal('orderModal');
    this.cart = [];
    this.currentDiscount = 0;
    this.updateCartDisplay();

    this.toastSuccess(`Commande ${order.order_number} enregistrée !`);

    // Rediriger vers l'onglet commandes
    this.showSection('orders');

  } catch (error) {
    console.error('Error saving order:', error);
    this.toastError('Erreur lors de l\'enregistrement de la commande');
  }
};

CocaisseApp.prototype.viewOrderDetail = async function(orderId) {
  try {
    const response = await this.apiFetch(`${API_URL}/orders/${orderId}`, {
      headers: this.getAuthHeaders()
    });
    const order = await response.json();

    const statusLabels = {
      draft:      'En attente de validation',
      in_kitchen: 'En cuisine',
      ready:      'Prête',
      served:     'Servie',
      paid:       'Payée'
    };

    const typeLabels = {
      dine_in: '🍽️ Sur place',
      takeaway: '📦 À emporter',
      delivery: '🚚 Livraison'
    };

    const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');

    const content = document.getElementById('orderDetailContent');
    content.innerHTML = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h2 class="text-2xl font-bold text-gray-800">${order.order_number}</h2>
          <span class="order-status-badge order-status-${order.status} text-sm">
            ${statusLabels[order.status]}
          </span>
        </div>

        <div class="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
          <div>
            <p class="text-xs text-gray-500">Type</p>
            <p class="font-medium">${typeLabels[order.order_type]}</p>
          </div>
          ${order.table_number ? `
            <div>
              <p class="text-xs text-gray-500">Table/Réf</p>
              <p class="font-medium">${order.table_number}</p>
            </div>
          ` : ''}
          ${order.customer_name ? `
            <div>
              <p class="text-xs text-gray-500">Client</p>
              <p class="font-medium">${order.customer_name}</p>
            </div>
          ` : ''}
          ${order.customer_phone ? `
            <div>
              <p class="text-xs text-gray-500">Téléphone</p>
              <p class="font-medium">${order.customer_phone}</p>
            </div>
          ` : ''}
          <div>
            <p class="text-xs text-gray-500">Créée le</p>
            <p class="font-medium">${new Date(order.created_at).toLocaleString('fr-FR')}</p>
          </div>
          <div>
            <p class="text-xs text-gray-500">Par</p>
            <p class="font-medium">${order.cashier_name || 'Inconnu'}</p>
          </div>
        </div>

        ${order.notes ? `
          <div class="bg-orange-50 border border-orange-200 p-3 rounded-lg">
            <p class="text-xs text-orange-600 font-semibold mb-1">📝 Notes</p>
            <p class="text-sm text-gray-700">${order.notes}</p>
          </div>
        ` : ''}

        ${(() => {
          // Infos cuisine : visibles pour admin, manager et cook si commande en cuisine/prête
          const showKitchenInfo = ['in_kitchen', 'ready', 'served', 'paid'].includes(order.status);
          if (!showKitchenInfo) return '';
          let handlers = [];
          try { handlers = JSON.parse(order.kitchen_handlers || '[]'); } catch {}
          const userRole = this.currentUser?.role;
          const isCook = userRole === 'cook';
          const canEdit = isCook || userRole === 'admin';
          return `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p class="text-xs text-blue-700 font-semibold mb-2 uppercase tracking-wide">👨‍🍳 Informations Cuisine</p>
              <div class="space-y-2">
                <div>
                  <p class="text-xs text-gray-500 mb-1">Cuisiniers en charge :</p>
                  ${handlers.length > 0
                    ? `<div class="flex flex-wrap gap-1">${handlers.map(h => `<span class="bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full font-medium">👨‍🍳 ${h.username}</span>`).join('')}</div>`
                    : `<p class="text-xs text-gray-400 italic">Aucune prise en charge</p>`
                  }
                </div>
                <div>
                  <p class="text-xs text-gray-500 mb-1">Commentaire cuisine :</p>
                  ${order.kitchen_comment
                    ? `<p class="text-sm text-gray-700 bg-white border border-blue-100 rounded p-2">${order.kitchen_comment}</p>`
                    : `<p class="text-xs text-gray-400 italic">Aucun commentaire</p>`
                  }
                </div>
              </div>
            </div>
          `;
        })()}

        <div class="bg-white border border-gray-200 rounded-lg p-4">
          <h3 class="font-semibold text-gray-800 mb-3">Articles</h3>
          <div class="space-y-2">
            ${items.map(item => `
              <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p class="font-medium text-gray-800">${item.name}</p>
                  <p class="text-xs text-gray-500">${item.price.toFixed(2)} € × ${item.quantity}</p>
                </div>
                <p class="font-bold text-indigo-600">${item.total.toFixed(2)} €</p>
              </div>
            `).join('')}
          </div>

          <div class="mt-4 pt-4 border-t-2 border-gray-200 space-y-1">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-600">Sous-total HT</span>
              <span class="font-medium">${order.subtotal.toFixed(2)} €</span>
            </div>
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-600">TVA (20%)</span>
              <span class="font-medium">${order.tax.toFixed(2)} €</span>
            </div>
            ${order.discount > 0 ? `
              <div class="flex items-center justify-between text-sm text-green-600">
                <span>Remise</span>
                <span class="font-medium">-${order.discount.toFixed(2)} €</span>
              </div>
            ` : ''}
            <div class="flex items-center justify-between text-lg font-bold pt-2">
              <span class="text-gray-800">TOTAL</span>
              <span class="text-indigo-600">${order.total.toFixed(2)} €</span>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap gap-2">
          ${order.status === 'draft' ? `
            <button onclick="app.validateOrder('${order.id}')" class="order-action-btn order-action-btn-primary">
              👨‍🍳 Valider & Envoyer en cuisine
            </button>
            <button onclick="app.editOrder('${order.id}')" class="order-action-btn order-action-btn-secondary">
              ✏️ Modifier
            </button>
            <button onclick="app.deleteOrder('${order.id}')" class="order-action-btn order-action-btn-danger">
              🗑️ Supprimer
            </button>
          ` : ''}

          ${order.status === 'in_kitchen' ? `
            <button onclick="app.markOrderReady('${order.id}')" class="order-action-btn order-action-btn-success">
              ✨ Marquer prête
            </button>
          ` : ''}

          ${order.status === 'ready' ? `
            <button onclick="app.markOrderServed('${order.id}')" class="order-action-btn order-action-btn-primary">
              🍽️ Marquer servie
            </button>
            <button onclick="app.payOrder('${order.id}')" class="order-action-btn order-action-btn-success">
              💰 Encaisser
            </button>
          ` : ''}

          ${order.status === 'served' ? `
            <button onclick="app.payOrder('${order.id}')" class="order-action-btn order-action-btn-success">
              💰 Encaisser
            </button>
          ` : ''}

          ${order.status === 'paid' ? `
            <p class="text-green-600 font-medium">✅ Commande payée le ${new Date(order.paid_at).toLocaleString('fr-FR')}</p>
          ` : ''}

          <button onclick="app.closeModal('orderDetailModal')" class="order-action-btn order-action-btn-secondary ml-auto">
            Fermer
          </button>
        </div>
      </div>
    `;

    this.openModal('orderDetailModal');
  } catch (error) {
    console.error('Error loading order detail:', error);
    this.toastError('Erreur lors du chargement du détail de la commande');
  }
};

CocaisseApp.prototype.validateOrder = async function(orderId) {
  try {
    const confirmed = await this.confirm('Valider et envoyer en cuisine ?', {
      title: 'Validation → Cuisine',
      icon: '👨‍🍳',
      type: 'info',
      confirmText: 'Valider & Envoyer',
      cancelText: 'Annuler'
    });

    if (!confirmed) return;

    const response = await this.apiFetch(`${API_URL}/orders/${orderId}/validate`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Erreur lors de la validation');
    this.toastSuccess('Commande validée et envoyée en cuisine ! 👨‍🍳');
    this.closeModal('orderDetailModal');
    this.resetAlertForOrder(orderId);
    await this.loadOrders();
    await this.loadAlerts();
  } catch (error) {
    console.error('Error validating order:', error);
    this.toastError('Erreur lors de la validation');
  }
};

CocaisseApp.prototype.sendToKitchen = async function(orderId) {
  try {
    const response = await this.apiFetch(`${API_URL}/orders/${orderId}/send-to-kitchen`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Erreur');
    this.toastSuccess('Commande envoyée en cuisine !');
    this.closeModal('orderDetailModal');
    this.resetAlertForOrder(orderId);
    await this.loadOrders();
    await this.loadAlerts();
  } catch (error) {
    console.error('Error sending to kitchen:', error);
    this.toastError('Erreur lors de l\'envoi en cuisine');
  }
};

CocaisseApp.prototype.markOrderReady = async function(orderId) {
  try {
    const response = await this.apiFetch(`${API_URL}/orders/${orderId}/mark-ready`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Erreur');
    this.toastSuccess('Commande marquée comme prête !');
    this.closeModal('orderDetailModal');
    this.resetAlertForOrder(orderId);
    await this.loadOrders();
    await this.loadAlerts();
  } catch (error) {
    console.error('Error marking ready:', error);
    this.toastError('Erreur');
  }
};

CocaisseApp.prototype.markOrderServed = async function(orderId) {
  try {
    const response = await this.apiFetch(`${API_URL}/orders/${orderId}/mark-served`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Erreur');
    this.toastSuccess('Commande marquée comme servie !');
    this.closeModal('orderDetailModal');
    this.resetAlertForOrder(orderId);
    await this.loadOrders();
    await this.loadAlerts();
  } catch (error) {
    console.error('Error marking served:', error);
    this.toastError('Erreur');
  }
};

CocaisseApp.prototype.payOrder = async function(orderId) {
  try {
    this.closeModal('orderDetailModal');

    // Charger la commande
    const response = await this.apiFetch(`${API_URL}/orders/${orderId}`, {
      headers: this.getAuthHeaders()
    });
    const order = await response.json();

    // Afficher un modal de paiement simplifié
    const paymentMethod = await this.selectPaymentMethod();
    if (!paymentMethod) return;

    const payResponse = await this.apiFetch(`${API_URL}/orders/${orderId}/pay`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        payment_method: paymentMethod,
        change: 0
      })
    });

    if (!payResponse.ok) throw new Error('Erreur lors du paiement');

    const result = await payResponse.json();
    this.toastSuccess('Commande encaissée !');

    // Afficher le reçu
    if (result.transaction) {
      this.viewReceipt(result.transaction.id);
    }

    // Recharger commandes et alertes
    this.resetAlertForOrder(orderId);
    await this.loadOrders();
    await this.loadAlerts();

    this.loadOrders();
  } catch (error) {
    console.error('Error paying order:', error);
    this.toastError('Erreur lors du paiement');
  }
};

CocaisseApp.prototype.selectPaymentMethod = async function() {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
    modal.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 class="text-xl font-bold text-gray-800 mb-4">💳 Mode de paiement</h3>
        <div class="space-y-3">
          <button onclick="window.resolvePayment('cash')" class="w-full p-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition">
            💵 Espèces
          </button>
          <button onclick="window.resolvePayment('card')" class="w-full p-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition">
            💳 Carte bancaire
          </button>
          <button onclick="window.resolvePayment(null)" class="w-full p-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium transition">
            Annuler
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    window.resolvePayment = (method) => {
      modal.remove();
      delete window.resolvePayment;
      resolve(method);
    };
  });
};

CocaisseApp.prototype.editOrder = async function(orderId) {
  try {
    // Charger la commande
    const response = await this.apiFetch(`${API_URL}/orders/${orderId}`, {
      headers: this.getAuthHeaders()
    });
    const order = await response.json();

    if (order.status !== 'draft') {
      this.toastWarning('Seules les commandes en attente de validation peuvent être modifiées');
      return;
    }

    // Charger les articles dans le panier
    const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
    this.cart = items.map(item => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      discount: 0
    }));

    this.currentDiscount = order.discount || 0;
    this.updateCartDisplay();

    // Fermer le modal de détail
    this.closeModal('orderDetailModal');

    // Ouvrir le modal d'édition avec les données pré-remplies
    document.getElementById('orderId').value = order.id;
    document.getElementById('orderType').value = order.order_type || 'dine_in';
    document.getElementById('orderTableNumber').value = order.table_number || '';
    document.getElementById('orderCustomerName').value = order.customer_name || '';
    document.getElementById('orderCustomerPhone').value = order.customer_phone || '';
    document.getElementById('orderNotes').value = order.notes || '';

    // Preview des articles
    const preview = document.getElementById('orderItemsPreview');
    if (preview && this.cart.length > 0) {
      preview.innerHTML = this.cart.map(item => `
        <div class="flex items-center justify-between text-sm py-1">
          <span class="text-gray-700">${item.name} ×${item.quantity}</span>
          <span class="font-medium text-gray-800">${(item.price * item.quantity).toFixed(2)} €</span>
        </div>
      `).join('');
    }

    this.openModal('orderModal');
    this.toastInfo('Modifiez les informations de la commande');
  } catch (error) {
    console.error('Error editing order:', error);
    this.toastError('Erreur lors du chargement de la commande');
  }
};

CocaisseApp.prototype.deleteOrder = async function(orderId) {
  try {
    const confirmed = await this.confirm('Supprimer cette commande ?', {
      title: 'Suppression',
      icon: '🗑️',
      type: 'danger'
    });

    if (!confirmed) return;

    const response = await this.apiFetch(`${API_URL}/orders/${orderId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) throw new Error('Erreur lors de la suppression');

    this.toastSuccess('Commande supprimée');
    this.closeModal('orderDetailModal');
    this.loadOrders();
  } catch (error) {
    console.error('Error deleting order:', error);
    this.toastError('Erreur lors de la suppression');
  }
};

// ===== SYSTÈME D'ALERTES =====

CocaisseApp.prototype.startAlertPolling = function() {
  // 1. Chargement initial des alertes depuis le serveur
  this.loadAlerts();

  // 2. Polling serveur toutes les 60s (juste pour synchroniser les nouvelles commandes)
  this.alertPollingInterval = setInterval(() => this.loadAlerts(), 60000);

  // 3. Timer local toutes les 5s : détecte les dépassements de seuil EN TEMPS RÉEL
  //    sans appel serveur — c'est lui qui déclenche les notifications
  this.alertDisplayInterval = setInterval(() => this._checkAndNotify(), 5000);
};

CocaisseApp.prototype.stopAlertPolling = function() {
  if (this.alertPollingInterval) { clearInterval(this.alertPollingInterval); this.alertPollingInterval = null; }
  if (this.alertDisplayInterval) { clearInterval(this.alertDisplayInterval); this.alertDisplayInterval = null; }
};

// Calcule le nombre de minutes écoulées depuis status_since
CocaisseApp.prototype._elapsedMin = function(status_since) {
  if (!status_since) return 0;
  const since = new Date(status_since);
  const now   = Date.now();
  const diffMs = now - since.getTime();
  const mins = Math.floor(diffMs / 60000);
  // Log de diagnostic (peut être retiré après validation)
  // console.debug(`[elapsed] since=${status_since} → diffMs=${diffMs} → ${mins} min`);
  return Math.max(0, mins);
};

// Calcule le retard réel (elapsed - seuil)
CocaisseApp.prototype._computeDelay = function(alert) {
  if (!alert.status_since || !alert.alert_threshold_minutes) return alert.delay_minutes || 0;
  const elapsed = this._elapsedMin(alert.status_since);
  return Math.max(0, elapsed - alert.alert_threshold_minutes);
};

// Calcule le niveau d'alerte en temps réel
CocaisseApp.prototype._computeLevel = function(alert) {
  if (!alert.status_since || !alert.alert_threshold_minutes) return alert.alert_level || 'warning';
  const elapsed = this._elapsedMin(alert.status_since);
  if (elapsed >= alert.alert_threshold_minutes * 2) return 'critical';
  if (elapsed >= alert.alert_threshold_minutes) return 'warning';
  return null; // pas encore en alerte
};

// ★ Cœur du système : appelé toutes les 5s, déclenche les notifications au bon moment
CocaisseApp.prototype._checkAndNotify = function() {
  if (!this.alertsRaw || this.alertsRaw.length === 0) {
    this.alerts = [];
    this.updateAlertBadge(0);
    return;
  }

  const now = Date.now();
  const remindAfterMs = ((this.settings?.alert_remind_after_dismiss) || 10) * 60000;
  const toNotify = [];

  // Recalculer chaque alerte en temps réel
  const updated = this.alertsRaw.map(raw => {
    const elapsed = this._elapsedMin(raw.status_since);
    const threshold = raw.alert_threshold_minutes || 15;
    const delay = Math.max(0, elapsed - threshold);
    const level = elapsed >= threshold * 2 ? 'critical'
                : elapsed >= threshold       ? 'warning'
                : null; // pas encore en alerte

    if (!level) return null; // ignorer : seuil pas encore atteint

    const alert = { ...raw, delay_minutes: delay, alert_level: level };

    // --- Logique de notification ---
    // On notifie dès le WARNING (1ère fois que le seuil est dépassé)
    // On re-notifie quand ça passe de warning → critical
    // On re-notifie après dismiss si le délai de relance est écoulé

    const alreadyNotified = this.notifiedAlerts.has(raw.id);
    const prevLevel = this.notifiedLevels?.get(raw.id);

    if (!alreadyNotified) {
      // 1ère notification (warning ou critical)
      toNotify.push(alert);
      this.notifiedAlerts.add(raw.id);
      if (!this.notifiedLevels) this.notifiedLevels = new Map();
      this.notifiedLevels.set(raw.id, level);
    } else if (level === 'critical' && prevLevel === 'warning') {
      // Escalade warning → critical : re-notifier
      toNotify.push(alert);
      if (!this.notifiedLevels) this.notifiedLevels = new Map();
      this.notifiedLevels.set(raw.id, 'critical');
    } else {
      // Vérifier relance après dismiss
      const dismissedTime = this.dismissedAlerts.get(raw.id);
      if (dismissedTime && (now - dismissedTime) >= remindAfterMs) {
        this.dismissedAlerts.delete(raw.id);
        this.notifiedAlerts.delete(raw.id);
        if (this.notifiedLevels) this.notifiedLevels.delete(raw.id);
        toNotify.push(alert);
        this.notifiedAlerts.add(raw.id);
        if (!this.notifiedLevels) this.notifiedLevels = new Map();
        this.notifiedLevels.set(raw.id, level);
      }
    }

    return alert;
  }).filter(Boolean);

  this.alerts = updated;

  // Déclencher les notifications
  if (toNotify.length > 0) {
    if (this.settings?.alert_sound_enabled !== 0) this.playAlertSound();
    this.displayAlerts(toNotify);
  }

  // Badge : toutes les alertes non dismissées
  const unseen = updated.filter(a => !this.dismissedAlerts.has(a.id));
  this.updateAlertBadge(unseen.length);

  // Re-render commandes si visible
  if (this.currentSection === 'orders' && this.orders.length > 0) {
    this.renderOrders();
  }
};

// Met à jour les delays sans refetch serveur (pour rétrocompatibilité)
CocaisseApp.prototype._refreshAlertDisplay = function() {
  this._checkAndNotify();
};

CocaisseApp.prototype.loadAlerts = async function() {
  try {
    const response = await this.apiFetch(`${API_URL}/orders/alerts/pending`, {
      headers: this.getAuthHeaders()
    });
    if (!response.ok) return;
    const freshAlerts = await response.json();

    // Filtrer les alertes dont la commande a déjà changé de statut dans this.orders
    // (évite qu'une alerte périmée réapparaisse si le serveur est légèrement en retard)
    const filtered = freshAlerts.filter(alert => {
      const localOrder = this.orders.find(o => o.id === alert.id);
      // Si la commande est connue localement et a un statut différent → ignorer cette alerte
      if (localOrder && localOrder.status !== alert.status) return false;
      return true;
    });

    this.alertsRaw = filtered;

    // Nettoyer les IDs disparus de notifiedAlerts, notifiedLevels et dismissedAlerts
    const currentIds = new Set(filtered.map(a => a.id));
    this.notifiedAlerts.forEach(id => {
      if (!currentIds.has(id)) {
        this.notifiedAlerts.delete(id);
        this.notifiedLevels.delete(id);
        this.dismissedAlerts.delete(id);
      }
    });

    // Déclencher immédiatement une vérification locale
    this._checkAndNotify();

  } catch (error) {
    console.error('Error loading alerts:', error);
  }
};

// Appelé après CHAQUE changement de statut pour reset la notification
CocaisseApp.prototype.resetAlertForOrder = function(orderId) {
  this.notifiedAlerts.delete(orderId);
  this.notifiedLevels.delete(orderId);
  this.dismissedAlerts.delete(orderId);
  // Retirer immédiatement de alertsRaw et alerts pour stopper le clignotement
  if (this.alertsRaw) this.alertsRaw = this.alertsRaw.filter(a => a.id !== orderId);
  this.alerts = this.alerts.filter(a => a.id !== orderId);
  // Mettre à jour badge + rendu immédiatement (sans re-fetch serveur — évite race condition)
  this.updateAlertBadge(this.alerts.filter(a => !this.dismissedAlerts.has(a.id)).length);
  if (this.currentSection === 'orders') this.renderOrders();
};

// ===== SECTION CUISINE =====

CocaisseApp.prototype.loadKitchenOrders = async function() {
  const list = document.getElementById('kitchenOrdersList');
  const countEl = document.getElementById('kitchenOrderCount');
  if (!list) return;

  list.innerHTML = `<div class="text-center py-8 text-gray-400">⏳ Chargement...</div>`;

  try {
    const response = await this.apiFetch(`${API_URL}/orders/kitchen/active`, {
      headers: this.getAuthHeaders()
    });
    if (!response.ok) throw new Error('Erreur serveur');
    const orders = await response.json();

    if (countEl) countEl.textContent = `${orders.length} commande(s)`;

    if (orders.length === 0) {
      list.innerHTML = `
        <div class="text-center py-16">
          <p class="text-6xl mb-4">✅</p>
          <p class="text-xl font-semibold text-gray-500">Aucune commande en cuisine</p>
          <p class="text-sm text-gray-400 mt-1">Toutes les commandes ont été traitées</p>
        </div>`;
      return;
    }

    const isCook = this.currentUser?.role === 'cook';
    const isAdmin = this.currentUser?.role === 'admin';
    const canComment = isCook || isAdmin;
    const canMarkReady = isCook || isAdmin;

    list.innerHTML = orders.map(order => {
      let handlers = [];
      try { handlers = JSON.parse(order.kitchen_handlers || '[]'); } catch { handlers = []; }

      const items = (() => { try { return JSON.parse(order.items || '[]'); } catch { return []; } })();
      const kitchenAt = order.kitchen_at ? new Date(order.kitchen_at.replace(' ', 'T')) : new Date(order.created_at.replace(' ', 'T'));
      const elapsedMin = Math.floor((Date.now() - kitchenAt.getTime()) / 60000);

      const isHandledByMe = handlers.find(h => h.id === this.currentUser?.id);
      const urgencyColor = elapsedMin >= 30 ? 'border-red-400 bg-red-50'
                         : elapsedMin >= 15 ? 'border-orange-400 bg-orange-50'
                         : 'border-green-400 bg-white';
      const timeColor = elapsedMin >= 30 ? 'text-red-600 font-bold'
                      : elapsedMin >= 15 ? 'text-orange-600 font-semibold'
                      : 'text-green-600';

      return `
        <div class="rounded-xl border-2 ${urgencyColor} p-4 mb-4 shadow-sm transition-all" id="kitchen-card-${order.id}">
          <!-- En-tête -->
          <div class="flex items-start justify-between mb-3">
            <div>
              <p class="font-bold text-lg text-gray-800">${order.order_number}</p>
              <p class="text-sm text-gray-500">${order.order_type === 'dine_in' ? '🍽️ Sur place' : order.order_type === 'takeaway' ? '📦 À emporter' : '🚚 Livraison'}${order.table_number ? ' — ' + order.table_number : ''}</p>
            </div>
            <div class="text-right">
              <span class="${timeColor} text-lg">⏱ ${elapsedMin} min</span>
              <p class="text-xs text-gray-400">${kitchenAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
            </div>
          </div>

          <!-- Articles -->
          <div class="bg-white/70 rounded-lg p-3 mb-3 border border-gray-100">
            <p class="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Articles</p>
            <div class="space-y-1">
              ${items.map(item => `
                <div class="flex items-center justify-between">
                  <span class="font-semibold text-gray-800 text-sm">${item.name}</span>
                  <span class="bg-indigo-100 text-indigo-700 font-bold px-2 py-0.5 rounded-full text-sm">×${item.quantity}</span>
                </div>
              `).join('')}
            </div>
          </div>

          ${order.notes ? `
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-3">
              <p class="text-xs font-semibold text-yellow-700">📝 Note client</p>
              <p class="text-sm text-gray-700">${order.notes}</p>
            </div>
          ` : ''}

          <!-- Commentaire cuisine -->
          <div class="mb-3">
            ${order.kitchen_comment ? `
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-2">
                <p class="text-xs font-semibold text-blue-700">💬 Commentaire cuisine</p>
                <p class="text-sm text-gray-700">${order.kitchen_comment}</p>
              </div>
            ` : ''}
            ${canComment ? `
              <div id="comment-form-${order.id}" class="${order.kitchen_comment ? 'hidden' : ''}">
                <textarea id="comment-input-${order.id}" placeholder="Ajouter un commentaire cuisine (retard, problème, ingrédient manquant...)"
                  class="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-300 focus:border-transparent resize-none"
                  rows="2">${order.kitchen_comment || ''}</textarea>
                <button onclick="app.saveKitchenComment('${order.id}')"
                  class="mt-1 text-xs px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition font-medium">
                  💾 Enregistrer
                </button>
              </div>
              ${order.kitchen_comment ? `
                <button onclick="app.toggleKitchenCommentForm('${order.id}')"
                  class="text-xs text-blue-600 hover:underline">✏️ Modifier le commentaire</button>
              ` : ''}
            ` : ''}
          </div>

          <!-- Cuisiniers en charge -->
          <div class="mb-3">
            ${handlers.length > 0 ? `
              <div class="flex flex-wrap gap-1 mb-2">
                ${handlers.map(h => `
                  <span class="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-xs px-2 py-1 rounded-full font-medium">
                    👨‍🍳 ${h.username}
                  </span>
                `).join('')}
              </div>
            ` : `<p class="text-xs text-gray-400 italic mb-2">Aucun cuisinier n'a pris en charge cette commande</p>`}
            ${canComment && !isHandledByMe ? `
              <button onclick="app.takeKitchenOrder('${order.id}')"
                class="text-xs px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg transition font-medium">
                ✋ Je prends en charge
              </button>
            ` : canComment && isHandledByMe ? `
              <span class="text-xs text-green-600 font-medium">✅ Vous avez pris en charge cette commande</span>
            ` : ''}
          </div>

          <!-- Actions -->
          <div class="flex gap-2 pt-2 border-t border-gray-100">
            ${canMarkReady ? `
              <button onclick="app.markKitchenOrderReady('${order.id}')"
                class="flex-1 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl transition shadow-sm flex items-center justify-center gap-2">
                ✨ Commande prête
              </button>
            ` : `
              <div class="flex-1 text-center py-2 text-sm text-gray-400 italic">En attente de la cuisine</div>
            `}
          </div>
        </div>
      `;
    }).join('');

    // Auto-refresh toutes les 30s si on est sur la page cuisine
    if (this.currentSection === 'kitchen') {
      clearTimeout(this._kitchenRefreshTimer);
      this._kitchenRefreshTimer = setTimeout(() => {
        if (this.currentSection === 'kitchen') this.loadKitchenOrders();
      }, 30000);
    }
  } catch (error) {
    console.error('Error loading kitchen orders:', error);
    list.innerHTML = `<div class="text-center py-8 text-red-500">❌ Erreur de chargement</div>`;
  }
};

CocaisseApp.prototype.takeKitchenOrder = async function(orderId) {
  try {
    const response = await this.apiFetch(`${API_URL}/orders/${orderId}/kitchen-handle`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) {
      const err = await response.json();
      this.toastError(err.error || 'Erreur');
      return;
    }
    this.toastSuccess('Vous avez pris en charge la commande !');
    this.loadKitchenOrders();
  } catch (error) {
    this.toastError('Erreur réseau');
  }
};

CocaisseApp.prototype.toggleKitchenCommentForm = function(orderId) {
  const form = document.getElementById(`comment-form-${orderId}`);
  const input = document.getElementById(`comment-input-${orderId}`);
  if (form) {
    form.classList.toggle('hidden');
    if (!form.classList.contains('hidden') && input) input.focus();
  }
};

CocaisseApp.prototype.saveKitchenComment = async function(orderId) {
  const input = document.getElementById(`comment-input-${orderId}`);
  if (!input) return;
  const comment = input.value.trim();

  try {
    const response = await this.apiFetch(`${API_URL}/orders/${orderId}/kitchen-comment`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ comment })
    });
    if (!response.ok) {
      const err = await response.json();
      this.toastError(err.error || 'Erreur');
      return;
    }
    this.toastSuccess('Commentaire enregistré !');
    this.loadKitchenOrders();
  } catch (error) {
    this.toastError('Erreur réseau');
  }
};

CocaisseApp.prototype.markKitchenOrderReady = async function(orderId) {
  try {
    const confirmed = await this.confirm('Marquer cette commande comme prête ?', {
      title: '✨ Commande prête',
      icon: '✨',
      type: 'info',
      confirmText: 'Oui, c\'est prêt !',
      cancelText: 'Annuler'
    });
    if (!confirmed) return;

    const response = await this.apiFetch(`${API_URL}/orders/${orderId}/mark-ready`, {
      method: 'POST',
      headers: this.getAuthHeaders()
    });
    if (!response.ok) {
      const err = await response.json();
      this.toastError(err.error || 'Erreur');
      return;
    }
    this.toastSuccess('Commande marquée comme prête ! 🎉');
    this.resetAlertForOrder(orderId);
    this.loadKitchenOrders();
    // Recharger aussi les alertes
    await this.loadAlerts();
  } catch (error) {
    this.toastError('Erreur réseau');
  }
};

CocaisseApp.prototype.updateAlertBadge = function(count) {
  const badge = document.getElementById('alertBadge');
  if (!badge) return;

  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    badge.classList.add('animate-pulse');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('animate-pulse');
  }
};

CocaisseApp.prototype.playAlertSound = function() {
  const now = Date.now();
  // Éviter de jouer le son plus d'une fois par minute
  if (now - this.lastAlertSound < 60000) return;

  this.lastAlertSound = now;

  // Créer un beep sonore simple
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.frequency.value = 800;
  oscillator.type = 'sine';

  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
};

CocaisseApp.prototype.displayAlerts = function(alerts) {
  if (alerts.length === 0) return;

  if (alerts.length === 1) {
    const a = alerts[0];
    const icon = a.alert_level === 'critical' ? '🚨' : '⚠️';
    const msg = a.alert_level === 'critical'
      ? `${icon} CRITIQUE: Commande ${a.order_number} en retard de ${a.delay_minutes} min (${a.status_label})`
      : `${icon} Commande ${a.order_number} en retard de ${a.delay_minutes} min (${a.status_label})`;
    this.toastError(msg, { duration: 10000 });
  } else {
    const critical = alerts.filter(a => a.alert_level === 'critical').length;
    const warning  = alerts.filter(a => a.alert_level === 'warning').length;
    let msg = '';
    if (critical > 0) msg += `🚨 ${critical} critique(s) `;
    if (warning > 0)  msg += `⚠️ ${warning} en retard `;
    msg += '— Cliquez sur 🔔';
    this.toastError(msg, { duration: 10000 });
  }
};

// Alias pour compatibilité
CocaisseApp.prototype.displayCriticalAlerts = function(alerts) {
  this.displayAlerts(alerts);
};

CocaisseApp.prototype.showAlertsPanel = function() {
  const modalContent = `
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold text-gray-800 flex items-center gap-2">
        🔔 Alertes Commandes
        ${this.alerts.length > 0 ? `<span class="text-sm font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">${this.alerts.length}</span>` : ''}
      </h2>
      <button onclick="app.closeModal('alertsModal')" 
        class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 text-lg font-bold transition">
        ✕
      </button>
    </div>
    <div style="max-height: 65vh; overflow-y: auto;">
      ${this.alerts.length === 0 ? `
        <div class="text-center py-12">
          <p class="text-5xl mb-3">✅</p>
          <p class="text-gray-500 text-lg font-medium">Aucune alerte en cours</p>
        </div>
      ` : `
        <div class="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
          <p class="text-sm text-blue-800">
            <strong>${this.alerts.length}</strong> alerte${this.alerts.length > 1 ? 's' : ''} active${this.alerts.length > 1 ? 's' : ''}
          </p>
          <button 
            onclick="app.dismissAllAlerts()" 
            class="text-xs px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition"
          >
            ✓ Tout marquer comme vu
          </button>
        </div>
        ${this.alerts.map(alert => `
          <div class="p-4 mb-3 rounded-xl border-2 ${
            alert.alert_level === 'critical'
              ? 'bg-red-50 border-red-400'
              : 'bg-orange-50 border-orange-400'
          }">
            <div class="flex items-start justify-between mb-2">
              <div>
                <p class="font-bold text-base ${alert.alert_level === 'critical' ? 'text-red-700' : 'text-orange-700'}">
                  ${alert.alert_level === 'critical' ? '🚨' : '⚠️'} ${alert.order_number}
                </p>
                <p class="text-xs text-gray-500 mt-0.5">${alert.table_number || 'Sans table'}</p>
              </div>
              <span class="px-2 py-1 rounded-full text-xs font-semibold ${
                alert.alert_level === 'critical'
                  ? 'bg-red-600 text-white'
                  : 'bg-orange-500 text-white'
              }">
                ${alert.status_label}
              </span>
            </div>
            <div class="mb-3 text-sm text-gray-700 space-y-0.5">
              <p><span class="font-medium">Temps écoulé :</span> ${this._elapsedMin(alert.status_since)} min</p>
              <p><span class="font-medium">Retard :</span> ${alert.delay_minutes} min</p>
              ${this.currentUser?.role === 'admin' ? `
                <p><span class="font-medium">Créée par :</span> ${alert.cashier_name}</p>
              ` : ''}
            </div>
            <div class="flex gap-2">
              <button
                onclick="app.closeModal('alertsModal'); app.viewOrderDetail('${alert.id}')"
                class="flex-1 py-1.5 text-sm font-medium bg-white border border-blue-300 text-blue-700 hover:bg-blue-50 rounded-lg transition">
                👁️ Voir détails
              </button>
              ${alert.status === 'draft' ? `
                <button
                  onclick="app.closeModal('alertsModal'); app.validateOrder('${alert.id}')"
                  class="flex-1 py-1.5 text-sm font-medium bg-green-500 hover:bg-green-600 text-white rounded-lg transition">
                  ✅ Valider
                </button>
              ` : ''}
            </div>
          </div>
        `).join('')}
      `}
    </div>
    <div class="flex justify-end mt-4 pt-3 border-t border-gray-100">
      <button onclick="app.closeModal('alertsModal')"
        class="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition text-sm">
        Fermer
      </button>
    </div>
  `;

  this.showModalWithContent('alertsModal', modalContent);
};

CocaisseApp.prototype.showOrdersStatistics = async function() {
  try {
    const response = await this.apiFetch(`${API_URL}/orders/stats/detailed`, {
      headers: this.getAuthHeaders()
    });
    const stats = await response.json();

    const modalContent = `
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-gray-800">📊 Statistiques Commandes</h2>
        <button onclick="app.closeModal('statsModal')"
          class="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 hover:text-gray-800 text-lg font-bold transition">
          ✕
        </button>
      </div>
      <div style="max-height: 65vh; overflow-y: auto;">
        <!-- Statistiques par statut -->
        <div class="mb-6">
          <h3 class="text-base font-bold text-gray-700 mb-3">📈 Répartition par Statut</h3>
          <div class="grid grid-cols-2 gap-3">
            ${stats.status_stats.map(stat => {
              const statusLabels = {
                draft:      { label: 'En attente', icon: '⏳', color: 'gray' },
                in_kitchen: { label: 'En cuisine', icon: '👨‍🍳', color: 'blue' },
                ready:      { label: 'Prêtes',     icon: '🔔', color: 'purple' },
                served:     { label: 'Servies',    icon: '🍽️', color: 'indigo' },
                paid:       { label: 'Payées',     icon: '💰', color: 'emerald' }
              };
              const info = statusLabels[stat.status] || { label: stat.status, icon: '•', color: 'gray' };
              
              return `
                <div class="stat-card bg-${info.color}-50 border-${info.color}-200">
                  <p class="text-sm text-gray-600">${info.icon} ${info.label}</p>
                  <p class="text-3xl font-bold text-${info.color}-700">${stat.count}</p>
                  <p class="text-xs text-gray-500">Total: ${stat.total_amount?.toFixed(2) || '0.00'} €</p>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        
        <!-- Temps moyen par transition -->
        <div>
          <h3 class="text-xl font-bold text-gray-700 mb-3">⏱️ Temps Moyen par Étape</h3>
          <div class="space-y-2">
            ${stats.time_stats.map(stat => {
              const transitionLabels = {
                'draft_to_validated':   'En attente → Cuisine',
                'kitchen_to_ready':     'Cuisine → Prête',
                'ready_to_served':      'Prête → Servie',
                'served_to_paid':       'Servie → Payée'
              };
              
              const avgMin = Math.round(stat.avg_minutes || 0);
              const color = avgMin > 30 ? 'red' : avgMin > 15 ? 'orange' : 'green';
              
              return `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span class="text-sm font-medium text-gray-700">
                    ${transitionLabels[stat.transition] || stat.transition}
                  </span>
                  <div class="flex items-center gap-2">
                    <span class="text-lg font-bold text-${color}-600">${avgMin} min</span>
                    <span class="text-xs text-gray-500">(${stat.count} commandes)</span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="flex justify-end mt-4 pt-3 border-t border-gray-100">
        <button onclick="app.closeModal('statsModal')"
          class="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition text-sm">
          Fermer
        </button>
      </div>
    `;

    this.showModalWithContent('statsModal', modalContent);
  } catch (error) {
    console.error('Error loading statistics:', error);
    this.toastError('Erreur lors du chargement des statistiques');
  }
};

CocaisseApp.prototype.showModalWithContent = function(modalId, content) {
  let modal = document.getElementById(modalId);
  if (!modal) {
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'modal';
    modal.style.zIndex = '60'; // inférieur à orderDetailModal (9999)

    modal.innerHTML = `
      <div class="modal-backdrop" onclick="app.closeModal('${modalId}')"></div>
      <div class="modal-content" style="max-width: 800px;">
        ${content}
      </div>
    `;
    document.body.appendChild(modal);
  } else {
    const contentEl = modal.querySelector('.modal-content');
    if (contentEl) {
      contentEl.innerHTML = content;
    }
  }

  modal.classList.remove('hidden');
};

CocaisseApp.prototype.dismissAllAlerts = function() {
  const now = Date.now();

  // Marquer toutes les alertes actuelles comme dismissed avec timestamp
  this.alerts.forEach(alert => {
    this.dismissedAlerts.set(alert.id, now);
  });

  // Réinitialiser badge
  this.updateAlertBadge(0);
  this.closeModal('alertsModal');

  const remindAfter = this.settings?.alert_remind_after_dismiss || 10;
  this.toastSuccess(`Alertes masquées — relance dans ${remindAfter} min si non traitées`);
};

// Initialize app
let app = null;

// ═══════════════════════════════════════════════════════════
// PANEL ADMIN — GESTION DES LICENCES
// ═══════════════════════════════════════════════════════════

CocaisseApp.prototype.loadAdminPanel = async function() {
  await Promise.all([
    this.loadCurrentLicenceInfo(),
    this.loadAdminLicences(),
  ]);
};

// ── Licence active sur cette installation ────────────────────────────────────
CocaisseApp.prototype.loadCurrentLicenceInfo = async function() {
  const el = document.getElementById('currentLicenceInfo');
  if (!el) return;
  try {
    const res  = await fetch(`${API_URL}/licences/status`);
    const data = await res.json();

    if (!data.hasLicence) {
      el.innerHTML = `<p class="text-orange-500 font-medium">⚠️ Aucune licence active</p>`;
      return;
    }

    const statusColor = data.valid
      ? (data.type === 'trial' ? 'text-amber-600' : 'text-green-600')
      : 'text-red-600';

    const statusLabel = !data.valid ? '❌ Expirée/Suspendue'
      : data.type === 'trial'       ? `⏳ Essai — ${data.daysRemaining} j restants`
      : data.type === 'perpetual'   ? '✅ Perpétuelle'
      : `✅ Abonnement — ${data.daysRemaining} j restants`;

    el.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div><p class="text-xs text-gray-400">Client</p><p class="font-semibold text-gray-800">${data.clientName || '—'}</p></div>
        <div><p class="text-xs text-gray-400">Statut</p><p class="font-semibold ${statusColor}">${statusLabel}</p></div>
        <div><p class="text-xs text-gray-400">Type</p><p class="font-semibold text-gray-800">${data.type || '—'}</p></div>
        <div><p class="text-xs text-gray-400">Modules</p><p class="font-semibold text-gray-800">${(data.modules || []).join(', ') || '—'}</p></div>
      </div>
    `;
  } catch (e) {
    el.innerHTML = `<p class="text-red-500 text-sm">Erreur chargement : ${e.message}</p>`;
  }
};

// ── Liste toutes les licences ────────────────────────────────────────────────
CocaisseApp.prototype.loadAdminLicences = async function() {
  const tbody = document.getElementById('adminLicencesTable');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-400">Chargement...</td></tr>`;

  try {
    const res  = await this.apiFetch(`${API_URL}/admin/licences`);
    const data = await res.json();
    const licences = data.licences || [];

    if (licences.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-400">Aucune licence</td></tr>`;
      return;
    }

    tbody.innerHTML = licences.map(lic => {
      const statusBadge = lic.computed_status === 'active'
        ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">✅ Active</span>'
        : lic.computed_status === 'expired'
        ? '<span class="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">❌ Expirée</span>'
        : '<span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">⏸ Suspendue</span>';

      const typeBadge = lic.type === 'perpetual'
        ? '<span class="text-xs text-gray-500">♾ Perpétuelle</span>'
        : lic.type === 'trial'
        ? '<span class="text-xs text-amber-600">⏳ Essai</span>'
        : '<span class="text-xs text-blue-600">🔄 Abonnement</span>';

      const expiry = lic.expires_at || lic.trial_end
        ? new Date(lic.expires_at || lic.trial_end).toLocaleDateString('fr-FR')
        : '<span class="text-gray-400">—</span>';

      const modules = (Array.isArray(lic.modules) ? lic.modules : [])
        .map(m => `<span class="px-1 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">${m}</span>`)
        .join(' ');

      const canSuspend = lic.computed_status === 'active';
      const canReactivate = lic.status === 'suspended';

      return `
        <tr class="hover:bg-gray-50 border-b border-gray-100">
          <td class="px-4 py-3">
            <p class="font-medium text-gray-800 text-sm">${lic.client_name}</p>
          </td>
          <td class="px-4 py-3">
            <code class="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">${lic.licence_key}</code>
          </td>
          <td class="px-4 py-3">${typeBadge}</td>
          <td class="px-4 py-3">${statusBadge}</td>
          <td class="px-4 py-3"><div class="flex flex-wrap gap-1">${modules}</div></td>
          <td class="px-4 py-3 text-sm text-gray-600">${expiry}</td>
          <td class="px-4 py-3">
            <div class="flex items-center justify-center gap-1">
              <button onclick="app.showLicenceEvents('${lic.id}')" title="Historique"
                class="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition text-sm">📋</button>
              ${canSuspend ? `
                <button onclick="app.suspendLicence('${lic.id}', '${lic.client_name}')" title="Suspendre"
                  class="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition text-sm">⏸</button>
              ` : ''}
              ${canReactivate ? `
                <button onclick="app.reactivateLicence('${lic.id}', '${lic.client_name}')" title="Réactiver"
                  class="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition text-sm">▶️</button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Erreur : ${e.message}</td></tr>`;
  }
};

// ── Suspend une licence ──────────────────────────────────────────────────────
CocaisseApp.prototype.suspendLicence = async function(id, clientName) {
  const confirmed = await this.confirm(`Suspendre la licence de "${clientName}" ?`, {
    title: 'Suspension', icon: '⏸', type: 'danger',
    confirmText: 'Suspendre', cancelText: 'Annuler',
  });
  if (!confirmed) return;

  try {
    const res = await this.apiFetch(`${API_URL}/admin/licences/${id}/suspend`, {
      method: 'PUT', headers: this.getAuthHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    this.toastSuccess(`Licence de "${clientName}" suspendue`);
    this.loadAdminLicences();
  } catch (e) {
    this.toastError(e.message);
  }
};

// ── Réactive une licence ─────────────────────────────────────────────────────
CocaisseApp.prototype.reactivateLicence = async function(id, clientName) {
  const confirmed = await this.confirm(`Réactiver la licence de "${clientName}" ?`, {
    title: 'Réactivation', icon: '▶️', type: 'info',
    confirmText: 'Réactiver', cancelText: 'Annuler',
  });
  if (!confirmed) return;

  try {
    const res = await this.apiFetch(`${API_URL}/admin/licences/${id}/reactivate`, {
      method: 'PUT', headers: this.getAuthHeaders(),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    this.toastSuccess(`Licence de "${clientName}" réactivée`);
    this.loadAdminLicences();
  } catch (e) {
    this.toastError(e.message);
  }
};

// ── Affiche l'historique d'une licence ──────────────────────────────────────
CocaisseApp.prototype.showLicenceEvents = async function(id) {
  const el = document.getElementById('licenceEventsContent');
  if (!el) return;
  el.innerHTML = `<p class="text-gray-400 text-center py-4">Chargement...</p>`;
  this.openModal('licenceEventsModal');

  try {
    const res  = await this.apiFetch(`${API_URL}/admin/licences/${id}/events`);
    const data = await res.json();

    if (data.events.length === 0) {
      el.innerHTML = `<p class="text-gray-400 text-center py-4">Aucun événement</p>`;
      return;
    }

    const EVENT_ICONS = {
      activated:     '✅', trial_started: '🚀', expired:       '❌',
      suspended:     '⏸', reactivated:   '▶️', generated:     '🔑', renewed: '🔄',
    };

    el.innerHTML = data.events.map(e => {
      const icon = EVENT_ICONS[e.event_type] || '•';
      const meta = e.metadata
        ? `<p class="text-xs text-gray-400 mt-0.5">${JSON.stringify(e.metadata)}</p>`
        : '';
      return `
        <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
          <span class="text-lg leading-none mt-0.5">${icon}</span>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <p class="text-sm font-semibold text-gray-800">${e.event_type}</p>
              <p class="text-xs text-gray-400">${new Date(e.created_at).toLocaleString('fr-FR')}</p>
            </div>
            ${meta}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    el.innerHTML = `<p class="text-red-500 text-sm text-center py-4">Erreur : ${e.message}</p>`;
  }
};

// ─────────────────────────────────────────────────────────────────────────────

function initializeApp() {
  console.log('🚀 Initialisation de l\'application Co-Caisse');
  app = new CocaisseApp();
  window.app = app;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}



