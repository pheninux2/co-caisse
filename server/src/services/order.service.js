/**
 * Co-Caisse — OrderService
 */
import { v4 as uuidv4 } from 'uuid';
import { AuditService } from './audit.service.js';

function generateOrderNumber() {
  const now  = new Date();
  const date = now.toISOString().split('T')[0].replace(/-/g, '');
  const ts   = now.getTime().toString().slice(-6);
  return `CMD-${date}-${ts}`;
}

export const OrderService = {

  // ── Retourne la commande active d'une table, ou null ──────────────────────────
  async getActiveByTable(db, table_number) {
    if (!table_number) return null;
    return db.get(`
      SELECT o.id, o.order_number, o.status, o.total, o.created_at,
             COALESCE(u.username, 'Inconnu') AS cashier_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      WHERE o.table_number = ?
        AND o.status IN ('draft','in_kitchen','ready','served')
      ORDER BY o.created_at DESC
      LIMIT 1
    `, [table_number]);
  },

  async create(db, data, userId) {
    const {
      table_number, order_type = 'dine_in', items,
      subtotal, tax, discount, total,
      customer_name, customer_phone, notes,
      force = false,
    } = data;

    const userExists = await db.get('SELECT id FROM `users` WHERE id = ?', [userId]);
    if (!userExists) {
      const err = new Error('Session expirée — veuillez vous reconnecter');
      err.status = 401;
      throw err;
    }

    // ── Contrôle attribution de table (prioritaire sur le contrôle d'occupation) ─
    // Si une table est assignée à un autre caissier, bloquer immédiatement,
    // même si la table est occupée (évite d'afficher le popup de conflit au lieu de l'erreur d'attribution).
    if (table_number && order_type === 'dine_in') {
      const actor = await db.get('SELECT role FROM `users` WHERE id = ?', [userId]);
      if (!['admin', 'manager'].includes(actor?.role)) {
        const table = await db.get(
          'SELECT assigned_waiter_id FROM `tables` WHERE label = ? AND active = 1 LIMIT 1',
          [table_number]
        );
        if (table?.assigned_waiter_id && table.assigned_waiter_id !== userId) {
          const assignedUser = await db.get('SELECT username FROM `users` WHERE id = ?', [table.assigned_waiter_id]);
          const err = new Error(
            `La table ${table_number} est assignée à ${assignedUser?.username || 'un autre caissier'} — vous ne pouvez pas y ouvrir une commande`
          );
          err.status = 403;
          throw err;
        }
      }
    }

    // ── Contrôle table occupée (uniquement sur place, sauf si force:true) ──────
    if (table_number && order_type === 'dine_in' && !force) {
      const existing = await this.getActiveByTable(db, table_number);
      if (existing) {
        const statusLabels = { draft: 'En attente', in_kitchen: 'En cuisine', ready: 'Prête', served: 'Servie' };
        const err = new Error(`Table ${table_number} occupée — commande ${existing.order_number} (${statusLabels[existing.status] || existing.status}) en cours`);
        err.status = 409;
        err.conflict = existing;
        throw err;
      }
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

  async getAll(db, filters = {}, userId, userRole, canSeeAll = false) {
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

    if (userRole === 'cashier' && !canSeeAll) { query += ' AND o.created_by = ?'; params.push(userId); }
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
      SELECT o.*,
             COALESCE(u.username,  'Utilisateur supprimé') AS cashier_name,
             COALESCE(uc.username, 'Inconnu')              AS cancelled_by_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u  ON o.created_by   = u.id
      LEFT JOIN \`users\` uc ON o.cancelled_by = uc.id
      WHERE o.id = ?
    `, [id]);
    if (order) {
      try { order.items = JSON.parse(order.items); } catch { /* déjà parsé */ }
    }
    return order;
  },

  // ── Vérifie si l'utilisateur peut modifier/annuler des commandes ──────────
  async _checkModifyPermission(db, userId) {
    const user = await db.get('SELECT role, can_modify_orders FROM `users` WHERE id = ?', [userId]);
    if (!user) {
      const err = new Error('Utilisateur introuvable');
      err.status = 401;
      throw err;
    }
    if (user.role === 'admin') return; // admin toujours autorisé
    if (user.can_modify_orders) return; // cashier avec permission accordée
    const err = new Error('Vous n\'avez pas la permission de modifier ou annuler des commandes');
    err.status = 403;
    throw err;
  },

  // ── Vérifie si la commande est modifiable (non prise en charge par cuisine) ─
  _checkOrderEditable(order) {
    if (!['draft', 'in_kitchen'].includes(order.status)) {
      const err = new Error('Seules les commandes en attente ou en cuisine (non prise en charge) peuvent être modifiées');
      err.status = 400;
      throw err;
    }
    if (order.status === 'in_kitchen') {
      let handlers = [];
      try { handlers = JSON.parse(order.kitchen_handlers || '[]'); } catch { handlers = []; }
      if (handlers.length > 0) {
        const err = new Error('Cette commande a déjà été prise en charge par la cuisine — modification impossible');
        err.status = 400;
        throw err;
      }
    }
  },

  async update(db, id, data, userId) {
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    await this._checkModifyPermission(db, userId);
    this._checkOrderEditable(order);
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
    // ── Audit log ────────────────────────────────────────────────────────────
    const actor = await db.get('SELECT username FROM `users` WHERE id = ?', [userId]);
    await AuditService.log(db, {
      userId,
      userName:   actor?.username || null,
      action:     'order.update',
      targetType: 'order',
      targetId:   id,
      details:    { order_number: order.order_number, fields_updated: Object.keys(data) },
    });
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

  async cancel(db, id, userId) {
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    await this._checkModifyPermission(db, userId);
    this._checkOrderEditable(order);
    await db.run(
      "UPDATE `orders` SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = ? WHERE id = ?",
      [userId, id]
    );
    // ── Audit log ────────────────────────────────────────────────────────────
    const actor = await db.get('SELECT username FROM `users` WHERE id = ?', [userId]);
    await AuditService.log(db, {
      userId,
      userName:   actor?.username || null,
      action:     'order.cancel',
      targetType: 'order',
      targetId:   id,
      details:    { order_number: order.order_number, previous_status: order.status },
    });
    return db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
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

      // ── Normalisation UTC ──────────────────────────────────────────────────
      // Le pool mysql2 est configuré avec timezone:'Z' → les objets Date retournés
      // sont déjà en UTC. .toISOString() donne donc la valeur correcte directement.
      // Pour les strings brutes (cas sans dateStrings:false), on suffixe 'Z' pour
      // forcer l'interprétation UTC (sans ça JS traiterait la string comme heure locale).
      let isoDate;
      if (statusDateStr instanceof Date) {
        isoDate = statusDateStr.toISOString();

        // ── Diagnostic temporaire ──────────────────────────────────────────
        console.log('[ALERT TZ] created_at brut (DB)  :', statusDateStr);
        console.log('[ALERT TZ] isoDate UTC           :', isoDate);
        console.log('[ALERT TZ] Date.now() serveur    :', new Date().toISOString());
        console.log('[ALERT TZ] Delta (ms)            :', Date.now() - new Date(isoDate).getTime());
        // ──────────────────────────────────────────────────────────────────
      } else {
        // String brute "YYYY-MM-DD HH:MM:SS" sans TZ → suffixer 'Z' pour UTC
        isoDate = new Date(String(statusDateStr).replace(' ', 'T') + 'Z').toISOString();
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
    if (order.status !== 'served') {
      const err = new Error('La commande doit être marquée "servie" avant de pouvoir être encaissée');
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

  // ── Suppression définitive d'une commande annulée (admin uniquement) ─────────
  async permanentDelete(db, id, userId) {
    const actor = await db.get('SELECT role FROM `users` WHERE id = ?', [userId]);
    if (actor?.role !== 'admin') {
      const err = new Error('Seul un administrateur peut supprimer définitivement une commande');
      err.status = 403;
      throw err;
    }
    const order = await db.get('SELECT * FROM `orders` WHERE id = ?', [id]);
    if (!order) return null;
    if (order.status !== 'cancelled') {
      const err = new Error('Seules les commandes annulées peuvent être supprimées définitivement');
      err.status = 400;
      throw err;
    }
    await db.run('DELETE FROM `orders` WHERE id = ?', [id]);
    await AuditService.log(db, {
      userId,
      userName:   actor?.username || null,
      action:     'order.permanent_delete',
      targetType: 'order',
      targetId:   id,
      details:    { order_number: order.order_number },
    });
    return { deleted: true, order_number: order.order_number };
  },

  // ── Analytics restaurant ──────────────────────────────────────────────────────
  async getAnalytics(db, { start_date, end_date, period = 'day' } = {}) {
    const dateFilter = [];
    const params     = [];

    if (start_date) { dateFilter.push('DATE(o.created_at) >= ?'); params.push(start_date); }
    if (end_date)   { dateFilter.push('DATE(o.created_at) <= ?'); params.push(end_date); }

    const where = dateFilter.length ? 'WHERE ' + dateFilter.join(' AND ') : '';

    // ── 1. KPI globaux ──────────────────────────────────────────────────────
    const kpi = await db.get(`
      SELECT
        COUNT(*)                                           AS total_orders,
        SUM(CASE WHEN status = 'paid'      THEN 1 ELSE 0 END) AS paid_orders,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(CASE WHEN status NOT IN ('cancelled') AND DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) AS orders_today,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END)  AS revenue_total,
        SUM(CASE WHEN status = 'paid' AND DATE(created_at) = CURDATE() THEN total ELSE 0 END) AS revenue_today,
        AVG(CASE WHEN status = 'paid' THEN total END)          AS avg_ticket
      FROM \`orders\` o
      ${where}
    `, params);

    // ── 2. Commandes par heure (0-23) ──────────────────────────────────────
    const byHour = await db.all(`
      SELECT
        HOUR(o.created_at)               AS hour,
        COUNT(*)                         AS orders_count,
        SUM(CASE WHEN o.status = 'paid' THEN o.total ELSE 0 END) AS revenue
      FROM \`orders\` o
      ${where}
      GROUP BY HOUR(o.created_at)
      ORDER BY HOUR(o.created_at)
    `, params);

    // ── 3. Top produits (+ heure de pointe par produit) ───────────────────
    const productWhere = dateFilter.length
      ? 'WHERE ' + dateFilter.join(' AND ') + " AND o.status NOT IN ('cancelled')"
      : "WHERE o.status NOT IN ('cancelled')";
    const allOrders = await db.all(`
      SELECT o.items, o.created_at
      FROM \`orders\` o
      ${productWhere}
      ORDER BY o.created_at
    `, params);

    // Agrégation produits côté JS (les items sont en JSON)
    const productMap = new Map();
    for (const row of allOrders) {
      const hour  = new Date(row.created_at).getUTCHours();
      const items = JSON.parse(row.items || '[]');
      for (const item of items) {
        const key = item.id || item.name;
        if (!productMap.has(key)) {
          productMap.set(key, { id: key, name: item.name, qty: 0, revenue: 0, hours: new Array(24).fill(0) });
        }
        const p = productMap.get(key);
        p.qty     += item.quantity || 1;
        p.revenue += (item.price || 0) * (item.quantity || 1);
        p.hours[hour] += item.quantity || 1;
      }
    }
    const topProducts = [...productMap.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 15)
      .map(p => ({
        ...p,
        peak_hour: p.hours.indexOf(Math.max(...p.hours)),
        hours: undefined, // ne pas surcharger la réponse
      }));

    // ── 4. Historique par période (jour / mois / année) ────────────────────
    const groupFormat = period === 'year'  ? '%Y'
                      : period === 'month' ? '%Y-%m'
                      :                     '%Y-%m-%d';

    const history = await db.all(`
      SELECT
        DATE_FORMAT(o.created_at, '${groupFormat}')       AS period_label,
        COUNT(*)                                           AS total_orders,
        SUM(CASE WHEN o.status = 'paid'      THEN 1 ELSE 0 END) AS paid_orders,
        SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(CASE WHEN o.status = 'paid' THEN o.total ELSE 0 END) AS revenue,
        AVG(CASE WHEN o.status = 'paid' THEN o.total END)        AS avg_ticket
      FROM \`orders\` o
      ${where}
      GROUP BY period_label
      ORDER BY period_label DESC
      LIMIT 90
    `, params);

    // ── 5. Performance par caissier ────────────────────────────────────────
    const byCashier = await db.all(`
      SELECT
        u.username                                         AS cashier_name,
        COUNT(o.id)                                        AS total_orders,
        SUM(CASE WHEN o.status = 'paid' THEN 1 ELSE 0 END) AS paid_orders,
        SUM(CASE WHEN o.status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_orders,
        SUM(CASE WHEN o.status = 'paid' THEN o.total ELSE 0 END) AS revenue,
        AVG(CASE WHEN o.status = 'paid' THEN o.total END)  AS avg_ticket
      FROM \`orders\` o
      LEFT JOIN \`users\` u ON o.created_by = u.id
      ${where}
      GROUP BY o.created_by, u.username
      ORDER BY revenue DESC
    `, params);

    // ── 6. Répartition type de commande ───────────────────────────────────
    const byType = await db.all(`
      SELECT
        order_type,
        COUNT(*)                                                AS orders_count,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END)   AS revenue
      FROM \`orders\` o
      ${where}
      GROUP BY order_type
    `, params);

    // ── 7. Commandes annulées (détail) ────────────────────────────────────
    const cancelledOrders = await db.all(`
      SELECT
        o.*,
        COALESCE(u.username,  'Inconnu') AS cashier_name,
        COALESCE(uc.username, 'Inconnu') AS cancelled_by_name
      FROM \`orders\` o
      LEFT JOIN \`users\` u  ON o.created_by   = u.id
      LEFT JOIN \`users\` uc ON o.cancelled_by = uc.id
      WHERE o.status = 'cancelled'
      ${dateFilter.length ? 'AND ' + dateFilter.join(' AND ') : ''}
      ORDER BY o.cancelled_at DESC
      LIMIT 200
    `, params);

    return {
      kpi,
      by_hour:          byHour,
      top_products:     topProducts,
      history,
      by_cashier:       byCashier,
      by_type:          byType,
      cancelled_orders: cancelledOrders,
    };
  },

};
