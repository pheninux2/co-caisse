import './styles/main.css';
import { api, API_URL } from './core/api.js';
import { Toast } from './components/toast.js';
import { Modal } from './components/modal.js';
import { router } from './core/router.js';
import { store } from './core/store.js';
import { ProductService }     from './services/product.service.js';
import { CategoryService }    from './services/category.service.js';
import { UserService }        from './services/user.service.js';
import { SettingsService }    from './services/settings.service.js';
import { OrderService }       from './services/order.service.js';
import { TransactionService } from './services/transaction.service.js';
import { TableService }       from './services/table.service.js';
import { FiscalService }      from './services/fiscal.service.js';
import { RgpdService }        from './services/rgpd.service.js';
import { FiscalMethods }      from './features/fiscal/fiscal.methods.js';
import { KitchenMethods }     from './features/kitchen/kitchen.methods.js';
import { OrdersMethods }      from './features/orders/orders.methods.js';
import { DashboardMethods }   from './features/dashboard/dashboard.methods.js';
import { FloorPlanMethods }   from './features/floor-plan/floor-plan.methods.js';
import { AlertsMethods }     from './features/alerts/alerts.methods.js';
import { AdminMethods }      from './features/admin/admin.methods.js';
import { RgpdMethods }       from './features/rgpd/rgpd.methods.js';
import { SettingsMethods }   from './features/settings/settings.methods.js';
import { PaymentMethods }    from './features/payment/payment.methods.js';
import { WizardMethods }     from './features/wizard/wizard.methods.js';
import { CatalogMethods }    from './features/catalog/catalog.methods.js';
import { CartMethods }       from './features/cart/cart.methods.js';
import { AnalyticsMethods } from './features/analytics/analytics.methods.js';

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
    this.editingOrderId    = null;
    this._editingOrderData = null;
    this.floorPlan = null;
    this.floorPlanTables = [];
    this.floorPlanEditMode = false;
    this.floorPlanPollingInterval = null;
    this._dragState = null;
    this._drawElements = [];
    this._selectedDrawEl = null;
    this._selectedTableId = null;
    this._currentDrawTool = 'select';
    this._drawing = false;
    this._drawStart = null;
    this.alerts = [];
    this.alertsRaw = [];
    this.alertPollingInterval = null;
    this.alertDisplayInterval = null;
    this.lastAlertSound = 0;
    this.notifiedAlerts = new Set();
    this.notifiedLevels = new Map(); // garde le niveau déjà notifié par id
    this.dismissedAlerts = new Map();
    this._wizardData = { country: null, businessType: null, step: 1 };

    this.init();
  }

  // ── Auth headers JWT ─────────────────────────────────────────────────────
  getAuthHeaders() { return api.getAuthHeaders(); }

  // ── Fetch authentifié ────────────────────────────────────────────────────
  async apiFetch(url, options = {}) { return api.fetch(url, options); }

  // ── Gestion centralisée de l'expiration du token ─────────────────────────
  // Enregistrée dans api.onExpired() depuis init() — voir _setupApiExpiredHandler()
  _handleTokenExpired() { api._handleTokenExpired(); }

  async init() {
    console.log('✅ Co-Caisse application initialized');

    // ── Enregistrer le handler d'expiration JWT ──────────────────────────
    api.onExpired(() => {
      this.stopAlertPolling();
      this.alertsRaw = [];
      this.alerts = [];
      Toast.clearAll();
      this.currentUser = null;
      this.cart = [];
      this.currentDiscount = 0;
      this.showLoginScreen();
    });

    // Charger les paramètres sauvegardés
    const savedSettings = localStorage.getItem('cocaisse_settings');
    if (savedSettings) {
      this.settings = JSON.parse(savedSettings);
    }

    // ── 0. Vérification premier démarrage (wizard) ───────────────────────
    try {
      const setupRes  = await fetch(`${API_URL}/setup/status`);
      const setupData = await setupRes.json();
      if (!setupData.completed) {
        this._showSetupWizard();
        return; // stoppe init() — le wizard appellera init() à la fin
      }
    } catch (_) {
      // Si le serveur est inaccessible, on continue normalement
    }

    // ── 1. Vérification licence AVANT tout ──────────────────────────────
    const licenceOk = await this._checkLicence();
    if (!licenceOk) return; // l'écran licence est affiché, on s'arrête

    // ── 2. Restaurer la session JWT ──────────────────────────────────────
    const savedToken = localStorage.getItem('jwt_token');
    const savedUser  = localStorage.getItem('currentUser');

    if (savedToken && savedUser) {
      try {
        api.setToken(savedToken);

        const checkRes = await this.apiFetch(`${API_URL}/users/me`, {
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${savedToken}`,
          },
        });

        if (checkRes.ok) {
          const freshUser = await checkRes.json();
          this.currentUser = freshUser;
          localStorage.setItem('currentUser', JSON.stringify(freshUser));
          console.log('👤 Session restaurée:', freshUser.username, '(' + freshUser.role + ')');
          this.showMainApp();
        } else {
          // Autre erreur (ex: 5xx) → conserver la session locale
          console.warn('⚠️ Serveur inaccessible, session locale conservée');
          this.currentUser = JSON.parse(savedUser);
          this.showMainApp();
        }
      } catch (e) {
        // Si l'erreur vient d'un 401 (session expirée), _handleTokenExpired() a déjà
        // effectué la redirection silencieuse → on ne fait rien d'autre
        if (e.message === 'session_expired') return;

        console.warn('⚠️ Serveur inaccessible:', e.message);
        try {
          this.currentUser = JSON.parse(savedUser);
          this.showMainApp();
        } catch {
          api.clearToken();
          localStorage.removeItem('currentUser');
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
    // Réinitialiser le flag de redirection pour permettre de futures sessions
    api.resetRedirectFlag();

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

    // ── Enregistrer les handlers de navigation du router ─────────────────
    router.onNavigate((section) => { this.currentSection = section; });
    router.on('dashboard', () => this.loadDashboard());
    router.on('orders',    () => this.loadOrders());
    router.on('kitchen',   () => this.loadKitchenOrders());
    router.on('products',  () => this.filterProducts(''));
    router.on('floorplan', () => this.loadFloorPlan());
    router.on('history',   () => { this.loadTransactions(); this.checkClosureStatus(); this.loadAnalytics(); });
    router.on('settings',  () => {
      this.loadUsers();
      this.loadSettingsData();
      setTimeout(() => this.showSettingsTab(this._activeSettingsTab || 'etablissement'), 0);
    });
    router.on('admin', () => this.loadAdminPanel());

    // Initialiser l'app principal
    this.setupEventListeners();
    this.businessConfig = null; // sera chargé par loadData → loadBusinessConfig
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

    // Vérifier le statut de la clôture journalière (admin only)
    this.checkClosureStatus();
    // Recheck toutes les 30 minutes
    setInterval(() => this.checkClosureStatus(), 30 * 60 * 1000);
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
        api.setToken(data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));

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



  // ===== DIALOGS & MODALS =====
  showSection(section) {
    // Arrêter le polling plan de salle si on quitte la section
    if (section !== 'floorplan') this.stopFloorPlanPolling();

    const ok = router.navigate(section, { role: this.currentUser?.role || 'cashier' });
    if (!ok) this.toastError('Vous n\'avez pas accès à cette section');
  }



  _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }


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
  openModal(id)  { Modal.open(id); }
  closeModal(id) { Modal.close(id); }
  showConfirm(message, options = {}) { return Modal.showConfirm(message, options); }

  updateClock() {
    const el = document.getElementById('currentTime');
    if (el) {
      el.textContent = new Date().toLocaleTimeString('fr-FR');
    }
  }

  // ===== TOAST NOTIFICATIONS =====
  clearAllToasts()                         { Toast.clearAll(); }
  toast(message, type = 'info', dur = 3000){ return Toast.show(message, type, dur); }
  toastSuccess(message, dur = 3000)        { return Toast.success(message, dur); }
  toastError(message, dur = 4000)          { return Toast.error(message, dur); }
  toastWarning(message, dur = 3500)        { return Toast.warning(message, dur); }
  toastInfo(message, dur = 3000)           { return Toast.info(message, dur); }

  // ===== CONFIRM DIALOG =====
  confirm(message, options = {})           { return Modal.confirm(message, options); }
  confirmDelete(itemName = 'cet élément')  { return Modal.confirmDelete(itemName); }
  confirmAction(message, title)            { return Modal.confirmAction(message, title); }

  async logout() {
    const confirmed = await this.confirm('Êtes-vous sûr de vouloir vous déconnecter ?', {
      title: 'Déconnexion',
      icon: '🚪',
      type: 'warning',
      confirmText: 'Se déconnecter',
      cancelText: 'Rester connecté'
    });

    if (confirmed) {
      // Stopper proprement le polling des alertes et vider les données
      this.stopAlertPolling();
      this.alertsRaw = [];
      this.alerts = [];

      // Effacer immédiatement toutes les notifications visibles
      this.clearAllToasts();

      // Nettoyer le token JWT
      api.clearToken();
      localStorage.removeItem('currentUser');

      this.currentUser = null;
      this.cart = [];
      this.currentDiscount = 0;


      this.showLoginScreen();
      this.toastInfo('Vous avez été déconnecté');
    }
  }
}


// Initialize app
let app = null;

// ── Feature modules — extend prototype ──────────────────────────────────────
Object.assign(CocaisseApp.prototype, FiscalMethods);
Object.assign(CocaisseApp.prototype, KitchenMethods);
Object.assign(CocaisseApp.prototype, OrdersMethods);
Object.assign(CocaisseApp.prototype, DashboardMethods);
Object.assign(CocaisseApp.prototype, FloorPlanMethods);
Object.assign(CocaisseApp.prototype, AlertsMethods);
Object.assign(CocaisseApp.prototype, AdminMethods);
Object.assign(CocaisseApp.prototype, RgpdMethods);
Object.assign(CocaisseApp.prototype, SettingsMethods);
Object.assign(CocaisseApp.prototype, PaymentMethods);
Object.assign(CocaisseApp.prototype, WizardMethods);
Object.assign(CocaisseApp.prototype, CatalogMethods);
Object.assign(CocaisseApp.prototype, CartMethods);
Object.assign(CocaisseApp.prototype, AnalyticsMethods);

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



