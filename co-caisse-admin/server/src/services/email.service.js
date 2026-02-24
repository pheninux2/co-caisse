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

