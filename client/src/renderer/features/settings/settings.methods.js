import { SettingsService } from '../../services/settings.service.js';
import { RgpdService }     from '../../services/rgpd.service.js';

export const SettingsMethods = {

  // ===== BUSINESS CONFIG =====

  /**
   * Préréglages pays côté client (miroir de COUNTRY_PRESETS serveur).
   * Utilisés pour l'aperçu immédiat sans appel API.
   */
  _countryPresets() {
    return {
      FR: { currency: 'EUR', currencySymbol: '€', vatRates: [5.5, 10, 20], defaultVatRate: 20, printByDefault: false, antifraudMode: true },
      MA: { currency: 'MAD', currencySymbol: 'د.م.', vatRates: [0, 7, 10, 14, 20], defaultVatRate: 10, printByDefault: true,  antifraudMode: false },
      BE: { currency: 'EUR', currencySymbol: '€', vatRates: [6, 12, 21],       defaultVatRate: 21, printByDefault: false, antifraudMode: false },
      CH: { currency: 'CHF', currencySymbol: 'CHF', vatRates: [2.6, 3.8, 8.1], defaultVatRate: 8.1, printByDefault: false, antifraudMode: false },
    };
  },

  /** Remplit les selects pays/type depuis this.businessConfig. */
  _populateBusinessConfigUI() {
    const cfg = this.businessConfig;
    if (!cfg) return;

    const countryEl = document.getElementById('businessCountry');
    if (countryEl) countryEl.value = cfg.country || 'FR';

    const typeEl = document.getElementById('businessType');
    if (typeEl) typeEl.value = cfg.businessType || 'restaurant';

    this._updateBusinessPreview(cfg.country || 'FR');
  },

  /** Met à jour l'aperçu préréglage en temps réel (sans appel API). */
  onCountryChange() {
    const country = document.getElementById('businessCountry')?.value || 'FR';
    this._updateBusinessPreview(country);
  },

  _updateBusinessPreview(country) {
    const presets = this._countryPresets();
    const p = presets[country] || presets['FR'];

    const el = (id) => document.getElementById(id);
    if (el('previewCurrency'))    el('previewCurrency').textContent    = `${p.currency} (${p.currencySymbol})`;
    if (el('previewDefaultVat'))  el('previewDefaultVat').textContent  = `${p.defaultVatRate}%`;
    if (el('previewVatRates'))    el('previewVatRates').textContent    = p.vatRates.map(r => r + '%').join(' · ');
    if (el('previewPrintDefault')) el('previewPrintDefault').textContent = p.printByDefault ? 'Oui' : 'Non (AGEC)';
    if (el('previewAntifraud'))   el('previewAntifraud').textContent   = p.antifraudMode  ? 'Oui (NF525)' : 'Non';
  },

  /** Sauvegarde la config pays/type via PUT /api/config/business. */
  async saveBusinessConfig() {
    const resultEl = document.getElementById('businessConfigResult');
    const country     = document.getElementById('businessCountry')?.value  || 'FR';
    const businessType = document.getElementById('businessType')?.value    || 'restaurant';
    const presets     = this._countryPresets();
    const preset      = presets[country] || presets['FR'];

    try {
      if (resultEl) { resultEl.className = 'mt-2 p-2 rounded-lg text-xs text-center bg-gray-50 text-gray-500'; resultEl.textContent = '⏳ Enregistrement…'; resultEl.classList.remove('hidden'); }

      const data = await SettingsService.saveBusinessConfig({
        country,
        business_type:    businessType,
        vat_rates:        preset.vatRates,
        default_vat_rate: preset.defaultVatRate,
        currency:         preset.currency,
        currency_symbol:  preset.currencySymbol,
        print_by_default: preset.printByDefault,
        antifraud_mode:   preset.antifraudMode,
      });

      // Mettre à jour businessConfig en mémoire
      this.businessConfig = data.config;

      if (resultEl) { resultEl.className = 'mt-2 p-2 rounded-lg text-xs text-center bg-green-50 text-green-700'; resultEl.textContent = '✅ Configuration appliquée — taux TVA et devise mis à jour.'; }
      this.toastSuccess(`🌍 Config ${country} appliquée — TVA : ${preset.vatRates.join('%, ')}%`);

      // Rafraîchir les produits (taux TVA dans les cards)
      await this.loadProducts();
    } catch (e) {
      if (resultEl) { resultEl.className = 'mt-2 p-2 rounded-lg text-xs text-center bg-red-50 text-red-700'; resultEl.textContent = '❌ ' + e.message; }
      this.toastError('Erreur : ' + e.message);
    }
  },

  // ===== SETTINGS TABS =====

  showSettingsTab(tab) {
    // Mettre à jour les boutons
    document.querySelectorAll('.settings-tab').forEach(btn => {
      btn.classList.remove('border-indigo-500', 'text-indigo-600', 'bg-indigo-50');
      btn.classList.add('border-transparent', 'text-gray-500');
    });
    const activeBtn = document.getElementById(`stab-${tab}`);
    if (activeBtn) {
      activeBtn.classList.add('border-indigo-500', 'text-indigo-600', 'bg-indigo-50');
      activeBtn.classList.remove('border-transparent', 'text-gray-500');
    }
    // Afficher/cacher les panneaux
    document.querySelectorAll('.settings-tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById(`stab-panel-${tab}`)?.classList.remove('hidden');
    // Chargements spécifiques
    if (tab === 'rgpd') this.loadRgpdStatus();
    if (tab === 'avance') {
      this.loadFiscalStatus();
      this._populateBusinessConfigUI();
    }
    this._activeSettingsTab = tab;
  },

  showRgpdSubTab(sub) {
    document.querySelectorAll('.rgpd-subtab').forEach(btn => {
      btn.classList.remove('text-indigo-600', 'bg-indigo-50', 'border-indigo-500');
      btn.classList.add('text-gray-500', 'border-transparent');
    });
    const activeBtn = document.getElementById(`rtab-${sub}`);
    if (activeBtn) {
      activeBtn.classList.add('text-indigo-600', 'bg-indigo-50', 'border-indigo-500');
      activeBtn.classList.remove('text-gray-500', 'border-transparent');
    }
    ['conservation', 'clients', 'journal'].forEach(s => {
      const el = document.getElementById(`rtab-panel-${s}`);
      if (el) el.classList.toggle('hidden', s !== sub);
    });
    if (sub === 'journal') this.loadRgpdJournal();
  },

  async loadRgpdJournal() {
    const listEl = document.getElementById('rgpdJournalList');
    if (!listEl) return;
    listEl.innerHTML = '<p class="text-center text-gray-400 py-4 text-sm">Chargement…</p>';
    try {
      const logs = await RgpdService.getJournal();
      if (!logs?.length) {
        listEl.innerHTML = '<p class="text-center text-gray-400 py-6 text-sm">Aucune purge enregistrée.</p>';
        return;
      }
      listEl.innerHTML = logs.map(log => {
        const date   = new Date(log.run_at).toLocaleString('fr-FR');
        const isAuto = log.triggered_by === 'cron';
        const isErr  = log.status === 'error';
        const isAnon = log.retention_months === 0;
        const icon   = isErr ? '⚠️' : isAnon ? '🛡️' : '🔄';
        const label  = isAnon ? 'Effacement ciblé' : isAuto ? 'Automatique' : 'Manuel';
        const bg     = isErr ? 'bg-red-50 border-red-200' : isAnon ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-200';
        return `
          <div class="p-3 rounded-lg border ${bg} text-xs space-y-0.5">
            <div class="flex items-center justify-between">
              <span class="font-semibold text-gray-700">${icon} ${date}</span>
              <span class="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">${label}</span>
            </div>
            <p class="text-gray-500">Anonymisés : <strong>${log.transactions_anonymized}</strong>${log.logs_deleted > 0 ? ` · Logs supprimés : <strong>${log.logs_deleted}</strong>` : ''}</p>
            ${log.error_message ? `<p class="text-red-600 italic truncate">${log.error_message}</p>` : ''}
          </div>`;
      }).join('');
    } catch (e) {
      listEl.innerHTML = `<p class="text-center text-red-400 py-4 text-sm">Erreur : ${e.message}</p>`;
    }
  },

  // ===== SETTINGS =====

  async saveSettings() {
    try {
      const settings = {
        company_name: document.getElementById('companyName')?.value,
        company_address: document.getElementById('companyAddress')?.value,
        company_phone: document.getElementById('companyPhone')?.value,
        company_email: document.getElementById('companyEmail')?.value,
        tax_number: document.getElementById('taxNumber')?.value,
        default_tax_rate: parseFloat(document.getElementById('defaultTaxRate')?.value) || 20,
        receipt_header: document.getElementById('receiptHeader')?.value,
        receipt_footer: document.getElementById('receiptFooter')?.value,
        alert_enabled: document.getElementById('alertEnabled')?.checked ? 1 : 0,
        alert_sound_enabled: document.getElementById('alertSoundEnabled')?.checked ? 1 : 0,
        alert_draft_minutes: parseInt(document.getElementById('alertDraftMinutes')?.value) || 15,
        alert_kitchen_minutes: parseInt(document.getElementById('alertKitchenMinutes')?.value) || 20,
        alert_ready_minutes: parseInt(document.getElementById('alertReadyMinutes')?.value) || 5,
        alert_served_minutes: parseInt(document.getElementById('alertServedMinutes')?.value) || 30,
        alert_remind_after_dismiss: parseInt(document.getElementById('alertRemindAfterDismiss')?.value) || 10,
        // NF525 — chaînage fiscal
        fiscal_chain_enabled: document.getElementById('fiscalChainEnabled')?.checked ? 1 : 0,
        fiscal_day_start_hour: parseInt(document.getElementById('fiscalDayStartHour')?.value) || 6,
        // AGEC — ticket dématérialisé
        agec_enabled: document.getElementById('agecEnabled')?.checked ? 1 : 0,
        // RGPD — durée de conservation
        rgpd_retention_months:      Math.max(parseInt(document.getElementById('rgpdRetentionMonths')?.value)     || 1, 1),
        rgpd_logs_retention_months: Math.max(parseInt(document.getElementById('rgpdLogsRetentionMonths')?.value) || 1, 1),
      };

      // Avertissement RGPD si valeur < 120 mois (test mode)
      const warnEl = document.getElementById('rgpdRetentionWarning');
      if (warnEl) {
        warnEl.classList.toggle('hidden', settings.rgpd_retention_months >= 120);
      }

      await SettingsService.save(settings);

      this.settings = settings;
      localStorage.setItem('cocaisse_settings', JSON.stringify(settings));
      this.toastSuccess('Paramètres enregistrés');

      // Rafraîchir le statut fiscal après sauvegarde
      this.loadFiscalStatus();
    } catch (error) {
      console.error('Error saving settings:', error);
      this.toastError('Erreur: ' + error.message);
    }
  },

  async loadSettingsData() {
    try {
      const settings = await SettingsService.get();

      if (settings) {
        this.settings = settings;

        // Remplir les champs du formulaire
        if (document.getElementById('companyName')) {
          document.getElementById('companyName').value = settings.company_name || '';
          document.getElementById('companyAddress').value = settings.company_address || '';
          document.getElementById('companyPhone').value = settings.company_phone || '';
          document.getElementById('companyEmail').value = settings.company_email || '';
          document.getElementById('taxNumber').value = settings.tax_number || '';
          document.getElementById('defaultTaxRate').value = settings.default_tax_rate || 20;
          document.getElementById('receiptHeader').value = settings.receipt_header || '';
          document.getElementById('receiptFooter').value = settings.receipt_footer || '';

          // Paramètres d'alerte
          document.getElementById('alertEnabled').checked = settings.alert_enabled === 1;
          document.getElementById('alertSoundEnabled').checked = settings.alert_sound_enabled === 1;
          document.getElementById('alertDraftMinutes').value = settings.alert_draft_minutes || 15;
          document.getElementById('alertKitchenMinutes').value = settings.alert_kitchen_minutes || 20;
          document.getElementById('alertReadyMinutes').value = settings.alert_ready_minutes || 5;
          document.getElementById('alertServedMinutes').value = settings.alert_served_minutes || 30;
          document.getElementById('alertRemindAfterDismiss').value = settings.alert_remind_after_dismiss || 10;

          // NF525 — chaînage fiscal
          const fiscalCb = document.getElementById('fiscalChainEnabled');
          if (fiscalCb) fiscalCb.checked = settings.fiscal_chain_enabled === 1;
          const fiscalHourEl = document.getElementById('fiscalDayStartHour');
          if (fiscalHourEl) fiscalHourEl.value = settings.fiscal_day_start_hour ?? 6;

          // AGEC — ticket dématérialisé
          const agecCb = document.getElementById('agecEnabled');
          if (agecCb) agecCb.checked = settings.agec_enabled !== 0; // activé par défaut

          // RGPD — durée de conservation
          const rgpdRet = document.getElementById('rgpdRetentionMonths');
          if (rgpdRet) rgpdRet.value = settings.rgpd_retention_months ?? 120;
          const rgpdLogs = document.getElementById('rgpdLogsRetentionMonths');
          if (rgpdLogs) rgpdLogs.value = settings.rgpd_logs_retention_months ?? 12;
          // Warning si valeur < 120 (mode test)
          const warnEl = document.getElementById('rgpdRetentionWarning');
          if (warnEl) warnEl.classList.toggle('hidden', (settings.rgpd_retention_months ?? 120) >= 120);
        }

        // Charger le statut fiscal (admin only)
        if (this.currentUser?.role === 'admin') {
          this.loadFiscalStatus();
          this.loadRgpdStatus(); // Statut RGPD
        }
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  },

};
