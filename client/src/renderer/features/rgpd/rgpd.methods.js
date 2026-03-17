import { RgpdService } from '../../services/rgpd.service.js';

export const RgpdMethods = {

  /** Charge et affiche le statut RGPD (dernière purge, config). */
  async loadRgpdStatus() {
    const block   = document.getElementById('rgpdStatusBlock');
    const lastEl  = document.getElementById('rgpdLastPurge');
    if (!block || !lastEl) return;

    try {
      const data = await RgpdService.getStatus().catch(() => null);
      if (!data) { lastEl.textContent = 'Service RGPD non disponible.'; return; }

      const cutoff = new Date(data.cutoff_date).toLocaleDateString('fr-FR');

      if (data.last_purge) {
        const runAt  = new Date(data.last_purge.run_at).toLocaleString('fr-FR');
        const icon   = data.last_purge.status === 'success' ? '✅' : '⚠️';
        const by     = data.last_purge.triggered_by === 'manual' ? 'Manuel' : 'Automatique';
        lastEl.innerHTML =
          `${icon} <strong>${runAt}</strong> — ${by}<br>` +
          `Anonymisées : <strong>${data.last_purge.transactions_anonymized}</strong> tx · ` +
          `Logs supprimés : <strong>${data.last_purge.logs_deleted}</strong><br>` +
          `<span class="text-gray-400">Date pivot actuelle : données avant le ${cutoff}</span>`;
      } else {
        lastEl.innerHTML =
          `<span class="text-gray-400">Aucune purge effectuée · ` +
          `Date pivot actuelle : données avant le ${cutoff}</span>`;
      }
    } catch (e) {
      lastEl.textContent = 'Erreur de chargement : ' + e.message;
    }
  },

  /** Aperçu du nombre de transactions qui seraient anonymisées. */
  async previewRgpdPurge() {
    const resultEl   = document.getElementById('rgpdPurgeResult');
    const testCutoff = document.getElementById('rgpdTestCutoff')?.value;
    if (!resultEl) return;

    try {
      const data = await RgpdService.preview(testCutoff || null);

      const cutoff     = new Date(data.cutoff_date).toLocaleDateString('fr-FR');
      const testLabel  = testCutoff ? ` <span class="text-yellow-700 font-semibold">(date pivot forcée — mode test)</span>` : '';
      const toAnon     = data.transactions_to_anonymize ?? 0;
      const txTotal    = data.transactions_total ?? 0;
      const txEmails   = data.transactions_emails ?? 0;
      const ordNames   = data.orders_names ?? 0;

      resultEl.className = `mt-3 p-3 rounded-lg border text-xs ${
        toAnon > 0
          ? 'border-amber-200 bg-amber-50 text-amber-800'
          : 'border-indigo-200 bg-indigo-50 text-indigo-800'
      }`;

      let html = `🔍 <strong>Aperçu${testLabel} — avant le ${cutoff} :</strong><br>`;
      html += `<table class="mt-1 w-full text-xs"><tbody>`;
      html += `<tr><td class="pr-4">📋 Transactions totales dans la fenêtre :</td><td class="font-bold">${txTotal}</td></tr>`;
      html += `<tr><td class="pr-4">📧 Avec email client à effacer :</td><td class="font-bold ${txEmails > 0 ? 'text-amber-700' : 'text-green-700'}">${txEmails}</td></tr>`;
      html += `<tr><td class="pr-4">👤 Commandes avec nom/tel à anonymiser :</td><td class="font-bold ${ordNames > 0 ? 'text-amber-700' : 'text-green-700'}">${ordNames}</td></tr>`;
      html += `</tbody></table>`;

      if (toAnon === 0) {
        html += `<br><span class="text-green-700 font-semibold">✅ Aucune donnée personnelle à anonymiser dans cette fenêtre.</span>`;
        if (txTotal > 0) {
          html += `<br><span class="text-indigo-500">${txTotal} transaction(s) fiscales conservées intactes (montants, TVA, articles).</span>`;
        }
      } else {
        html += `<br><span class="text-amber-700 font-semibold">⚠️ ${toAnon} enregistrement(s) contiennent des données personnelles à anonymiser.</span>`;
        html += `<br><span class="text-amber-600">Cliquez "Purger maintenant" pour lancer l'anonymisation.</span>`;
      }

      resultEl.innerHTML = html;
      resultEl.classList.remove('hidden');
    } catch (e) {
      resultEl.className = 'mt-3 p-3 rounded-lg border text-xs border-red-200 bg-red-50 text-red-700';
      resultEl.textContent = 'Erreur : ' + e.message;
      resultEl.classList.remove('hidden');
    }
  },

  /** Déclenche une purge RGPD manuelle avec confirmation. */
  async triggerRgpdPurge() {
    const btn        = document.getElementById('btnRgpdPurge');
    const resultEl   = document.getElementById('rgpdPurgeResult');
    const testCutoff = document.getElementById('rgpdTestCutoff')?.value;

    const cutoffLabel = testCutoff
      ? `date pivot forcée : <strong>${new Date(testCutoff).toLocaleDateString('fr-FR')}</strong> (mode test)`
      : `date pivot calculée automatiquement (${this.settings?.rgpd_retention_months ?? 120} mois en arrière)`;

    const confirmed = await this.confirm(
      `Cette action va anonymiser les données personnelles (email) des transactions ` +
      `et les données clients (nom, téléphone) des commandes antérieures à la ${cutoffLabel}.\n\n` +
      `Les montants, produits et données fiscales restent intacts.\n\n` +
      `Voulez-vous continuer ?`,
      {
        title:       '🛡️ Confirmation purge RGPD',
        icon:        '⚠️',
        type:        'warning',
        confirmText: 'Anonymiser',
        cancelText:  'Annuler',
      }
    );
    if (!confirmed) return;

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Purge en cours…'; }

    try {
      const data = await RgpdService.purge(testCutoff || null);

      const icon = data.status === 'error' ? '⚠️' : '✅';
      resultEl.className = `mt-3 p-3 rounded-lg border text-xs ${
        data.status === 'error'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-green-200 bg-green-50 text-green-800'
      }`;
      resultEl.innerHTML =
        `${icon} <strong>Purge terminée</strong>` +
        (testCutoff ? ` <span class="text-yellow-700">(mode test — date pivot : ${new Date(testCutoff).toLocaleDateString('fr-FR')})</span>` : '') +
        `<br>Enregistrements anonymisés : <strong>${data.transactions_anonymized}</strong><br>` +
        `Logs supprimés : <strong>${data.logs_deleted}</strong>` +
        (data.error_message ? `<br>⚠️ ${data.error_message}` : '');
      resultEl.classList.remove('hidden');

      await this.loadRgpdStatus();
      this.toastSuccess(`✅ Purge RGPD — ${data.transactions_anonymized} enregistrement(s) anonymisé(s)`);
    } catch (e) {
      resultEl.className = 'mt-3 p-3 rounded-lg border text-xs border-red-200 bg-red-50 text-red-700';
      resultEl.textContent = 'Erreur : ' + e.message;
      resultEl.classList.remove('hidden');
      this.toastError('Erreur RGPD : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '🗑️ Purger maintenant'; }
    }
  },

  async searchRgpdCustomers() {
    const input   = document.getElementById('rgpdSearchInput');
    const errEl   = document.getElementById('rgpdSearchError');
    const resBox  = document.getElementById('rgpdSearchResults');
    const listEl  = document.getElementById('rgpdResultsList');
    const countEl = document.getElementById('rgpdResultsCount');
    const query   = input?.value?.trim();

    if (errEl) errEl.classList.add('hidden');
    if (!query || query.length < 2) {
      if (errEl) { errEl.textContent = 'Saisissez au moins 2 caractères.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (listEl) listEl.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">Recherche…</p>';
    if (resBox) resBox.classList.remove('hidden');

    try {
      const data = await RgpdService.searchCustomers(query);

      if (countEl) countEl.textContent = `${data.total} résultat(s)`;
      if (!data.results?.length) {
        listEl.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">Aucun client trouvé avec données personnelles.</p>';
        return;
      }

      window._rgpdSearchResults = [];
      listEl.innerHTML = data.results.map((r, idx) => {
        window._rgpdSearchResults[idx] = r;
        const icon     = r.type === 'transactions' ? '📧' : '👤';
        const detail   = r.detail ? ` · ${r.detail}` : '';
        const count    = r.type === 'transactions' ? `${r.tx_count} transaction(s)` : `${r.order_count} commande(s)`;
        const lastSeen = new Date(r.last_seen).toLocaleDateString('fr-FR');
        return `
          <div class="flex items-center justify-between p-3 hover:bg-gray-50 transition">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                <span>${icon}</span>
                <span class="truncate">${this._esc(r.identifier)}${this._esc(detail)}</span>
              </p>
              <p class="text-xs text-gray-400 mt-0.5">${count} · Dernière activité : ${lastSeen}</p>
            </div>
            <button onclick="app.openRgpdAnonymizeModalByIndex(${idx})"
              class="ml-3 flex-shrink-0 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-semibold rounded-lg transition">
              🗑️ Anonymiser
            </button>
          </div>`;
      }).join('');
    } catch (e) {
      if (errEl) { errEl.textContent = 'Erreur : ' + e.message; errEl.classList.remove('hidden'); }
      if (listEl) listEl.innerHTML = '';
    }
  },

  openRgpdAnonymizeModalByIndex(idx) {
    const r = window._rgpdSearchResults?.[idx];
    if (!r) return;
    const email = r.type === 'transactions' ? r.identifier : null;
    const name  = r.type === 'orders'       ? r.identifier : null;
    this.openRgpdAnonymizeModal(email, name);
  },

  openRgpdAnonymizeModal(customerEmail = null, customerName = null) {
    this._rgpdTarget = { customerEmail, customerName };
    const targetEl = document.getElementById('rgpdAnonymizeTarget');
    if (targetEl) {
      const lines = [];
      if (customerEmail) lines.push(`📧 Email : <strong>${this._esc(customerEmail)}</strong>`);
      if (customerName)  lines.push(`👤 Nom   : <strong>${this._esc(customerName)}</strong>`);
      targetEl.innerHTML = lines.join('<br>');
    }
    const reasonEl = document.getElementById('rgpdAnonymizeReason');
    if (reasonEl) reasonEl.value = '';
    const confirmInput = document.getElementById('rgpdConfirmInput');
    if (confirmInput) confirmInput.value = '';
    const errEl = document.getElementById('rgpdAnonymizeError');
    if (errEl) errEl.classList.add('hidden');
    document.getElementById('rgpdStep1')?.classList.remove('hidden');
    document.getElementById('rgpdStep2')?.classList.add('hidden');
    this.openModal('rgpdAnonymizeModal');
  },

  rgpdAnonymizeStep2() {
    document.getElementById('rgpdStep1')?.classList.add('hidden');
    document.getElementById('rgpdStep2')?.classList.remove('hidden');
    document.getElementById('rgpdConfirmInput')?.focus();
  },

  rgpdAnonymizeBack() {
    document.getElementById('rgpdStep2')?.classList.add('hidden');
    document.getElementById('rgpdStep1')?.classList.remove('hidden');
  },

  async rgpdAnonymizeConfirm() {
    const confirmInput = document.getElementById('rgpdConfirmInput');
    const errEl        = document.getElementById('rgpdAnonymizeError');
    const btn          = document.getElementById('btnRgpdConfirmAnonymize');
    if (errEl) errEl.classList.add('hidden');

    if (confirmInput?.value?.trim().toUpperCase() !== 'CONFIRMER') {
      if (errEl) { errEl.textContent = 'Tapez exactement "CONFIRMER" pour valider.'; errEl.classList.remove('hidden'); }
      return;
    }

    const { customerEmail, customerName } = this._rgpdTarget || {};
    const reason = document.getElementById('rgpdAnonymizeReason')?.value?.trim() || 'Droit à l\'effacement RGPD Art. 17';
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Anonymisation…'; }

    try {
      const data = await RgpdService.anonymizeCustomer({ customerEmail, customerName, reason });
      this.closeModal('rgpdAnonymizeModal');
      this._showRgpdReport(data);
      await this.searchRgpdCustomers();
      this.toastSuccess(`✅ Client anonymisé — ${data.total_affected} enregistrement(s) traité(s)`);
    } catch (e) {
      if (errEl) { errEl.textContent = 'Erreur : ' + e.message; errEl.classList.remove('hidden'); }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '🛡️ Anonymiser définitivement'; }
    }
  },

  _showRgpdReport(data) {
    const adminName   = this.currentUser?.username || 'admin';
    const companyName = this.settings?.company_name || 'Co-Caisse';
    const execAt      = new Date(data.executed_at).toLocaleString('fr-FR');
    const sep  = '═'.repeat(50);
    const dash = '─'.repeat(50);
    const report = `${sep}
  RAPPORT DE CONFORMITÉ RGPD — Art. 17
${sep}

Établissement   : ${companyName}
Date d'exécution: ${execAt}
Exécuté par     : ${adminName}
Référence       : ${data.run_id}

${dash}
CLIENT CONCERNÉ
${dash}
${data.customer_email ? `Email : ${data.customer_email}` : ''}
${data.customer_name  ? `Nom   : ${data.customer_name}` : ''}
Motif : ${data.reason}

${dash}
RÉSULTAT
${dash}
Statut       : ${data.status === 'success' ? '✅ SUCCÈS' : '⚠️ ' + data.status.toUpperCase()}
Transactions : ${data.transactions_anonymized} anonymisé(s)
Commandes    : ${data.orders_anonymized} anonymisé(s)
Total        : ${data.total_affected} enregistrement(s)

${dash}
DONNÉES CONSERVÉES (obligation fiscale LPF Art. L102 B)
${dash}
• Montants · Articles · TVA · N° ticket · Dates

${dash}
DONNÉES EFFACÉES
${dash}
• Nom → "Client anonymisé" · Email → NULL · Téléphone → NULL

${sep}
À conserver dans le registre de traitement (RGPD Art. 30)
${sep}`;

    this._lastRgpdReport     = report;
    this._lastRgpdReportData = data;
    const contentEl = document.getElementById('rgpdReportContent');
    if (contentEl) contentEl.textContent = report;
    this.openModal('rgpdReportModal');
  },

  printRgpdReport() {
    const content = this._lastRgpdReport || '';
    const win = window.open('', '', 'height=700,width=600');
    win.document.write(`<!DOCTYPE html><html lang="fr"><head><title>Rapport RGPD</title>
      <style>body{font-family:'Courier New',monospace;font-size:11pt;margin:20px}pre{white-space:pre-wrap}</style>
      </head><body><pre>${content.replace(/</g, '&lt;')}</pre>
      <script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
    win.document.close();
  },

  downloadRgpdReport() {
    const content  = this._lastRgpdReport || '';
    const data     = this._lastRgpdReportData;
    const filename = `rapport-rgpd-${data?.run_id?.slice(0,8) || 'export'}-${new Date().toISOString().slice(0,10)}.txt`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  },

};
