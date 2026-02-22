/**
 * Co-Caisse — Routes commandes
 * Version : 2.0.0 (MariaDB — NOW() / TIMESTAMPDIFF)
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateOrderNumber() {
  const now  = new Date();
  const date = now.toISOString().split('T')[0].replace(/-/g, '');
  const ts   = now.getTime().toString().slice(-6);
  return `CMD-${date}-${ts}`;
}

// ── POST / — Créer une commande ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      table_number, order_type = 'dine_in', items,
      subtotal, tax, discount, total,
      customer_name, customer_phone, notes,
    } = req.body;

    if (!items || total == null) {
      return res.status(400).json({ error: 'Missing required fields: items, total' });
    }

    // Vérifie que l'utilisateur du token existe toujours en DB (évite FK violation)
    const userExists = await db.get('SELECT id FROM `users` WHERE id = ?', [req.userId]);
    if (!userExists) {
      return res.status(401).json({ error: 'Session expirée — veuillez vous reconnecter' });
    }

    const id           = uuidv4();
    const order_number = generateOrderNumber();

    const params = [
      id,
      order_number,
      table_number    || null,
      order_type      || 'dine_in',
      JSON.stringify(Array.isArray(items) ? items : []),
      subtotal        != null ? Number(subtotal)  : 0,
      tax             != null ? Number(tax)       : 0,
      discount        != null ? Number(discount)  : 0,
      Number(total),
      customer_name   || null,
      customer_phone  || null,
      notes           || null,
      req.userId,
    ];

    await db.run(
      `INSERT INTO \`orders\` (
         id, order_number, table_number, order_type, status, items,
         subtotal, tax, discount, total,
         customer_name, customer_phone, notes,
         created_by, created_at
       ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      params
    );

    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    res.status(201).json(order);
  } catch (error) {
    console.error('[orders POST]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── GET / — Lister les commandes ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      status, order_type, table_number,
      start_date, end_date,
      limit = 100, offset = 0,
    } = req.query;

    const currentUser = await db.get(
      'SELECT role FROM `users` WHERE id = ?', [req.userId]
    );
    const userRole = currentUser?.role || 'cashier';

    let query  = `
      SELECT o.*, COALESCE(u.username, 'Inconnu') AS cashier_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    // Caissier : ses commandes uniquement
    if (userRole === 'cashier') {
      query += ' AND o.created_by = ?';
      params.push(req.userId);
    }

    // Cuisinier : uniquement in_kitchen et ready
    if (userRole === 'cook') {
      query += " AND o.status IN ('in_kitchen','ready')";
    }

    if (status)       { query += ' AND o.status = ?';          params.push(status);       }
    if (order_type)   { query += ' AND o.order_type = ?';      params.push(order_type);   }
    if (table_number) { query += ' AND o.table_number = ?';    params.push(table_number); }
    if (start_date)   { query += ' AND DATE(o.created_at) >= ?'; params.push(start_date); }
    if (end_date)     { query += ' AND DATE(o.created_at) <= ?'; params.push(end_date);   }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const orders = await db.all(query, params);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /kitchen/active — Commandes en cuisine ────────────────────────────────
router.get('/kitchen/active', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const orders = await db.all(`
      SELECT o.*, COALESCE(u.username, 'Inconnu') AS cashier_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      WHERE o.status = 'in_kitchen'
      ORDER BY o.kitchen_at ASC, o.created_at ASC
    `);
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /stats/summary — Statistiques du jour ─────────────────────────────────
router.get('/stats/summary', async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const today = new Date().toISOString().split('T')[0];

    const stats = await db.get(`
      SELECT
        COUNT(*)                                                  AS total_orders,
        SUM(status = 'draft')                                     AS draft_count,
        SUM(status = 'validated')                                 AS validated_count,
        SUM(status = 'in_kitchen')                                AS in_kitchen_count,
        SUM(status = 'ready')                                     AS ready_count,
        SUM(status = 'served')                                    AS served_count,
        SUM(status = 'paid')                                      AS paid_count,
        COALESCE(SUM(total), 0)                                   AS total_amount,
        COALESCE(AVG(total), 0)                                   AS average_order
      FROM \`orders\`
      WHERE DATE(created_at) = ?
    `, [today]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /alerts/pending — Commandes surveillées pour alertes ──────────────────
router.get('/alerts/pending', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const settings = await db.get('SELECT * FROM `settings` LIMIT 1');
    if (!settings || !settings.alert_enabled) return res.json([]);

    const currentUser = await db.get(
      'SELECT id, role FROM `users` WHERE id = ?', [req.userId]
    );
    const userRole = currentUser?.role || 'cashier';

    let query = `
      SELECT o.*, COALESCE(u.username, 'Inconnu') AS cashier_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      WHERE o.status IN ('draft','in_kitchen','ready','served')
    `;
    const queryParams = [];

    if (userRole === 'cashier') {
      query += ' AND o.created_by = ?';
      queryParams.push(req.userId);
    }
    query += ' ORDER BY o.created_at ASC';

    const orders = await db.all(query, queryParams);

    const enriched = orders.map(order => {
      let statusDateStr, alertMinutes, statusLabel;

      switch (order.status) {
        case 'draft':
          statusDateStr = order.created_at;
          alertMinutes  = settings.alert_draft_minutes || 15;
          statusLabel   = 'En attente de validation';
          break;
        case 'in_kitchen':
          statusDateStr = order.kitchen_at || order.created_at;
          alertMinutes  = settings.alert_kitchen_minutes || 20;
          statusLabel   = 'En cuisine';
          break;
        case 'ready':
          statusDateStr = order.ready_at || order.kitchen_at || order.created_at;
          alertMinutes  = settings.alert_ready_minutes || 5;
          statusLabel   = 'Prête';
          break;
        case 'served':
          statusDateStr = order.served_at || order.ready_at || order.created_at;
          alertMinutes  = settings.alert_served_minutes || 30;
          statusLabel   = 'Servie';
          break;
        default:
          return null;
      }

      // MariaDB avec timezone:'local' retourne des objets Date JS déjà en UTC.
      // Si c'est une string (cas rare), on la traite comme heure locale → on NE met pas Z.
      let isoDate;
      if (statusDateStr instanceof Date) {
        isoDate = statusDateStr.toISOString(); // UTC correct, avec Z
      } else {
        // String locale "YYYY-MM-DD HH:MM:SS" → on crée un Date en heure locale
        const localDate = new Date(String(statusDateStr).replace(' ', 'T'));
        isoDate = localDate.toISOString(); // convertit en UTC avec Z
      }

      return {
        id:                      order.id,
        order_number:            order.order_number,
        status:                  order.status,
        status_label:            statusLabel,
        status_since:            isoDate,
        alert_threshold_minutes: alertMinutes,
        table_number:            order.table_number,
        order_type:              order.order_type,
        cashier_name:            order.cashier_name,
        total:                   order.total,
        items:                   order.items,
        notes:                   order.notes,
        created_at:              order.created_at,
      };
    }).filter(Boolean);

    res.json(enriched);
  } catch (error) {
    console.error('[ALERTS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /stats/detailed — Temps moyen par transition ─────────────────────────
router.get('/stats/detailed', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { start_date, end_date } = req.query;

    let dateFilter = '';
    const params   = [];

    if (start_date) { dateFilter += ' AND DATE(o.created_at) >= ?'; params.push(start_date); }
    if (end_date)   { dateFilter += ' AND DATE(o.created_at) <= ?'; params.push(end_date);   }

    // Statistiques par statut
    const statusStats = await db.all(`
      SELECT
        status,
        COUNT(*)         AS count,
        SUM(total)       AS total_amount,
        AVG(total)       AS avg_amount,
        MIN(created_at)  AS oldest,
        MAX(created_at)  AS newest
      FROM \`orders\` o
      WHERE 1=1 ${dateFilter}
      GROUP BY status
    `, params);

    // ── Temps moyens de transition (julianday → TIMESTAMPDIFF) ────────────────
    // Chaque sous-requête reçoit ses propres params (pas de UNION pour éviter le doublon)
    const buildTransitionQuery = (label, col1, col2, whereExtra = '') => ({
      label,
      sql: `
        SELECT
          '${label}'                                AS transition,
          AVG(TIMESTAMPDIFF(MINUTE, ${col1}, ${col2})) AS avg_minutes,
          COUNT(*)                                  AS count
        FROM \`orders\`
        WHERE ${col2} IS NOT NULL
          AND ${col1} IS NOT NULL
          ${whereExtra}
          ${dateFilter}
      `,
    });

    const transitions = [
      buildTransitionQuery('draft_to_validated',    'created_at',    'validated_at'),
      buildTransitionQuery('validated_to_kitchen',  'validated_at',  'kitchen_at'),
      buildTransitionQuery('kitchen_to_ready',      'kitchen_at',    'ready_at'),
      buildTransitionQuery('ready_to_served',       'ready_at',      'served_at'),
      buildTransitionQuery('served_to_paid',        'served_at',     'paid_at'),
    ];

    const timeStats = await Promise.all(
      transitions.map(t => db.get(t.sql, params))
    );

    res.json({ status_stats: statusStats, time_stats: timeStats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /:id — Obtenir une commande ───────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const order = await db.get(`
      SELECT o.*, COALESCE(u.username, 'Utilisateur supprimé') AS cashier_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      WHERE o.id = ?
    `, [req.params.id]);

    if (!order) return res.status(404).json({ error: 'Order not found' });

    try { order.items = JSON.parse(order.items); } catch { /* déjà parsé */ }
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /:id — Modifier une commande (draft uniquement) ───────────────────────
router.put('/:id', async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'draft') {
      return res.status(400).json({ error: 'Can only modify draft orders' });
    }

    const {
      table_number, order_type, items,
      subtotal, tax, discount, total,
      customer_name, customer_phone, notes,
    } = req.body;

    await db.run(
      `UPDATE \`orders\` SET
         table_number = ?, order_type = ?, items = ?,
         subtotal = ?, tax = ?, discount = ?, total = ?,
         customer_name = ?, customer_phone = ?, notes = ?
       WHERE id = ?`,
      [
        table_number, order_type, JSON.stringify(items),
        subtotal, tax, discount, total,
        customer_name, customer_phone, notes,
        req.params.id,
      ]
    );

    const updated = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── DELETE /:id — Supprimer une commande (draft uniquement) ───────────────────
