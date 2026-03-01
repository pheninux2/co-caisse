/**
 * Co-Caisse — Routes Fiscales NF525
 * ============================================================
 * GET  /api/fiscal/status              → état du chaînage
 * GET  /api/fiscal/verify-chain        → vérification chaîne
 * GET  /api/fiscal/anomalies           → liste anomalies
 * POST /api/fiscal/anomalies/:id/resolve
 * POST /api/fiscal/reset-chain         → recalcul après changement clé
 * POST /api/fiscal/close-day           → clôture journalière Z-ticket
 * GET  /api/fiscal/closures            → liste des clôtures
 * GET  /api/fiscal/closures/:id        → détail d'une clôture
 * GET  /api/fiscal/closure-status      → statut clôture du jour
 * ============================================================
 */

import express  from 'express';
import crypto   from 'crypto';
import { v4 as uuidv4 } from 'uuid';
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

// ═══════════════════════════════════════════════════════════════════════════
// CLÔTURE JOURNALIÈRE — Z-TICKET NF525
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Calcule les bornes de la journée fiscale courante.
 * La journée commence à `startHour` (défaut 6h) et se termine à startHour-1h le lendemain.
 * Ex: startHour=6 → journée de 06:00 à 05:59 le lendemain.
 */
function getFiscalDayBounds(referenceDate = new Date(), startHour = 6) {
  const d = new Date(referenceDate);
  // Si on est avant startHour, on appartient à la journée fiscale de la veille
  if (d.getUTCHours() < startHour) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), startHour, 0, 0, 0));
  const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1000); // +23h59m59s
  return { start, end };
}

/**
 * Formate une date en "YYYY-MM-DD HH:MM:SS" UTC (pour requêtes SQL).
 */
function toSqlDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())} `
       + `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Génère le contenu texte du Z-ticket.
 */
function buildZticketContent(data) {
  const sep  = '='.repeat(40);
  const dash = '-'.repeat(40);
  const center = (s, w = 40) => {
    const pad = Math.max(0, Math.floor((w - s.length) / 2));
    return ' '.repeat(pad) + s;
  };

  const {
    closureNumber, closedAt, fiscalDayStart, fiscalDayEnd,
    companyName, companyAddress, companySiret,
    transactionCount, totalTtc, totalHt, totalTax, totalDiscount,
    vatBreakdown, paymentBreakdown,
    lastTransactionHash, closureHash,
  } = data;

  const paymentLabels = { cash: 'Espèces', card: 'Carte bancaire', mixed: 'Mixte', other: 'Autre' };

  let z = '';
  z += sep + '\n';
  z += center('Z - TICKET DE CLÔTURE') + '\n';
  z += center('JOURNÉE FISCALE') + '\n';
  z += sep + '\n';
  if (companyName)    z += center(companyName.toUpperCase()) + '\n';
  if (companyAddress) z += center(companyAddress) + '\n';
  if (companySiret)   z += center(`SIRET : ${companySiret}`) + '\n';
  z += dash + '\n';
  z += `N° Clôture   : ${closureNumber}\n`;
  z += `Clôturé le   : ${new Date(closedAt).toLocaleString('fr-FR', { timeZone: 'UTC' })}\n`;
  z += `Période      : ${new Date(fiscalDayStart).toLocaleString('fr-FR', { timeZone: 'UTC' })}\n`;
  z += `           → ${new Date(fiscalDayEnd).toLocaleString('fr-FR', { timeZone: 'UTC' })}\n`;
  z += dash + '\n';
  z += `Nb transactions  : ${transactionCount}\n`;
  z += `Total remises    : -${Number(totalDiscount).toFixed(2)} €\n`;
  z += dash + '\n';
  z += `TOTAL HT         : ${Number(totalHt).toFixed(2)} €\n`;

  // Ventilation TVA
  if (vatBreakdown && vatBreakdown.length > 0) {
    z += dash + '\n';
    z += 'VENTILATION TVA\n';
    vatBreakdown.forEach(v => {
      z += `  TVA ${String(v.rate).padEnd(5)}%  HT: ${Number(v.base_ht).toFixed(2).padStart(8)} €`;
      z += `  TVA: ${Number(v.tax_amount).toFixed(2).padStart(7)} €\n`;
    });
  }

  z += dash + '\n';
  z += `TOTAL TVA        : ${Number(totalTax).toFixed(2)} €\n`;
  z += sep + '\n';
  z += `TOTAL TTC        : ${Number(totalTtc).toFixed(2)} €\n`;
  z += sep + '\n';

  // Ventilation paiements
  if (paymentBreakdown) {
    z += 'MODES DE PAIEMENT\n';
    Object.entries(paymentBreakdown).forEach(([method, amount]) => {
      if (Number(amount) > 0) {
        z += `  ${(paymentLabels[method] || method).padEnd(16)}: ${Number(amount).toFixed(2).padStart(8)} €\n`;
      }
    });
    z += dash + '\n';
  }

  // Chaînage fiscal
  z += `Dernière TX hash : ${lastTransactionHash ? lastTransactionHash.substring(0, 16) + '...' : 'N/A'}\n`;
  z += `Hash clôture     : ${closureHash.substring(0, 16)}...\n`;
  z += sep + '\n';
  z += center('Document fiscal — NF525') + '\n';
  z += center('Ne pas jeter') + '\n';
  z += sep + '\n';

  return z;
}

