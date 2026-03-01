/**
 * Co-Caisse — Service Email (nodemailer)
 * Version : 1.0.0
 *
 * Utilise les variables SMTP du .env :
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 *
 * Fonctions exportées :
 *   sendLicenceEmail({ to, clientName, licenceKey, modules, type, expiresAt })
 *   testSmtpConnection()
 */

import nodemailer from 'nodemailer';
import dotenv     from 'dotenv';

dotenv.config();

// ── Constantes ────────────────────────────────────────────────────────────────
const MODULE_LABELS = {
  caisse:       { icon: '🛒', label: 'Caisse',       desc: 'Encaissement, panier, tickets de caisse' },
  cuisine:      { icon: '🍳', label: 'Cuisine',       desc: 'Affichage commandes en cuisine' },
  commandes:    { icon: '📋', label: 'Commandes',     desc: 'Gestion commandes en salle' },
  historique:   { icon: '📜', label: 'Historique',    desc: 'Historique des transactions' },
  statistiques: { icon: '📊', label: 'Statistiques',  desc: 'Rapports et analytics' },
  gestion:      { icon: '📦', label: 'Gestion',       desc: 'Produits, catégories, utilisateurs' },
};

const TYPE_LABELS = {
  trial:        'Essai gratuit 7 jours',
  perpetual:    'Licence perpétuelle',
  subscription: 'Abonnement',
};

// ── Créer le transporter nodemailer ──────────────────────────────────────────
function _createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error(
      'Configuration SMTP incomplète — vérifiez SMTP_HOST, SMTP_USER, SMTP_PASS dans .env'
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,      // true pour SSL (465), false pour STARTTLS (587)
    auth:   { user, pass },
    tls:    { rejectUnauthorized: false }, // utile pour certains serveurs internes
  });
}

