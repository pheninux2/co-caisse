import { OrderService } from '../../services/order.service.js';

export const KitchenMethods = {

  async loadKitchenOrders() {
    const list = document.getElementById('kitchenOrdersList');
    const countEl = document.getElementById('kitchenOrderCount');
    if (!list) return;

    list.innerHTML = `<div class="text-center py-8 text-gray-400">⏳ Chargement...</div>`;

    try {
      const orders = await OrderService.getKitchenOrders();

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
  },

  async takeKitchenOrder(orderId) {
    try {
      await OrderService.takeKitchenOrder(orderId);
      this.toastSuccess('Vous avez pris en charge la commande !');
      this.loadKitchenOrders();
    } catch (error) {
      this.toastError('Erreur réseau');
    }
  },

  toggleKitchenCommentForm(orderId) {
    const form = document.getElementById(`comment-form-${orderId}`);
    const input = document.getElementById(`comment-input-${orderId}`);
    if (form) {
      form.classList.toggle('hidden');
      if (!form.classList.contains('hidden') && input) input.focus();
    }
  },

  async saveKitchenComment(orderId) {
    const input = document.getElementById(`comment-input-${orderId}`);
    if (!input) return;
    const comment = input.value.trim();

    try {
      await OrderService.addKitchenComment(orderId, comment);
      this.toastSuccess('Commentaire enregistré !');
      this.loadKitchenOrders();
    } catch (error) {
      this.toastError('Erreur réseau');
    }
  },

  async markKitchenOrderReady(orderId) {
    try {
      const confirmed = await this.confirm('Marquer cette commande comme prête ?', {
        title: '✨ Commande prête',
        icon: '✨',
        type: 'info',
        confirmText: 'Oui, c\'est prêt !',
        cancelText: 'Annuler'
      });
      if (!confirmed) return;

      await OrderService.markReady(orderId);
      this.toastSuccess('Commande marquée comme prête ! 🎉');
      this.resetAlertForOrder(orderId);
      this.loadKitchenOrders();
      await this.loadAlerts();
    } catch (error) {
      this.toastError('Erreur réseau');
    }
  },

};
