import { OrderService } from '../../services/order.service.js';

export const AnalyticsMethods = {

  // ── État ─────────────────────────────────────────────────────────────────────
  _analyticsData:   null,
  _analyticsPeriod: 'day',

  // ── Chargement principal ──────────────────────────────────────────────────────
  async loadAnalytics() {
    const startDate = document.getElementById('analyticsStartDate')?.value || '';
    const endDate   = document.getElementById('analyticsEndDate')?.value   || '';
    const period    = document.getElementById('analyticsPeriod')?.value    || 'day';
    this._analyticsPeriod = period;

    const loader = document.getElementById('analyticsLoader');
    const content = document.getElementById('analyticsContent');
    if (loader)  loader.classList.remove('hidden');
    if (content) content.classList.add('hidden');

    try {
      this._analyticsData = await OrderService.getAnalytics({
        start_date: startDate,
        end_date:   endDate,
        period,
      });
      this._renderAnalytics(this._analyticsData);
    } catch (error) {
      console.error('Analytics error:', error);
      this.toastError('Erreur lors du chargement des analytics');
    } finally {
      if (loader)  loader.classList.add('hidden');
      if (content) content.classList.remove('hidden');
    }
  },

  _renderAnalytics(data) {
    this._renderKpi(data.kpi);
    this._renderHourlyChart(data.by_hour);
    this._renderTopProducts(data.top_products);
    this._renderHistory(data.history);
    this._renderByCashier(data.by_cashier);
    this._renderByType(data.by_type);
    this._renderCancelledTab(data.cancelled_orders);
  },

  // ── KPI Cards ─────────────────────────────────────────────────────────────────
  _renderKpi(kpi) {
    const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('anaOrdersToday',    kpi?.orders_today   ?? 0);
    set('anaTotalOrders',    kpi?.total_orders   ?? 0);
    set('anaCancelled',      kpi?.cancelled_orders ?? 0);
    set('anaRevenueToday',   fmt(kpi?.revenue_today));
    set('anaRevenueTotal',   fmt(kpi?.revenue_total));
    set('anaAvgTicket',      fmt(kpi?.avg_ticket));
  },

  // ── Graphique horaire (barres ASCII-style pur CSS) ────────────────────────────
  _renderHourlyChart(byHour) {
    const container = document.getElementById('analyticsHourlyChart');
    if (!container) return;

    // Tableau complet 0-23
    const hours = Array.from({ length: 24 }, (_, h) => {
      const found = byHour.find(r => Number(r.hour) === h);
      return { hour: h, count: found ? Number(found.orders_count) : 0, revenue: found ? Number(found.revenue) : 0 };
    });

    const maxCount = Math.max(...hours.map(h => h.count), 1);

    container.innerHTML = `
      <div class="flex items-end gap-1 h-40 px-2">
        ${hours.map(h => {
          const pct    = Math.round((h.count / maxCount) * 100);
          const isHigh = pct >= 70;
          const isMid  = pct >= 35;
          const color  = isHigh ? 'bg-red-500' : isMid ? 'bg-orange-400' : 'bg-indigo-300';
          const label  = h.hour.toString().padStart(2, '0') + 'h';
          return `
            <div class="flex-1 flex flex-col items-center gap-0.5 group relative">
              <div class="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs px-1.5 py-0.5 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                ${h.count} cmd
              </div>
              <div class="${color} rounded-t w-full transition-all" style="height:${pct}%"></div>
              <span class="text-xs text-gray-400 leading-none" style="font-size:9px">${h.count > 0 ? label : ''}</span>
            </div>
          `;
        }).join('')}
      </div>
      <div class="flex justify-between text-xs text-gray-400 px-2 mt-1">
        <span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span>
      </div>
    `;
  },

  // ── Top produits ──────────────────────────────────────────────────────────────
  _renderTopProducts(products) {
    const container = document.getElementById('analyticsTopProducts');
    if (!container) return;

    if (!products?.length) {
      container.innerHTML = '<p class="text-gray-400 text-center py-4 text-sm">Aucune donnée</p>';
      return;
    }

    const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
    const maxQty = Math.max(...products.map(p => p.qty), 1);

    container.innerHTML = `
      <table class="w-full text-sm">
        <thead class="bg-gray-50 sticky top-0">
          <tr>
            <th class="px-3 py-2 text-left font-semibold text-gray-600">#</th>
            <th class="px-3 py-2 text-left font-semibold text-gray-600">Produit</th>
            <th class="px-3 py-2 text-center font-semibold text-gray-600">Qté</th>
            <th class="px-3 py-2 text-right font-semibold text-gray-600">CA</th>
            <th class="px-3 py-2 text-center font-semibold text-gray-600 hidden md:table-cell">Heure de pointe</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          ${products.map((p, i) => {
            const bar = Math.round((p.qty / maxQty) * 100);
            const peakH = `${String(p.peak_hour).padStart(2,'0')}h`;
            return `
              <tr class="hover:bg-gray-50">
                <td class="px-3 py-2 text-gray-400 font-medium">${i + 1}</td>
                <td class="px-3 py-2">
                  <div class="font-medium text-gray-800">${p.name}</div>
                  <div class="mt-1 h-1.5 bg-gray-100 rounded-full w-full max-w-32">
                    <div class="h-1.5 bg-indigo-500 rounded-full" style="width:${bar}%"></div>
                  </div>
                </td>
                <td class="px-3 py-2 text-center font-bold text-indigo-600">${p.qty}</td>
                <td class="px-3 py-2 text-right text-gray-700">${fmt(p.revenue)}</td>
                <td class="px-3 py-2 text-center hidden md:table-cell">
                  <span class="bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full text-xs font-medium">⏰ ${peakH}</span>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  },

  // ── Historique par période ────────────────────────────────────────────────────
  _renderHistory(history) {
    const container = document.getElementById('analyticsHistory');
    if (!container) return;

    if (!history?.length) {
      container.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-gray-400">Aucune donnée</td></tr>';
      return;
    }

    const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);

    container.innerHTML = history.map(row => `
      <tr class="hover:bg-gray-50 border-b border-gray-100">
        <td class="px-3 py-2 font-medium text-gray-800">${row.period_label}</td>
        <td class="px-3 py-2 text-center text-gray-700">${row.total_orders}</td>
        <td class="px-3 py-2 text-center text-green-600 font-medium">${row.paid_orders}</td>
        <td class="px-3 py-2 text-center text-red-500">${row.cancelled_orders}</td>
        <td class="px-3 py-2 text-right font-bold text-gray-800">${fmt(row.revenue)}</td>
        <td class="px-3 py-2 text-right text-gray-500">${fmt(row.avg_ticket)}</td>
      </tr>
    `).join('');
  },

  // ── Performance caissiers ─────────────────────────────────────────────────────
  _renderByCashier(cashiers) {
    const container = document.getElementById('analyticsByCashier');
    if (!container) return;

    if (!cashiers?.length) {
      container.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-400">Aucune donnée</td></tr>';
      return;
    }

    const fmt = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);

    container.innerHTML = cashiers.map(c => `
      <tr class="hover:bg-gray-50 border-b border-gray-100">
        <td class="px-3 py-2 font-medium text-gray-800">👤 ${c.cashier_name}</td>
        <td class="px-3 py-2 text-center text-gray-700">${c.total_orders}</td>
        <td class="px-3 py-2 text-center text-green-600 font-medium">${c.paid_orders}</td>
        <td class="px-3 py-2 text-center text-red-500">${c.cancelled_orders}</td>
        <td class="px-3 py-2 text-right font-bold text-indigo-600">${fmt(c.revenue)}</td>
      </tr>
    `).join('');
  },

  // ── Type de commande ──────────────────────────────────────────────────────────
  _renderByType(byType) {
    const container = document.getElementById('analyticsByType');
    if (!container) return;

    const labels  = { dine_in: '🍽️ Sur place', takeaway: '📦 À emporter', delivery: '🚚 Livraison' };
    const colors  = { dine_in: 'bg-indigo-500', takeaway: 'bg-orange-500', delivery: 'bg-green-500' };
    const total   = byType.reduce((s, r) => s + Number(r.orders_count), 0) || 1;

    container.innerHTML = (byType || []).map(r => {
      const pct = Math.round((Number(r.orders_count) / total) * 100);
      return `
        <div class="flex items-center gap-3 py-2">
          <span class="text-sm font-medium text-gray-700 w-32">${labels[r.order_type] || r.order_type}</span>
          <div class="flex-1 h-3 bg-gray-100 rounded-full">
            <div class="${colors[r.order_type] || 'bg-gray-400'} h-3 rounded-full" style="width:${pct}%"></div>
          </div>
          <span class="text-sm font-bold text-gray-800 w-10 text-right">${pct}%</span>
          <span class="text-xs text-gray-400 w-12 text-right">${r.orders_count} cmd</span>
        </div>
      `;
    }).join('') || '<p class="text-gray-400 text-center py-2 text-sm">Aucune donnée</p>';
  },

  // ── Onglet commandes annulées ─────────────────────────────────────────────────
  _renderCancelledTab(orders) {
    const container = document.getElementById('cancelledOrdersBody');
    if (!container) return;

    if (!orders?.length) {
      container.innerHTML = '<tr><td colspan="6" class="text-center py-6 text-gray-400">Aucune commande annulée</td></tr>';
      return;
    }

    const isAdmin = this.currentUser?.role === 'admin';
    const fmt     = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0);
    const fmtDate = (d) => d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

    container.innerHTML = orders.map(o => `
      <tr class="hover:bg-gray-50 border-b border-gray-100">
        <td class="px-3 py-2 text-xs text-gray-500">${fmtDate(o.cancelled_at || o.created_at)}</td>
        <td class="px-3 py-2 font-medium text-gray-800">${o.order_number}</td>
        <td class="px-3 py-2 text-gray-600">${o.cashier_name}</td>
        <td class="px-3 py-2 text-gray-500 text-xs">${o.cancelled_by_name !== 'Inconnu' ? o.cancelled_by_name : '—'}</td>
        <td class="px-3 py-2 text-right font-medium text-gray-700">${fmt(o.total)}</td>
        <td class="px-3 py-2 text-center">
          ${isAdmin ? `
            <button onclick="app.deleteCancelledOrder('${o.id}', '${o.order_number}')"
              class="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded-lg transition text-xs font-medium"
              title="Supprimer définitivement">
              🗑️ Suppr.
            </button>
          ` : '<span class="text-gray-300 text-xs">—</span>'}
        </td>
      </tr>
    `).join('');
  },

  // ── Action : suppression définitive commande annulée ─────────────────────────
  async deleteCancelledOrder(orderId, orderNumber) {
    const confirmed = await this.confirm(
      `Supprimer définitivement la commande ${orderNumber} ? Cette action est irréversible.`,
      { title: 'Suppression définitive', icon: '🗑️', type: 'danger', confirmText: 'Supprimer', cancelText: 'Annuler' }
    );
    if (!confirmed) return;
    try {
      await OrderService.deleteCancelled(orderId);
      this.toastSuccess(`Commande ${orderNumber} supprimée définitivement`);
      await this.loadAnalytics();
    } catch (error) {
      this.toastError(error.message || 'Erreur lors de la suppression');
    }
  },

  // ── Changement d'onglet analytics ────────────────────────────────────────────
  switchAnalyticsTab(tab) {
    document.querySelectorAll('.analytics-tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.analytics-tab-btn').forEach(el => el.classList.remove('active-analytics-tab'));
    const content = document.getElementById(`analyticsTab_${tab}`);
    const btn     = document.querySelector(`[data-analytics-tab="${tab}"]`);
    if (content) content.classList.remove('hidden');
    if (btn)     btn.classList.add('active-analytics-tab');
  },

};