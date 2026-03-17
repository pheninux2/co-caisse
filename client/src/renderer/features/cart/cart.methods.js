export const CartMethods = {

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
  },

  removeFromCart(productId) {
    this.cart = this.cart.filter(item => item.id !== productId);
    this.updateCartDisplay();
  },

  updateCartItemQty(productId, quantity) {
    const item = this.cart.find(i => i.id === productId);
    if (item) {
      item.quantity = Math.max(1, parseInt(quantity) || 1);
      this.updateCartDisplay();
    }
  },

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
  },

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
  },

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
  },

  // Fermer le modal
  closeHeldCartsModal() {
    const modal = document.getElementById('heldCartsModal');
    if (modal) modal.remove();
  },

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
  },

  // Mettre à jour le bouton des paniers en attente
  updateHeldCartsButton() {
    const btn = document.getElementById('heldCartsBtn');
    const badge = document.getElementById('heldCartsBadge');

    if (badge) {
      badge.textContent = this.heldCarts.length;
      badge.style.display = this.heldCarts.length > 0 ? '' : 'none';
    }
  },

  // Formater le temps écoulé
  formatTimeAgo(date) {
    const now = new Date();
    const diff = Math.floor((now - new Date(date)) / 1000);

    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    return `Il y a ${Math.floor(diff / 86400)} j`;
  },

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
  },

  updateTotals() {
    const { totalHt, totalTax, totalTtc, byRate } = this.computeCartTax();
    const discount = this.currentDiscount;
    const total    = totalTtc - discount;

    // Sous-total HT
    document.getElementById('subtotal').textContent =
      totalHt.toFixed(2).replace('.', ',') + ' €';

    // Ventilation TVA par taux
    const vatEl = document.getElementById('vatBreakdownDisplay');
    if (vatEl) {
      vatEl.innerHTML = byRate.map(v =>
        `<div class="flex justify-between text-gray-400 text-xs">
           <span>TVA ${v.rate}% sur ${v.baseHt.toFixed(2).replace('.', ',')} €</span>
           <span>${v.taxAmount.toFixed(2).replace('.', ',')} €</span>
         </div>`
      ).join('');
    }

    // Total TVA
    document.getElementById('taxAmount').textContent =
      totalTax.toFixed(2).replace('.', ',') + ' €';

    // Total TTC
    document.getElementById('totalAmount').textContent =
      total.toFixed(2).replace('.', ',') + ' €';

    const discountRow     = document.getElementById('discountRow');
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
  },

  updateChangeSection() {
    const selected    = document.querySelector('.payment-method.active');
    const changeSection = document.getElementById('changeSection');
    if (changeSection) {
      changeSection.style.display = selected?.dataset.method === 'cash' ? '' : 'none';
    }
  },

  calculateChange() {
    const amountInput  = document.getElementById('amountReceived');
    const changeAmount = document.getElementById('changeAmount');
    if (!amountInput || !changeAmount) return;

    const amountReceived = parseFloat(amountInput.value || 0);
    const { totalTtc }   = this.computeCartTax();
    const total          = totalTtc - this.currentDiscount;
    const change         = amountReceived - total;

    changeAmount.textContent = change.toFixed(2).replace('.', ',') + ' €';
    changeAmount.className   = change >= 0
      ? 'font-bold text-green-600'
      : 'font-bold text-red-600';
  },

  // ===== DISCOUNT & CALCULATOR =====

  openDiscountDialog() {
    document.getElementById('discountAmount').value = '';
    document.getElementById('discountPercent').value = '';
    document.getElementById('discountReason').value = '';
    this.openModal('discountModal');
  },

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
  },

  // Bug 2 — supprime la remise en cours
  removeDiscount() {
    this.currentDiscount = 0;
    this.updateTotals();
    this.toastInfo('Remise supprimée');
  },

  openCalculator() {
    this.calculator = { value: '0', operation: null, operand: null };
    document.getElementById('calcDisplay').value = '0';
    this.openModal('calculatorModal');
  },

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
  },

  calcClear() {
    this.calculator = { value: '0', operation: null, operand: null };
    document.getElementById('calcDisplay').value = '0';
  },

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
  },

};