router.delete('/:id', async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'draft') {
      return res.status(400).json({ error: 'Can only delete draft orders' });
    }

    await db.run('DELETE FROM `orders` WHERE id = ?', [req.params.id]);
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /:id/validate — draft → in_kitchen (validation + envoi cuisine en 1 étape) ──
router.post('/:id/validate', async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'draft') {
      return res.status(400).json({ error: 'Order must be in draft status' });
    }

    // Validation + envoi cuisine en une seule opération
    await db.run(
      "UPDATE `orders` SET status = 'in_kitchen', validated_at = NOW(), kitchen_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    const updated = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /:id/send-to-kitchen — DÉSACTIVÉ (validate envoie directement en cuisine) ──
router.post('/:id/send-to-kitchen', async (req, res) => {
  return res.status(400).json({ error: 'La validation envoie directement en cuisine. Cette route n\'est plus utilisée.' });
});

// ── POST /:id/mark-ready — in_kitchen → ready (cook/admin uniquement) ─────────
router.post('/:id/mark-ready', async (req, res) => {
  try {
    const db   = req.app.locals.db;
    const user = await db.get('SELECT role FROM `users` WHERE id = ?', [req.userId]);

    if (!['admin', 'cook'].includes(user?.role)) {
      return res.status(403).json({ error: 'Seul un cuisinier ou un admin peut marquer une commande comme prête' });
    }

    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'in_kitchen') {
      return res.status(400).json({ error: 'Order must be in kitchen' });
    }

    await db.run(
      "UPDATE `orders` SET status = 'ready', ready_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    const updated = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /:id/kitchen-handle — Prise en charge par un cuisinier ───────────────
router.post('/:id/kitchen-handle', async (req, res) => {
  try {
    const db   = req.app.locals.db;
    const user = await db.get(
      'SELECT id, username, role FROM `users` WHERE id = ?', [req.userId]
    );

    if (!user || !['admin', 'cook'].includes(user.role)) {
      return res.status(403).json({ error: 'Seul un cuisinier ou admin peut prendre en charge une commande' });
    }

    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'in_kitchen') {
      return res.status(400).json({ error: 'Order must be in kitchen' });
    }

    let handlers = [];
    try { handlers = JSON.parse(order.kitchen_handlers || '[]'); } catch { handlers = []; }

    if (!handlers.find(h => h.id === user.id)) {
      handlers.push({ id: user.id, username: user.username, taken_at: new Date().toISOString() });
      await db.run(
        'UPDATE `orders` SET kitchen_handlers = ? WHERE id = ?',
        [JSON.stringify(handlers), req.params.id]
      );
    }

    const updated = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);
    res.json({ ...updated, kitchen_handlers: handlers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /:id/kitchen-comment — Commentaire cuisinier ─────────────────────────
router.post('/:id/kitchen-comment', async (req, res) => {
  try {
    const db   = req.app.locals.db;
    const user = await db.get('SELECT role FROM `users` WHERE id = ?', [req.userId]);

    if (!user || !['admin', 'cook'].includes(user.role)) {
      return res.status(403).json({ error: 'Seul un cuisinier ou admin peut commenter' });
    }

    const { comment } = req.body;
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!['in_kitchen', 'ready'].includes(order.status)) {
      return res.status(400).json({ error: 'La commande doit être en cuisine ou prête pour ajouter un commentaire' });
    }

    await db.run(
      'UPDATE `orders` SET kitchen_comment = ? WHERE id = ?',
      [comment || null, req.params.id]
    );

    res.json({ success: true, kitchen_comment: comment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /:id/mark-served — ready → served ────────────────────────────────────
router.post('/:id/mark-served', async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'ready') {
      return res.status(400).json({ error: 'Order must be ready' });
    }

    await db.run(
      "UPDATE `orders` SET status = 'served', served_at = NOW() WHERE id = ?",
      [req.params.id]
    );

    const updated = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST /:id/pay — Encaissement d'une commande ───────────────────────────────
router.post('/:id/pay', async (req, res) => {
  try {
    const db    = req.app.locals.db;
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [req.params.id]);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'paid') {
      return res.status(400).json({ error: 'Order already paid' });
    }

    const { payment_method, change: changeAmount = 0, notes = '' } = req.body;
    if (!payment_method) return res.status(400).json({ error: 'Payment method required' });

    const transactionId    = uuidv4();
    const receipt_number   = `REC-${Date.now()}`;

    await db.run(
      `INSERT INTO \`transactions\` (
         id, user_id, items, subtotal, tax, discount, total,
         payment_method, payment_status, \`change\`, notes, receipt_number, order_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
      [
        transactionId, req.userId, order.items,
        order.subtotal, order.tax, order.discount, order.total,
        payment_method, changeAmount, notes, receipt_number, order.id,
      ]
    );

    await db.run(
      "UPDATE `orders` SET status = 'paid', paid_at = NOW(), transaction_id = ? WHERE id = ?",
      [transactionId, req.params.id]
    );

    const transaction  = await db.get('SELECT * FROM `transactions` WHERE id = ?', [transactionId]);
    const updatedOrder = await db.get('SELECT * FROM `orders`       WHERE id = ?', [req.params.id]);

    res.json({ order: updatedOrder, transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

