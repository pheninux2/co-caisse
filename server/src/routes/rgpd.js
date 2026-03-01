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

// ── GET /api/rgpd/search-customers ──────────────────────────────────────────
// Recherche de clients par email ou nom (dans orders) — admin uniquement
// Query : ?q=jean  ou  ?email=jean@...  ou  ?name=Jean
router.get('/search-customers', async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const query = (req.query.q || req.query.email || req.query.name || '').trim();

    if (!query || query.length < 2) {
      return res.status(400).json({ error: 'Requête trop courte — minimum 2 caractères' });
    }

    const like = `%${query}%`;

    // Chercher dans orders (customer_name, customer_phone)
    const ordersRows = await db.all(
      `SELECT
         customer_name,
         customer_phone,
         COUNT(*) AS order_count,
         MIN(created_at) AS first_seen,
         MAX(created_at) AS last_seen
       FROM \`orders\`
       WHERE (customer_name LIKE ? OR customer_phone LIKE ?)
         AND customer_name IS NOT NULL
         AND customer_name != 'Client anonymisé'
       GROUP BY customer_name, customer_phone
       ORDER BY last_seen DESC
       LIMIT 20`,
      [like, like]
    );

    // Chercher dans transactions (customer_email)
    const txRows = await db.all(
      `SELECT
         customer_email,
         COUNT(*) AS tx_count,
         MIN(created_at) AS first_seen,
         MAX(created_at) AS last_seen
       FROM \`transactions\`
       WHERE customer_email LIKE ?
         AND customer_email IS NOT NULL
       GROUP BY customer_email
       ORDER BY last_seen DESC
       LIMIT 20`,
      [like]
    );

    // Fusionner les résultats
    const results = [];

    for (const row of ordersRows) {
      results.push({
        type:        'orders',
        identifier:  row.customer_name,
        detail:      row.customer_phone || null,
        order_count: row.order_count,
        tx_count:    0,
        first_seen:  row.first_seen,
        last_seen:   row.last_seen,
      });
    }

    for (const row of txRows) {
      results.push({
        type:        'transactions',
        identifier:  row.customer_email,
        detail:      null,
        order_count: 0,
        tx_count:    row.tx_count,
        first_seen:  row.first_seen,
        last_seen:   row.last_seen,
      });
    }

    res.json({ results, total: results.length, query });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/rgpd/anonymize-customer ────────────────────────────────────────
// Droit à l'effacement RGPD Art. 17 — anonymisation ciblée d'un client
// Body : { customer_email?, customer_name?, reason? }
router.post('/anonymize-customer', async (req, res) => {
  try {
    const db           = req.app.locals.db;
    const adminId      = req.user?.id || null;
    const adminName    = req.user?.username || 'admin';
    const { customer_email, customer_name, reason = 'Droit à l\'effacement RGPD Art. 17' } = req.body;

    if (!customer_email && !customer_name) {
      return res.status(400).json({
        error: 'Fournir au moins customer_email ou customer_name',
      });
    }

    const runAt   = new Date();
    const runId   = (await import('uuid')).v4();
    let   txCount = 0;
    let   ordersCount = 0;
    let   errorMsg    = null;
    let   status      = 'success';

    try {
      // ── 1. Anonymiser les transactions (customer_email) ──────────────────
      if (customer_email) {
        const r = await db.run(
          `UPDATE \`transactions\`
           SET customer_email = NULL
           WHERE customer_email = ?`,
          [customer_email]
        );
        txCount = r.affectedRows ?? 0;
      }

      // ── 2. Anonymiser les orders (customer_name + customer_phone) ─────────
      if (customer_name) {
        const r = await db.run(
          `UPDATE \`orders\`
           SET
             customer_name  = 'Client anonymisé',
             customer_phone = NULL
           WHERE customer_name = ?
             AND customer_name != 'Client anonymisé'`,
          [customer_name]
        );
        ordersCount = r.affectedRows ?? 0;
      }

    } catch (err) {
      status   = 'error';
      errorMsg = err.message;
      console.error('[RGPD] anonymize-customer error:', err.message);
    }

    const totalAffected = txCount + ordersCount;

    // ── 3. Logger dans rgpd_purge_logs ────────────────────────────────────
    try {
      const fmtDate = (d) => new Date(d).toISOString().replace('T', ' ').substring(0, 19);
      await db.run(
        `INSERT INTO \`rgpd_purge_logs\`
           (id, run_at, triggered_by, triggered_by_user, retention_months,
            cutoff_date, transactions_anonymized, logs_deleted, status, error_message)
         VALUES (?, ?, 'manual', ?, 0, ?, ?, 0, ?, ?)`,
        [
          runId,
          fmtDate(runAt),
          adminId,
          fmtDate(runAt),
          totalAffected,
          status,
          errorMsg ?? `Droit à l'effacement — ${customer_email || customer_name} — par ${adminName}. ${reason}`,
        ]
      );
    } catch (logErr) {
      console.error('[RGPD] log error:', logErr.message);
    }

    console.log(`[RGPD] ✓ anonymize-customer — ${customer_email || customer_name} — ${totalAffected} enreg. par ${adminName}`);

    res.json({
      success:          status !== 'error',
      run_id:           runId,
      status,
      customer_email:   customer_email   || null,
      customer_name:    customer_name    || null,
      transactions_anonymized: txCount,
      orders_anonymized:       ordersCount,
      total_affected:          totalAffected,
      executed_at:      runAt.toISOString(),
      executed_by:      adminName,
      reason,
      error_message:    errorMsg || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