// ── GET /closure-status — Statut de la clôture du jour ─────────────────────
router.get('/closure-status', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const settings = await db.get('SELECT fiscal_day_start_hour FROM `settings` LIMIT 1');
    const startHour = settings?.fiscal_day_start_hour ?? 6;
    const { start, end } = getFiscalDayBounds(new Date(), startHour);

    // Chercher une clôture pour la journée fiscale actuelle
    const existing = await db.get(
      'SELECT id, closure_number, closed_at, transaction_count, total_ttc FROM `daily_closures` WHERE fiscal_day_start = ? LIMIT 1',
      [toSqlDate(start)]
    );

    // Chercher la dernière clôture toutes journées confondues
    const lastClosure = await db.get(
      'SELECT closed_at, closure_number FROM `daily_closures` ORDER BY closed_at DESC LIMIT 1'
    );

    // Compter les transactions de la journée (pour badge)
    const txCount = await db.get(
      `SELECT COUNT(*) AS count FROM \`transactions\`
       WHERE transaction_date >= ? AND transaction_date <= ?`,
      [toSqlDate(start), toSqlDate(end)]
    );

    // Calcul du badge : avertissement si dernière clôture > 26h
    let warnNoClosureH = null;
    if (lastClosure?.closed_at) {
      const diffH = (Date.now() - new Date(lastClosure.closed_at).getTime()) / 3_600_000;
      if (diffH > 26) warnNoClosureH = Math.floor(diffH);
    } else if (!lastClosure) {
      // Jamais clôturé — avertir si des transactions existent
      const total = await db.get('SELECT COUNT(*) AS count FROM `transactions`');
      if (total?.count > 0) warnNoClosureH = 99;
    }

    res.json({
      already_closed:       !!existing,
      closure:              existing || null,
      fiscal_day_start:     toSqlDate(start),
      fiscal_day_end:       toSqlDate(end),
      transactions_today:   txCount?.count || 0,
      last_closure:         lastClosure || null,
      warn_no_closure_hours: warnNoClosureH,
    });
  } catch (error) {
    console.error('[fiscal/closure-status]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /close-day — Effectuer la clôture journalière ─────────────────────
router.post('/close-day', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;

    if (!process.env.FISCAL_HMAC_KEY) {
      return res.status(400).json({
        error: 'FISCAL_HMAC_KEY manquante dans .env — clôture impossible',
      });
    }

    // ── Journée fiscale ──────────────────────────────────────────────────────
    const settings = await db.get(
      'SELECT fiscal_day_start_hour, company_name, company_address, tax_number FROM `settings` LIMIT 1'
    );
    const startHour = settings?.fiscal_day_start_hour ?? 6;
    const { start, end } = getFiscalDayBounds(new Date(), startHour);

    // ── Vérifier si déjà clôturé aujourd'hui ────────────────────────────────
    const existing = await db.get(
      'SELECT id, closure_number FROM `daily_closures` WHERE fiscal_day_start = ? LIMIT 1',
      [toSqlDate(start)]
    );
    if (existing) {
      return res.status(409).json({
        error: `Journée déjà clôturée (${existing.closure_number})`,
        closure_number: existing.closure_number,
      });
    }

    // ── Récupérer les transactions de la journée ─────────────────────────────
    const transactions = await db.all(
      `SELECT id, items, subtotal, tax, discount, total, payment_method, transaction_hash
       FROM \`transactions\`
       WHERE transaction_date >= ? AND transaction_date <= ?
       ORDER BY transaction_date ASC`,
      [toSqlDate(start), toSqlDate(end)]
    );

    // ── Calculer les totaux ──────────────────────────────────────────────────
    let totalTtc      = 0;
    let totalHt       = 0;
    let totalTax      = 0;
    let totalDiscount = 0;
    const vatMap      = {};   // { "20": { base_ht, tax_amount, total_ttc } }
    const payMap      = { cash: 0, card: 0, mixed: 0, other: 0 };

    for (const tx of transactions) {
      totalTtc      += Number(tx.total)    || 0;
      totalTax      += Number(tx.tax)      || 0;
      totalDiscount += Number(tx.discount) || 0;

      // Ventilation paiements
      const m = tx.payment_method;
      if (m === 'cash')       payMap.cash  += Number(tx.total);
      else if (m === 'card')  payMap.card  += Number(tx.total);
      else if (m === 'mixed') payMap.mixed += Number(tx.total);
      else                    payMap.other += Number(tx.total);

      // Ventilation TVA — lire le taux depuis les items si possible
      let items = [];
      try { items = typeof tx.items === 'string' ? JSON.parse(tx.items) : (tx.items || []); } catch (_) {}

      if (items.length > 0) {
        for (const item of items) {
          const rate   = Number(item.tax_rate ?? item.taxRate ?? 20);
          const qty    = Number(item.quantity ?? item.qty ?? 1);
          const priceTtc = Number(item.price ?? 0) * qty;
          const priceHt  = priceTtc / (1 + rate / 100);
          const taxAmt   = priceTtc - priceHt;

          const key = String(rate);
          if (!vatMap[key]) vatMap[key] = { rate, base_ht: 0, tax_amount: 0, total_ttc: 0 };
          vatMap[key].base_ht    += priceHt;
          vatMap[key].tax_amount += taxAmt;
          vatMap[key].total_ttc  += priceTtc;
        }
      } else {
        // Fallback : taux unique 20%
        const ht  = Number(tx.subtotal) || (Number(tx.total) / 1.20);
        const tax = Number(tx.tax)      || (Number(tx.total) - ht);
        if (!vatMap['20']) vatMap['20'] = { rate: 20, base_ht: 0, tax_amount: 0, total_ttc: 0 };
        vatMap['20'].base_ht    += ht;
        vatMap['20'].tax_amount += tax;
        vatMap['20'].total_ttc  += Number(tx.total);
      }
    }

    // totalHt = totalTtc - totalTax
    totalHt = totalTtc - totalTax;
    const vatBreakdown     = Object.values(vatMap).sort((a, b) => a.rate - b.rate);
    const paymentBreakdown = payMap;

    // ── Dernière transaction de la chaîne ────────────────────────────────────
    const lastTx = transactions.length > 0
      ? transactions[transactions.length - 1]
      : null;
    const lastTxHash = lastTx?.transaction_hash || null;

    // ── Numéro séquentiel ─────────────────────────────────────────────────────
    const lastClosure = await db.get(
      'SELECT closure_number FROM `daily_closures` ORDER BY created_at DESC LIMIT 1'
    );
    let nextNum = 1;
    if (lastClosure?.closure_number) {
      const m = lastClosure.closure_number.match(/Z(\d+)/i);
      if (m) nextNum = parseInt(m[1], 10) + 1;
    }
    const closureNumber = `Z${String(nextNum).padStart(3, '0')}`;

    // ── Hash de clôture ───────────────────────────────────────────────────────
    const closurePayload = JSON.stringify({
      closure_number:   closureNumber,
      fiscal_day_start: toSqlDate(start),
      fiscal_day_end:   toSqlDate(end),
      transaction_count: transactions.length,
      total_ttc:        Math.round(totalTtc * 1e6) / 1e6,
      total_ht:         Math.round(totalHt  * 1e6) / 1e6,
      total_tax:        Math.round(totalTax * 1e6) / 1e6,
      vat_breakdown:    vatBreakdown,
      payment_breakdown: paymentBreakdown,
      last_transaction_hash: lastTxHash || 'GENESIS',
    });
    const closureHash = crypto
      .createHmac('sha256', process.env.FISCAL_HMAC_KEY)
      .update(closurePayload, 'utf8')
      .digest('hex');

    // ── Générer le contenu textuel du Z-ticket ────────────────────────────────
    const closedAt = new Date();
    const zticketContent = buildZticketContent({
      closureNumber,
      closedAt:           closedAt.toISOString(),
      fiscalDayStart:     start.toISOString(),
      fiscalDayEnd:       end.toISOString(),
      companyName:        settings?.company_name    || '',
      companyAddress:     settings?.company_address || '',
      companySiret:       settings?.tax_number      || '',
      transactionCount:   transactions.length,
      totalTtc, totalHt, totalTax, totalDiscount,
      vatBreakdown,
      paymentBreakdown,
      lastTransactionHash: lastTxHash,
      closureHash,
    });

    // ── Insérer la clôture en base ────────────────────────────────────────────
    const closureId = uuidv4();
    await db.run(
      `INSERT INTO \`daily_closures\`
         (id, closure_number, fiscal_day_start, fiscal_day_end, closed_at, closed_by,
          transaction_count, total_ttc, total_ht, total_tax, total_discount,
          vat_breakdown, payment_breakdown,
          last_transaction_id, last_transaction_hash,
          closure_hash, zticket_content)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        closureId, closureNumber, toSqlDate(start), toSqlDate(end),
        toSqlDate(closedAt), req.userId,
        transactions.length,
        Math.round(totalTtc * 100) / 100,
        Math.round(totalHt  * 100) / 100,
        Math.round(totalTax * 100) / 100,
        Math.round(totalDiscount * 100) / 100,
        JSON.stringify(vatBreakdown),
        JSON.stringify(paymentBreakdown),
        lastTx?.id   || null,
        lastTxHash   || null,
        closureHash,
        zticketContent,
      ]
    );

    console.log(`[fiscal] ✅ Clôture ${closureNumber} effectuée — ${transactions.length} transactions — Total TTC : ${totalTtc.toFixed(2)} €`);

    res.status(201).json({
      success:          true,
      closure_id:       closureId,
      closure_number:   closureNumber,
      transaction_count: transactions.length,
      total_ttc:        Math.round(totalTtc * 100) / 100,
      total_ht:         Math.round(totalHt  * 100) / 100,
      total_tax:        Math.round(totalTax * 100) / 100,
      total_discount:   Math.round(totalDiscount * 100) / 100,
      vat_breakdown:    vatBreakdown,
      payment_breakdown: paymentBreakdown,
      closure_hash:     closureHash,
      closed_at:        closedAt.toISOString(),
      fiscal_day_start: start.toISOString(),
      fiscal_day_end:   end.toISOString(),
      zticket_content:  zticketContent,
    });
  } catch (error) {
    console.error('[fiscal/close-day] erreur:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /closures — Liste des clôtures ───────────────────────────────────────
router.get('/closures', roleCheck(['admin']), async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const closures = await db.all(
      `SELECT id, closure_number, fiscal_day_start, fiscal_day_end, closed_at,
              transaction_count, total_ttc, total_ht, total_tax, total_discount,
              closure_hash, last_transaction_hash
       FROM \`daily_closures\`
       ORDER BY closed_at DESC
       LIMIT ?`,
      [limit]
    );
    res.json(closures);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /closures/:id — Détail d'une clôture (avec Z-ticket) ─────────────────
router.get('/closures/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const closure = await db.get(
      'SELECT * FROM `daily_closures` WHERE id = ?',
      [req.params.id]
    );
    if (!closure) return res.status(404).json({ error: 'Clôture introuvable' });

    // Désérialiser les JSON stockés
    if (typeof closure.vat_breakdown     === 'string') closure.vat_breakdown     = JSON.parse(closure.vat_breakdown);
    if (typeof closure.payment_breakdown === 'string') closure.payment_breakdown = JSON.parse(closure.payment_breakdown);

    res.json(closure);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

