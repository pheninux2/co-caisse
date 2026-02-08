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
      } else {
        alert('❌ Identifiants incorrects');
      }
    } catch (error) {
      console.error('Erreur de connexion:', error);
      alert('❌ Erreur de connexion: ' + error.message);
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

  clearCart() {
    if (this.cart.length === 0) return;
    if (confirm('Vider le panier ?')) {
      this.cart = [];
      this.currentDiscount = 0;
      this.updateCartDisplay();
    }
  }

  holdCart() {
    if (this.cart.length === 0) {
      alert('Le panier est vide');
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
    alert(`✅ Panier mis en attente (${this.heldCarts.length} en attente)`);
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
            <div class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-sm">📦</div>
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

      let url = `${API_URL}/transactions`;
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      if (params.toString()) url += '?' + params.toString();

      const response = await fetch(url);
      const transactions = await response.json();

      const table = document.getElementById('transactionsTable');
      if (!table) return;

      if (transactions.length === 0) {
        table.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-400">Aucune transaction</td></tr>';
        return;
      }

      table.innerHTML = transactions.map(t => `
        <tr>
          <td class="px-3 py-2">
            <p class="font-medium text-gray-800">${new Date(t.transaction_date).toLocaleDateString('fr-FR')}</p>
            <p class="text-xs text-gray-500">${new Date(t.transaction_date).toLocaleTimeString('fr-FR')}</p>
          </td>
          <td class="px-3 py-2 hidden sm:table-cell text-gray-600">${t.receipt_number}</td>
          <td class="px-3 py-2 text-right font-bold text-indigo-600">${t.total.toFixed(2)} €</td>
          <td class="px-3 py-2 text-center hidden md:table-cell">
            <span class="badge ${t.payment_method === 'cash' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}">
              ${t.payment_method === 'cash' ? '💵 Espèces' : '💳 Carte'}
            </span>
          </td>
          <td class="px-3 py-2 text-center">
            <button onclick="app.viewReceipt('${t.id}')" class="action-btn action-btn-edit">👁️</button>
          </td>
        </tr>
      `).join('');
    } catch (error) {
      console.error('Error loading transactions:', error);
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
        alert('❌ Vous n\'avez pas accès à cette section');
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
      alert('✅ Produit enregistré');
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
    }
  }

  async deleteProduct(productId) {
    if (!confirm('Supprimer ce produit ?')) return;

    try {
      await fetch(`${API_URL}/products/${productId}`, { method: 'DELETE' });
      await this.loadProducts();
      alert('✅ Produit supprimé');
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
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
      alert('✅ Catégorie enregistrée');
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
    }
  }

  async deleteCategory(categoryId) {
    if (!confirm('Supprimer cette catégorie ?')) return;

    try {
      await fetch(`${API_URL}/categories/${categoryId}`, { method: 'DELETE' });
      await this.loadCategories();
      alert('✅ Catégorie supprimée');
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
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
      alert('✅ Utilisateur enregistré');
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
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
    if (!confirm('Supprimer cet utilisateur ?')) return;

    try {
      await fetch(`${API_URL}/users/${userId}`, { method: 'DELETE' });
      await this.loadUsers();
      alert('✅ Utilisateur supprimé');
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
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
      alert('Veuillez sélectionner un moyen de paiement');
      return;
    }

    if (this.cart.length === 0) {
      alert('Le panier est vide');
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
      alert('Montant insuffisant');
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
      const response = await fetch(`${API_URL}/transactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transaction)
      });

      const result = await response.json();
      this.showReceipt(result);
      this.cart = [];
      this.currentDiscount = 0;
      document.getElementById('amountReceived').value = '';
      this.updateCartDisplay();
      await this.loadDashboard();
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
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
      alert('❌ Erreur: ' + error.message);
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
    alert('✅ Paramètres enregistrés');
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
          alert(`✅ Données exportées: ${result.path}`);
        }
      } else {
        const dataStr = JSON.stringify(allData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `cocaisse-export-${Date.now()}.json`;
        link.click();
        alert('✅ Données exportées');
      }
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
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

  logout() {
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      this.currentUser = null;
      this.cart = [];
      this.currentDiscount = 0;
      localStorage.removeItem('currentUser');
      this.showLoginScreen();
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

