/**
 * Co-Caisse — OrderService
 */
import { v4 as uuidv4 } from 'uuid';

function generateOrderNumber() {
  const now  = new Date();
  const date = now.toISOString().split('T')[0].replace(/-/g, '');
  const ts   = now.getTime().toString().slice(-6);
  return `CMD-${date}-${ts}`;
}

export const OrderService = {

  async create(db, data, userId) {
    const {
      table_number, order_type = 'dine_in', items,
      subtotal, tax, discount, total,
      customer_name, customer_phone, notes,
    } = data;

    const userExists = await db.get('SELECT id FROM `users` WHERE id = ?', [userId]);
    if (!userExists) {
      const err = new Error('Session expirée — veuillez vous reconnecter');
      err.status = 401;
      throw err;
    }

    const id           = uuidv4();
    const order_number = generateOrderNumber();

    await db.run(
      `INSERT INTO \`orders\` (
         id, order_number, table_number, order_type, status, items,
         subtotal, tax, discount, total,
         customer_name, customer_phone, notes,
         created_by, created_at
       ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        id, order_number,
        table_number   || null,
        order_type     || 'dine_in',
        JSON.stringify(Array.isArray(items) ? items : []),
        subtotal       != null ? Number(subtotal)  : 0,
        tax            != null ? Number(tax)       : 0,
        discount       != null ? Number(discount)  : 0,
        Number(total),
        customer_name  || null,
        customer_phone || null,
        notes          || null,
        userId,
      ]
    );

    return db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
  },

  async getAll(db, filters = {}, userId, userRole) {
    const {
      status, order_type, table_number,
      start_date, end_date,
      limit = 100, offset = 0,
    } = filters;

    let query = `
      SELECT o.*, COALESCE(u.username, 'Inconnu') AS cashier_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      WHERE 1=1
    `;
    const params = [];

    if (userRole === 'cashier') { query += ' AND o.created_by = ?'; params.push(userId); }
    if (userRole === 'cook')    { query += " AND o.status IN ('in_kitchen','ready')"; }

    if (status)       { query += ' AND o.status = ?';            params.push(status);       }
    if (order_type)   { query += ' AND o.order_type = ?';        params.push(order_type);   }
    if (table_number) { query += ' AND o.table_number = ?';      params.push(table_number); }
    if (start_date)   { query += ' AND DATE(o.created_at) >= ?'; params.push(start_date);   }
    if (end_date)     { query += ' AND DATE(o.created_at) <= ?'; params.push(end_date);     }

    query += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    return db.all(query, params);
  },

  async getById(db, id) {
    const order = await db.get(`
      SELECT o.*, COALESCE(u.username, 'Utilisateur supprimé') AS cashier_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      WHERE o.id = ?
    `, [id]);
    if (order) {
      try { order.items = JSON.parse(order.items); } catch { /* déjà parsé */ }
    }
    return order;
  },

  async update(db, id, data) {
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    if (order.status !== 'draft') {
      const err = new Error('Can only modify draft orders');
      err.status = 400;
      throw err;
    }
    const {
      table_number, order_type, items,
      subtotal, tax, discount, total,
      customer_name, customer_phone, notes,
    } = data;
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
        id,
      ]
    );
    return db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
  },

  async remove(db, id) {
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    if (order.status !== 'draft') {
      const err = new Error('Can only delete draft orders');
      err.status = 400;
      throw err;
    }
    await db.run('DELETE FROM `orders` WHERE id = ?', [id]);
    return true;
  },

  async getKitchenActive(db) {
    return db.all(`
      SELECT o.*, COALESCE(u.username, 'Inconnu') AS cashier_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      WHERE o.status = 'in_kitchen'
      ORDER BY o.kitchen_at ASC, o.created_at ASC
    `);
  },

  async getDailySummary(db) {
    const today = new Date().toISOString().split('T')[0];
    return db.get(`
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
  },

  async getAlertsPending(db, userId, userRole) {
    const settings = await db.get('SELECT * FROM `settings` LIMIT 1');
    if (!settings || !settings.alert_enabled) return [];

    let query = `
      SELECT o.*, COALESCE(u.username, 'Inconnu') AS cashier_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      WHERE o.status IN ('draft','in_kitchen','ready','served')
    `;
    const queryParams = [];
    if (userRole === 'cashier') { query += ' AND o.created_by = ?'; queryParams.push(userId); }
    query += ' ORDER BY o.created_at ASC';

    const orders = await db.all(query, queryParams);

    return orders.map(order => {
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

      let isoDate;
      if (statusDateStr instanceof Date) {
        isoDate = statusDateStr.toISOString();
      } else {
        isoDate = new Date(String(statusDateStr).replace(' ', 'T')).toISOString();
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
  },

  async getDetailedStats(db, { start_date, end_date } = {}) {
    let dateFilter = '';
    const params   = [];
    if (start_date) { dateFilter += ' AND DATE(o.created_at) >= ?'; params.push(start_date); }
    if (end_date)   { dateFilter += ' AND DATE(o.created_at) <= ?'; params.push(end_date);   }

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

    const buildTransitionQuery = (label, col1, col2) => ({
      label,
      sql: `
        SELECT
          '${label}'                                AS transition,
          AVG(TIMESTAMPDIFF(MINUTE, ${col1}, ${col2})) AS avg_minutes,
          COUNT(*)                                  AS count
        FROM \`orders\`
        WHERE ${col2} IS NOT NULL
          AND ${col1} IS NOT NULL
          ${dateFilter}
      `,
    });

    const transitions = [
      buildTransitionQuery('draft_to_validated',   'created_at',   'validated_at'),
      buildTransitionQuery('validated_to_kitchen', 'validated_at', 'kitchen_at'),
      buildTransitionQuery('kitchen_to_ready',     'kitchen_at',   'ready_at'),
      buildTransitionQuery('ready_to_served',      'ready_at',     'served_at'),
      buildTransitionQuery('served_to_paid',       'served_at',    'paid_at'),
    ];

    const timeStats = await Promise.all(transitions.map(t => db.get(t.sql, params)));
    return { status_stats: statusStats, time_stats: timeStats };
  },

  // ── Transitions de statut ──────────────────────────────────────────────────

  async validate(db, id) {
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    if (order.status !== 'draft') {
      const err = new Error('Order must be in draft status');
      err.status = 400;
      throw err;
    }
    await db.run(
      "UPDATE `orders` SET status = 'in_kitchen', validated_at = NOW(), kitchen_at = NOW() WHERE id = ?",
      [id]
    );
    return db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
  },

  async markReady(db, id, userId) {
    const user = await db.get('SELECT role FROM `users` WHERE id = ?', [userId]);
    if (!['admin', 'cook'].includes(user?.role)) {
      const err = new Error('Seul un cuisinier ou un admin peut marquer une commande comme prête');
      err.status = 403;
      throw err;
    }
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    if (order.status !== 'in_kitchen') {
      const err = new Error('Order must be in kitchen');
      err.status = 400;
      throw err;
    }
    await db.run(
      "UPDATE `orders` SET status = 'ready', ready_at = NOW() WHERE id = ?",
      [id]
    );
    return db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
  },

  async kitchenHandle(db, id, userId) {
    const user = await db.get('SELECT id, username, role FROM `users` WHERE id = ?', [userId]);
    if (!user || !['admin', 'cook'].includes(user.role)) {
      const err = new Error('Seul un cuisinier ou admin peut prendre en charge une commande');
      err.status = 403;
      throw err;
    }
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    if (order.status !== 'in_kitchen') {
      const err = new Error('Order must be in kitchen');
      err.status = 400;
      throw err;
    }
    let handlers = [];
    try { handlers = JSON.parse(order.kitchen_handlers || '[]'); } catch { handlers = []; }

    if (!handlers.find(h => h.id === user.id)) {
      handlers.push({ id: user.id, username: user.username, taken_at: new Date().toISOString() });
      await db.run(
        'UPDATE `orders` SET kitchen_handlers = ? WHERE id = ?',
        [JSON.stringify(handlers), id]
      );
    }
    const updated = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    return { ...updated, kitchen_handlers: handlers };
  },

  async kitchenComment(db, id, comment, userId) {
    const user = await db.get('SELECT role FROM `users` WHERE id = ?', [userId]);
    if (!user || !['admin', 'cook'].includes(user.role)) {
      const err = new Error('Seul un cuisinier ou admin peut commenter');
      err.status = 403;
      throw err;
    }
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    if (!['in_kitchen', 'ready'].includes(order.status)) {
      const err = new Error('La commande doit être en cuisine ou prête pour ajouter un commentaire');
      err.status = 400;
      throw err;
    }
    await db.run('UPDATE `orders` SET kitchen_comment = ? WHERE id = ?', [comment || null, id]);
    return { success: true, kitchen_comment: comment };
  },

  async markServed(db, id) {
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    if (order.status !== 'ready') {
      const err = new Error('Order must be ready');
      err.status = 400;
      throw err;
    }
    await db.run(
      "UPDATE `orders` SET status = 'served', served_at = NOW() WHERE id = ?",
      [id]
    );
    return db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
  },

  async pay(db, id, data, userId) {
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    if (order.status === 'paid') {
      const err = new Error('Order already paid');
      err.status = 400;
      throw err;
    }
    const { payment_method, change: changeAmount = 0, notes = '' } = data;
    const transactionId  = uuidv4();
    const receipt_number = `REC-${Date.now()}`;

    await db.run(
      `INSERT INTO \`transactions\` (
         id, user_id, items, subtotal, tax, discount, total,
         payment_method, payment_status, \`change\`, notes, receipt_number, order_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
      [
        transactionId, userId, order.items,
        order.subtotal, order.tax, order.discount, order.total,
        payment_method, changeAmount, notes, receipt_number, order.id,
      ]
    );

    await db.run(
      "UPDATE `orders` SET status = 'paid', paid_at = NOW(), transaction_id = ? WHERE id = ?",
      [transactionId, id]
    );

    const transaction  = await db.get('SELECT * FROM `transactions` WHERE id = ?', [transactionId]);
    const updatedOrder = await db.get('SELECT * FROM `orders`       WHERE id = ?', [id]);
    return { order: updatedOrder, transaction };
  },

};
