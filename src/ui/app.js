// Import styles
import './styles/main.css';

// API Configuration
const API_URL = 'http://localhost:5000/api';

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

    this.init();
  }

  // Helper pour les requêtes API avec authentification
  getAuthHeaders() {
    return {
      'Content-Type': 'application/json',
      'user-id': this.currentUser?.id || 'system',
      'user-role': this.currentUser?.role || 'cashier'
    };
  }

  // Méthode fetch avec authentification
  async apiFetch(url, options = {}) {
    const headers = {
      ...this.getAuthHeaders(),
      ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
  }

  async init() {
    console.log('✅ Co-Caisse application initialized');

    // Charger les paramètres sauvegardés
    const savedSettings = localStorage.getItem('cocaisse_settings');
    if (savedSettings) {
      this.settings = JSON.parse(savedSettings);
    }

    // Charger l'utilisateur depuis localStorage
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      try {
        this.currentUser = JSON.parse(savedUser);
        console.log('👤 Utilisateur restauré:', this.currentUser.username);
        this.showMainApp();
      } catch (e) {
        console.log('❌ Erreur lors de la restauration de l\'utilisateur');
        this.showLoginScreen();
      }
    } else {
      console.log('🔐 Aucun utilisateur connecté');
      this.showLoginScreen();
    }
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

    // Filtrer les onglets selon le rôle
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

    // Afficher la caisse par défaut
    this.showSection('pos');
  }

  filterMenuByRole() {
    const userRole = this.currentUser?.role || 'cashier';

    // Filtrer les onglets de navigation desktop
    document.querySelectorAll('.nav-tab').forEach(item => {
      const allowedRoles = (item.getAttribute('data-role') || '').split(',').map(r => r.trim());
      item.style.display = allowedRoles.includes(userRole) ? '' : 'none';
    });

    // Filtrer les onglets mobile
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
      const allowedRoles = (item.getAttribute('data-role') || '').split(',').map(r => r.trim());
      item.style.display = allowedRoles.includes(userRole) ? '' : 'none';
    });

    // Filtrer le bouton export
    const exportBtn = document.querySelector('.export-btn');
    if (exportBtn) {
      exportBtn.style.display = userRole === 'admin' ? '' : 'none';
    }

    console.log(`✅ Menu filtré pour le rôle: ${userRole}`);
  }

  async handleLogin(event) {
    event.preventDefault();
    console.log('🔐 Tentative de connexion...');

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const response = await fetch(`${API_URL}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      if (response.ok) {
        const user = await response.json();
        this.currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        console.log('✅ Connexion réussie:', user.username);

        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';

        this.showMainApp();
        this.toastSuccess(`Bienvenue ${user.username} !`);
      } else {
        this.toastError('Identifiants incorrects');
      }
    } catch (error) {
      console.error('Erreur de connexion:', error);
      this.toastError('Erreur de connexion: ' + error.message);
    }
  }

  setupEventListeners() {
    // Mobile menu button
    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => {
      this.openMobileMenu();
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
      const response = await fetch(`${API_URL}/categories`);
      this.categories = await response.json();
      this.renderCategories();
      this.renderCategoryFilter();
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }

  async loadProducts() {
    try {
      const response = await fetch(`${API_URL}/products`);
      this.products = await response.json();
      this.renderProducts();
      this.filterProducts('');
    } catch (error) {
      console.error('Error loading products:', error);
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
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`${API_URL}/transactions/summary/daily?date=${today}`);
      const summary = await response.json();

      document.getElementById('dailySales').textContent = (summary.total_amount || 0).toFixed(2) + ' €';
      document.getElementById('dailyTransactions').textContent = summary.transaction_count || 0;
      document.getElementById('dailyTax').textContent = (summary.total_tax || 0).toFixed(2) + ' €';
      document.getElementById('dailyDiscount').textContent = (summary.total_discount || 0).toFixed(2) + ' €';

      await this.loadRecentTransactions();
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  }

  async loadRecentTransactions() {
    try {
      const response = await fetch(`${API_URL}/transactions?limit=5`);
      const transactions = await response.json();

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

      const response = await fetch(url);
      const transactions = await response.json();

      const table = document.getElementById('transactionsTable');
      if (!table) return;

      if (transactions.length === 0) {
        table.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-400">Aucune transaction</td></tr>';
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

      // Charger les statistiques par période
      await this.loadPeriodStats();

      // Charger la liste des caissiers pour le filtre
      await this.loadCashiersFilter();
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  }

  // Charger les statistiques par période
  async loadPeriodStats() {
    try {
      const today = new Date();

      // Aujourd'hui
      const todayStr = today.toISOString().split('T')[0];

      // Cette semaine (lundi au dimanche)
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay() + 1);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      // Ce mois
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = monthStart.toISOString().split('T')[0];

      // Cette année
      const yearStart = new Date(today.getFullYear(), 0, 1);
      const yearStartStr = yearStart.toISOString().split('T')[0];

      // Requêtes parallèles
      const [todayRes, weekRes, monthRes, yearRes] = await Promise.all([
        fetch(`${API_URL}/transactions/summary/period?start=${todayStr}&end=${todayStr}`),
        fetch(`${API_URL}/transactions/summary/period?start=${weekStartStr}&end=${todayStr}`),
        fetch(`${API_URL}/transactions/summary/period?start=${monthStartStr}&end=${todayStr}`),
        fetch(`${API_URL}/transactions/summary/period?start=${yearStartStr}&end=${todayStr}`)
      ]);

      const [todayData, weekData, monthData, yearData] = await Promise.all([
        todayRes.json(),
        weekRes.json(),
        monthRes.json(),
        yearRes.json()
      ]);

      // Mettre à jour l'affichage
      document.getElementById('statToday').textContent = (todayData.total || 0).toFixed(2) + ' €';
      document.getElementById('statWeek').textContent = (weekData.total || 0).toFixed(2) + ' €';
      document.getElementById('statMonth').textContent = (monthData.total || 0).toFixed(2) + ' €';
      document.getElementById('statYear').textContent = (yearData.total || 0).toFixed(2) + ' €';
    } catch (error) {
      console.error('Error loading period stats:', error);
    }
  }

  // Charger la liste des caissiers pour le filtre
  async loadCashiersFilter() {
    try {
      const response = await fetch(`${API_URL}/users`);
      const users = await response.json();

      const select = document.getElementById('filterCashier');
      if (!select) return;

      select.innerHTML = '<option value="">Tous les caissiers</option>' +
        users.map(u => `<option value="${u.id}">${u.username} (${u.role})</option>`).join('');
    } catch (error) {
      console.error('Error loading cashiers:', error);
    }
  }

  // Afficher le détail d'une transaction
  async showTransactionDetail(transactionId) {
    try {
      const response = await fetch(`${API_URL}/transactions/${transactionId}`);
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
          weekStart.setDate(today.getDate() - today.getDay() + 1);
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
      const response = await fetch(`${API_URL}/transactions?start_date=${startDate}&end_date=${endDate}`);
      const transactions = await response.json();

      // Récupérer les stats
      const statsRes = await fetch(`${API_URL}/transactions/summary/period?start=${startDate}&end=${endDate}`);
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
    if (section === 'products') this.filterProducts('');
    if (section === 'history') this.loadTransactions();
    if (section === 'settings') this.loadUsers();
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

      await fetch(url, {
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
      await fetch(`${API_URL}/products/${productId}`, { method: 'DELETE' });
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

      await fetch(url, {
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
      await fetch(`${API_URL}/categories/${categoryId}`, { method: 'DELETE' });
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

      await fetch(url, {
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
      const response = await fetch(`${API_URL}/users`);
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
      await fetch(`${API_URL}/users/${userId}`, { method: 'DELETE' });
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
      const response = await fetch(`${API_URL}/transactions/${transactionId}`);
      const transaction = await response.json();
      this.showReceipt(transaction);
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  }

  // ===== SETTINGS =====
  async saveSettings() {
    const settings = {
      company_name: document.getElementById('companyName').value,
      company_address: document.getElementById('companyAddress').value,
      company_phone: document.getElementById('companyPhone').value,
      company_email: document.getElementById('companyEmail').value,
      tax_number: document.getElementById('taxNumber').value,
      default_tax_rate: parseFloat(document.getElementById('defaultTaxRate').value) || 20,
      receipt_header: document.getElementById('receiptHeader').value,
      receipt_footer: document.getElementById('receiptFooter').value
    };

    this.settings = settings;
    localStorage.setItem('cocaisse_settings', JSON.stringify(settings));
    this.toastSuccess('Paramètres enregistrés');
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
    document.getElementById(id)?.classList.remove('hidden');
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

      // Afficher le dialogue
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
      this.currentUser = null;
      this.cart = [];
      this.currentDiscount = 0;
      localStorage.removeItem('currentUser');
      this.showLoginScreen();
      this.toastInfo('Vous avez été déconnecté');
    }
  }
}

// Initialize app
let app = null;

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

