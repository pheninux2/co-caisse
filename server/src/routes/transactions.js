/**
 * Co-Caisse — Routes transactions
 * Version : 2.0.0 (MariaDB — backticks sur `change`)
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// ── POST / — Créer une transaction ───────────────────────────────────────────
router.post('/', async (req, res) => {
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

    // Vérifier qu'aucune valeur n'est undefined (MariaDB strict)
    const params = [
      uuidv4(),                                    // id
      req.userId,                                   // user_id (garanti par authMiddleware)
      JSON.stringify(Array.isArray(items) ? items : []),
      subtotal        != null ? Number(subtotal)       : 0,
      tax             != null ? Number(tax)            : 0,
      discount        != null ? Number(discount)       : 0,
      Number(total),
      payment_method,
      payment_status  || 'completed',
      changeAmount    != null ? Number(changeAmount)   : 0,
      notes           !== undefined ? notes : null,
      `REC-${Date.now()}`,
    ];

    // Vérification défensive : aucun undefined ne doit passer
    const undefinedIdx = params.findIndex(p => p === undefined);
    if (undefinedIdx !== -1) {
      console.error('[transactions POST] param undefined à index', undefinedIdx, params);
      return res.status(500).json({ error: `Param undefined at index ${undefinedIdx}` });
    }

    await db.run(
      `INSERT INTO \`transactions\`
         (id, user_id, items, subtotal, tax, discount, total,
          payment_method, payment_status, \`change\`, notes, receipt_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    );

    const transaction = await db.get(
      'SELECT * FROM `transactions` WHERE id = ?', [params[0]]
    );
    res.status(201).json(transaction);
  } catch (error) {
    console.error('[transactions POST] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── GET / — Lister les transactions avec filtres ──────────────────────────────
router.get('/', async (req, res) => {
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
router.get('/summary/daily', async (req, res) => {
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
router.get('/summary/period', async (req, res) => {
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
router.get('/:id', async (req, res) => {
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

