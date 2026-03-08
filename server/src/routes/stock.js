/**
 * Co-Caisse — Routes Gestion des Stocks
 * ============================================================
 * GET  /api/stock                    → rapport stock tous produits
 * GET  /api/stock/alerts             → produits en alerte (stock ≤ seuil)
 * GET  /api/stock/:productId/movements → historique mouvements d'un produit
 * POST /api/stock/:productId/adjust  → ajustement manuel du stock
 * ============================================================
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { roleCheck } from '../middleware/auth.js';

const router = express.Router();

// ── GET / — Rapport stock complet ─────────────────────────────────────────────
router.get('/', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const products = await db.all(`
      SELECT
        p.id, p.name, p.stock, p.stock_enabled, p.stock_alert_threshold, p.stock_unit,
        c.name AS category_name,
        CASE
          WHEN p.stock_enabled = 0                        THEN 'disabled'
          WHEN p.stock <= 0                               THEN 'out'
          WHEN p.stock <= p.stock_alert_threshold         THEN 'low'
          ELSE                                                 'ok'
        END AS stock_status
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.active = 1
      ORDER BY stock_status ASC, p.name ASC
    `);
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /alerts — Produits en rupture ou alerte ───────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const alerts = await db.all(`
      SELECT
        p.id, p.name, p.stock, p.stock_alert_threshold, p.stock_unit,
        c.name AS category_name,
        CASE
          WHEN p.stock <= 0                         THEN 'out'
          WHEN p.stock <= p.stock_alert_threshold   THEN 'low'
        END AS alert_type
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.active = 1
        AND p.stock_enabled = 1
        AND p.stock <= p.stock_alert_threshold
      ORDER BY p.stock ASC
    `);
    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /:productId/movements — Historique des mouvements ────────────────────
router.get('/:productId/movements', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const limit = parseInt(req.query.limit) || 50;
    const movements = await db.all(`
      SELECT
        sm.id, sm.quantity, sm.stock_after, sm.reason, sm.reference, sm.created_at,
        u.username AS user_name
      FROM stock_movements sm
      LEFT JOIN users u ON sm.user_id = u.id
      WHERE sm.product_id = ?
      ORDER BY sm.created_at DESC
      LIMIT ?
    `, [req.params.productId, limit]);
    res.json(movements);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:productId/adjust — Ajustement manuel du stock ─────────────────────
router.post('/:productId/adjust', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db        = req.app.locals.db;
    const { productId } = req.params;
    const {
      quantity,             // delta : +X ou -X  (peut aussi être absolu si mode='set')
      mode    = 'delta',    // 'delta' | 'set'
      reason  = 'adjustment',
      reference = null,
    } = req.body;

    if (quantity == null || isNaN(Number(quantity))) {
      return res.status(400).json({ error: 'quantity requis (nombre)' });
    }

    const product = await db.get(
      'SELECT id, name, stock, stock_enabled FROM products WHERE id = ? AND active = 1',
      [productId]
    );
    if (!product) return res.status(404).json({ error: 'Produit introuvable' });

    // Calculer le nouveau stock
    const currentStock = Number(product.stock) || 0;
    const delta        = mode === 'set'
      ? Number(quantity) - currentStock
      : Number(quantity);
    const newStock     = Math.max(0, currentStock + delta);

    // Mettre à jour le stock produit
    await db.run(
      'UPDATE products SET stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newStock, productId]
    );

    // Enregistrer le mouvement
    await db.run(
      `INSERT INTO stock_movements (id, product_id, quantity, stock_after, reason, reference, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), productId, delta, newStock, reason, reference, req.userId]
    );

    res.json({
      product_id:  productId,
      stock_before: currentStock,
      delta,
      stock_after:  newStock,
      reason,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /:productId/settings — Modifier stock_enabled / seuil / unité ────────
router.post('/:productId/settings', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { productId } = req.params;
    const {
      stock_enabled,
      stock_alert_threshold,
      stock_unit,
    } = req.body;

    const fields = [];
    const params = [];
    if (stock_enabled         != null) { fields.push('stock_enabled = ?');         params.push(stock_enabled ? 1 : 0); }
    if (stock_alert_threshold != null) { fields.push('stock_alert_threshold = ?'); params.push(Number(stock_alert_threshold)); }
    if (stock_unit            != null) { fields.push('stock_unit = ?');            params.push(stock_unit); }

    if (fields.length === 0) return res.status(400).json({ error: 'Aucun champ à mettre à jour' });

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(productId);

    await db.run(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, params);

    const product = await db.get(
      'SELECT id, name, stock, stock_enabled, stock_alert_threshold, stock_unit FROM products WHERE id = ?',
      [productId]
    );
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

