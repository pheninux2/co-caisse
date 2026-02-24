/**
 * Co-Caisse — Routes rapports
 * Version : 2.0.0 (MariaDB — json_extract remplacé par logique JS)
 */

import express from 'express';
import { roleCheck } from '../middleware/auth.js';

const router = express.Router();

// Toutes les routes rapports : admin + manager uniquement
router.use(roleCheck(['admin', 'manager']));

// ── GET /sales/daily — Rapport des ventes journalières ────────────────────────
router.get('/sales/daily', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { start_date, end_date } = req.query;

    let query = `
      SELECT
        DATE(transaction_date)   AS date,
        COUNT(*)                 AS transaction_count,
        SUM(total)               AS total_sales,
        SUM(tax)                 AS total_tax,
        SUM(discount)            AS total_discount,
        AVG(total)               AS average_transaction,
        MIN(total)               AS min_transaction,
        MAX(total)               AS max_transaction
      FROM \`transactions\`
      WHERE 1=1
    `;
    const params = [];

    if (start_date) { query += ' AND DATE(transaction_date) >= ?'; params.push(start_date); }
    if (end_date)   { query += ' AND DATE(transaction_date) <= ?'; params.push(end_date);   }

    query += ' GROUP BY DATE(transaction_date) ORDER BY date DESC';

    const report = await db.all(query, params);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /payments — Répartition par moyen de paiement ────────────────────────
router.get('/payments', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { start_date, end_date } = req.query;

    let query = `
      SELECT
        payment_method,
        COUNT(*)    AS count,
        SUM(total)  AS total,
        AVG(total)  AS average
      FROM \`transactions\`
      WHERE 1=1
    `;
    const params = [];

    if (start_date) { query += ' AND DATE(transaction_date) >= ?'; params.push(start_date); }
    if (end_date)   { query += ' AND DATE(transaction_date) <= ?'; params.push(end_date);   }

    query += ' GROUP BY payment_method ORDER BY total DESC';

    const report = await db.all(query, params);
    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /products — Top produits vendus ───────────────────────────────────────
// Ancienne version : json_extract SQL (invalide en MariaDB sur un tableau JSON)
// Nouvelle version : on charge les produits + toutes les transactions en mémoire,
//                    on parse le JSON items côté JS, on agrège par produit.
//                    Fonctionne avec n'importe quel moteur SQL.
router.get('/products', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { start_date, end_date } = req.query;

    // 1. Récupérer les produits actifs comme référentiel
    const products = await db.all(
      'SELECT id, name, price FROM `products` WHERE active = 1'
    );
    const productMap = Object.fromEntries(products.map(p => [p.id, p]));

    // 2. Récupérer les transactions (avec filtre de date optionnel)
    let txQuery  = 'SELECT items, total FROM `transactions` WHERE 1=1';
    const params = [];
    if (start_date) { txQuery += ' AND DATE(transaction_date) >= ?'; params.push(start_date); }
    if (end_date)   { txQuery += ' AND DATE(transaction_date) <= ?'; params.push(end_date);   }

    const transactions = await db.all(txQuery, params);

    // 3. Agréger côté JS — items est un tableau JSON [{id, name, qty, price, ...}]
    const stats = {}; // { productId: { name, quantity, revenue, times_in_transaction } }

    for (const tx of transactions) {
      let items = [];
      try {
        items = typeof tx.items === 'string' ? JSON.parse(tx.items) : tx.items;
      } catch { continue; }

      if (!Array.isArray(items)) continue;

      for (const item of items) {
        const pid = item.id || item.product_id;
        if (!pid) continue;

        if (!stats[pid]) {
          const ref = productMap[pid];
          stats[pid] = {
            id:                   pid,
            name:                 item.name || ref?.name || 'Produit inconnu',
            times_in_transaction: 0,
            quantity_sold:        0,
            revenue:              0,
          };
        }

        const qty    = Number(item.quantity || item.qty || 1);
        const price  = Number(item.price || item.unit_price || 0);

        stats[pid].times_in_transaction += 1;
        stats[pid].quantity_sold        += qty;
        stats[pid].revenue              += qty * price;
      }
    }

    // 4. Trier par revenue décroissant
    const report = Object.values(stats).sort((a, b) => b.revenue - a.revenue);

    res.json(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

