/**
 * Co-Caisse — Route RGPD
 * =============================================
 * GET  /api/rgpd/status         → statut + dernier log de purge
 * GET  /api/rgpd/logs           → historique des purges
 * POST /api/rgpd/purge          → déclencher une purge manuelle (admin)
 * GET  /api/rgpd/preview        → aperçu : nb transactions concernées
 */

import express from 'express';
import { roleCheck } from '../middleware/auth.js';
import { runPurgeNow } from '../jobs/purgeJob.js';

const router = express.Router();

// Toutes les routes RGPD sont réservées aux admins
router.use(roleCheck(['admin']));

// ── GET /api/rgpd/status ──────────────────────────────────────────────────────
// Retourne le statut RGPD : config + dernier log
router.get('/status', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const settings = await db.get(
      'SELECT rgpd_retention_months, rgpd_logs_retention_months FROM `settings` LIMIT 1'
    );
    const lastLog  = await db.get(
      'SELECT * FROM `rgpd_purge_logs` ORDER BY run_at DESC LIMIT 1'
    );

    const retentionMonths = settings?.rgpd_retention_months     ?? 120;
    const logsMonths      = settings?.rgpd_logs_retention_months ?? 12;
    const cutoffDate      = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);

    res.json({
      retention_months:       retentionMonths,
      logs_retention_months:  logsMonths,
      cutoff_date:            cutoffDate.toISOString(),
      legal_minimum_months:   120,
      last_purge:             lastLog || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rgpd/preview ────────────────────────────────────────────────────
// Aperçu du nombre d'enregistrements qui seraient anonymisés
// Query param optionnel : ?cutoff_date=2026-03-01 (mode test)
router.get('/preview', async (req, res) => {
  try {
    const db       = req.app.locals.db;
    const settings = await db.get('SELECT rgpd_retention_months FROM `settings` LIMIT 1');
    const months   = settings?.rgpd_retention_months ?? 120;

    // Date pivot : forcée (test) ou calculée automatiquement
    let cutoff;
    if (req.query.cutoff_date) {
      cutoff = new Date(req.query.cutoff_date);
      if (isNaN(cutoff.getTime())) {
        return res.status(400).json({ error: 'cutoff_date invalide — format attendu : YYYY-MM-DD' });
      }
      // Mettre à la fin de la journée pour inclure toute la journée sélectionnée
      cutoff.setHours(23, 59, 59, 999);
    } else {
      cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
    }
    const cutoffStr = cutoff.toISOString().replace('T', ' ').substring(0, 19);

    // Toutes les transactions dans la fenêtre (pour info)
    const txTotal = await db.get(
      `SELECT COUNT(*) AS cnt FROM \`transactions\` WHERE created_at < ?`,
      [cutoffStr]
    );

    // Transactions avec customer_email renseigné (donnée personnelle)
    const txRow = await db.get(
      `SELECT COUNT(*) AS cnt FROM \`transactions\`
       WHERE created_at < ?
         AND customer_email IS NOT NULL`,
      [cutoffStr]
    );

    // Orders avec données nominatives (customer_name / customer_phone)
    let ordersCount    = 0;
    let ordersTotalCnt = 0;
    try {
      const ordersRow = await db.get(
        `SELECT COUNT(*) AS cnt FROM \`orders\`
         WHERE created_at < ?
           AND (customer_name IS NOT NULL OR customer_phone IS NOT NULL)`,
        [cutoffStr]
      );
      ordersCount = ordersRow?.cnt ?? 0;

      const ordersTotalRow = await db.get(
        `SELECT COUNT(*) AS cnt FROM \`orders\` WHERE created_at < ?`,
        [cutoffStr]
      );
      ordersTotalCnt = ordersTotalRow?.cnt ?? 0;
    } catch (_) { /* orders peut ne pas avoir ces colonnes */ }

    res.json({
      transactions_to_anonymize: (txRow?.cnt ?? 0) + ordersCount,
      transactions_emails:       txRow?.cnt ?? 0,
      orders_names:              ordersCount,
      transactions_total:        txTotal?.cnt ?? 0,
      orders_total:              ordersTotalCnt,
      cutoff_date:               cutoff.toISOString(),
      retention_months:          months,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/rgpd/logs ───────────────────────────────────────────────────────
// Historique des purges (50 dernières)
router.get('/logs', async (req, res) => {
  try {
    const db   = req.app.locals.db;
    const logs = await db.all(
      'SELECT * FROM `rgpd_purge_logs` ORDER BY run_at DESC LIMIT 50'
    );
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rgpd/purge ─────────────────────────────────────────────────────
// Déclencher une purge manuelle
// Body optionnel : { cutoff_date: "2026-03-01" } pour forcer la date pivot (tests)
router.post('/purge', async (req, res) => {
  try {
    const db          = req.app.locals.db;
    const userId      = req.user?.id || null;
    const forcedCutoff = req.body?.cutoff_date ? new Date(req.body.cutoff_date) : null;

    if (forcedCutoff && isNaN(forcedCutoff.getTime())) {
      return res.status(400).json({ error: 'cutoff_date invalide — format attendu : YYYY-MM-DD' });
    }

    console.log(`[RGPD] Purge manuelle déclenchée par l'admin ${userId}${forcedCutoff ? ` — cutoff forcé : ${forcedCutoff.toISOString()}` : ''}`);
    const result = await runPurgeNow(db, 'manual', userId, forcedCutoff);

    res.json({
      success:                 result.status !== 'error',
      run_id:                  result.runId,
      run_at:                  result.runAt,
      status:                  result.status,
      transactions_anonymized: result.transactionsAnonymized,
      logs_deleted:            result.logsDeleted,
      error_message:           result.errorMessage || null,
      cutoff_used:             forcedCutoff ? forcedCutoff.toISOString() : null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