// ── Template HTML email de licence ───────────────────────────────────────────
function _buildLicenceEmailHtml({ clientName, licenceKey, modules = [], type, expiresAt }) {
  const typeLabel  = TYPE_LABELS[type] || type;
  const fromEmail  = process.env.SMTP_FROM || 'noreply@co-caisse.fr';
  const year       = new Date().getFullYear();

  const expiryLine = expiresAt
    ? `<p style="margin:4px 0;color:#64748b;font-size:14px;">
        ⏳ <strong>Expiration :</strong>
        ${new Date(expiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
       </p>`
    : `<p style="margin:4px 0;color:#64748b;font-size:14px;">♾️ <strong>Durée :</strong> Perpétuelle — aucune expiration</p>`;

  const modulesRows = modules.map(m => {
    const mod = MODULE_LABELS[m] || { icon: '•', label: m, desc: '' };
    return `
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;">
          <span style="font-size:18px;margin-right:10px;">${mod.icon}</span>
          <strong style="color:#1e293b;">${mod.label}</strong>
        </td>
        <td style="padding:10px 16px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;">
          ${mod.desc}
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Votre licence Co-Caisse</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:40px 40px 32px;text-align:center;">
            <p style="margin:0 0 8px;font-size:36px;">🔑</p>
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Co-Caisse</h1>
            <p style="margin:6px 0 0;color:#c7d2fe;font-size:15px;">Votre logiciel de caisse intelligent</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff;padding:40px;">

            <!-- Salutation -->
            <p style="margin:0 0 24px;font-size:16px;color:#1e293b;">
              Bonjour <strong>${_esc(clientName)}</strong>,
            </p>
            <p style="margin:0 0 32px;font-size:15px;color:#475569;line-height:1.7;">
              Merci pour votre confiance. Voici votre clé de licence <strong>Co-Caisse</strong>.
              Conservez-la précieusement — elle est personnelle et non transférable.
            </p>

            <!-- Type badge -->
            <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:.08em;">
              ${typeLabel}
            </p>
            ${expiryLine}

            <!-- Clé de licence -->
            <div style="margin:32px 0;background:#f8f7ff;border:2px solid #e0e7ff;border-radius:12px;padding:28px;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;font-weight:600;color:#6366f1;text-transform:uppercase;letter-spacing:.1em;">
                Votre clé de licence
              </p>
              <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:26px;font-weight:700;color:#4f46e5;letter-spacing:.2em;word-break:break-all;">
                ${_esc(licenceKey)}
              </p>
            </div>

            <!-- Modules activés -->
            <h3 style="margin:32px 0 16px;font-size:16px;color:#1e293b;border-bottom:2px solid #f1f5f9;padding-bottom:10px;">
              📦 Modules activés sur votre licence
            </h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f1f5f9;border-radius:10px;overflow:hidden;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Module</th>
                  <th style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.05em;">Description</th>
                </tr>
              </thead>
              <tbody>${modulesRows}</tbody>
            </table>

            <!-- Instructions -->
            <div style="margin:32px 0 0;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;">
              <h4 style="margin:0 0 12px;font-size:15px;color:#166534;">✅ Comment activer votre licence</h4>
              <ol style="margin:0;padding-left:20px;color:#15803d;font-size:14px;line-height:2;">
                <li>Lancez l'application <strong>Co-Caisse</strong></li>
                <li>Sur l'écran d'accueil, cliquez sur <strong>« Entrer une clé de licence »</strong></li>
                <li>Copiez et collez la clé ci-dessus</li>
                <li>Cliquez sur <strong>« Activer »</strong></li>
              </ol>
            </div>

          </td>
        </tr>

        <!-- Support -->
        <tr>
          <td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;">
              Un problème ? Contactez-nous à
              <a href="mailto:support@co-caisse.fr" style="color:#6366f1;text-decoration:none;">support@co-caisse.fr</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#1e1b4b;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 4px;color:#a5b4fc;font-size:14px;font-weight:600;">Co-Caisse</p>
            <p style="margin:0;color:#6366f1;font-size:12px;">© ${year} — Tous droits réservés</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>

</body>
</html>`;
}

// ── Template texte brut (fallback) ────────────────────────────────────────────
function _buildLicenceEmailText({ clientName, licenceKey, modules = [], type, expiresAt }) {
  const typeLabel = TYPE_LABELS[type] || type;
  const modLines  = modules.map(m => `  • ${MODULE_LABELS[m]?.label || m}`).join('\n');
  const expiry    = expiresAt
    ? `Expiration : ${new Date(expiresAt).toLocaleDateString('fr-FR')}`
    : 'Durée : Perpétuelle';

  return `Bonjour ${clientName},

Voici votre licence Co-Caisse.

─────────────────────────────────
  TYPE    : ${typeLabel}
  ${expiry}
─────────────────────────────────
  CLÉ DE LICENCE :

  ${licenceKey}

─────────────────────────────────
  MODULES ACTIVÉS :
${modLines}

─────────────────────────────────
  ACTIVATION :
  1. Lancez Co-Caisse
  2. Cliquez sur "Entrer une clé de licence"
  3. Collez la clé ci-dessus
  4. Cliquez sur "Activer"

Support : support@co-caisse.fr

Merci de votre confiance.
Co-Caisse`;
}

// ── Escape HTML ───────────────────────────────────────────────────────────────
function _esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ══════════════════════════════════════════════════════════════
// EXPORT : sendLicenceEmail
// ══════════════════════════════════════════════════════════════
/**
 * Envoie l'email de licence au client.
 *
 * @param {object} opts
 * @param {string} opts.to          Email destinataire
 * @param {string} opts.clientName  Nom du client
 * @param {string} opts.licenceKey  Clé au format CCZ-XXXX-XXXX-XXXX
 * @param {string[]} opts.modules   Modules activés
 * @param {string} opts.type        'trial' | 'perpetual' | 'subscription'
 * @param {string|null} opts.expiresAt  Date d'expiration (ISO string) ou null
 */
export async function sendLicenceEmail({ to, clientName, licenceKey, modules = [], type, expiresAt }) {
  const transporter = _createTransporter();
  const from        = process.env.SMTP_FROM || '"Co-Caisse" <noreply@co-caisse.fr>';
  const typeLabel   = TYPE_LABELS[type] || type;

  const payload = { clientName, licenceKey, modules, type, expiresAt };

  const info = await transporter.sendMail({
    from,
    to,
    subject: `🔑 Votre licence Co-Caisse — ${typeLabel}`,
    text:    _buildLicenceEmailText(payload),
    html:    _buildLicenceEmailHtml(payload),
  });

  console.log(`[email] Licence envoyée à ${to} — messageId: ${info.messageId}`);
  return info;
}

// ══════════════════════════════════════════════════════════════
// EXPORT : testSmtpConnection
// ══════════════════════════════════════════════════════════════
/**
 * Teste la connexion SMTP sans envoyer d'email.
 * Retourne { ok: true } ou lance une erreur.
 */
export async function testSmtpConnection() {
  const transporter = _createTransporter();
  await transporter.verify();
  console.log('[email] Connexion SMTP vérifiée OK');
  return { ok: true };
}


// ══════════════════════════════════════════════════════════════
// EXPORT : sendReceiptEmail  (loi AGEC — ticket dématérialisé)
// ══════════════════════════════════════════════════════════════
/**
 * Envoie le ticket de caisse par email au client (loi AGEC août 2023).
 *
 * @param {object} opts
 * @param {string}  opts.to            Email du client
 * @param {object}  opts.transaction   Objet transaction complet (depuis DB)
 * @param {object}  opts.settings      Paramètres établissement (company_name, etc.)
 */
export async function sendReceiptEmail({ to, transaction, settings = {} }) {
  const transporter = _createTransporter();
  const from        = process.env.SMTP_FROM || '"Co-Caisse" <noreply@co-caisse.fr>';
  const companyName = settings.company_name || 'Co-Caisse';
  const dateStr     = new Date(transaction.transaction_date || transaction.created_at)
    .toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const html = _buildReceiptHtml({ transaction, settings });
  const text = _buildReceiptText({ transaction, settings });

  const info = await transporter.sendMail({
    from,
    to,
    subject: `🧾 Votre ticket de caisse — ${companyName} — ${dateStr}`,
    text,
    html,
  });

  console.log(`[email] Ticket envoyé à ${to} — TX: ${transaction.id} — messageId: ${info.messageId}`);
  return info;
}

// ── Template HTML du ticket de caisse ────────────────────────────────────────
function _buildReceiptHtml({ transaction, settings }) {
  const esc           = _esc;
  const companyName   = settings.company_name    || 'Co-Caisse';
  const companyAddr   = settings.company_address || '';
  const companyPhone  = settings.company_phone   || '';
  const companyEmail  = settings.company_email   || '';
  const taxNumber     = settings.tax_number      || '';
  const receiptFooter = settings.receipt_footer  || 'Merci de votre visite !';
  const year          = new Date().getFullYear();

  const items = (() => {
    try { return typeof transaction.items === 'string' ? JSON.parse(transaction.items) : (transaction.items || []); }
    catch (_) { return []; }
  })();

  const txDate = new Date(transaction.transaction_date || transaction.created_at);
  const dateLabel = txDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const timeLabel = txDate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const payLabels = { cash: 'Espèces', card: 'Carte bancaire', mixed: 'Mixte' };
  const payLabel  = payLabels[transaction.payment_method] || transaction.payment_method;

  // Calcul ventilation TVA depuis les items
  const vatMap = {};
  for (const item of items) {
    const rate  = Number(item.tax_rate ?? 20);
    const ttc   = Number(item.price) * item.quantity;
    const ht    = ttc / (1 + rate / 100);
    const tax   = ttc - ht;
    const key   = String(rate);
    if (!vatMap[key]) vatMap[key] = { rate, baseHt: 0, taxAmount: 0 };
    vatMap[key].baseHt    += ht;
    vatMap[key].taxAmount += tax;
  }
  const vatBreakdown = Object.values(vatMap).sort((a, b) => a.rate - b.rate);
  const totalHt      = vatBreakdown.reduce((s, v) => s + v.baseHt, 0);
  const totalTax     = vatBreakdown.reduce((s, v) => s + v.taxAmount, 0);

  const itemsRows = items.map(item => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;">${esc(item.name)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#64748b;text-align:center;">${item.quantity}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#94a3b8;text-align:center;">TVA ${item.tax_rate ?? 20}%</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;text-align:right;font-weight:600;">${(Number(item.price) * item.quantity).toFixed(2)} €</td>
    </tr>`).join('');

  const vatRows = vatBreakdown.map(v => `
    <tr>
      <td style="padding:5px 12px;font-size:13px;color:#64748b;">TVA ${v.rate}% (base HT : ${v.baseHt.toFixed(2)} €)</td>
      <td style="padding:5px 12px;font-size:13px;color:#64748b;text-align:right;">${v.taxAmount.toFixed(2)} €</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Ticket de caisse — ${esc(companyName)}</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:30px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

        <!-- Header établissement -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:16px 16px 0 0;padding:32px 32px 24px;text-align:center;">
            <p style="margin:0 0 6px;font-size:28px;">🧾</p>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${esc(companyName.toUpperCase())}</h1>
            ${companyAddr  ? `<p style="margin:4px 0 0;color:#c7d2fe;font-size:13px;">${esc(companyAddr)}</p>` : ''}
            ${companyPhone ? `<p style="margin:2px 0 0;color:#c7d2fe;font-size:13px;">Tél : ${esc(companyPhone)}</p>` : ''}
            ${taxNumber    ? `<p style="margin:2px 0 0;color:#a5b4fc;font-size:12px;">N° TVA : ${esc(taxNumber)}</p>` : ''}
          </td>
        </tr>

        <!-- Infos transaction -->
        <tr>
          <td style="background:#fff;padding:20px 32px 0;">
            <table width="100%">
              <tr>
                <td style="font-size:13px;color:#64748b;">📅 ${dateLabel} à ${timeLabel}</td>
                <td style="font-size:13px;color:#64748b;text-align:right;font-family:monospace;">N° ${esc(transaction.receipt_number || '')}</td>
              </tr>
            </table>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0 0;">
          </td>
        </tr>

        <!-- Articles -->
        <tr>
          <td style="background:#fff;padding:0 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:8px 12px;font-size:12px;color:#94a3b8;text-align:left;font-weight:600;text-transform:uppercase;">Article</th>
                  <th style="padding:8px 12px;font-size:12px;color:#94a3b8;text-align:center;font-weight:600;text-transform:uppercase;">Qté</th>
                  <th style="padding:8px 12px;font-size:12px;color:#94a3b8;text-align:center;font-weight:600;text-transform:uppercase;">TVA</th>
                  <th style="padding:8px 12px;font-size:12px;color:#94a3b8;text-align:right;font-weight:600;text-transform:uppercase;">Montant</th>
                </tr>
              </thead>
              <tbody>${itemsRows}</tbody>
            </table>
          </td>
        </tr>

        <!-- Totaux -->
        <tr>
          <td style="background:#fff;padding:0 32px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-top:1px solid #e2e8f0;">
              <tr><td style="padding:6px 12px;font-size:13px;color:#64748b;">Sous-total HT</td>
                  <td style="padding:6px 12px;font-size:13px;color:#64748b;text-align:right;">${totalHt.toFixed(2)} €</td></tr>
              ${vatRows}
              ${Number(transaction.discount) > 0 ? `
              <tr><td style="padding:6px 12px;font-size:13px;color:#16a34a;">Remise</td>
                  <td style="padding:6px 12px;font-size:13px;color:#16a34a;text-align:right;">-${Number(transaction.discount).toFixed(2)} €</td></tr>` : ''}
              <tr style="background:#f8fafc;">
                <td style="padding:12px;font-size:16px;font-weight:700;color:#1e293b;">TOTAL TTC</td>
                <td style="padding:12px;font-size:18px;font-weight:700;color:#4f46e5;text-align:right;">${Number(transaction.total).toFixed(2)} €</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Paiement -->
        <tr>
          <td style="background:#f0fdf4;padding:16px 32px;border-top:1px solid #bbf7d0;">
            <p style="margin:0;font-size:14px;color:#166534;">
              💳 Paiement : <strong>${esc(payLabel)}</strong>
              ${Number(transaction.change) > 0 ? ` &nbsp;|&nbsp; Rendu : <strong>${Number(transaction.change).toFixed(2)} €</strong>` : ''}
            </p>
          </td>
        </tr>

        <!-- Pied de page -->
        <tr>
          <td style="background:#fff;padding:20px 32px;text-align:center;border-top:1px solid #e2e8f0;">
            <p style="margin:0;font-size:13px;color:#64748b;">${esc(receiptFooter)}</p>
            <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;font-style:italic;">
              Ticket envoyé à la demande du client — loi AGEC (août 2023)
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#1e1b4b;border-radius:0 0 16px 16px;padding:18px 32px;text-align:center;">
            <p style="margin:0;color:#a5b4fc;font-size:12px;">Co-Caisse © ${year} — Document fiscal</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Template texte brut du ticket ────────────────────────────────────────────
function _buildReceiptText({ transaction, settings }) {
  const companyName  = settings.company_name    || 'Co-Caisse';
  const companyAddr  = settings.company_address || '';
  const receiptFooter = settings.receipt_footer || 'Merci de votre visite !';

  const items = (() => {
    try { return typeof transaction.items === 'string' ? JSON.parse(transaction.items) : (transaction.items || []); }
    catch (_) { return []; }
  })();

  const txDate   = new Date(transaction.transaction_date || transaction.created_at);
  const payLabels = { cash: 'Espèces', card: 'Carte bancaire', mixed: 'Mixte' };
  const sep = '========================================';
  const dash = '----------------------------------------';

  let txt = `${sep}\n  ${companyName.toUpperCase()}\n`;
  if (companyAddr) txt += `  ${companyAddr}\n`;
  txt += `${sep}\n`;
  txt += `Date  : ${txDate.toLocaleDateString('fr-FR')} ${txDate.toLocaleTimeString('fr-FR')}\n`;
  txt += `N°    : ${transaction.receipt_number || ''}\n`;
  txt += `${dash}\n`;
  items.forEach(it => {
    txt += `${it.name}\n  ${it.quantity} x ${Number(it.price).toFixed(2)}€ [TVA ${it.tax_rate ?? 20}%] = ${(Number(it.price)*it.quantity).toFixed(2)}€\n`;
  });
  txt += `${dash}\n`;
  txt += `TOTAL TTC : ${Number(transaction.total).toFixed(2)} €\n`;
  txt += `Paiement  : ${payLabels[transaction.payment_method] || transaction.payment_method}\n`;
  txt += `${sep}\n${receiptFooter}\nTicket envoyé à la demande du client (loi AGEC)\n`;
  return txt;
}


