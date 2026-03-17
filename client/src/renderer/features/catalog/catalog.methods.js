import { ProductService }  from '../../services/product.service.js';
import { CategoryService } from '../../services/category.service.js';
import { UserService }     from '../../services/user.service.js';
import { SettingsService } from '../../services/settings.service.js';

export const CatalogMethods = {

  // ===== DATA MANAGEMENT =====

  async loadData() {
    try {
      await Promise.all([
        this.loadBusinessConfig(),
        this.loadCategories(),
        this.loadProducts(),
        this.loadDashboard(),
        SettingsService.get().then(s => { if (s) this.settings = s; }).catch(() => {}),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    }
  },

  // Charge la configuration établissement (vatRates, pays, devise…)
  async loadBusinessConfig() {
    try {
      this.businessConfig = await SettingsService.getBusinessConfig();
    } catch (_) { /* silencieux — fallback sur config par défaut */ }
    // Valeurs par défaut France si serveur inaccessible
    if (!this.businessConfig) {
      this.businessConfig = {
        country: 'FR',
        fiscal: { vatRates: [5.5, 10, 20], defaultVatRate: 20, currency: 'EUR', currencySymbol: '€' },
      };
    }
  },

  // Retourne les taux TVA disponibles selon la config active
  getVatRates() {
    return this.businessConfig?.fiscal?.vatRates || [5.5, 10, 20];
  },

  // Retourne le taux TVA par défaut
  getDefaultVatRate() {
    return this.businessConfig?.fiscal?.defaultVatRate ?? 20;
  },

  // Construit les <option> du select TVA — appelé à l'ouverture du formulaire produit
  buildVatOptions(currentRate = null) {
    const rates    = this.getVatRates();
    const selected = currentRate ?? this.getDefaultVatRate();
    return rates.map(r =>
      `<option value="${r}" ${Number(r) === Number(selected) ? 'selected' : ''}>${r} %</option>`
    ).join('');
  },

  /**
   * Calcule la ventilation TVA multi-taux du panier.
   * Retourne { totalHt, totalTax, totalTtc, byRate: [{rate, baseHt, taxAmount, totalTtc}] }
   * Prix TTC = item.price (stocké TTC en base)
   * Prix HT  = TTC / (1 + rate/100)
   */
  computeCartTax() {
    const vatMap = {};
    for (const item of this.cart) {
      const rate    = Number(item.tax_rate ?? this.getDefaultVatRate());
      const ttc     = item.price * item.quantity;
      const ht      = ttc / (1 + rate / 100);
      const taxAmt  = ttc - ht;
      const key     = String(rate);
      if (!vatMap[key]) vatMap[key] = { rate, baseHt: 0, taxAmount: 0, totalTtc: 0 };
      vatMap[key].baseHt    += ht;
      vatMap[key].taxAmount += taxAmt;
      vatMap[key].totalTtc  += ttc;
    }
    const byRate   = Object.values(vatMap).sort((a, b) => a.rate - b.rate);
    const totalTtc = byRate.reduce((s, v) => s + v.totalTtc,  0);
    const totalHt  = byRate.reduce((s, v) => s + v.baseHt,    0);
    const totalTax = byRate.reduce((s, v) => s + v.taxAmount, 0);
    return { totalHt, totalTax, totalTtc, byRate };
  },

  async loadCategories() {
    try {
      this.categories = await CategoryService.getAll();
      this.renderCategories();
      this.renderCategoryFilter();
    } catch (error) {
      console.error('Error loading categories:', error);
      this.categories = [];
    }
  },

  async loadProducts() {
    try {
      this.products = await ProductService.getAll();
      this.renderProducts();
      this.filterProducts('');
    } catch (error) {
      console.error('Error loading products:', error);
      this.products = [];
    }
  },

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
  },

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
  },

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
  },

  filterByCategory(categoryId) {
    // Update active state
    document.querySelectorAll('.category-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    event?.target?.classList.add('active');

    this.renderProducts(categoryId);
  },

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
  },

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
  },

  // ===== PRODUCT & CATEGORY DIALOGS =====

  openProductDialog(productId = null) {
    document.getElementById('productId').value = productId || '';

    // Reset image preview
    const preview = document.getElementById('productImagePreview');
    if (preview) preview.innerHTML = '📦';
    document.getElementById('productImageData').value = '';

    // Injecter les options TVA dynamiques selon la config pays
    const taxSelect = document.getElementById('productTax');
    if (taxSelect) {
      taxSelect.innerHTML = this.buildVatOptions(
        productId
          ? this.products.find(p => p.id === productId)?.tax_rate
          : this.getDefaultVatRate()
      );
    }

    if (productId) {
      const product = this.products.find(p => p.id === productId);
      if (product) {
        document.getElementById('productName').value        = product.name;
        document.getElementById('productDescription').value = product.description || '';
        document.getElementById('productCategory').value    = product.category_id;
        document.getElementById('productPrice').value       = product.price;
        document.getElementById('productCost').value        = product.cost || '';
        if (taxSelect) taxSelect.value = product.tax_rate ?? this.getDefaultVatRate();
        document.getElementById('productBarcode').value     = product.barcode || '';
        document.getElementById('productStock').value       = product.stock || 0;

        if (product.image_url) {
          preview.innerHTML = `<img src="${product.image_url}" alt="${product.name}" class="w-full h-full object-cover rounded-xl">`;
          document.getElementById('productImageData').value = product.image_url;
        }
      }
    } else {
      document.getElementById('productName').value        = '';
      document.getElementById('productDescription').value = '';
      document.getElementById('productPrice').value       = '';
      document.getElementById('productCost').value        = '';
      document.getElementById('productBarcode').value     = '';
      document.getElementById('productStock').value       = '';
    }

    const select = document.getElementById('productCategory');
    select.innerHTML = '<option value="">Sélectionner une catégorie</option>' +
      this.categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    if (productId) {
      const product = this.products.find(p => p.id === productId);
      if (product) select.value = product.category_id;
    }

    this.openModal('productModal');
  },

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
  },

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
      if (productId) await ProductService.update(productId, data);
      else           await ProductService.create(data);
      await this.loadProducts();
      this.closeModal('productModal');
      this.toastSuccess('Produit enregistré');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  },

  async deleteProduct(productId) {
    const confirmed = await this.confirmDelete('ce produit');
    if (!confirmed) return;
    try {
      await ProductService.remove(productId);
      await this.loadProducts();
      this.toastSuccess('Produit supprimé');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  },

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
  },

  async saveCategory(event) {
    event.preventDefault();
    const categoryId = document.getElementById('categoryId').value;
    const data = {
      name: document.getElementById('categoryName').value,
      description: document.getElementById('categoryDescription').value,
      color: document.getElementById('categoryColor').value
    };

    try {
      if (categoryId) await CategoryService.update(categoryId, data);
      else            await CategoryService.create(data);
      await this.loadCategories();
      this.closeModal('categoryModal');
      this.toastSuccess('Catégorie enregistrée');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  },

  async deleteCategory(categoryId) {
    const confirmed = await this.confirmDelete('cette catégorie');
    if (!confirmed) return;

    try {
      await CategoryService.remove(categoryId);
      await this.loadCategories();
      this.toastSuccess('Catégorie supprimée');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  },

  // ===== USER MANAGEMENT =====

  openUserDialog(userId = null) {
    document.getElementById('userId').value = userId || '';
    document.getElementById('username').value = '';
    document.getElementById('userEmail').value = '';
    document.getElementById('userPassword').value = '';
    document.getElementById('userRole').value = '';
    this.openModal('userModal');
  },

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
      if (userId) await UserService.update(userId, data);
      else        await UserService.create(data);
      await this.loadUsers();
      this.closeModal('userModal');
      this.toastSuccess('Utilisateur enregistré');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  },

  async loadUsers() {
    try {
      const users = await UserService.getAll();

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
  },

  async deleteUser(userId) {
    const confirmed = await this.confirmDelete('cet utilisateur');
    if (!confirmed) return;

    try {
      await UserService.remove(userId);
      await this.loadUsers();
      this.toastSuccess('Utilisateur supprimé');
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  },

};
