/**
 * Gestion des variantes, options et sauces
 * ========================================
 *
 * Module pour :
 * - Charger les groupes de variantes assignés à un produit
 * - Afficher la modal de sélection
 * - Valider les sélections
 * - Stocker les variantes dans les items du panier
 * - Afficher les variantes dans le panier et les commandes
 */

class VariantsManager {
  constructor(app, apiUrl) {
    this.app = app; // Référence à l'instance CocaisseApp
    this.apiUrl = apiUrl; // URL de base de l'API (ex: http://localhost:5000/api)
    this.currentVariantSelection = {}; // Stockage temporaire : { groupId: [optionIds] }
    this.currentProductWithVariants = null; // Produit en cours de sélection
  }

  /**
   * Charge les groupes de variantes assignés à un produit
   * @param {string} productId - ID du produit
   * @returns {Promise<Array>} Liste des groupes avec options
   */
  async loadProductVariants(productId) {
    try {
      const response = await fetch(`${this.apiUrl}/products/${productId}/variants`, {
        headers: this.app.getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.app._handleTokenExpired();
          return null;
        }
        throw new Error('Erreur chargement variantes');
      }

      const variants = await response.json();
      console.log(`[VariantsManager] Variantes chargées pour produit ${productId}:`, variants);
      return variants;
    } catch (error) {
      console.error('[VariantsManager] loadProductVariants error:', error);
      this.app.toastError(`Erreur : ${error.message}`);
      return null;
    }
  }

  /**
   * Affiche la modal de sélection des variantes
   * @param {Object} product - Objet produit
   * @param {Array} variants - Groupes de variantes avec options
   */
  showVariantsModal(product, variants) {
    if (!variants || variants.length === 0) {
      // Aucune variante → ajouter directement au panier
      this.app.addToCart(product.id);
      return;
    }

    this.currentProductWithVariants = product;
    this.currentVariantSelection = {};

    // Construire le contenu de la modal
    let modalHTML = `
      <div class="modal-backdrop" onclick="app.variantsManager.closeVariantsModal()"></div>
      <div class="modal-content max-w-2xl max-h-[90vh] overflow-y-auto">
        <div class="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div>
            <h3 class="font-bold text-lg text-gray-800">${this.app._escapeHtml(product.name)}</h3>
            <p class="text-sm text-gray-500">Prix de base : ${product.price.toFixed(2)}€</p>
          </div>
          <button onclick="app.variantsManager.closeVariantsModal()" class="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <div class="p-4 space-y-4">
          <div id="variantGroups" class="space-y-4">
    `;

    // Afficher chaque groupe de variantes
    variants.forEach((group) => {
      const groupId = group.id || group.assignmentId;
      const isRequired = group.required ? '✓ Obligatoire' : 'Optionnel';
      const badge = group.required ? '<span class="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">Obligatoire</span>' : '';

      modalHTML += `
        <div class="border border-gray-200 rounded-lg p-4" data-group-id="${groupId}">
          <div class="flex items-center justify-between mb-3">
            <h4 class="font-semibold text-gray-800">${this.app._escapeHtml(group.name)}</h4>
            ${badge}
          </div>

          <div class="space-y-2" id="options-${groupId}">
      `;

      // Type de sélection : radio (single) ou checkbox (multiple)
      const inputType = group.type === 'single' ? 'radio' : 'checkbox';

      group.options.forEach((option) => {
        const optionId = option.id;
        const checked = option.is_default ? 'checked' : '';
        const priceText = option.price_modifier > 0
          ? `+${option.price_modifier.toFixed(2)}€`
          : option.price_modifier < 0
          ? `${option.price_modifier.toFixed(2)}€`
          : 'Inclus';

        modalHTML += `
          <label class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
            <input 
              type="${inputType}" 
              name="group-${groupId}" 
              value="${optionId}" 
              data-group-id="${groupId}"
              data-group-name="${this.app._escapeHtml(group.name)}"
              data-option-name="${this.app._escapeHtml(option.name)}"
              data-price-modifier="${option.price_modifier}"
              ${checked}
              onchange="app.variantsManager.onVariantChange()"
              class="w-4 h-4"
            >
            <span class="flex-1 text-sm text-gray-700">${this.app._escapeHtml(option.name)}</span>
            <span class="text-xs text-gray-500">${priceText}</span>
          </label>
        `;
      });

      modalHTML += `
          </div>
          <div class="mt-2 text-xs text-red-600 hidden" id="error-${groupId}"></div>
        </div>
      `;
    });

    // Afficher le prix total mis à jour en temps réel
    modalHTML += `
        </div>

        <div class="sticky bottom-0 bg-white border-t border-gray-200 p-4 space-y-3">
          <div class="flex items-center justify-between text-lg font-bold">
            <span>Total :</span>
            <span id="variantTotalPrice" class="text-indigo-600">${product.price.toFixed(2)}€</span>
          </div>
          <div class="flex gap-2">
            <button 
              onclick="app.variantsManager.closeVariantsModal()" 
              class="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
            >
              Annuler
            </button>
            <button 
              id="addToCartBtn" 
              onclick="app.variantsManager.addProductToCart()" 
              class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ajouter au panier
            </button>
          </div>
        </div>
      </div>
    `;

    // Afficher la modal
    const modal = document.getElementById('variantsModal');
    if (modal) {
      modal.innerHTML = modalHTML;
      modal.classList.remove('hidden');
    }

    // Mettre à jour le prix initial
    this.updateVariantTotalPrice();
  }

