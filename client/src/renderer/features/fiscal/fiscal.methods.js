import { FiscalService } from '../../services/fiscal.service.js';

export const FiscalMethods = {

  // ===== NF525 — CHAÎNAGE FISCAL =====

  async loadFiscalStatus() {
    const statusEl  = document.getElementById('fiscalChainStatus');
    const dotEl     = document.getElementById('fiscalChainStatusDot');
    const textEl    = document.getElementById('fiscalChainStatusText');
    const detailsEl = document.getElementById('fiscalChainDetails');
    if (!statusEl) return;

    try {
      const data = await FiscalService.getStatus();
      if (!data) {
        statusEl.classList.add('hidden');
        return;
      }

      statusEl.classList.remove('hidden');

      if (!data.hmac_key_set) {
        dotEl.className   = 'w-2 h-2 rounded-full bg-red-500 inline-block';
        textEl.textContent = '⚠️ FISCAL_HMAC_KEY manquante dans le .env serveur !';
        detailsEl.textContent = 'Ajoutez FISCAL_HMAC_KEY dans server/.env pour activer le chaînage.';
        return;
      }

      if (data.enabled) {
        dotEl.className   = 'w-2 h-2 rounded-full bg-green-500 inline-block';
        textEl.textContent = `✅ Chaînage actif — ${data.chain_length} transaction(s) chaînée(s)`;
        detailsEl.textContent = data.unchained_count > 0
          ? `⚠️ ${data.unchained_count} transaction(s) antérieure(s) non chaînées (avant activation)`
          : `Dernière transaction : ${data.last_tx_id ? data.last_tx_id.slice(0, 8) + '…' : 'aucune'}`;
      } else {
        dotEl.className   = 'w-2 h-2 rounded-full bg-gray-400 inline-block';
        textEl.textContent = 'Chaînage désactivé — les nouvelles transactions ne seront pas signées';
        detailsEl.textContent = data.chain_length > 0
          ? `${data.chain_length} transaction(s) déjà chaînée(s) conservées.`
          : '';
      }
    } catch (e) {
      statusEl.classList.add('hidden');
    }
  },

  async verifyFiscalChain() {
    const btn        = document.getElementById('btnVerifyChain');
    const resultEl   = document.getElementById('fiscalVerifyResult');
    const resetBlock = document.getElementById('fiscalResetBlock');
    if (!resultEl) return;

    if (resetBlock) resetBlock.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Vérification en cours…'; }

    try {
      const data = await FiscalService.verifyChain();

      if (data.error) {
        resultEl.className = 'mt-3 p-3 rounded-lg border text-xs bg-red-50 border-red-200 text-red-700';
        resultEl.innerHTML = `⚠️ Erreur : ${data.error}`;
        resultEl.classList.remove('hidden');
        return;
      }

      if (data.ok) {
        resultEl.className = 'mt-3 p-3 rounded-lg border text-xs bg-green-50 border-green-200 text-green-700';
        resultEl.innerHTML = `
          ✅ <strong>Chaîne intègre</strong> — ${data.verified}/${data.total} transaction(s) vérifiée(s)<br>
          <span class="text-green-600">Vérifiée le ${new Date(data.verified_at).toLocaleString('fr-FR')}</span>
        `;
        if (resetBlock) resetBlock.classList.add('hidden');
      } else {
        const anomList = (data.anomalies || []).slice(0, 5).map(a =>
          `<li>Position #${a.position} — TX <code>${(a.tx_id||'').slice(0,8)}…</code> — ${a.type}</li>`
        ).join('');

        resultEl.className = 'mt-3 p-3 rounded-lg border text-xs bg-red-50 border-red-200 text-red-700';
        resultEl.innerHTML = `
          🚨 <strong>${data.anomalies?.length || 0} anomalie(s) détectée(s) !</strong>
          ${data.total > 0 ? `<br>${data.verified}/${data.total} transaction(s) OK` : ''}
          <ul class="mt-2 pl-4 list-disc space-y-0.5">${anomList}</ul>
        `;
        if (resetBlock) resetBlock.classList.remove('hidden');
      }
      resultEl.classList.remove('hidden');
    } catch (e) {
      resultEl.className = 'mt-3 p-3 rounded-lg border text-xs bg-red-50 border-red-200 text-red-700';
      resultEl.innerHTML = `⚠️ Erreur réseau : ${e.message}`;
      resultEl.classList.remove('hidden');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔍 Vérifier l\'intégrité de la chaîne'; }
    }
  },

  async resetFiscalChain() {
    const confirmed = await this.confirm(
      'Cette opération va recalculer les hashs de toutes les transactions avec la clé HMAC actuelle.\n\nÀ utiliser uniquement si vous avez changé la FISCAL_HMAC_KEY dans le .env du serveur.\n\nContinuer ?',
      { title: '🔄 Recalculer la chaîne fiscale', icon: '⚠️', type: 'warning', confirmText: 'Recalculer', cancelText: 'Annuler' }
    );
    if (!confirmed) return;

    const btn        = document.getElementById('btnResetChain');
    const resultEl   = document.getElementById('fiscalVerifyResult');
    const resetBlock = document.getElementById('fiscalResetBlock');

    if (btn) { btn.disabled = true; btn.textContent = '⏳ Recalcul en cours…'; }

    try {
      const data = await FiscalService.resetChain();

      if (data.success) {
        if (resultEl) {
          resultEl.className = 'mt-3 p-3 rounded-lg border text-xs bg-green-50 border-green-200 text-green-700';
          resultEl.innerHTML = `✅ <strong>Recalcul terminé</strong> — ${data.message}`;
          resultEl.classList.remove('hidden');
        }
        if (resetBlock) resetBlock.classList.add('hidden');
        this.toastSuccess(`✅ ${data.message}`);
        this.loadFiscalStatus();
      } else {
        this.toastError(data.error || 'Erreur lors du recalcul');
      }
    } catch (e) {
      this.toastError('Erreur réseau : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '🔄 Recalculer toute la chaîne avec la clé actuelle'; }
    }
  },

  // ===== CLÔTURE JOURNALIÈRE — Z-TICKET NF525 =====

  async checkClosureStatus() {
    if (this.currentUser?.role !== 'admin') return;
    try {
      const data = await FiscalService.getClosureStatus();
      if (!data) return;
      this._closureStatus = data;

      const badge   = document.getElementById('closureBadge');
      const banner  = document.getElementById('closureWarningBanner');
      const warnTxt = document.getElementById('closureWarningText');

      if (data.warn_no_closure_hours && !data.already_closed) {
        if (badge)  { badge.classList.remove('hidden'); }
        if (banner) { banner.classList.remove('hidden'); }
        if (warnTxt) {
          warnTxt.textContent = data.warn_no_closure_hours >= 99
            ? 'Aucune clôture journalière effectuée — des transactions existent sans être clôturées.'
            : `La clôture journalière n'a pas été effectuée depuis plus de ${data.warn_no_closure_hours}h.`;
        }
      } else {
        if (badge)  badge.classList.add('hidden');
        if (banner) banner.classList.add('hidden');
      }
    } catch (_) { /* silencieux */ }
  },

  async openClosureModal() {
    this.openModal('closureConfirmModal');
    const preview    = document.getElementById('closurePreview');
    const alreadyEl  = document.getElementById('closureAlreadyDone');
    const confirmBtn = document.getElementById('btnConfirmClosure');

    if (alreadyEl)  alreadyEl.classList.add('hidden');
    if (confirmBtn) confirmBtn.disabled = false;
    if (preview)    preview.innerHTML = '<p class="text-center text-gray-400 text-sm">Chargement…</p>';

    try {
      const data = await FiscalService.getClosureStatus();
      this._closureStatus = data;

      const fmtDate = iso => new Date(iso).toLocaleString('fr-FR', { timeZone: 'UTC' });

      if (preview) {
        preview.innerHTML = `
          <div class="flex justify-between text-gray-600">
            <span>📅 Journée fiscale</span>
            <span class="font-medium text-xs">${fmtDate(data.fiscal_day_start)} → ${fmtDate(data.fiscal_day_end)}</span>
          </div>
          <div class="flex justify-between text-gray-600">
            <span>🧾 Transactions du jour</span>
            <span class="font-bold text-gray-800">${data.transactions_today}</span>
          </div>
          ${data.already_closed ? '' : `
          <div class="flex justify-between text-gray-600">
            <span>💶 Total estimé TTC</span>
            <span class="font-bold text-indigo-600">Calculé à la clôture</span>
          </div>`}
        `;
      }

      if (data.already_closed) {
        if (alreadyEl) {
          alreadyEl.innerHTML = `✅ La journée a déjà été clôturée — <strong>${data.closure?.closure_number}</strong><br>
            <span class="text-xs text-green-600">le ${fmtDate(data.closure?.closed_at)}</span>`;
          alreadyEl.classList.remove('hidden');
        }
        if (confirmBtn) confirmBtn.disabled = true;
      }

      if (data.transactions_today === 0 && !data.already_closed) {
        if (confirmBtn) confirmBtn.textContent = '📋 Clôturer (0 transaction)';
      }
    } catch (e) {
      if (preview) preview.innerHTML = `<p class="text-red-500 text-sm text-center">Erreur : ${e.message}</p>`;
    }
  },

  async executeCloseDay() {
    const confirmBtn = document.getElementById('btnConfirmClosure');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = '⏳ Clôture en cours…'; }

    try {
      const data = await FiscalService.closeDay();

      this.closeModal('closureConfirmModal');
      this._lastClosure = data;
      this.showZticket(data);

      this.checkClosureStatus();
      this.toastSuccess(`✅ ${data.closure_number} — Clôture effectuée (${data.transaction_count} transactions)`);
    } catch (e) {
      this.toastError('Erreur réseau : ' + e.message);
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = '📋 Clôturer et générer le Z-Ticket'; }
    }
  },

  showZticket(data) {
    const content   = document.getElementById('zticketContent');
    const subtitle  = document.getElementById('zticketSubtitle');
    const numEl     = document.getElementById('zticketNumber');
    const summaryEl = document.getElementById('zticketSummary');

    if (numEl)    numEl.textContent    = data.closure_number || '';
    if (subtitle) subtitle.textContent =
      `Clôturé le ${new Date(data.closed_at || data.fiscal_day_start).toLocaleString('fr-FR', { timeZone: 'UTC' })}`;
    if (content)  content.textContent  = data.zticket_content || 'Contenu non disponible';

    const payLabels = { cash: '💵 Espèces', card: '💳 CB', mixed: '🔀 Mixte', other: '💱 Autre' };
    const vatBreak  = Array.isArray(data.vat_breakdown)           ? data.vat_breakdown     : [];
    const payBreak  = typeof data.payment_breakdown === 'object'  ? data.payment_breakdown : {};

    if (summaryEl) {
      const statsHtml = [
        `<div class="bg-indigo-50 rounded-lg p-2"><p class="text-gray-500">Transactions</p><p class="font-bold text-indigo-700 text-base">${data.transaction_count}</p></div>`,
        `<div class="bg-green-50 rounded-lg p-2"><p class="text-gray-500">Total TTC</p><p class="font-bold text-green-700 text-base">${Number(data.total_ttc).toFixed(2)} €</p></div>`,
        `<div class="bg-amber-50 rounded-lg p-2"><p class="text-gray-500">Total TVA</p><p class="font-bold text-amber-700 text-base">${Number(data.total_tax).toFixed(2)} €</p></div>`,
        ...vatBreak.map(v =>
          `<div class="bg-gray-50 rounded-lg p-2 col-span-1"><p class="text-gray-400 text-xs">TVA ${v.rate}%</p><p class="font-semibold text-gray-700">${Number(v.tax_amount).toFixed(2)} €</p></div>`
        ),
        ...Object.entries(payBreak).filter(([,v]) => Number(v) > 0).map(([k, v]) =>
          `<div class="bg-gray-50 rounded-lg p-2 col-span-1"><p class="text-gray-400 text-xs">${payLabels[k] || k}</p><p class="font-semibold text-gray-700">${Number(v).toFixed(2)} €</p></div>`
        ),
      ].join('');
      summaryEl.innerHTML = statsHtml;
    }

    this.openModal('zticketModal');
  },

  printZticket() {
    const content = document.getElementById('zticketContent')?.textContent || '';
    if (!content) return;

    if (window.electron) {
      window.electron.printTicket(`<pre style="font-family:'Courier New',monospace;font-size:9pt;margin:0">${content}</pre>`);
    } else {
      const w = window.open('', '', 'height=800,width=420');
      w.document.write(`<!DOCTYPE html><html><head><title>Z-Ticket</title>
        <style>body{font-family:'Courier New',monospace;margin:10px;font-size:9pt}pre{white-space:pre;margin:0}</style>
        </head><body><pre>${content}</pre>
        <script>window.onload=()=>{window.print();window.close()}<\/script></body></html>`);
      w.document.close();
    }
  },

  exportZticketPDF() {
    const content = document.getElementById('zticketContent')?.textContent || '';
    const numEl   = document.getElementById('zticketNumber')?.textContent  || 'Z-ticket';
    if (!content) return;

    const w = window.open('', '', 'height=900,width=500');
    w.document.write(`<!DOCTYPE html><html><head><title>${numEl}</title>
      <style>
        @page { size: A4 portrait; margin: 10mm; }
        body { font-family: 'Courier New', monospace; font-size: 8pt; }
        pre  { white-space: pre; margin: 0; }
      </style></head><body>
      <pre>${content}</pre>
      <script>window.onload = () => { window.print(); }<\/script>
      </body></html>`);
    w.document.close();
    this.toastSuccess('Fenêtre d\'impression ouverte — choisissez "Enregistrer en PDF"');
  },

  async openClosuresHistory() {
    this.openModal('closuresHistoryModal');
    const listEl = document.getElementById('closuresHistoryList');
    if (listEl) listEl.innerHTML = '<p class="text-center text-gray-400 py-8">Chargement…</p>';

    try {
      const closures = await FiscalService.getClosuresHistory();

      if (!Array.isArray(closures) || closures.length === 0) {
        listEl.innerHTML = '<p class="text-center text-gray-400 py-8">Aucune clôture enregistrée</p>';
        return;
      }

      listEl.innerHTML = closures.map(c => {
        const fmtDate = iso => new Date(iso).toLocaleString('fr-FR', { timeZone: 'UTC' });
        return `
          <div class="flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:bg-gray-50 transition"
               onclick="app.openClosureDetail('${c.id}')">
            <div class="flex items-center gap-3">
              <span class="text-lg font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-lg min-w-[55px] text-center">${c.closure_number}</span>
              <div>
                <p class="font-medium text-gray-800 text-sm">${fmtDate(c.closed_at)}</p>
                <p class="text-xs text-gray-400">${c.transaction_count} transaction(s)</p>
              </div>
            </div>
            <div class="text-right">
              <p class="font-bold text-indigo-600">${Number(c.total_ttc).toFixed(2)} €</p>
              <p class="text-xs text-gray-400">TTC</p>
            </div>
          </div>`;
      }).join('');
    } catch (e) {
      listEl.innerHTML = `<p class="text-center text-red-400 py-8">Erreur : ${e.message}</p>`;
    }
  },

  async openClosureDetail(closureId) {
    try {
      const data = await FiscalService.getClosure(closureId);
      this.closeModal('closuresHistoryModal');
      this.showZticket(data);
    } catch (e) {
      this.toastError('Erreur : ' + e.message);
    }
  },

};
