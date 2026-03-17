import { TransactionService } from '../../services/transaction.service.js';
import { UserService }        from '../../services/user.service.js';

export const DashboardMethods = {

  async loadDashboard() {
    const modules         = this.licenceStatus?.modules || [];
    // fail open si licence non chargée (licenceStatus null)
    const hasHistorique   = !this.licenceStatus || modules.includes('historique');
    const hasStatistiques = !this.licenceStatus || modules.includes('statistiques');

    try {
      if (hasHistorique) {
        const today   = new Date().toISOString().split('T')[0];
        const summary = await TransactionService.getDailySummary(today);

        document.getElementById('dailySales').textContent        = ((summary && summary.total_amount)     || 0).toFixed(2) + ' €';
        document.getElementById('dailyTransactions').textContent = (summary && summary.transaction_count) || 0;
        document.getElementById('dailyTax').textContent          = ((summary && summary.total_tax)        || 0).toFixed(2) + ' €';
        document.getElementById('dailyDiscount').textContent     = ((summary && summary.total_discount)   || 0).toFixed(2) + ' €';

        await this.loadRecentTransactions();
      } else {
        const recentContainer = document.getElementById('recentTransactions');
        if (recentContainer) recentContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Module Historique non activé</p>';
      }

      if (hasStatistiques) {
        await this.loadPaymentMethodsChart();
      } else {
        const chartContainer = document.getElementById('paymentMethodsChart');
        if (chartContainer) chartContainer.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Module Statistiques non activé</p>';
      }
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  },

  // Charger la répartition des moyens de paiement pour le dashboard
  async loadPaymentMethodsChart() {
    try {
      const today = new Date().toISOString().split('T')[0];
      const paymentData = await TransactionService.getPaymentMethods(today, today);

      const container = document.getElementById('paymentMethodsChart');
      if (!container) return;

      if (paymentData.length === 0) {
        container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Aucune donnée</p>';
        return;
      }

      const total = paymentData.reduce((sum, p) => sum + (p.total || 0), 0);

      const paymentIcons = {
        'cash': '💵',
        'card': '💳'
      };

      const paymentLabels = {
        'cash': 'Espèces',
        'card': 'Carte'
      };

      container.innerHTML = `
        <div class="space-y-3">
          ${paymentData.map(payment => {
            const percentage = total > 0 ? (payment.total / total * 100) : 0;
            return `
              <div class="space-y-1">
                <div class="flex items-center justify-between text-sm">
                  <span class="flex items-center gap-2">
                    <span class="text-lg">${paymentIcons[payment.payment_method] || '💰'}</span>
                    <span class="font-medium text-gray-700">${paymentLabels[payment.payment_method] || payment.payment_method}</span>
                  </span>
                  <span class="font-bold text-indigo-600">${(payment.total || 0).toFixed(2)} €</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500 ${payment.payment_method === 'cash' ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-blue-400 to-blue-600'}"
                       style="width: ${percentage}%"></div>
                </div>
                <div class="flex items-center justify-between text-xs text-gray-500">
                  <span>${payment.count || 0} transaction(s)</span>
                  <span>${percentage.toFixed(1)}%</span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } catch (error) {
      console.error('Error loading payment methods chart:', error);
    }
  },

  async loadRecentTransactions() {
    try {
      const transactions = await TransactionService.getAll({ limit: 5 });

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
  },

  async loadTransactions() {
    try {
      const startDate = document.getElementById('startDate')?.value;
      const endDate = document.getElementById('endDate')?.value;
      const cashierId = document.getElementById('filterCashier')?.value;

      const transactions = await TransactionService.getAll({ startDate, endDate, userId: cashierId });

      const table = document.getElementById('transactionsTable');
      if (!table) return;

      if (transactions.length === 0) {
        table.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-400">Aucune transaction</td></tr>';
        // Réinitialiser les stats de caissier
        const cashierStatsEl = document.getElementById('cashierDailyStats');
        if (cashierStatsEl) cashierStatsEl.classList.add('hidden');
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

      // Calculer et afficher les statistiques du caissier si filtré
      if (cashierId) {
        await this.loadCashierDailyStats(cashierId, startDate, endDate, transactions);
      } else {
        const cashierStatsEl = document.getElementById('cashierDailyStats');
        if (cashierStatsEl) cashierStatsEl.classList.add('hidden');
      }

      // Charger les statistiques par période
      await this.loadPeriodStats();

      // Charger la liste des caissiers pour le filtre
      await this.loadCashiersFilter();
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  },

  // Charger les statistiques journalières d'un caissier
  async loadCashierDailyStats(cashierId, startDate, endDate, transactions) {
    const cashierStatsEl = document.getElementById('cashierDailyStats');
    if (!cashierStatsEl) return;

    // Calculer les stats à partir des transactions déjà chargées
    const totalSales = transactions.reduce((sum, t) => sum + (t.total || 0), 0);
    const totalTransactions = transactions.length;
    const totalTax = transactions.reduce((sum, t) => sum + (t.tax || 0), 0);
    const totalDiscount = transactions.reduce((sum, t) => sum + (t.discount || 0), 0);

    // Récupérer le nom du caissier
    const cashierName = transactions.length > 0 ? transactions[0].cashier_name : 'Caissier';

    // Grouper par jour
    const dailyStats = {};
    transactions.forEach(t => {
      const day = new Date(t.transaction_date).toLocaleDateString('fr-FR');
      if (!dailyStats[day]) {
        dailyStats[day] = {
          date: day,
          count: 0,
          total: 0,
          tax: 0,
          discount: 0
        };
      }
      dailyStats[day].count++;
      dailyStats[day].total += t.total || 0;
      dailyStats[day].tax += t.tax || 0;
      dailyStats[day].discount += t.discount || 0;
    });

    const sortedDays = Object.values(dailyStats).sort((a, b) => {
      const dateA = a.date.split('/').reverse().join('-');
      const dateB = b.date.split('/').reverse().join('-');
      return dateB.localeCompare(dateA);
    });

    cashierStatsEl.classList.remove('hidden');
    cashierStatsEl.innerHTML = `
      <div class="bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl shadow-lg p-6 mb-4">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          <span>👤</span>
          <span>Statistiques de ${cashierName}</span>
        </h3>
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-white/10 backdrop-blur rounded-lg p-3">
            <p class="text-xs opacity-80 mb-1">Ventes totales</p>
            <p class="text-2xl font-bold">${totalSales.toFixed(2)} €</p>
          </div>
          <div class="bg-white/10 backdrop-blur rounded-lg p-3">
            <p class="text-xs opacity-80 mb-1">Transactions</p>
            <p class="text-2xl font-bold">${totalTransactions}</p>
          </div>
          <div class="bg-white/10 backdrop-blur rounded-lg p-3">
            <p class="text-xs opacity-80 mb-1">TVA collectée</p>
            <p class="text-2xl font-bold">${totalTax.toFixed(2)} €</p>
          </div>
          <div class="bg-white/10 backdrop-blur rounded-lg p-3">
            <p class="text-xs opacity-80 mb-1">Remises</p>
            <p class="text-2xl font-bold">${totalDiscount.toFixed(2)} €</p>
          </div>
        </div>

        ${sortedDays.length > 0 ? `
          <div class="mt-6">
            <h4 class="text-sm font-semibold mb-3 opacity-90">📊 Détail par jour</h4>
            <div class="space-y-2 max-h-60 overflow-y-auto">
              ${sortedDays.map(day => `
                <div class="bg-white/10 backdrop-blur rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p class="font-semibold">${day.date}</p>
                    <p class="text-xs opacity-80">${day.count} transaction(s)</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-lg">${day.total.toFixed(2)} €</p>
                    <p class="text-xs opacity-80">TVA: ${day.tax.toFixed(2)} € | Remise: ${day.discount.toFixed(2)} €</p>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  },

  // Charger la liste des caissiers pour le filtre
  async loadCashiersFilter() {
    try {
      const filterSelect = document.getElementById('filterCashier');
      if (!filterSelect) return;

      const users = await UserService.getAll();

      const currentValue = filterSelect.value;
      filterSelect.innerHTML = `
        <option value="">Tous les caissiers</option>
        ${users.map(user => `
          <option value="${user.id}" ${currentValue === user.id ? 'selected' : ''}>
            ${user.username} (${user.role})
          </option>
        `).join('')}
      `;
    } catch (error) {
      console.error('Error loading cashiers filter:', error);
    }
  },

  // Charger les statistiques par période
  async loadPeriodStats() {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      // Lundi de la semaine courante (getDay() : 0=dim, 1=lun … 6=sam)
      // (getDay() || 7) → dimanche devient 7, donc lundi = date - 6
      const weekStart = new Date(today);
      const dayOfWeek = today.getDay() || 7; // 1=lun … 7=dim
      weekStart.setDate(today.getDate() - dayOfWeek + 1);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      console.log(`[PeriodStats] Semaine : ${weekStartStr} → ${todayStr}`);

      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const monthStartStr = monthStart.toISOString().split('T')[0];

      const yearStart = new Date(today.getFullYear(), 0, 1);
      const yearStartStr = yearStart.toISOString().split('T')[0];

      const [todayData, weekData, monthData, yearData] = await Promise.all([
        TransactionService.getPeriodSummary(todayStr, todayStr),
        TransactionService.getPeriodSummary(weekStartStr, todayStr),
        TransactionService.getPeriodSummary(monthStartStr, todayStr),
        TransactionService.getPeriodSummary(yearStartStr, todayStr),
      ]);

      const statToday = document.getElementById('statToday');
      const statWeek = document.getElementById('statWeek');
      const statMonth = document.getElementById('statMonth');
      const statYear = document.getElementById('statYear');

      if (statToday) statToday.textContent = (todayData.total || 0).toFixed(2) + ' €';
      if (statWeek) statWeek.textContent = (weekData.total || 0).toFixed(2) + ' €';
      if (statMonth) statMonth.textContent = (monthData.total || 0).toFixed(2) + ' €';
      if (statYear) statYear.textContent = (yearData.total || 0).toFixed(2) + ' €';
    } catch (error) {
      console.error('Error loading period stats:', error);
    }
  },

  // Afficher le détail d'une transaction
  async showTransactionDetail(transactionId) {
    try {
      const t = await TransactionService.get(transactionId);

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
  },

  // Imprimer le reçu de la transaction actuelle
  async printTransactionReceipt() {
    if (this.currentTransactionId) {
      await this.viewReceipt(this.currentTransactionId);
    }
  },

  // Exporter un rapport par période
  async exportReport(period) {
    try {
      const today = new Date();
      let startDate, endDate = today.toISOString().split('T')[0];
      let periodName;

      switch(period) {
        case 'week':
          const weekStart = new Date(today);
          const dow = today.getDay() || 7;
          weekStart.setDate(today.getDate() - dow + 1);
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

      // Récupérer les transactions et les stats
      const [transactions, stats] = await Promise.all([
        TransactionService.getAll({ startDate, endDate }),
        TransactionService.getPeriodSummary(startDate, endDate),
      ]);

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
  },

};
