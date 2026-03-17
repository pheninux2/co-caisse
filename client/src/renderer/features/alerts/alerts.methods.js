import { OrderService }    from '../../services/order.service.js';
import { api, API_URL }    from '../../core/api.js';

export const AlertsMethods = {

  startAlertPolling() {
    // 1. Chargement initial des alertes depuis le serveur
    this.loadAlerts();

    // 2. Polling serveur toutes les 60s (juste pour synchroniser les nouvelles commandes)
    this.alertPollingInterval = setInterval(() => this.loadAlerts(), 60000);

    // 3. Timer local toutes les 5s : détecte les dépassements de seuil EN TEMPS RÉEL
    //    sans appel serveur — c'est lui qui déclenche les notifications
    this.alertDisplayInterval = setInterval(() => this._checkAndNotify(), 5000);
  },

  stopAlertPolling() {
    if (this.alertPollingInterval) { clearInterval(this.alertPollingInterval); this.alertPollingInterval = null; }
    if (this.alertDisplayInterval) { clearInterval(this.alertDisplayInterval); this.alertDisplayInterval = null; }
  },

  // Calcule le nombre de minutes écoulées depuis status_since
  _elapsedMin(status_since) {
    if (!status_since) return 0;
    const since  = new Date(status_since);
    const now    = Date.now();
    const diffMs = now - since.getTime();
    const mins   = Math.floor(diffMs / 60000);

    // ── Diagnostic temporaire ───────────────────────────────────────────
    if (mins > 5) {
      console.log('[ALERT TZ] status_since reçu     :', status_since);
      console.log('[ALERT TZ] since.toISOString()   :', since.toISOString());
      console.log('[ALERT TZ] Date (client) now     :', new Date().toISOString());
      console.log('[ALERT TZ] elapsed calculé (min) :', mins);
    }
    // ───────────────────────────────────────────────────────────────────

    return Math.max(0, mins);
  },

  // Calcule le retard réel (elapsed - seuil)
  _computeDelay(alert) {
    if (!alert.status_since || !alert.alert_threshold_minutes) return alert.delay_minutes || 0;
    const elapsed = this._elapsedMin(alert.status_since);
    return Math.max(0, elapsed - alert.alert_threshold_minutes);
  },

  // Calcule le niveau d'alerte en temps réel
  _computeLevel(alert) {
    if (!alert.status_since || !alert.alert_threshold_minutes) return alert.alert_level || 'warning';
    const elapsed = this._elapsedMin(alert.status_since);
    if (elapsed >= alert.alert_threshold_minutes * 2) return 'critical';
    if (elapsed >= alert.alert_threshold_minutes) return 'warning';
    return null; // pas encore en alerte
  },

  // ★ Cœur du système : appelé toutes les 5s, déclenche les notifications au bon moment
  _checkAndNotify() {
    // Ne pas notifier si l'utilisateur est déconnecté
    if (!this.currentUser || !api.hasToken()) {
      this.stopAlertPolling();
      return;
    }

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
  },

  // Met à jour les delays sans refetch serveur (pour rétrocompatibilité)
  _refreshAlertDisplay() {
    this._checkAndNotify();
  },

  async loadAlerts() {
    // Ne pas charger les alertes si l'utilisateur est déconnecté
    if (!this.currentUser || !api.hasToken()) return;

    try {
      const freshAlerts = await OrderService.getAlerts();

      // Filtrer les alertes dont la commande a déjà changé de statut dans this.orders
      const filtered = freshAlerts.filter(alert => {
        const localOrder = this.orders.find(o => o.id === alert.id);
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
  },

  // Appelé après CHAQUE changement de statut pour reset la notification
  resetAlertForOrder(orderId) {
    this.notifiedAlerts.delete(orderId);
    this.notifiedLevels.delete(orderId);
    this.dismissedAlerts.delete(orderId);
    // Retirer immédiatement de alertsRaw et alerts pour stopper le clignotement
    if (this.alertsRaw) this.alertsRaw = this.alertsRaw.filter(a => a.id !== orderId);
    this.alerts = this.alerts.filter(a => a.id !== orderId);
    // Mettre à jour badge + rendu immédiatement
    this.updateAlertBadge(this.alerts.filter(a => !this.dismissedAlerts.has(a.id)).length);
    if (this.currentSection === 'orders') this.renderOrders();
  },

  updateAlertBadge(count) {
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
  },

  playAlertSound() {
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
  },

  displayAlerts(alerts) {
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
  },

  // Alias pour compatibilité
  displayCriticalAlerts(alerts) {
    this.displayAlerts(alerts);
  },

  showAlertsPanel() {
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
  },

  async showOrdersStatistics() {
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
  },

  showModalWithContent(modalId, content) {
    let modal = document.getElementById(modalId);
    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'modal';
      modal.style.zIndex = '60';

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
  },

  dismissAllAlerts() {
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
  },

};
