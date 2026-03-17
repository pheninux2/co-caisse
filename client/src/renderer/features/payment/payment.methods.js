import { TransactionService } from '../../services/transaction.service.js';
import { API_URL }            from '../../core/api.js';

export const PaymentMethods = {

  // ===== PAYMENT & RECEIPT =====

  async processPayment() {
    const selectedMethod = document.querySelector('.payment-method.active');
    if (!selectedMethod) {
      this.toastWarning('Veuillez sélectionner un moyen de paiement');
      return;
    }

    if (this.cart.length === 0) {
      this.toastWarning('Le panier est vide');
      return;
    }

    const paymentMethod              = selectedMethod.dataset.method;
    const { totalHt, totalTax, totalTtc, byRate } = this.computeCartTax();
    const discount                   = this.currentDiscount;
    const total                      = totalTtc - discount;
    const change                     = paymentMethod === 'cash'
      ? parseFloat(document.getElementById('amountReceived')?.value || 0) - total
      : 0;

    if (paymentMethod === 'cash' && change < 0) {
      this.toastWarning('Montant insuffisant');
      return;
    }

    const transaction = {
      items: this.cart.map(item => ({
        id:       item.id,
        name:     item.name,
        quantity: item.quantity,
        price:    item.price,
        tax_rate: item.tax_rate ?? this.getDefaultVatRate(),
        total:    item.price * item.quantity,
      })),
      subtotal:        parseFloat(totalHt.toFixed(2)),      // HT
      tax:             parseFloat(totalTax.toFixed(2)),
      discount:        parseFloat(discount.toFixed(2)),
      total:           parseFloat(total.toFixed(2)),        // TTC - remise
      vat_breakdown:   byRate,
      payment_method:  paymentMethod,
      change:          parseFloat(change.toFixed(2)),
    };

    try {
      const result = await TransactionService.create(transaction);

      // Réinitialiser le panier AVANT d'afficher le modal ticket
      this.cart = [];
      this.currentDiscount = 0;
      document.getElementById('amountReceived').value = '';
      this.updateCartDisplay();
      await this.loadDashboard();
      this.toastSuccess('Paiement effectué avec succès !');

      // Loi AGEC (août 2023) : modal de choix du ticket
      this._openTicketChoiceModal(result);
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // TICKET DÉMATÉRIALISÉ — LOI AGEC (août 2023)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Ouvre le modal de choix du ticket selon la config printByDefault.
   * - printByDefault = false (France) : modal obligatoire, pas d'impression auto
   * - printByDefault = true           : impression auto + proposition email
   */
  _openTicketChoiceModal(transaction) {
    this._pendingReceiptTransaction = transaction;

    const printByDefault = this.businessConfig?.receipt?.printByDefault ?? false;
    const agecEnabled    = this.settings?.agec_enabled !== 0; // true par défaut

    // Si AGEC désactivé dans les paramètres → comportement classique (impression directe)
    if (!agecEnabled) {
      this.showReceipt(transaction);
      return;
    }

    if (printByDefault) {
      // Pays avec impression auto : imprimer + proposer l'email via le receipt modal
      this.showReceipt(transaction);
      return;
    }

    // Loi AGEC active : afficher le modal de choix
    const subtitleEl = document.getElementById('ticketChoiceSubtitle');
    if (subtitleEl) subtitleEl.textContent = 'Comment souhaitez-vous recevoir votre ticket ?';

    // Réinitialiser le formulaire email
    const emailForm = document.getElementById('emailInputForm');
    if (emailForm) emailForm.classList.add('hidden');
    const emailInput = document.getElementById('clientEmailInput');
    if (emailInput) emailInput.value = '';
    const consent = document.getElementById('storeEmailConsent');
    if (consent) consent.checked = false;
    const errEl = document.getElementById('emailSendError');
    if (errEl) errEl.classList.add('hidden');
    const btn = document.getElementById('btnConfirmEmail');
    if (btn) { btn.disabled = false; btn.innerHTML = '<span>📤</span> Envoyer le ticket'; }

    // Info imprimante
    const printerHint = document.getElementById('printerStatusHint');
    if (printerHint) {
      printerHint.textContent = window.electron
        ? 'Impression thermique directe'
        : 'Impression via le navigateur';
    }

    this.openModal('ticketChoiceModal');
  },

  /** Affiche le formulaire de saisie email dans le modal AGEC. */
  showEmailInput() {
    const form = document.getElementById('emailInputForm');
    if (form) {
      form.classList.remove('hidden');
      document.getElementById('clientEmailInput')?.focus();
    }
  },

  /** Envoie le ticket par email via POST /api/receipts/email. */
  async sendReceiptByEmail() {
    const email     = document.getElementById('clientEmailInput')?.value?.trim();
    const consent   = document.getElementById('storeEmailConsent')?.checked ?? false;
    const btn       = document.getElementById('btnConfirmEmail');
    const errEl     = document.getElementById('emailSendError');

    if (errEl) errEl.classList.add('hidden');

    // Validation email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (errEl) {
        errEl.textContent = 'Veuillez saisir une adresse email valide.';
        errEl.classList.remove('hidden');
      }
      return;
    }

    const tx = this._pendingReceiptTransaction;
    if (!tx?.id) {
      if (errEl) { errEl.textContent = 'Erreur : transaction introuvable.'; errEl.classList.remove('hidden'); }
      return;
    }

    // UI loading
    if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Envoi en cours…'; }

    try {
      const res  = await this.apiFetch(`${API_URL}/receipts/email`, {
        method:  'POST',
        body:    JSON.stringify({
          transactionId: tx.id,
          email,
          storeEmail: consent,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Erreur lors de l\'envoi');
      }

      this.closeModal('ticketChoiceModal');
      this.toastSuccess(`✅ Ticket envoyé à ${email}`);

      if (consent && data.email_stored) {
        this.toastInfo('📧 Email conservé pour l\'envoi du ticket uniquement (RGPD)');
      }
    } catch (e) {
      if (errEl) {
        errEl.textContent = e.message.includes('SMTP')
          ? 'Serveur email non configuré — contactez l\'administrateur.'
          : `Erreur : ${e.message}`;
        errEl.classList.remove('hidden');
      }
      if (btn) { btn.disabled = false; btn.innerHTML = '<span>📤</span> Envoyer le ticket'; }
    }
  },

  /** Imprime le ticket ET ferme le modal AGEC. */
  printAndCloseTicketModal() {
    const tx = this._pendingReceiptTransaction;
    this.closeModal('ticketChoiceModal');
    if (tx) {
      this.showReceipt(tx);   // affiche le receipt modal standard avec bouton imprimer
      setTimeout(() => this.printReceipt(), 400);
    }
  },

  /** Ferme le modal AGEC sans rien faire (aucun ticket). */
  closeTicketModal() {
    this._pendingReceiptTransaction = null;
    this.closeModal('ticketChoiceModal');
  },

  showReceipt(transaction) {
    const receiptContent = document.getElementById('receiptContent');
    const companyName    = this.settings?.company_name    || 'Co-Caisse';
    const companyAddress = this.settings?.company_address || '';
    const companyPhone   = this.settings?.company_phone   || '';

    const items           = typeof transaction.items === 'string'
      ? JSON.parse(transaction.items) : (transaction.items || []);
    const transactionDate = new Date(transaction.transaction_date || transaction.created_at);

    const paymentMethods = { cash: 'ESPÈCES', card: 'CARTE BANCAIRE', mixed: 'MIXTE' };
    const centerText = (text, width = 36) => {
      const pad = Math.max(0, width - text.length);
      return ' '.repeat(Math.floor(pad / 2)) + text;
    };
    const separator = '════════════════════════════════════';
    const dash      = '────────────────────────────────────';

    // ── En-tête ──────────────────────────────────────────────────────────────
    let receipt = `
${centerText(companyName.toUpperCase())}
${companyAddress ? centerText(companyAddress) : ''}
${companyPhone   ? centerText('Tél: ' + companyPhone) : ''}

${dash}
${centerText('REÇU DE CAISSE')}
${dash}

Date: ${transactionDate.toLocaleDateString('fr-FR')}
Heure: ${transactionDate.toLocaleTimeString('fr-FR')}
N°: ${transaction.receipt_number}

${separator}

`;

    // ── Articles ─────────────────────────────────────────────────────────────
    items.forEach(item => {
      const rate = item.tax_rate ?? 20;
      receipt += `${item.name}\n`;
      receipt += `  ${item.quantity} x ${Number(item.price).toFixed(2)}€  [TVA ${rate}%]`;
      receipt += `  = ${(Number(item.price) * item.quantity).toFixed(2)}€\n`;
    });

    // ── Ventilation TVA ───────────────────────────────────────────────────────
    receipt += `\n${dash}\n`;

    // Calculer la ventilation depuis les items (fiable même à la réimpression)
    const vatMap = {};
    for (const item of items) {
      const rate   = Number(item.tax_rate ?? 20);
      const ttc    = Number(item.price) * item.quantity;
      const ht     = ttc / (1 + rate / 100);
      const tax    = ttc - ht;
      const key    = String(rate);
      if (!vatMap[key]) vatMap[key] = { rate, baseHt: 0, taxAmount: 0 };
      vatMap[key].baseHt    += ht;
      vatMap[key].taxAmount += tax;
    }
    const vatBreakdown = Object.values(vatMap).sort((a, b) => a.rate - b.rate);

    const totalHt  = vatBreakdown.reduce((s, v) => s + v.baseHt,    0);
    const totalTax = vatBreakdown.reduce((s, v) => s + v.taxAmount, 0);

    receipt += `Sous-total HT:        ${totalHt.toFixed(2)}€\n`;

    vatBreakdown.forEach(v => {
      const label = `TVA ${v.rate}% sur ${v.baseHt.toFixed(2)}€:`;
      receipt += `${label.padEnd(22)} ${v.taxAmount.toFixed(2)}€\n`;
    });

    if (transaction.discount > 0) {
      receipt += `Remise:              -${Number(transaction.discount).toFixed(2)}€\n`;
    }

    receipt += `
${separator}
TOTAL TTC:            ${Number(transaction.total).toFixed(2)}€
${separator}

Paiement: ${paymentMethods[transaction.payment_method] || transaction.payment_method}`;

    if (transaction.change > 0) {
      receipt += `\nRendu:                ${Number(transaction.change).toFixed(2)}€`;
    }

    receipt += `

${dash}
${centerText(this.settings?.receipt_footer || 'Merci de votre visite !')}
${dash}
`;

    receiptContent.textContent = receipt;
    this.openModal('receiptModal');
  },

  printReceipt() {
    const content = document.getElementById('receiptContent').textContent;

    if (window.electron) {
      window.electron.printTicket(`<pre style="font-family: monospace; font-size: 10pt;">${content}</pre>`);
    } else {
      const printWindow = window.open('', '', 'height=600,width=400');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Reçu</title>
          <style>
            body { font-family: 'Courier New', monospace; margin: 10px; font-size: 11pt; }
            pre { white-space: pre-wrap; margin: 0; }
          </style>
        </head>
        <body>
          <pre>${content}</pre>
          <script>window.onload = () => { window.print(); window.close(); }</script>
        </body>
        </html>
      `);
      printWindow.document.close();
    }
  },

  async viewReceipt(transactionId) {
    try {
      const transaction = await TransactionService.get(transactionId);
      this.showReceipt(transaction);
    } catch (error) {
      this.toastError('Erreur: ' + error.message);
    }
  },

};
