import { api, API_URL } from '../../core/api.js';

export const WizardMethods = {

  // ===== SETUP WIZARD =====

  /** Affiche l'écran wizard et cache tout le reste. */
  _showSetupWizard() {
    document.getElementById('setupWizard')?.classList.remove('hidden');
    document.getElementById('licenceScreen')?.classList.add('hidden');
    document.getElementById('loginScreen')?.classList.add('hidden');
    document.getElementById('app')?.classList.add('hidden');
    this._wizardGoTo(1);
  },

  /** Navigue vers une étape du wizard. */
  _wizardGoTo(step) {
    this._wizardData.step = step;

    // Mettre à jour progression
    const label = document.getElementById('wizardStepLabel');
    if (label) label.textContent = `Étape ${step} / 4`;

    for (let i = 1; i <= 4; i++) {
      const dot = document.getElementById(`wizardDot${i}`);
      if (dot) dot.className = `h-2 flex-1 rounded-full transition-all ${i <= step ? 'bg-white' : 'bg-white/30'}`;
    }

    // Afficher/cacher les étapes
    for (let i = 1; i <= 4; i++) {
      document.getElementById(`wizardStep${i}`)?.classList.toggle('hidden', i !== step);
    }

    // Boutons navigation
    const btnPrev   = document.getElementById('wizardBtnPrev');
    const btnNext   = document.getElementById('wizardBtnNext');
    const btnFinish = document.getElementById('wizardBtnFinish');

    if (btnPrev)   btnPrev.classList.toggle('hidden', step === 1);
    if (btnNext)   btnNext.style.display   = step < 4 ? '' : 'none';
    if (btnFinish) btnFinish.style.display = step === 4 ? '' : 'none';

    // Cacher les erreurs
    const errEl = document.getElementById('wizardError');
    if (errEl) errEl.classList.add('hidden');

    // Étape 3 : adapter label SIRET/ICE selon pays
    if (step === 3) {
      const lbl = document.getElementById('wizardTaxNumberLabel');
      if (lbl) {
        if      (this._wizardData.country === 'MA')  lbl.textContent = 'ICE (15 chiffres)';
        else if (this._wizardData.country === 'FR')  lbl.textContent = 'SIRET (14 chiffres)';
        else                                         lbl.textContent = 'N° Identification';
      }
    }
  },

  /** Sélectionne un pays (étape 1). */
  _wizardSelectCountry(code) {
    this._wizardData.country = code;
    // Mettre à jour visuellement les boutons
    document.querySelectorAll('.wizard-country-btn').forEach(btn => {
      btn.classList.remove('border-indigo-500', 'bg-indigo-50');
      btn.classList.add('border-gray-200');
    });
    const btn = document.getElementById(`wizardCountry_${code}`);
    if (btn) { btn.classList.add('border-indigo-500', 'bg-indigo-50'); btn.classList.remove('border-gray-200'); }
  },

  /** Sélectionne un type d'établissement (étape 2). */
  _wizardSelectType(type) {
    this._wizardData.businessType = type;
    document.querySelectorAll('.wizard-type-btn').forEach(btn => {
      btn.classList.remove('border-indigo-500', 'bg-indigo-50');
      btn.classList.add('border-gray-200');
    });
    const btn = document.getElementById(`wizardType_${type}`);
    if (btn) { btn.classList.add('border-indigo-500', 'bg-indigo-50'); btn.classList.remove('border-gray-200'); }
  },

  /** Bouton Suivant → valide l'étape courante et avance. */
  _wizardNext() {
    const step  = this._wizardData.step;
    const errEl = document.getElementById('wizardError');
    if (errEl) errEl.classList.add('hidden');

    if (step === 1) {
      if (!this._wizardData.country) {
        if (errEl) { errEl.textContent = 'Veuillez sélectionner un pays.'; errEl.classList.remove('hidden'); }
        return;
      }
      this._wizardGoTo(2);
    } else if (step === 2) {
      if (!this._wizardData.businessType) {
        if (errEl) { errEl.textContent = 'Veuillez sélectionner un type d\'établissement.'; errEl.classList.remove('hidden'); }
        return;
      }
      this._wizardGoTo(3);
    } else if (step === 3) {
      const name    = document.getElementById('wizardCompanyName')?.value?.trim();
      const address = document.getElementById('wizardCompanyAddress')?.value?.trim();
      if (!name || !address) {
        if (errEl) { errEl.textContent = 'Le nom et l\'adresse sont obligatoires.'; errEl.classList.remove('hidden'); }
        return;
      }
      // Valider SIRET/ICE si renseigné
      const taxNum = document.getElementById('wizardTaxNumber')?.value?.replace(/\s/g, '') || '';
      if (taxNum) {
        if (this._wizardData.country === 'FR' && !/^\d{14}$/.test(taxNum)) {
          if (errEl) { errEl.textContent = 'SIRET invalide — 14 chiffres requis.'; errEl.classList.remove('hidden'); }
          return;
        }
        if (this._wizardData.country === 'MA' && !/^\d{15}$/.test(taxNum)) {
          if (errEl) { errEl.textContent = 'ICE invalide — 15 chiffres requis.'; errEl.classList.remove('hidden'); }
          return;
        }
      }
      this._wizardGoTo(4);
    }
  },

  /** Bouton Précédent. */
  _wizardPrev() {
    if (this._wizardData.step > 1) this._wizardGoTo(this._wizardData.step - 1);
  },

  /** Validation temps réel SIRET/ICE. */
  _wizardValidateTaxNumber() {
    const val    = document.getElementById('wizardTaxNumber')?.value?.replace(/\s/g, '') || '';
    const errEl  = document.getElementById('wizardTaxNumberError');
    if (!errEl || !val) { errEl?.classList.add('hidden'); return; }
    let ok = true;
    if (this._wizardData.country === 'FR' && val.length > 0) {
      ok = /^\d{0,14}$/.test(val);
      if (!ok || (val.length === 14 && !/^\d{14}$/.test(val))) {
        errEl.textContent = 'SIRET : 14 chiffres'; errEl.classList.remove('hidden');
      } else { errEl.classList.add('hidden'); }
    } else if (this._wizardData.country === 'MA' && val.length > 0) {
      if (val.length === 15 && /^\d{15}$/.test(val)) { errEl.classList.add('hidden'); }
      else { errEl.textContent = 'ICE : 15 chiffres'; errEl.classList.remove('hidden'); }
    } else { errEl.classList.add('hidden'); }
  },

  /** Validation temps réel mot de passe. */
  _wizardValidatePassword() {
    const pw      = document.getElementById('wizardAdminPassword')?.value || '';
    const confirm = document.getElementById('wizardAdminPasswordConfirm')?.value || '';
    const strengthDiv = document.getElementById('wizardPasswordStrength');
    const hintEl      = document.getElementById('wizardPasswordHint');
    const matchErr    = document.getElementById('wizardPasswordMatchError');

    if (!pw) { strengthDiv?.classList.add('hidden'); return; }
    strengthDiv?.classList.remove('hidden');

    // Score : longueur, majuscule, chiffre, spécial
    let score = 0;
    if (pw.length >= 8)         score++;
    if (/[A-Z]/.test(pw))       score++;
    if (/\d/.test(pw))          score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const colors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-500'];
    const labels = ['Très faible', 'Faible', 'Correct', 'Fort'];
    for (let i = 1; i <= 4; i++) {
      const bar = document.getElementById(`wizardPwBar${i}`);
      if (bar) bar.className = `h-1.5 flex-1 rounded-full transition-all ${i <= score ? colors[score - 1] : 'bg-gray-200'}`;
    }
    if (hintEl) hintEl.textContent = labels[score - 1] || '';

    // Vérif correspondance
    if (confirm) {
      if (matchErr) matchErr.classList.toggle('hidden', pw === confirm);
    }
  },

  /** Soumet le wizard — POST /api/setup/complete. */
  async _wizardFinish() {
    const errEl  = document.getElementById('wizardError');
    const btn    = document.getElementById('wizardBtnFinish');
    if (errEl) errEl.classList.add('hidden');

    // Validation étape 4
    const username = document.getElementById('wizardAdminUsername')?.value?.trim();
    const email    = document.getElementById('wizardAdminEmail')?.value?.trim();
    const password = document.getElementById('wizardAdminPassword')?.value;
    const confirm  = document.getElementById('wizardAdminPasswordConfirm')?.value;

    if (!username) {
      if (errEl) { errEl.textContent = 'Le nom d\'utilisateur est obligatoire.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (!password || !/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      if (errEl) { errEl.textContent = 'Mot de passe trop faible — 8 caractères min, 1 majuscule, 1 chiffre.'; errEl.classList.remove('hidden'); }
      return;
    }
    if (password !== confirm) {
      if (errEl) { errEl.textContent = 'Les mots de passe ne correspondent pas.'; errEl.classList.remove('hidden'); }
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Configuration en cours…'; }

    try {
      const body = {
        country:           this._wizardData.country === 'OTHER' ? 'FR' : this._wizardData.country,
        business_type:     this._wizardData.businessType,
        company_name:      document.getElementById('wizardCompanyName')?.value?.trim(),
        company_address:   document.getElementById('wizardCompanyAddress')?.value?.trim(),
        tax_number:        document.getElementById('wizardTaxNumber')?.value?.replace(/\s/g, '') || '',
        vat_number:        document.getElementById('wizardVatNumber')?.value?.trim() || '',
        company_phone:     document.getElementById('wizardCompanyPhone')?.value?.trim() || '',
        company_email:     document.getElementById('wizardCompanyEmail')?.value?.trim() || '',
        admin_username:    username,
        admin_email:       email,
        admin_password:    password,
      };

      const res  = await fetch(`${API_URL}/setup/complete`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Erreur lors de la configuration');

      // Stocker le JWT auto-login
      if (data.token) {
        api.setToken(data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));
        this.currentUser = data.user;
      }

      // Cacher le wizard et reprendre l'init normale
      document.getElementById('setupWizard')?.classList.add('hidden');
      console.log('✅ [WIZARD] Setup complété — lancement de l\'app');

      // Reprendre l'initialisation depuis l'étape licence
      await this.init();

    } catch (e) {
      if (errEl) { errEl.textContent = '❌ ' + e.message; errEl.classList.remove('hidden'); }
      if (btn)   { btn.disabled = false; btn.innerHTML = '✅ Terminer &amp; Lancer Co-Caisse'; }
    }
  },

};
