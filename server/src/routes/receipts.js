/**
 * Co-Caisse — Route Tickets dématérialisés (loi AGEC août 2023)
 * ============================================================
 * POST /api/receipts/email
 *   → Envoie le ticket de caisse par email au client
 *   → Stocke l'email en base (avec consentement RGPD)
 *
 * GET  /api/receipts/:transactionId
 *   → Retourne le statut email d'une transaction
 * ============================================================
 */

import express from 'express';
import { sendReceiptEmail } from '../services/email.service.js';

const router = express.Router();

// ── POST /api/receipts/email ──────────────────────────────────────────────────
// Corps : { transactionId, email, storeEmail? }
// storeEmail = true → stocke l'email en base (consentement RGPD explicite)
router.post('/email', async (req, res) => {
  const { transactionId, email, storeEmail = false } = req.body;

  // Validation
  if (!transactionId || !email) {
    return res.status(400).json({ error: 'transactionId et email sont requis' });
  }

  // Validation format email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Format email invalide' });
  }

  try {
    const db = req.app.locals.db;

    // Récupérer la transaction
    const transaction = await db.get(
      `SELECT t.*, u.username AS cashier_name
       FROM \`transactions\` t
       LEFT JOIN \`users\` u ON t.user_id = u.id
       WHERE t.id = ?`,
      [transactionId]
    );

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction introuvable' });
    }

    // Récupérer les paramètres de l'établissement
    const settings = await db.get('SELECT * FROM `settings` LIMIT 1') || {};

    // Vérifier que SMTP est configuré
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      return res.status(503).json({
        error: 'Configuration SMTP absente — renseignez SMTP_HOST, SMTP_USER, SMTP_PASS dans .env',
      });
    }

    // Envoyer le ticket par email
    await sendReceiptEmail({ to: email, transaction, settings });

    // Mettre à jour la transaction en base
    const updateFields = ['receipt_email_sent_at = CURRENT_TIMESTAMP'];
    const updateParams = [];

    // Stocker l'email uniquement si consentement explicite
    if (storeEmail) {
      updateFields.push('customer_email = ?');
      updateParams.push(email);
    }

    updateParams.push(transactionId);
    await db.run(
      `UPDATE \`transactions\` SET ${updateFields.join(', ')} WHERE id = ?`,
      updateParams
    );

    console.log(`[receipts] Ticket TX ${transactionId} envoyé à ${email} (storeEmail=${storeEmail})`);

    res.json({
      success:     true,
      message:     `Ticket envoyé à ${email}`,
      email_stored: storeEmail,
      rgpd_notice: storeEmail
        ? 'Email conservé pour l\'envoi du ticket uniquement (RGPD)'
        : 'Email non stocké en base (aucune donnée personnelle conservée)',
    });

  } catch (error) {
    console.error('[receipts/email] erreur:', error.message);

    // Distinguer erreur SMTP vs erreur serveur
    if (error.message?.includes('SMTP') || error.message?.includes('connect') || error.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Impossible de joindre le serveur email — vérifiez la configuration SMTP',
        detail: error.message,
      });
    }

    res.status(500).json({ error: error.message });
  }
});

// ── GET /api/receipts/:transactionId — Statut email d'une transaction ─────────
router.get('/:transactionId', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const row = await db.get(
      'SELECT id, receipt_number, customer_email, receipt_email_sent_at FROM `transactions` WHERE id = ?',
      [req.params.transactionId]
    );
    if (!row) return res.status(404).json({ error: 'Transaction introuvable' });

    res.json({
      transaction_id:        row.id,
      receipt_number:        row.receipt_number,
      email_sent:            !!row.receipt_email_sent_at,
      email_sent_at:         row.receipt_email_sent_at,
      customer_email_stored: !!row.customer_email,
      // Ne pas renvoyer l'email complet (RGPD)
      customer_email_hint:   row.customer_email
        ? row.customer_email.replace(/(.{2}).*(@.*)/, '$1***$2')
        : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