  /**
   * Appelé lors du changement de sélection d'une variante
   */
  onVariantChange() {
    // Reconstruction de la sélection
    this.currentVariantSelection = {};

    const groupElements = document.querySelectorAll('[data-group-id]');
    groupElements.forEach((input) => {
      if (input.checked) {
        const groupId = input.dataset.groupId;
        if (!this.currentVariantSelection[groupId]) {
          this.currentVariantSelection[groupId] = [];
        }
        this.currentVariantSelection[groupId].push({
          optionId: input.value,
          optionName: input.dataset.optionName,
          priceModifier: parseFloat(input.dataset.priceModifier),
          groupName: input.dataset.groupName
        });
      }
    });

    this.updateVariantTotalPrice();
  }

  /**
   * Met à jour l'affichage du prix total des variantes
   */
  updateVariantTotalPrice() {
    if (!this.currentProductWithVariants) return;

    let totalPrice = this.currentProductWithVariants.price;
    let totalModifier = 0;

    Object.values(this.currentVariantSelection).forEach((options) => {
      options.forEach((opt) => {
        totalModifier += opt.priceModifier;
      });
    });

    totalPrice += totalModifier;

    const priceElement = document.getElementById('variantTotalPrice');
    if (priceElement) {
      priceElement.textContent = totalPrice.toFixed(2) + '€';
    }

    // Vérifier la validation
    this.validateVariantSelection();
  }

