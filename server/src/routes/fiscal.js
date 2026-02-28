/**
 * Co-Caisse — Routes Fiscales NF525
 * ============================================================
 * Endpoints de contrôle de la chaîne cryptographique (admin only).
 *
 * GET  /api/fiscal/status         → état du chaînage + infos chaîne
 * GET  /api/fiscal/verify-chain   → vérification intégrale de la chaîne
 * GET  /api/fiscal/anomalies      → liste des anomalies enregistrées
 * POST /api/fiscal/anomalies/:id/resolve → marquer une anomalie comme résolue
 * ============================================================
 */

import express from 'express';
import { roleCheck } from '../middleware/auth.js';
import {
  verifyChain,
  getChainTail,
  logAnomaly,
} from '../services/fiscal.service.js';

const router = express.Router();

// ── GET /status — Infos sur la chaîne fiscale ────────────────────────────────
router.get('/status', roleCheck(['admin']), async (req, res) => {
  try {
    const db       = req.app.locals.db;
    const settings = await db.get('SELECT fiscal_chain_enabled FROM `settings` LIMIT 1');
    const tail     = await getChainTail(db);

    // Compter les transactions sans hash (antérieures à l'activation)
    const unchained = await db.get(
      'SELECT COUNT(*) AS count FROM `transactions` WHERE transaction_hash IS NULL'
    );

    res.json({
      enabled:        settings?.fiscal_chain_enabled === 1,
      chain_length:   tail.chain_length,
      last_tx_id:     tail.last_tx_id,
      last_hash_hint: tail.last_hash ? tail.last_hash.substring(0, 8) + '…' : null,
      updated_at:     tail.updated_at,
      unchained_count: unchained?.count || 0,
      hmac_key_set:   !!process.env.FISCAL_HMAC_KEY,
    });
  } catch (error) {
    console.error('[fiscal/status] erreur:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /verify-chain — Vérification intégrale de la chaîne ─────────────────
router.get('/verify-chain', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;

    console.log('[fiscal] Démarrage vérification de la chaîne fiscale…');
    const result = await verifyChain(db);

    // En cas d'anomalies → les logger en DB et notifier dans les logs
    if (result.anomalies && result.anomalies.length > 0) {
      console.warn(
        `[fiscal] ⚠️  ${result.anomalies.length} anomalie(s) détectée(s) dans la chaîne !`
      );

      for (const anomaly of result.anomalies) {
        console.warn(`[fiscal]   ↳ TX ${anomaly.tx_id} — type: ${anomaly.type}`);
        await logAnomaly(db, anomaly);
      }

      // Alert admin dans les logs (peut être étendu à un email via email.service.js)
      console.error('[fiscal] 🚨 ALERTE ADMIN — Intégrité de la chaîne fiscale compromise !');
    } else if (result.ok) {
      console.log(`[fiscal] ✅ Chaîne vérifiée — ${result.verified}/${result.total} transactions OK`);
    }

    res.json({
      ...result,
      verified_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[fiscal/verify-chain] erreur:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /anomalies — Liste des anomalies enregistrées ────────────────────────
router.get('/anomalies', roleCheck(['admin']), async (req, res) => {
  try {
    const db         = req.app.locals.db;
    const { resolved = 'all' } = req.query;

    let query = 'SELECT * FROM `fiscal_anomalies`';
    const params = [];

    if (resolved === 'false' || resolved === '0') {
      query += ' WHERE resolved = 0';
    } else if (resolved === 'true' || resolved === '1') {
      query += ' WHERE resolved = 1';
    }

    query += ' ORDER BY detected_at DESC LIMIT 100';

    const anomalies = await db.all(query, params);
    res.json(anomalies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /anomalies/:id/resolve — Marquer une anomalie comme résolue ──────────
router.post('/anomalies/:id/resolve', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;

    await db.run(
      `UPDATE \`fiscal_anomalies\`
         SET resolved    = 1,
             resolved_at = CURRENT_TIMESTAMP,
             resolved_by = ?
       WHERE id = ?`,
      [req.userId, req.params.id]
    );

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /reset-chain — Réinitialiser la chaîne après changement de clé ───────
// Efface tous les transaction_hash existants, remet fiscal_chain à GENESIS,
// et recalcule toute la chaîne avec la clé HMAC actuelle.
// ⚠️  Réservé admin — à utiliser uniquement après un changement de FISCAL_HMAC_KEY
router.post('/reset-chain', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;

    if (!process.env.FISCAL_HMAC_KEY) {
      return res.status(400).json({ error: 'FISCAL_HMAC_KEY manquante dans .env — reset impossible' });
    }

    console.log('[fiscal] 🔄 Démarrage reset + recalcul de la chaîne fiscale…');

    // 1. Récupérer toutes les transactions dans l'ordre chronologique
    const transactions = await db.all(`
      SELECT id, user_id, transaction_date, items, subtotal, tax, discount,
             total, payment_method, receipt_number, created_at
      FROM \`transactions\`
      ORDER BY created_at ASC, id ASC
    `);

    if (transactions.length === 0) {
      // Rien à recalculer — juste remettre le singleton à zéro
      await db.run(
        `UPDATE \`fiscal_chain\` SET last_hash='GENESIS', last_tx_id=NULL, chain_length=0, updated_at=CURRENT_TIMESTAMP WHERE id=1`
      );
      await db.run(`UPDATE \`transactions\` SET transaction_hash = NULL`);
      await db.run(`UPDATE \`fiscal_anomalies\` SET resolved=1, resolved_at=CURRENT_TIMESTAMP WHERE resolved=0`);
      return res.json({ success: true, recomputed: 0, message: 'Chaîne réinitialisée (aucune transaction)' });
    }

    // 2. Recalculer tous les hashs avec la clé actuelle
    const { computeTransactionHash } = await import('../services/fiscal.service.js');
    let prevHash = 'GENESIS';
    let count    = 0;

    for (const tx of transactions) {
      const newHash = computeTransactionHash(tx, prevHash);
      await db.run(
        'UPDATE `transactions` SET transaction_hash = ? WHERE id = ?',
        [newHash, tx.id]
      );
      prevHash = newHash;
      count++;
    }

    // 3. Mettre à jour le singleton fiscal_chain
    const lastTx = transactions[transactions.length - 1];
    await db.run(
      `UPDATE \`fiscal_chain\`
         SET last_hash    = ?,
             last_tx_id   = ?,
             chain_length = ?,
             updated_at   = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [prevHash, lastTx.id, count]
    );

    // 4. Marquer toutes les anciennes anomalies comme résolues
    await db.run(
      `UPDATE \`fiscal_anomalies\` SET resolved=1, resolved_at=CURRENT_TIMESTAMP, resolved_by=? WHERE resolved=0`,
      [req.userId]
    );

    console.log(`[fiscal] ✅ Reset terminé — ${count} transaction(s) recalculées`);
    res.json({
      success:    true,
      recomputed: count,
      message:    `${count} transaction(s) recalculées avec la nouvelle clé HMAC`,
    });
  } catch (error) {
    console.error('[fiscal/reset-chain] erreur:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;

