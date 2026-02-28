/**
 * Co-Caisse — Routes transactions
 * Version : 2.1.0 (MariaDB + chaînage fiscal NF525)
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { roleCheck } from '../middleware/auth.js';
import {
  computeTransactionHash,
  getChainTail,
  updateChainTail,
} from '../services/fiscal.service.js';

const router = express.Router();

// ── POST / — Créer une transaction ───────────────────────────────────────────
router.post('/', roleCheck(['admin', 'cashier']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      items, subtotal, tax, discount, total,
      payment_method, payment_status,
      change: changeAmount,
      notes,
    } = req.body;

    if (!items || total == null || !payment_method) {
      return res.status(400).json({ error: 'Missing required fields: items, total, payment_method' });
    }

    // Vérifie que l'utilisateur du token existe toujours en DB (évite FK violation)
    const userExists = await db.get('SELECT id FROM `users` WHERE id = ?', [req.userId]);
    if (!userExists) {
      return res.status(401).json({ error: 'Session expirée — veuillez vous reconnecter' });
    }

    // ── Données de la transaction ────────────────────────────────────────────
    const txId          = uuidv4();
    const receiptNumber = `REC-${Date.now()}`;

    // txDate : format "YYYY-MM-DD HH:MM:SS" en UTC
    // Doit correspondre EXACTEMENT à ce que MariaDB stocke et à ce que mysql2 retourne
    // (mysql2 retourne un objet Date UTC → normalizeDateStr() lui applique le même format)
    const _now = new Date();
    const _pad = n => String(n).padStart(2, '0');
    const txDate = `${_now.getUTCFullYear()}-${_pad(_now.getUTCMonth()+1)}-${_pad(_now.getUTCDate())} `
                 + `${_pad(_now.getUTCHours())}:${_pad(_now.getUTCMinutes())}:${_pad(_now.getUTCSeconds())}`;

    const itemsJson     = JSON.stringify(Array.isArray(items) ? items : []);

    const safeSubtotal = subtotal       != null ? Number(subtotal)      : 0;
    const safeTax      = tax            != null ? Number(tax)           : 0;
    const safeDiscount = discount       != null ? Number(discount)      : 0;
    const safeTotal    = Number(total);
    const safeChange   = changeAmount   != null ? Number(changeAmount)  : 0;
    const safeNotes    = notes          !== undefined ? notes : null;
    const safeStatus   = payment_status || 'completed';

    // ── Chaînage fiscal NF525 (optionnel selon paramètre) ────────────────────
    let txHash = null;
    try {
      const settings = await db.get(
        'SELECT fiscal_chain_enabled FROM `settings` LIMIT 1'
      );
      if (settings?.fiscal_chain_enabled === 1) {
        if (!process.env.FISCAL_HMAC_KEY) {
          console.warn('[fiscal] fiscal_chain_enabled=1 mais FISCAL_HMAC_KEY manquante dans .env !');
        } else {
          const tail = await getChainTail(db);
          const txForHash = {
            id:               txId,
            user_id:          req.userId,
            transaction_date: txDate,
            items:            itemsJson,
            subtotal:         safeSubtotal,
            tax:              safeTax,
            discount:         safeDiscount,
            total:            safeTotal,
            payment_method,
            receipt_number:   receiptNumber,
          };
          txHash = computeTransactionHash(txForHash, tail.last_hash);
        }
      }
    } catch (hashErr) {
      // Ne pas bloquer l'encaissement en cas d'erreur sur le hash
      console.error('[fiscal] Erreur calcul hash :', hashErr.message);
    }

    // Vérification défensive : aucun undefined ne doit passer
    const params = [
      txId, req.userId, itemsJson,
      safeSubtotal, safeTax, safeDiscount, safeTotal,
      payment_method, safeStatus, safeChange, safeNotes,
      receiptNumber, txHash,
    ];

    const undefinedIdx = params.findIndex(p => p === undefined);
    if (undefinedIdx !== -1) {
      console.error('[transactions POST] param undefined à index', undefinedIdx, params);
      return res.status(500).json({ error: `Param undefined at index ${undefinedIdx}` });
    }

    await db.run(
      `INSERT INTO \`transactions\`
         (id, user_id, items, subtotal, tax, discount, total,
          payment_method, payment_status, \`change\`, notes,
          receipt_number, transaction_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    );

    // ── Mise à jour du singleton fiscal_chain (si hash calculé) ─────────────
    if (txHash) {
      try {
        await updateChainTail(db, txHash, txId);
      } catch (chainErr) {
        console.error('[fiscal] Erreur mise à jour fiscal_chain :', chainErr.message);
      }
    }

    const transaction = await db.get(
      'SELECT * FROM `transactions` WHERE id = ?', [txId]
    );
    res.status(201).json(transaction);
  } catch (error) {
    console.error('[transactions POST] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── GET / — Lister les transactions avec filtres ──────────────────────────────
router.get('/', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      start_date, end_date, payment_method, user_id,
      limit = 100, offset = 0,
    } = req.query;

    let query = `
      SELECT t.*, u.username AS cashier_name
      FROM \`transactions\` t
      LEFT JOIN \`users\` u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];

    if (start_date)      { query += ' AND DATE(t.transaction_date) >= ?'; params.push(start_date);      }
    if (end_date)        { query += ' AND DATE(t.transaction_date) <= ?'; params.push(end_date);        }
    if (payment_method)  { query += ' AND t.payment_method = ?';          params.push(payment_method);  }
    if (user_id)         { query += ' AND t.user_id = ?';                 params.push(user_id);         }

    query += ' ORDER BY t.transaction_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const transactions = await db.all(query, params);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /summary/daily — Résumé journalier ────────────────────────────────────
router.get('/summary/daily', roleCheck(['admin', 'manager', 'cashier']), async (req, res) => {
  try {
    const db   = req.app.locals.db;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const summary = await db.get(`
      SELECT
        DATE(transaction_date)                                        AS date,
        COUNT(*)                                                      AS transaction_count,
        COALESCE(SUM(total), 0)                                       AS total_amount,
        COALESCE(SUM(tax), 0)                                         AS total_tax,
        COALESCE(SUM(discount), 0)                                    AS total_discount,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) AS cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) AS card_total
      FROM \`transactions\`
      WHERE DATE(transaction_date) = ?
    `, [date]);

    res.json(summary || { date, transaction_count: 0, total_amount: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /summary/period — Résumé sur une période ──────────────────────────────
router.get('/summary/period', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db           = req.app.locals.db;
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({ error: 'start and end dates required' });
    }

    const summary = await db.get(`
      SELECT
        COUNT(*)                                                           AS count,
        COALESCE(SUM(total), 0)                                            AS total,
        COALESCE(SUM(tax), 0)                                              AS tax,
        COALESCE(SUM(discount), 0)                                         AS discount,
        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END), 0) AS cash_total,
        COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END), 0) AS card_total
      FROM \`transactions\`
      WHERE DATE(transaction_date) >= ? AND DATE(transaction_date) <= ?
    `, [start, end]);

    res.json(summary || { count: 0, total: 0, tax: 0, discount: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /:id — Obtenir une transaction par ID ─────────────────────────────────
router.get('/:id', roleCheck(['admin', 'manager', 'cashier']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const transaction = await db.get(`
      SELECT t.*, u.username AS cashier_name
      FROM \`transactions\` t
      LEFT JOIN \`users\` u ON t.user_id = u.id
      WHERE t.id = ?
    `, [req.params.id]);

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    try { transaction.items = JSON.parse(transaction.items); } catch { /* déjà parsé */ }
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

