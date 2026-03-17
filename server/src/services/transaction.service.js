/**
 * Co-Caisse — TransactionService
 */
import { v4 as uuidv4 } from 'uuid';
import {
  computeTransactionHash,
  getChainTail,
  updateChainTail,
} from './fiscal.service.js';

export const TransactionService = {

  async create(db, data, userId) {
    const {
      items, subtotal, tax, discount, total,
      payment_method, payment_status,
      change: changeAmount,
      notes,
    } = data;

    // Vérifie que l'utilisateur du token existe toujours
    const userExists = await db.get('SELECT id FROM `users` WHERE id = ?', [userId]);
    if (!userExists) {
      const err = new Error('Session expirée — veuillez vous reconnecter');
      err.status = 401;
      throw err;
    }

    const txId          = uuidv4();
    const receiptNumber = `REC-${Date.now()}`;

    const _now = new Date();
    const _pad = n => String(n).padStart(2, '0');
    const txDate = `${_now.getUTCFullYear()}-${_pad(_now.getUTCMonth()+1)}-${_pad(_now.getUTCDate())} `
                 + `${_pad(_now.getUTCHours())}:${_pad(_now.getUTCMinutes())}:${_pad(_now.getUTCSeconds())}`;

    const itemsJson    = JSON.stringify(Array.isArray(items) ? items : []);
    const safeSubtotal = subtotal     != null ? Number(subtotal)     : 0;
    const safeTax      = tax          != null ? Number(tax)          : 0;
    const safeDiscount = discount     != null ? Number(discount)     : 0;
    const safeTotal    = Number(total);
    const safeChange   = changeAmount != null ? Number(changeAmount) : 0;
    const safeNotes    = notes !== undefined ? notes : null;
    const safeStatus   = payment_status || 'completed';

    // Chaînage fiscal NF525 (optionnel)
    let txHash = null;
    try {
      const settings = await db.get('SELECT fiscal_chain_enabled FROM `settings` LIMIT 1');
      if (settings?.fiscal_chain_enabled === 1) {
        if (!process.env.FISCAL_HMAC_KEY) {
          console.warn('[fiscal] fiscal_chain_enabled=1 mais FISCAL_HMAC_KEY manquante dans .env !');
        } else {
          const tail = await getChainTail(db);
          txHash = computeTransactionHash({
            id:               txId,
            user_id:          userId,
            transaction_date: txDate,
            items:            itemsJson,
            subtotal:         safeSubtotal,
            tax:              safeTax,
            discount:         safeDiscount,
            total:            safeTotal,
            payment_method,
            receipt_number:   receiptNumber,
          }, tail.last_hash);
        }
      }
    } catch (hashErr) {
      console.error('[fiscal] Erreur calcul hash :', hashErr.message);
    }

    const params = [
      txId, userId, itemsJson,
      safeSubtotal, safeTax, safeDiscount, safeTotal,
      payment_method, safeStatus, safeChange, safeNotes,
      receiptNumber, txHash,
    ];

    const undefinedIdx = params.findIndex(p => p === undefined);
    if (undefinedIdx !== -1) {
      throw new Error(`Param undefined at index ${undefinedIdx}`);
    }

    await db.run(
      `INSERT INTO \`transactions\`
         (id, user_id, items, subtotal, tax, discount, total,
          payment_method, payment_status, \`change\`, notes,
          receipt_number, transaction_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params
    );

    if (txHash) {
      try {
        await updateChainTail(db, txHash, txId);
      } catch (chainErr) {
        console.error('[fiscal] Erreur mise à jour fiscal_chain :', chainErr.message);
      }
    }

    return db.get('SELECT * FROM `transactions` WHERE id = ?', [txId]);
  },

  async getAll(db, { start_date, end_date, payment_method, user_id, limit = 100, offset = 0 } = {}) {
    let query = `
      SELECT t.*, u.username AS cashier_name
      FROM \`transactions\` t
      LEFT JOIN \`users\` u ON t.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    if (start_date)     { query += ' AND DATE(t.transaction_date) >= ?'; params.push(start_date);     }
    if (end_date)       { query += ' AND DATE(t.transaction_date) <= ?'; params.push(end_date);       }
    if (payment_method) { query += ' AND t.payment_method = ?';          params.push(payment_method); }
    if (user_id)        { query += ' AND t.user_id = ?';                 params.push(user_id);        }
    query += ' ORDER BY t.transaction_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    return db.all(query, params);
  },

  async getById(db, id) {
    const tx = await db.get(`
      SELECT t.*, u.username AS cashier_name
      FROM \`transactions\` t
      LEFT JOIN \`users\` u ON t.user_id = u.id
      WHERE t.id = ?
    `, [id]);
    if (tx) {
      try { tx.items = JSON.parse(tx.items); } catch { /* déjà parsé */ }
    }
    return tx;
  },

  async getDailySummary(db, date) {
    const row = await db.get(`
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
    return row || { date, transaction_count: 0, total_amount: 0 };
  },

  async getPeriodSummary(db, start, end) {
    const row = await db.get(`
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
    return row || { count: 0, total: 0, tax: 0, discount: 0 };
  },

};
