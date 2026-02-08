// Import styles
import './styles/main.css';

// API Configuration
const API_URL = 'http://localhost:5000/api';

class CocaisseApp {
  constructor() {
    this.currentUser = null;
    this.currentSection = 'dashboard';
    this.products = [];
    this.categories = [];
    this.cart = [];
    this.currentDiscount = 0;
    this.settings = {};
    this.calculator = { value: '0', operation: null, operand: null };

    this.init();
  }

  async init() {
    console.log('✅ Co-Caisse application initialized');

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
      // Afficher l'écran de connexion
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
      userDisplay.textContent = this.currentUser.username || 'Admin';
    }

    // Afficher le tableau de bord par défaut pour cashier
    if (this.currentUser.role === 'cashier') {
      this.showSection('checkout');
    }
  }

  filterMenuByRole() {
    const userRole = this.currentUser?.role || 'cashier';

    // Filtrer les onglets de navigation
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      const allowedRoles = (item.getAttribute('data-role') || '').split(',').map(r => r.trim());

      if (allowedRoles.includes(userRole)) {
        item.classList.remove('hidden');
        item.style.display = '';
      } else {
        item.classList.add('hidden');
        item.style.display = 'none';
      }
    });

    // Filtrer les boutons Export et Import
    const exportBtn = document.querySelector('.export-btn');
    const importBtn = document.querySelector('.import-btn');

    if (userRole === 'admin') {
      if (exportBtn) exportBtn.style.display = '';
      if (importBtn) importBtn.style.display = '';
    } else {
      if (exportBtn) exportBtn.style.display = 'none';
      if (importBtn) importBtn.style.display = 'none';
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

        // Sauvegarder l'utilisateur
        localStorage.setItem('currentUser', JSON.stringify(user));

        console.log('✅ Connexion réussie:', user.username);

        // Vider les champs de connexion
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';

        // Afficher l'app principal
        this.showMainApp();
      } else {
        alert('❌ Identifiants incorrects');
        console.log('❌ Identifiants incorrects');
      }
    } catch (error) {
      console.error('Erreur de connexion:', error);
      alert('❌ Erreur de connexion: ' + error.message);
    }
  }

  setupEventListeners() {
    // Search products - attacher à TOUS les searchInput
    document.querySelectorAll('#searchInput').forEach(input => {
      input.addEventListener('input', (e) => {
        this.searchProducts(e.target.value);
      });
    });

    // Payment methods
    document.querySelectorAll('.payment-method').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.payment-method').forEach(b => b.classList.remove('active'));
        e.target.closest('button').classList.add('active');
        this.updateChangeSection();
      });
    });

    // Amount received - attacher à TOUS les amountReceived
    document.querySelectorAll('#amountReceived').forEach(input => {
      input.addEventListener('input', () => {
        this.calculateChange();
      });
    });

    // Amount received input
    document.getElementById('amountReceived')?.addEventListener('input', (e) => {
      this.calculateChange();
    });

    // Product search in management
    document.getElementById('productsSearch')?.addEventListener('input', (e) => {
      this.filterProducts(e.target.value);
    });
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
      item.quantity = Math.max(1, quantity);
      this.updateCartDisplay();
    }
  }

  updateCartDisplay() {
    const cartItems = document.querySelectorAll('#cartItems');
    if (cartItems.length === 0) return;

    const html = this.cart.length === 0
      ? '<p class="text-gray-500 text-center py-4 text-xs md:text-sm">Aucun produit</p>'
      : this.cart.map(item => `
      <div class="flex justify-between items-center p-1 md:p-2 bg-gray-50 rounded text-xs md:text-sm">
        <div class="flex-1 min-w-0">
          <p class="font-semibold truncate">${item.name}</p>
          <p class="text-gray-500">${item.price.toFixed(2)} € x ${item.quantity}</p>
        </div>
        <div class="text-right mx-1">
          <p class="font-bold">${(item.price * item.quantity).toFixed(2)} €</p>
          <input type="number" value="${item.quantity}" min="1"
                 onchange="app.updateCartItemQty('${item.id}', this.value)"
                 class="w-10 md:w-12 px-1 py-0.5 text-xs border border-gray-300 rounded">
        </div>
        <button onclick="app.removeFromCart('${item.id}')" class="ml-1 text-red-500 hover:text-red-700 font-bold">✕</button>
      </div>
    `).join('');

    // Mettre à jour tous les cartItems
    cartItems.forEach(cart => {
      cart.innerHTML = html;
    });

    this.updateTotals();
  }

  updateTotals() {
    const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * 0.20; // 20% TVA
    const discount = this.currentDiscount;
    const total = subtotal + tax - discount;

    // Mettre à jour TOUS les éléments
    document.querySelectorAll('#subtotal').forEach(el => {
      el.textContent = subtotal.toFixed(2).replace('.', ',') + ' €';
    });
    document.querySelectorAll('#taxAmount').forEach(el => {
      el.textContent = tax.toFixed(2).replace('.', ',') + ' €';
    });
    document.querySelectorAll('#discountDisplay').forEach(el => {
      el.textContent = discount.toFixed(2).replace('.', ',') + ' €';
    });
    document.querySelectorAll('#totalAmount').forEach(el => {
      el.textContent = total.toFixed(2).replace('.', ',') + ' €';
    });
  }

  updateChangeSection() {
    const selected = document.querySelector('.payment-method.active');
    const changeSections = document.querySelectorAll('#changeSection');

    changeSections.forEach(changeSection => {
      if (selected?.dataset.method === 'cash') {
        changeSection.classList.remove('hidden');
        changeSection.style.display = '';
      } else {
        changeSection.classList.add('hidden');
        changeSection.style.display = 'none';
      }
    });
  }

  calculateChange() {
    const amountReceivedInputs = document.querySelectorAll('#amountReceived');
    if (amountReceivedInputs.length === 0) return;

    const amountReceived = parseFloat(amountReceivedInputs[0]?.value || 0);
    const totalAmount = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = totalAmount * 0.20;
    const discount = this.currentDiscount;
    const total = totalAmount + tax - discount;

    const change = amountReceived - total;

    // Mettre à jour TOUS les changeDisplay et changeAmount
    document.querySelectorAll('#changeDisplay').forEach(changeDisplay => {
      if (amountReceived > 0) {
        changeDisplay.classList.remove('hidden');
        changeDisplay.style.display = '';
      } else {
        changeDisplay.classList.add('hidden');
        changeDisplay.style.display = 'none';
      }
    });

    document.querySelectorAll('#changeAmount').forEach(changeAmount => {
      changeAmount.textContent = change.toFixed(2).replace('.', ',') + ' €';
      changeAmount.className = change >= 0
        ? 'text-2xl font-bold text-green-600'
        : 'text-2xl font-bold text-red-600';
    });
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
    } catch (error) {
      console.error('Error loading products:', error);
    }
  }

  renderCategories() {
    const categoriesGrid = document.getElementById('categoriesGrid');
    if (!categoriesGrid) return;

    if (this.categories.length === 0) {
      categoriesGrid.innerHTML = '<p class="col-span-full text-center py-4 text-gray-500">Aucune catégorie</p>';
      return;
    }

    categoriesGrid.innerHTML = this.categories.map(cat => `
      <div class="category-card p-4" style="background-color: ${cat.color || '#f3f4f6'}80">
        <div class="flex justify-between items-start mb-2">
          <h4 class="font-bold text-lg">${cat.name}</h4>
          <div class="flex gap-1">
            <button onclick="app.openCategoryDialog('${cat.id}')" class="text-blue-500 hover:text-blue-700">✏️</button>
            <button onclick="app.deleteCategory('${cat.id}')" class="text-red-500 hover:text-red-700">🗑️</button>
          </div>
        </div>
        ${cat.image_url ? `<img src="${cat.image_url}" alt="" class="w-full h-24 object-cover rounded mb-2">` : ''}
        <p class="text-sm text-gray-600">${cat.description || ''}</p>
        <p class="text-xs text-gray-500 mt-2">${this.products.filter(p => p.category_id === cat.id).length} produits</p>
      </div>
    `).join('');
  }

  renderCategoryFilter() {
    const categoriesLists = document.querySelectorAll('#categoriesList');
    if (categoriesLists.length === 0) return;

    const html = `
      <button class="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm" onclick="app.filterByCategory('')">Tous</button>
      ${this.categories.map(cat => `
        <button class="px-3 py-2 bg-gray-200 hover:bg-blue-500 hover:text-white rounded-lg text-sm transition"
                onclick="app.filterByCategory('${cat.id}')">${cat.name}</button>
      `).join('')}
    `;

    // Mettre à jour tous les éléments categoriesList
    categoriesLists.forEach(list => {
      list.innerHTML = html;
    });
  }

  renderProducts(filter = '') {
    const productsLists = document.querySelectorAll('#productsList');
    if (productsLists.length === 0) return;

    let filtered = this.products.filter(p => p.active !== false);

    if (filter) {
      filtered = filtered.filter(p => p.category_id === filter);
    }

    const html = filtered.length === 0
      ? '<p class="col-span-2 text-gray-500 text-center py-4">Aucun produit</p>'
      : filtered.map(product => `
      <div class="product-card" onclick="app.addToCart('${product.id}')">
        ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}">` : '<div class="w-full h-24 bg-gray-200 rounded-md mb-2 flex items-center justify-center">📦</div>'}
        <p class="product-card-name">${product.name}</p>
        <p class="text-xs text-gray-500 truncate">${product.barcode || '-'}</p>
        <p class="product-card-price">${product.price.toFixed(2)} €</p>
      </div>
    `).join('');

    // Mettre à jour tous les éléments productsList
    productsLists.forEach(list => {
      list.innerHTML = html;
    });
  }

  filterByCategory(categoryId) {
    this.renderProducts(categoryId);
  }

  searchProducts(query) {
    const productsLists = document.querySelectorAll('#productsList');
    if (productsLists.length === 0) return;

    if (!query.trim()) {
      this.renderProducts();
      return;
    }

    const filtered = this.products.filter(p =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      (p.barcode && p.barcode.includes(query)) ||
      p.description?.toLowerCase().includes(query.toLowerCase())
    );

    const html = filtered.length === 0
      ? '<p class="col-span-2 text-gray-500 text-center py-4">Aucun produit trouvé</p>'
      : filtered.map(product => `
      <div class="product-card" onclick="app.addToCart('${product.id}')">
        ${product.image_url ? `<img src="${product.image_url}" alt="${product.name}">` : '<div class="w-full h-24 bg-gray-200 rounded-md mb-2 flex items-center justify-center">📦</div>'}
        <p class="product-card-name">${product.name}</p>
        <p class="text-xs text-gray-500 truncate">${product.barcode || '-'}</p>
        <p class="product-card-price">${product.price.toFixed(2)} €</p>
      </div>
    `).join('');

    // Mettre à jour tous les éléments productsList
    productsLists.forEach(list => {
      list.innerHTML = html;
    });
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

    table.innerHTML = filtered.map(product => `
      <tr>
        <td class="px-4 py-2">${product.name}</td>
        <td class="px-4 py-2">${this.categories.find(c => c.id === product.category_id)?.name || '-'}</td>
        <td class="px-4 py-2 text-right">${product.price.toFixed(2)} €</td>
        <td class="px-4 py-2 text-center">${product.stock || 0}</td>
        <td class="px-4 py-2 text-center">${product.tax_rate || 20}%</td>
        <td class="px-4 py-2 text-center">
          <button onclick="app.openProductDialog('${product.id}')" class="text-blue-500 hover:text-blue-700">✏️</button>
          <button onclick="app.deleteProduct('${product.id}')" class="text-red-500 hover:text-red-700">🗑️</button>
        </td>
      </tr>
    `).join('');

    if (filtered.length === 0) {
      table.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Aucun produit</td></tr>';
    }
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
        container.innerHTML = '<p class="text-gray-500 text-center py-4">Aucune transaction</p>';
        return;
      }

      container.innerHTML = transactions.map(t => `
        <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
          <div>
            <p class="font-semibold text-sm">${t.receipt_number}</p>
            <p class="text-xs text-gray-500">${new Date(t.transaction_date).toLocaleString('fr-FR')}</p>
          </div>
          <div class="text-right">
            <p class="font-bold">${t.total.toFixed(2)} €</p>
            <p class="text-xs text-gray-500">${t.payment_method}</p>
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

      table.innerHTML = transactions.map(t => `
        <tr>
          <td class="px-4 py-2">${new Date(t.transaction_date).toLocaleString('fr-FR')}</td>
          <td class="px-4 py-2">${t.receipt_number}</td>
          <td class="px-4 py-2 text-right font-bold">${t.total.toFixed(2)} €</td>
          <td class="px-4 py-2">${t.payment_method}</td>
          <td class="px-4 py-2 text-center">${JSON.parse(t.items || '[]').length}</td>
          <td class="px-4 py-2 text-center">
            <button onclick="app.viewReceipt('${t.id}')" class="text-blue-500 hover:text-blue-700">👁️</button>
          </td>
        </tr>
      `).join('');

      if (transactions.length === 0) {
        table.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Aucune transaction</td></tr>';
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  }

  // ===== DIALOGS & MODALS =====
  showSection(section) {
    // Vérifier les permissions
    const button = Array.from(document.querySelectorAll('.nav-item')).find(
      btn => btn.getAttribute('onclick')?.includes(`'${section}'`)
    );

    if (button) {
      const allowedRoles = (button.getAttribute('data-role') || '').split(',').map(r => r.trim());
      const userRole = this.currentUser?.role || 'cashier';

      if (!allowedRoles.includes(userRole)) {
        console.warn(`❌ Accès refusé: ${userRole} ne peut pas accéder à ${section}`);
        alert('❌ Vous n\'avez pas accès à cette section');
        return;
      }
    }

    document.querySelectorAll('[id$="-section"]').forEach(s => s.classList.add('hidden'));
    document.getElementById(section + '-section')?.classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    event?.target?.closest('button')?.classList.add('active');

    const titles = {
      dashboard: 'Tableau de bord',
      checkout: 'Caisse',
      products: 'Produits',
      categories: 'Catégories',
      transactions: 'Historique',
      reports: 'Rapports',
      users: 'Utilisateurs',
      settings: 'Paramètres'
    };

    document.getElementById('pageTitle').textContent = titles[section] || section;
    this.currentSection = section;

    if (section === 'products') this.filterProducts('');
    if (section === 'transactions') this.loadTransactions();
    if (section === 'reports') this.loadReports();
    if (section === 'users') this.loadUsers();
    if (section === 'settings') this.loadSettings();
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
        if (product.image_url) {
          document.getElementById('productImagePreview').src = product.image_url;
          document.getElementById('productImagePreview').style.display = 'block';
        }
      }
    } else {
      document.getElementById('productForm')?.reset();
    }

    const select = document.getElementById('productCategory');
    select.innerHTML = '<option value="">Sélectionner une catégorie</option>' +
      this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

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
      image_url: document.getElementById('productImagePreview')?.src || ''
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
    if (!confirm('Êtes-vous sûr ?')) return;

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
        document.getElementById('categoryColor').value = category.color || '#3b82f6';
        if (category.image_url) {
          document.getElementById('categoryImagePreview').src = category.image_url;
          document.getElementById('categoryImagePreview').style.display = 'block';
        }
      }
    }

    this.openModal('categoryModal');
  }

  async saveCategory(event) {
    event.preventDefault();
    const categoryId = document.getElementById('categoryId').value;
    const data = {
      name: document.getElementById('categoryName').value,
      description: document.getElementById('categoryDescription').value,
      color: document.getElementById('categoryColor').value,
      image_url: document.getElementById('categoryImagePreview')?.src || ''
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
    if (!confirm('Êtes-vous sûr ?')) return;

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

      const table = document.getElementById('usersTable');
      if (!table) return;

      table.innerHTML = users.map(user => `
        <tr>
          <td class="px-4 py-2">${user.username}</td>
          <td class="px-4 py-2">${user.email || '-'}</td>
          <td class="px-4 py-2">${user.role}</td>
          <td class="px-4 py-2 text-center">${user.profile}</td>
          <td class="px-4 py-2 text-center">${user.active ? '✅' : '❌'}</td>
          <td class="px-4 py-2 text-center">
            <button onclick="app.openUserDialog('${user.id}')" class="text-blue-500 hover:text-blue-700">✏️</button>
            <button onclick="app.deleteUser('${user.id}')" class="text-red-500 hover:text-red-700">🗑️</button>
          </td>
        </tr>
      `).join('');

      if (users.length === 0) {
        table.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-500">Aucun utilisateur</td></tr>';
      }
    } catch (error) {
      console.error('Error loading users:', error);
    }
  }

  async deleteUser(userId) {
    if (!confirm('Êtes-vous sûr ?')) return;

    try {
      await fetch(`${API_URL}/users/${userId}`, { method: 'DELETE' });
      await this.loadUsers();
      alert('✅ Utilisateur supprimé');
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
    }
  }

  openDiscountDialog() {
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
    const companyEmail = this.settings.company_email || '';
    const taxNumber = this.settings.tax_number || '';

    // Parser les items si c'est une string JSON
    const items = typeof transaction.items === 'string' ? JSON.parse(transaction.items) : transaction.items;

    // Formater la date et heure
    const transactionDate = new Date(transaction.transaction_date);
    const dateStr = transactionDate.toLocaleDateString('fr-FR');
    const timeStr = transactionDate.toLocaleTimeString('fr-FR');

    // Mapper les méthodes de paiement
    const paymentMethods = {
      'cash': 'ESPÈCES',
      'card': 'CARTE BANCAIRE',
      'check': 'CHÈQUE',
      'transfer': 'VIREMENT'
    };

    // Fonction pour centrer le texte sur 40 caractères
    const centerText = (text, width = 40) => {
      const padding = Math.max(0, width - text.length);
      const padLeft = Math.floor(padding / 2);
      const padRight = padding - padLeft;
      return ' '.repeat(padLeft) + text + ' '.repeat(padRight);
    };

    // Fonction pour aligner à droite
    const rightAlign = (text, width) => {
      return text.toString().padStart(width);
    };

    // Ligne de séparation
    const separator = '══════════════════════════════════════';
    const dash = '──────────────────────────────────────';

    // Construire le ticket
    const ticketLines = [
      '╔══════════════════════════════════════╗',
      '║' + centerText(companyName.toUpperCase(), 38) + '║',
      '║' + centerText('', 38) + '║',
      '╚══════════════════════════════════════╝',
      '',
      companyAddress ? companyAddress : '',
      companyPhone ? 'Tél: ' + companyPhone : '',
      companyEmail ? companyEmail : '',
      taxNumber ? 'SIRET/TVA: ' + taxNumber : '',
      '',
      '──────────────────────────────────────',
      centerText('REÇU DE CAISSE', 40),
      '──────────────────────────────────────',
      '',
      'Date: ' + dateStr,
      'Heure: ' + timeStr,
      'Reçu N°: ' + transaction.receipt_number,
      '',
      separator,
      '',
      'DÉSIGNATION              QTE   PRIX   TOTAL',
      dash
    ];

    // Ajouter les articles
    items.forEach(item => {
      const name = item.name.substring(0, 22).padEnd(22);
      const qty = rightAlign(item.quantity, 4);
      const price = rightAlign(item.price.toFixed(2), 6);
      const total = rightAlign(item.total.toFixed(2), 6);
      ticketLines.push(`${name}${qty} ${price}€ ${total}€`);
    });

    ticketLines.push(dash);
    ticketLines.push('');

    // Totaux
    const subtotalLabel = 'Sous-total HT'.padEnd(22);
    const subtotalValue = rightAlign(transaction.subtotal.toFixed(2), 13);
    ticketLines.push(subtotalLabel + subtotalValue + '€');

    const taxLabel = 'Montant TVA (20%)'.padEnd(22);
    const taxValue = rightAlign(transaction.tax.toFixed(2), 13);
    ticketLines.push(taxLabel + taxValue + '€');

    if (transaction.discount > 0) {
      const discountLabel = 'Remise appliquée'.padEnd(22);
      const discountValue = rightAlign('-' + transaction.discount.toFixed(2), 13);
      ticketLines.push(discountLabel + discountValue + '€');
    }

    ticketLines.push('');
    ticketLines.push(separator);

    const totalLabel = 'MONTANT TOTAL'.padEnd(22);
    const totalValue = rightAlign(transaction.total.toFixed(2), 13);
    ticketLines.push(totalLabel + totalValue + '€');

    ticketLines.push(separator);
    ticketLines.push('');

    // Paiement
    ticketLines.push('Mode de paiement: ' + (paymentMethods[transaction.payment_method] || transaction.payment_method.toUpperCase()));

    if (transaction.change > 0) {
      const paidLabel = 'Montant reçu'.padEnd(22);
      const paidValue = rightAlign((transaction.total + transaction.change).toFixed(2), 13);
      ticketLines.push(paidLabel + paidValue + '€');

      const changeLabel = 'Reste à rendre'.padEnd(22);
      const changeValue = rightAlign(transaction.change.toFixed(2), 13);
      ticketLines.push(changeLabel + changeValue + '€');
    }

    ticketLines.push('');
    ticketLines.push(separator);
    ticketLines.push('');
    ticketLines.push(centerText(this.settings.receipt_footer || 'Merci de votre visite !', 40));
    ticketLines.push('');
    ticketLines.push(separator);

    const content = ticketLines.filter(line => line !== '').join('\n');
    receiptContent.textContent = content;
    this.openModal('receiptModal');
  }

  printReceipt() {
    const content = document.getElementById('receiptContent').textContent;

    if (window.electron) {
      // Pour Electron - impression native
      window.electron.printTicket(`<pre style="font-family: monospace; font-size: 10pt; white-space: pre-wrap; word-wrap: break-word;">${content}</pre>`);
    } else {
      // Pour le navigateur - créer une fenêtre d'impression
      const printWindow = window.open('', '', 'height=800,width=400');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Reçu de caisse</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              margin: 0;
              padding: 10px;
              font-size: 11pt;
            }
            pre {
              white-space: pre-wrap;
              word-wrap: break-word;
              margin: 0;
            }
            @media print {
              body {
                margin: 0;
                padding: 5px;
              }
            }
          </style>
        </head>
        <body>
          <pre>${content}</pre>
          <script>
            window.addEventListener('load', function() {
              window.print();
              window.close();
            });
          </script>
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

  // ===== REPORTS =====
  async loadReports() {
    try {
      const response = await fetch(`${API_URL}/reports/sales/daily`);
      const sales = await response.json();

      const reportDiv = document.getElementById('salesReport');
      if (reportDiv) {
        reportDiv.innerHTML = sales.slice(0, 7).map(s => `
          <div class="p-2 bg-gray-50 rounded flex justify-between">
            <span>${new Date(s.date).toLocaleDateString('fr-FR')}</span>
            <span class="font-bold">${s.total_sales.toFixed(2)} € (${s.transaction_count} tx)</span>
          </div>
        `).join('');
      }

      const productsResponse = await fetch(`${API_URL}/reports/products`);
      const products = await productsResponse.json();

      const topDiv = document.getElementById('topProducts');
      if (topDiv) {
        topDiv.innerHTML = products.slice(0, 10).map(p => `
          <div class="p-2 bg-gray-50 rounded flex justify-between">
            <span>${p.name}</span>
            <span class="font-bold">${p.revenue?.toFixed(2) || 0} €</span>
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Error loading reports:', error);
    }
  }

  // ===== SETTINGS =====
  async loadSettings() {
    // Load and display settings
    console.log('Loading settings...');
  }

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
      if (window.electron) {
        const allData = {
          categories: this.categories,
          products: this.products,
          settings: this.settings,
          exportedAt: new Date().toISOString()
        };

        const result = await window.electron.exportData(allData);
        if (result.success) {
          alert(`✅ Données exportées: ${result.path}`);
        }
      } else {
        const allData = {
          categories: this.categories,
          products: this.products,
          settings: this.settings,
          exportedAt: new Date().toISOString()
        };

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

  async dataImport() {
    try {
      if (window.electron) {
        const result = await window.electron.importData();
        if (result.success && result.data) {
          // Import categories and products
          const data = result.data;
          // Update local data
          alert('✅ Données importées');
        }
      }
    } catch (error) {
      alert('❌ Erreur: ' + error.message);
    }
  }

  // ===== UTILITIES =====
  openModal(id) {
    document.getElementById(id).classList.remove('hidden');
  }

  closeModal(id) {
    document.getElementById(id).classList.add('hidden');
  }

  toggleSidebar() {
    document.querySelector('aside').classList.toggle('show');
  }

  updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString('fr-FR');
  }

  logout() {
    console.log('🔐 Déconnexion...');
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      console.log('✅ Déconnexion confirmée');

      // Nettoyer les données
      this.currentUser = null;
      this.cart = [];
      this.currentDiscount = 0;
      this.currentSection = 'dashboard';

      // Vider le localStorage
      localStorage.removeItem('currentUser');
      localStorage.removeItem('cart');
      localStorage.removeItem('currentDiscount');

      // Vider les champs de connexion
      document.getElementById('loginUsername').value = '';
      document.getElementById('loginPassword').value = '';

      // Afficher l'écran de connexion
      this.showLoginScreen();
      console.log('🔐 Écran de connexion affiché');
    }
  }
}

// Make app globally accessible and Initialize app when DOM is ready
let app = null;

function initializeApp() {
  console.log('🚀 Initialisation de l\'application Co-Caisse');
  app = new CocaisseApp();
  window.app = app;
  console.log('✅ Application initialisée');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