  /**
   * Valide les sélections (notamment les groupes obligatoires)
   */
  validateVariantSelection() {
    const button = document.getElementById('addToCartBtn');
    if (!button) return;

    let isValid = true;
    let errorMessages = {};

    // Récupérer tous les groupes
    const groupElements = document.querySelectorAll('[data-group-id]');
    const groups = new Map();

    groupElements.forEach((input) => {
      const groupId = input.dataset.groupId;
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          required: input.parentElement.parentElement.parentElement.querySelector('span:contains("Obligatoire")') !== null,
          hasSelection: false
        });
      }
    });

    // Vérifier que chaque groupe obligatoire a au moins une sélection
    groupElements.forEach((input) => {
      if (input.checked) {
        const groupId = input.dataset.groupId;
        const group = groups.get(groupId);
        if (group) group.hasSelection = true;
      }
    });

    // Chercher les groupes avec required=true
    const groupContainers = document.querySelectorAll('[data-group-id]');
    const processedGroups = new Set();

    groupContainers.forEach((input) => {
      const groupId = input.dataset.groupId;
      if (processedGroups.has(groupId)) return;
      processedGroups.add(groupId);

      const container = input.closest('[data-group-id]').parentElement.parentElement;
      const badge = container.querySelector('span:contains("Obligatoire")');
      const isRequired = container.innerHTML.includes('Obligatoire');

      // Vérifier la sélection
      const selected = document.querySelector(`input[data-group-id="${groupId}"]:checked`);
      if (isRequired && !selected) {
        isValid = false;
        errorMessages[groupId] = 'Veuillez faire un choix';
      }
    });

    // Afficher les messages d'erreur
    Object.keys(errorMessages).forEach((groupId) => {
      const errorDiv = document.getElementById(`error-${groupId}`);
      if (errorDiv) {
        errorDiv.textContent = errorMessages[groupId];
        errorDiv.classList.remove('hidden');
      }
    });

    // Masquer les erreurs des groupes valides
    document.querySelectorAll('[id^="error-"]').forEach((div) => {
      const groupId = div.id.replace('error-', '');
      if (!errorMessages[groupId]) {
        div.classList.add('hidden');
      }
    });

    button.disabled = !isValid;
  }

  /**
   * Ajoute le produit au panier avec les variantes sélectionnées
   */
  addProductToCart() {
    if (!this.currentProductWithVariants) return;

    // Construire l'array des variantes sélectionnées
    const variants = [];
    Object.values(this.currentVariantSelection).forEach((options) => {
      options.forEach((opt) => {
        variants.push({
          groupId: opt.groupId || '', // À récupérer depuis le sélecteur
          groupName: opt.groupName,
          optionId: opt.optionId,
          optionName: opt.optionName,
          priceModifier: opt.priceModifier
        });
      });
    });

    // Récupérer les groupes depuis le DOM pour avoir les groupIds
    document.querySelectorAll('[data-group-id]:checked').forEach((input) => {
      const index = variants.findIndex(v => v.optionId === input.value);
      if (index >= 0) {
        variants[index].groupId = input.dataset.groupId;
      }
    });

    // Calculer le prix total
    let priceModifier = 0;
    variants.forEach(v => {
      priceModifier += v.priceModifier;
    });

    const product = this.currentProductWithVariants;
    const finalPrice = product.price + priceModifier;

    // Ajouter au panier
    const existingItem = this.app.cart.find(item =>
      item.id === product.id &&
      JSON.stringify(item.variants || []) === JSON.stringify(variants)
    );

    if (existingItem) {
      existingItem.quantity++;
    } else {
      this.app.cart.push({
        ...product,
        quantity: 1,
        discount: 0,
        variants: variants,
        price: finalPrice // Stocker le prix final avec les variantes
      });
    }

    this.app.updateCartDisplay();
    this.closeVariantsModal();
    this.app.toastSuccess(`${product.name} ajouté au panier`);
  }

  /**
   * Ferme la modal de variantes
   */
  closeVariantsModal() {
    const modal = document.getElementById('variantsModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.innerHTML = '';
    }
    this.currentVariantSelection = {};
    this.currentProductWithVariants = null;
  }

  /**
   * Affiche les variantes d'un item dans le panier
   * @param {Array} variants - Array de variantes
   * @returns {string} HTML formaté des variantes
   */
  formatVariantsForDisplay(variants) {
    if (!variants || variants.length === 0) return '';

    return variants
      .map(v => `<span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">${this.app._escapeHtml(v.groupName)}: ${this.app._escapeHtml(v.optionName)}</span>`)
      .join(' ');
  }

  /**
   * Affiche les variantes pour un ticket/bon de cuisine
   * @param {Array} variants - Array de variantes
   * @param {string} format - 'compact' ou 'detailed'
   * @returns {string} HTML formaté
   */
  formatVariantsForTicket(variants, format = 'compact') {
    if (!variants || variants.length === 0) return '';

    if (format === 'compact') {
      return variants.map(v => `${this.app._escapeHtml(v.optionName)}`).join(', ');
    } else {
      return variants
        .map(v => `${this.app._escapeHtml(v.groupName)}: ${this.app._escapeHtml(v.optionName)}`)
        .join('\n');
    }
  }

  /**
   * Charge tous les groupes de variantes (pour l'interface admin)
   * @returns {Promise<Array>} Liste de tous les groupes
   */
  async loadAllVariantGroups() {
    try {
      const response = await fetch(`${this.apiUrl}/variants/groups`, {
        headers: this.app.getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.app._handleTokenExpired();
          return null;
        }
        throw new Error('Erreur chargement groupes');
      }

      const groups = await response.json();
      return groups;
    } catch (error) {
      console.error('[VariantsManager] loadAllVariantGroups error:', error);
      this.app.toastError(`Erreur : ${error.message}`);
      return null;
    }
  }

  /**
   * Crée un nouveau groupe de variantes
   */
  async createVariantGroup(data) {
    try {
      const response = await fetch(`${this.apiUrl}/variants/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.app.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.app._handleTokenExpired();
          return null;
        }
        const error = await response.json();
        throw new Error(error.error || 'Erreur création groupe');
      }

      const group = await response.json();
      this.app.toastSuccess(`Groupe "${group.name}" créé`);
      return group;
    } catch (error) {
      console.error('[VariantsManager] createVariantGroup error:', error);
      this.app.toastError(`Erreur : ${error.message}`);
      return null;
    }
  }

  /**
   * Modifie un groupe de variantes
   */
  async updateVariantGroup(groupId, data) {
    try {
      const response = await fetch(`${this.apiUrl}/variants/groups/${groupId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...this.app.getAuthHeaders()
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.app._handleTokenExpired();
          return null;
        }
        const error = await response.json();
        throw new Error(error.error || 'Erreur modification groupe');
      }

      const group = await response.json();
      this.app.toastSuccess(`Groupe modifié`);
      return group;
    } catch (error) {
      console.error('[VariantsManager] updateVariantGroup error:', error);
      this.app.toastError(`Erreur : ${error.message}`);
      return null;
    }
  }

  /**
   * Supprime un groupe de variantes
   */
  async deleteVariantGroup(groupId) {
    try {
      const response = await fetch(`${this.apiUrl}/variants/groups/${groupId}`, {
        method: 'DELETE',
        headers: this.app.getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.app._handleTokenExpired();
          return false;
        }
        if (response.status === 409) {
          const error = await response.json();
          this.app.toastError(`Ce groupe est lié à des produits: ${error.products.map(p => p.name).join(', ')}`);
          return false;
        }
        const error = await response.json();
        throw new Error(error.error || 'Erreur suppression groupe');
      }

      this.app.toastSuccess(`Groupe supprimé`);
      return true;
    } catch (error) {
      console.error('[VariantsManager] deleteVariantGroup error:', error);
      this.app.toastError(`Erreur : ${error.message}`);
      return false;
    }
  }

  /**
   * Assigne des groupes à un produit
   */
  async assignVariantGroupsToProduct(productId, groupIds) {
    try {
      const response = await fetch(`${this.apiUrl}/products/${productId}/variants`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.app.getAuthHeaders()
        },
        body: JSON.stringify({ group_ids: groupIds })
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.app._handleTokenExpired();
          return null;
        }
        const error = await response.json();
        throw new Error(error.error || 'Erreur assignation');
      }

      const result = await response.json();
      this.app.toastSuccess(`Groupes assignés au produit`);
      return result;
    } catch (error) {
      console.error('[VariantsManager] assignVariantGroupsToProduct error:', error);
      this.app.toastError(`Erreur : ${error.message}`);
      return null;
    }
  }

  /**
   * Retire un groupe d'un produit
   */
  async removeVariantGroupFromProduct(productId, assignmentId) {
    try {
      const response = await fetch(`${this.apiUrl}/products/${productId}/variants/${assignmentId}`, {
        method: 'DELETE',
        headers: this.app.getAuthHeaders()
      });

      if (!response.ok) {
        if (response.status === 401) {
          this.app._handleTokenExpired();
          return false;
        }
        const error = await response.json();
        throw new Error(error.error || 'Erreur suppression assignation');
      }

      this.app.toastSuccess(`Groupe retiré`);
      return true;
    } catch (error) {
      console.error('[VariantsManager] removeVariantGroupFromProduct error:', error);
      this.app.toastError(`Erreur : ${error.message}`);
      return false;
    }
  }

  /**
   * Ferme la modal de sélection des variantes
   */
  closeVariantsModal() {
    const modal = document.getElementById('variantsModal');
    if (modal) {
      modal.innerHTML = '';
      modal.classList.add('hidden');
    }
    this.currentProductWithVariants = null;
    this.currentVariantSelection = {};
  }

  /**
   * Callback à chaque changement de sélection
   * Met à jour l'affichage du prix total
   */
  onVariantChange() {
    this.updateVariantTotalPrice();
  }

  /**
   * Met à jour l'affichage du prix total incluant les variantes
   */
  updateVariantTotalPrice() {
    if (!this.currentProductWithVariants) return;

    // Récupérer toutes les options cochées
    const selectedOptions = document.querySelectorAll('[data-group-id]:checked');
    let totalModifier = 0;

    selectedOptions.forEach(option => {
      totalModifier += parseFloat(option.dataset.priceModifier || 0);
    });

    const totalPrice = this.currentProductWithVariants.price + totalModifier;
    const priceDisplay = document.getElementById('variantTotalPrice');

    if (priceDisplay) {
      priceDisplay.textContent = `${totalPrice.toFixed(2)}€`;
    }

    // Mettre à jour la classe de couleur si le prix a changé
    if (totalModifier > 0) {
      if (priceDisplay) priceDisplay.classList.add('text-indigo-700');
    } else {
      if (priceDisplay) priceDisplay.classList.remove('text-indigo-700');
    }
  }

  /**
   * Formate les variantes pour l'affichage dans le panier
   * Format: "Taille: Grande (+4.00€), Sauce: Harissa (+0.50€)"
   */
  formatVariantsForDisplay(variants) {
    if (!variants || variants.length === 0) return '';

    const grouped = {};
    variants.forEach(v => {
      if (!grouped[v.groupName]) {
        grouped[v.groupName] = [];
      }
      grouped[v.groupName].push(v);
    });

    return Object.entries(grouped).map(([groupName, options]) => {
      const optionTexts = options.map(opt => {
        const priceStr = opt.priceModifier > 0 ? ` (+${opt.priceModifier.toFixed(2)}€)` : ' (Inclus)';
        return opt.optionName + priceStr;
      }).join(', ');
      return `${groupName}: ${optionTexts}`;
    }).join(' | ');
  }

  /**
   * Formate les variantes pour le ticket de caisse
   * Format:
   *   Taille: Grande (+4.00€)
   *   Sauce: Harissa (+0.50€), Sans gluten (+1.00€)
   */
  formatVariantsForTicket(variants) {
    if (!variants || variants.length === 0) return '';

    const grouped = {};
    variants.forEach(v => {
      if (!grouped[v.groupName]) {
        grouped[v.groupName] = [];
      }
      grouped[v.groupName].push(v);
    });

    return Object.entries(grouped).map(([groupName, options]) => {
      const optionTexts = options.map(opt => {
        const priceStr = opt.priceModifier > 0 ? ` (+${opt.priceModifier.toFixed(2)}€)` : '';
        return `  ${opt.optionName}${priceStr}`;
      }).join('\n');
      return `  ${groupName}:\n${optionTexts}`;
    }).join('\n');
  }

  /**
   * Formate les variantes pour le bon de cuisine (KDS) — en majuscules
   * Format:
   *   ► TAILLE: GRANDE
   *   ► SAUCE: HARISSA, SANS GLUTEN
   */
  formatVariantsForKitchen(variants) {
    if (!variants || variants.length === 0) return '';

    const grouped = {};
    variants.forEach(v => {
      if (!grouped[v.groupName]) {
        grouped[v.groupName] = [];
      }
      grouped[v.groupName].push(v);
    });

    return Object.entries(grouped).map(([groupName, options]) => {
      const optionNames = options.map(opt => opt.optionName.toUpperCase()).join(', ');
      return `► ${groupName.toUpperCase()}: ${optionNames}`;
    }).join('\n');
  }

  /**
   * Calcule le prix total des variantes
   */
  calculateVariantsPriceModifier(variants) {
    if (!variants || variants.length === 0) return 0;
    return variants.reduce((sum, v) => sum + (v.priceModifier || 0), 0);
  }
}

// Exporter pour utilisation dans le module principal
export { VariantsManager };

