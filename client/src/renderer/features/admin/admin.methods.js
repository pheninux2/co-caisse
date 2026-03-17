import { API_URL } from '../../core/api.js';

export const AdminMethods = {

  async loadAdminPanel() {
    await Promise.all([
      this.loadCurrentLicenceInfo(),
      this.loadAdminLicences(),
    ]);
  },

  // ── Licence active sur cette installation ────────────────────────────────────
  async loadCurrentLicenceInfo() {
    const el = document.getElementById('currentLicenceInfo');
    if (!el) return;
    try {
      const res  = await fetch(`${API_URL}/licences/status`);
      const data = await res.json();

      if (!data.hasLicence) {
        el.innerHTML = `<p class="text-orange-500 font-medium">⚠️ Aucune licence active</p>`;
        return;
      }

      const statusColor = data.valid
        ? (data.type === 'trial' ? 'text-amber-600' : 'text-green-600')
        : 'text-red-600';

      const statusLabel = !data.valid ? '❌ Expirée/Suspendue'
        : data.type === 'trial'       ? `⏳ Essai — ${data.daysRemaining} j restants`
        : data.type === 'perpetual'   ? '✅ Perpétuelle'
        : `✅ Abonnement — ${data.daysRemaining} j restants`;

      el.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><p class="text-xs text-gray-400">Client</p><p class="font-semibold text-gray-800">${data.clientName || '—'}</p></div>
          <div><p class="text-xs text-gray-400">Statut</p><p class="font-semibold ${statusColor}">${statusLabel}</p></div>
          <div><p class="text-xs text-gray-400">Type</p><p class="font-semibold text-gray-800">${data.type || '—'}</p></div>
          <div><p class="text-xs text-gray-400">Modules</p><p class="font-semibold text-gray-800">${(data.modules || []).join(', ') || '—'}</p></div>
        </div>
      `;
    } catch (e) {
      el.innerHTML = `<p class="text-red-500 text-sm">Erreur chargement : ${e.message}</p>`;
    }
  },

  // ── Liste toutes les licences ────────────────────────────────────────────────
  async loadAdminLicences() {
    const tbody = document.getElementById('adminLicencesTable');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-400">Chargement...</td></tr>`;

    try {
      const res  = await this.apiFetch(`${API_URL}/admin/licences`);
      const data = await res.json();
      const licences = data.licences || [];

      if (licences.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-gray-400">Aucune licence</td></tr>`;
        return;
      }

      tbody.innerHTML = licences.map(lic => {
        const statusBadge = lic.computed_status === 'active'
          ? '<span class="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">✅ Active</span>'
          : lic.computed_status === 'expired'
          ? '<span class="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full font-medium">❌ Expirée</span>'
          : '<span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full font-medium">⏸ Suspendue</span>';

        const typeBadge = lic.type === 'perpetual'
          ? '<span class="text-xs text-gray-500">♾ Perpétuelle</span>'
          : lic.type === 'trial'
          ? '<span class="text-xs text-amber-600">⏳ Essai</span>'
          : '<span class="text-xs text-blue-600">🔄 Abonnement</span>';

        const expiry = lic.expires_at || lic.trial_end
          ? new Date(lic.expires_at || lic.trial_end).toLocaleDateString('fr-FR')
          : '<span class="text-gray-400">—</span>';

        const modules = (Array.isArray(lic.modules) ? lic.modules : [])
          .map(m => `<span class="px-1 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded">${m}</span>`)
          .join(' ');

        const canSuspend = lic.computed_status === 'active';
        const canReactivate = lic.status === 'suspended';

        return `
          <tr class="hover:bg-gray-50 border-b border-gray-100">
            <td class="px-4 py-3">
              <p class="font-medium text-gray-800 text-sm">${lic.client_name}</p>
            </td>
            <td class="px-4 py-3">
              <code class="text-xs font-mono text-gray-600 bg-gray-100 px-2 py-0.5 rounded">${lic.licence_key}</code>
            </td>
            <td class="px-4 py-3">${typeBadge}</td>
            <td class="px-4 py-3">${statusBadge}</td>
            <td class="px-4 py-3"><div class="flex flex-wrap gap-1">${modules}</div></td>
            <td class="px-4 py-3 text-sm text-gray-600">${expiry}</td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-center gap-1">
                <button onclick="app.showLicenceEvents('${lic.id}')" title="Historique"
                  class="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition text-sm">📋</button>
                ${canSuspend ? `
                  <button onclick="app.suspendLicence('${lic.id}', '${lic.client_name}')" title="Suspendre"
                    class="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition text-sm">⏸</button>
                ` : ''}
                ${canReactivate ? `
                  <button onclick="app.reactivateLicence('${lic.id}', '${lic.client_name}')" title="Réactiver"
                    class="p-1.5 hover:bg-green-50 text-green-600 rounded-lg transition text-sm">▶️</button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-red-500">Erreur : ${e.message}</td></tr>`;
    }
  },

  // ── Suspend une licence ──────────────────────────────────────────────────────
  async suspendLicence(id, clientName) {
    const confirmed = await this.confirm(`Suspendre la licence de "${clientName}" ?`, {
      title: 'Suspension', icon: '⏸', type: 'danger',
      confirmText: 'Suspendre', cancelText: 'Annuler',
    });
    if (!confirmed) return;

    try {
      const res = await this.apiFetch(`${API_URL}/admin/licences/${id}/suspend`, {
        method: 'PUT', headers: this.getAuthHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      this.toastSuccess(`Licence de "${clientName}" suspendue`);
      this.loadAdminLicences();
    } catch (e) {
      this.toastError(e.message);
    }
  },

  // ── Réactive une licence ─────────────────────────────────────────────────────
  async reactivateLicence(id, clientName) {
    const confirmed = await this.confirm(`Réactiver la licence de "${clientName}" ?`, {
      title: 'Réactivation', icon: '▶️', type: 'info',
      confirmText: 'Réactiver', cancelText: 'Annuler',
    });
    if (!confirmed) return;

    try {
      const res = await this.apiFetch(`${API_URL}/admin/licences/${id}/reactivate`, {
        method: 'PUT', headers: this.getAuthHeaders(),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      this.toastSuccess(`Licence de "${clientName}" réactivée`);
      this.loadAdminLicences();
    } catch (e) {
      this.toastError(e.message);
    }
  },

  // ── Affiche l'historique d'une licence ──────────────────────────────────────
  async showLicenceEvents(id) {
    const el = document.getElementById('licenceEventsContent');
    if (!el) return;
    el.innerHTML = `<p class="text-gray-400 text-center py-4">Chargement...</p>`;
    this.openModal('licenceEventsModal');

    try {
      const res  = await this.apiFetch(`${API_URL}/admin/licences/${id}/events`);
      const data = await res.json();

      if (data.events.length === 0) {
        el.innerHTML = `<p class="text-gray-400 text-center py-4">Aucun événement</p>`;
        return;
      }

      const EVENT_ICONS = {
        activated:     '✅', trial_started: '🚀', expired:       '❌',
        suspended:     '⏸', reactivated:   '▶️', generated:     '🔑', renewed: '🔄',
      };

      el.innerHTML = data.events.map(e => {
        const icon = EVENT_ICONS[e.event_type] || '•';
        const meta = e.metadata
          ? `<p class="text-xs text-gray-400 mt-0.5">${JSON.stringify(e.metadata)}</p>`
          : '';
        return `
          <div class="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
            <span class="text-lg leading-none mt-0.5">${icon}</span>
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between">
                <p class="text-sm font-semibold text-gray-800">${e.event_type}</p>
                <p class="text-xs text-gray-400">${new Date(e.created_at).toLocaleString('fr-FR')}</p>
              </div>
              ${meta}
            </div>
          </div>
        `;
      }).join('');
    } catch (e) {
      el.innerHTML = `<p class="text-red-500 text-sm text-center py-4">Erreur : ${e.message}</p>`;
    }
  },

};
