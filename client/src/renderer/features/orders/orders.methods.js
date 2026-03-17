import { OrderService } from '../../services/order.service.js';

export const OrdersMethods = {

  async loadOrders() {
    try {
      const status   = this.currentOrderFilter === 'all' ? '' : this.currentOrderFilter;
      const userRole = this.currentUser?.role || 'cashier';
      const userId   = userRole !== 'admin' ? this.currentUser?.id : undefined;
      this.orders = await OrderService.getAll({ status, userId });
      this.renderOrders();
    } catch (error) {
      console.error('Error loading orders:', error);
      this.toastError('Erreur lors du chargement des commandes');
    }
  },

  renderOrders() {
    const container = document.getElementById('ordersList');
    if (!container) return;

    if (this.orders.length === 0) {
      container.innerHTML = '<p class="col-span-full text-gray-400 text-center py-8">Aucune commande</p>';
      return;
    }

    const statusIcons  = { draft: '⏳', in_kitchen: '🔥', ready: '✨', served: '🍽️', paid: '💰' };
    const statusLabels = { draft: 'En attente de validation', in_kitchen: 'En cuisine', ready: 'Prête', served: 'Servie', paid: 'Payée' };
    const typeLabels   = { dine_in: '🍽️ Sur place', takeaway: '📦 À emporter', delivery: '🚚 Livraison' };

    container.innerHTML = this.orders.map(order => {
      const items     = JSON.parse(order.items || '[]');
      const itemsText = items.slice(0, 3).map(item => `${item.name} ×${item.quantity}`).join(', ');
      const moreItems = items.length > 3 ? ` +${items.length - 3} autres` : '';
      const isAdmin   = this.currentUser?.role === 'admin';
      const alertData  = this.alerts.find(a => a.id === order.id);
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

          ${order.table_number ? `<p class="text-sm font-medium text-gray-700 mb-2">📍 ${order.table_number}</p>` : ''}

          ${order.customer_name ? `<p class="text-xs text-gray-600 mb-2">👤 ${order.customer_name}${order.customer_phone ? ` - ${order.customer_phone}` : ''}</p>` : ''}

          ${isAdmin ? `
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
              ${new Date(order.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </div>
            <div class="font-bold text-lg text-indigo-600">${order.total.toFixed(2)} €</div>
          </div>

          ${order.notes ? `<p class="text-xs text-orange-600 mt-2 bg-orange-50 p-2 rounded">📝 ${order.notes}</p>` : ''}
        </div>
      `;
    }).join('');
  },

  filterOrders(filter) {
    this.currentOrderFilter = filter;
    document.querySelectorAll('.order-filter-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-filter="${filter}"]`)?.classList.add('active');
    this.loadOrders();
  },

  openOrderDialog(orderId = null) {
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
  },

  async saveOrder(event) {
    event.preventDefault();

    try {
      const orderId       = document.getElementById('orderId').value;
      const table_number  = document.getElementById('orderTableNumber').value;
      const order_type    = document.getElementById('orderType').value;
      const customer_name = document.getElementById('orderCustomerName').value;
      const customer_phone = document.getElementById('orderCustomerPhone').value;
      const notes         = document.getElementById('orderNotes').value;

      if (this.cart.length === 0) {
        this.toastWarning('Le panier est vide');
        return;
      }

      const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const tax      = subtotal * 0.20;
      const discount = this.currentDiscount;
      const total    = subtotal + tax - discount;

      const orderData = {
        table_number, order_type,
        items: this.cart.map(item => ({ id: item.id, name: item.name, quantity: item.quantity, price: item.price, total: item.price * item.quantity })),
        subtotal, tax, discount, total, customer_name, customer_phone, notes,
      };

      const order = orderId
        ? await OrderService.update(orderId, orderData)
        : await OrderService.create(orderData);

      this.closeModal('orderModal');
      this.cart = [];
      this.currentDiscount = 0;
      this.updateCartDisplay();
      this.toastSuccess(`Commande ${order.order_number} enregistrée !`);
      this.showSection('orders');
    } catch (error) {
      console.error('Error saving order:', error);
      this.toastError('Erreur lors de l\'enregistrement de la commande');
    }
  },

  async viewOrderDetail(orderId) {
    try {
      const order = await OrderService.get(orderId);

      const statusLabels = { draft: 'En attente de validation', in_kitchen: 'En cuisine', ready: 'Prête', served: 'Servie', paid: 'Payée' };
      const typeLabels   = { dine_in: '🍽️ Sur place', takeaway: '📦 À emporter', delivery: '🚚 Livraison' };
      const items        = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');

      const content = document.getElementById('orderDetailContent');
      content.innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <h2 class="text-2xl font-bold text-gray-800">${order.order_number}</h2>
            <span class="order-status-badge order-status-${order.status} text-sm">${statusLabels[order.status]}</span>
          </div>

          <div class="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg">
            <div><p class="text-xs text-gray-500">Type</p><p class="font-medium">${typeLabels[order.order_type]}</p></div>
            ${order.table_number    ? `<div><p class="text-xs text-gray-500">Table/Réf</p><p class="font-medium">${order.table_number}</p></div>` : ''}
            ${order.customer_name   ? `<div><p class="text-xs text-gray-500">Client</p><p class="font-medium">${order.customer_name}</p></div>` : ''}
            ${order.customer_phone  ? `<div><p class="text-xs text-gray-500">Téléphone</p><p class="font-medium">${order.customer_phone}</p></div>` : ''}
            <div><p class="text-xs text-gray-500">Créée le</p><p class="font-medium">${new Date(order.created_at).toLocaleString('fr-FR')}</p></div>
            <div><p class="text-xs text-gray-500">Par</p><p class="font-medium">${order.cashier_name || 'Inconnu'}</p></div>
          </div>

          ${order.notes ? `
            <div class="bg-orange-50 border border-orange-200 p-3 rounded-lg">
              <p class="text-xs text-orange-600 font-semibold mb-1">📝 Notes</p>
              <p class="text-sm text-gray-700">${order.notes}</p>
            </div>
          ` : ''}

          ${(() => {
            const showKitchenInfo = ['in_kitchen', 'ready', 'served', 'paid'].includes(order.status);
            if (!showKitchenInfo) return '';
            let handlers = [];
            try { handlers = JSON.parse(order.kitchen_handlers || '[]'); } catch {}
            const userRole = this.currentUser?.role;
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
              <div class="flex items-center justify-between text-sm"><span class="text-gray-600">Sous-total HT</span><span class="font-medium">${order.subtotal.toFixed(2)} €</span></div>
              <div class="flex items-center justify-between text-sm"><span class="text-gray-600">TVA (20%)</span><span class="font-medium">${order.tax.toFixed(2)} €</span></div>
              ${order.discount > 0 ? `<div class="flex items-center justify-between text-sm text-green-600"><span>Remise</span><span class="font-medium">-${order.discount.toFixed(2)} €</span></div>` : ''}
              <div class="flex items-center justify-between text-lg font-bold pt-2"><span class="text-gray-800">TOTAL</span><span class="text-indigo-600">${order.total.toFixed(2)} €</span></div>
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            ${order.status === 'draft' ? `
              <button onclick="app.validateOrder('${order.id}')" class="order-action-btn order-action-btn-primary">👨‍🍳 Valider & Envoyer en cuisine</button>
              <button onclick="app.editOrder('${order.id}')" class="order-action-btn order-action-btn-secondary">✏️ Modifier</button>
              <button onclick="app.deleteOrder('${order.id}')" class="order-action-btn order-action-btn-danger">🗑️ Supprimer</button>
            ` : ''}
            ${order.status === 'in_kitchen' ? `<button onclick="app.markOrderReady('${order.id}')" class="order-action-btn order-action-btn-success">✨ Marquer prête</button>` : ''}
            ${order.status === 'ready' ? `
              <button onclick="app.markOrderServed('${order.id}')" class="order-action-btn order-action-btn-primary">🍽️ Marquer servie</button>
              <button onclick="app.payOrder('${order.id}')" class="order-action-btn order-action-btn-success">💰 Encaisser</button>
            ` : ''}
            ${order.status === 'served' ? `<button onclick="app.payOrder('${order.id}')" class="order-action-btn order-action-btn-success">💰 Encaisser</button>` : ''}
            ${order.status === 'paid' ? `<p class="text-green-600 font-medium">✅ Commande payée le ${new Date(order.paid_at).toLocaleString('fr-FR')}</p>` : ''}
            <button onclick="app.closeModal('orderDetailModal')" class="order-action-btn order-action-btn-secondary ml-auto">Fermer</button>
          </div>
        </div>
      `;

      this.openModal('orderDetailModal');
    } catch (error) {
      console.error('Error loading order detail:', error);
      this.toastError('Erreur lors du chargement du détail de la commande');
    }
  },

  async validateOrder(orderId) {
    try {
      const confirmed = await this.confirm('Valider et envoyer en cuisine ?', {
        title: 'Validation → Cuisine', icon: '👨‍🍳', type: 'info', confirmText: 'Valider & Envoyer', cancelText: 'Annuler',
      });
      if (!confirmed) return;
      await OrderService.validate(orderId);
      this.toastSuccess('Commande validée et envoyée en cuisine ! 👨‍🍳');
      this.closeModal('orderDetailModal');
      this.resetAlertForOrder(orderId);
      await this.loadOrders();
      await this.loadAlerts();
    } catch (error) {
      console.error('Error validating order:', error);
      this.toastError('Erreur lors de la validation');
    }
  },

  async sendToKitchen(orderId) {
    try {
      await OrderService.sendToKitchen(orderId);
      this.toastSuccess('Commande envoyée en cuisine !');
      this.closeModal('orderDetailModal');
      this.resetAlertForOrder(orderId);
      await this.loadOrders();
      await this.loadAlerts();
    } catch (error) {
      console.error('Error sending to kitchen:', error);
      this.toastError('Erreur lors de l\'envoi en cuisine');
    }
  },

  async markOrderReady(orderId) {
    try {
      await OrderService.markReady(orderId);
      this.toastSuccess('Commande marquée comme prête !');
      this.closeModal('orderDetailModal');
      this.resetAlertForOrder(orderId);
      await this.loadOrders();
      await this.loadAlerts();
    } catch (error) {
      console.error('Error marking ready:', error);
      this.toastError('Erreur');
    }
  },

  async markOrderServed(orderId) {
    try {
      await OrderService.markServed(orderId);
      this.toastSuccess('Commande marquée comme servie !');
      this.closeModal('orderDetailModal');
      this.resetAlertForOrder(orderId);
      await this.loadOrders();
      await this.loadAlerts();
    } catch (error) {
      console.error('Error marking served:', error);
      this.toastError('Erreur');
    }
  },

  async payOrder(orderId) {
    try {
      this.closeModal('orderDetailModal');
      const paymentMethod = await this.selectPaymentMethod();
      if (!paymentMethod) return;
      const result = await OrderService.pay(orderId, { paymentMethod });
      this.toastSuccess('Commande encaissée !');
      if (result.transaction) this.viewReceipt(result.transaction.id);
      this.resetAlertForOrder(orderId);
      await this.loadOrders();
      await this.loadAlerts();
    } catch (error) {
      console.error('Error paying order:', error);
      this.toastError('Erreur lors du paiement');
    }
  },

  selectPaymentMethod() {
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
      modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <h3 class="text-xl font-bold text-gray-800 mb-4">💳 Mode de paiement</h3>
          <div class="space-y-3">
            <button onclick="window.resolvePayment('cash')" class="w-full p-4 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition">💵 Espèces</button>
            <button onclick="window.resolvePayment('card')" class="w-full p-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition">💳 Carte bancaire</button>
            <button onclick="window.resolvePayment(null)" class="w-full p-3 bg-gray-200 hover:bg-gray-300 rounded-xl font-medium transition">Annuler</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      window.resolvePayment = (method) => { modal.remove(); delete window.resolvePayment; resolve(method); };
    });
  },

  async editOrder(orderId) {
    try {
      const order = await OrderService.get(orderId);
      if (order.status !== 'draft') {
        this.toastWarning('Seules les commandes en attente de validation peuvent être modifiées');
        return;
      }
      const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
      this.cart = items.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity, discount: 0 }));
      this.currentDiscount = order.discount || 0;
      this.updateCartDisplay();
      this.closeModal('orderDetailModal');

      document.getElementById('orderId').value = order.id;
      document.getElementById('orderType').value = order.order_type || 'dine_in';
      document.getElementById('orderCustomerName').value = order.customer_name || '';
      document.getElementById('orderCustomerPhone').value = order.customer_phone || '';
      document.getElementById('orderNotes').value = order.notes || '';

      await this.refreshTableSelect();
      const tableSelect = document.getElementById('orderTableNumber');
      if (tableSelect) tableSelect.value = order.table_number || '';

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
  },

  async deleteOrder(orderId) {
    try {
      const confirmed = await this.confirm('Supprimer cette commande ?', { title: 'Suppression', icon: '🗑️', type: 'danger' });
      if (!confirmed) return;
      await OrderService.remove(orderId);
      this.toastSuccess('Commande supprimée');
      this.closeModal('orderDetailModal');
      this.loadOrders();
    } catch (error) {
      console.error('Error deleting order:', error);
      this.toastError('Erreur lors de la suppression');
    }
  },

};
