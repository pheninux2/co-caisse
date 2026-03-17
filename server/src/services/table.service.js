/**
 * Co-Caisse — TableService (plan de salle + tables)
 */
import { v4 as uuidv4 } from 'uuid';

export const FLOOR_PLAN_ID = 'default-floor-plan';

export const TableService = {

  // ── Plan de salle ──────────────────────────────────────────────────────────

  async getLayout(db) {
    const floorPlan = await db.get(
      'SELECT id, name, width, height, background_color, background_image_name, drawing_data, updated_at FROM `floor_plans` WHERE id = ? LIMIT 1',
      [FLOOR_PLAN_ID]
    );
    const tables = await db.all(
      'SELECT * FROM `tables` WHERE floor_plan_id = ? AND active = 1 ORDER BY label ASC',
      [FLOOR_PLAN_ID]
    );
    return {
      floor_plan: floorPlan || { id: FLOOR_PLAN_ID, name: 'Salle principale', width: 1100, height: 650, background_color: '#f3f4f6' },
      tables:     tables   || [],
    };
  },

  async updateLayout(db, data) {
    const { name, width, height, background_color } = data;
    await db.run(
      `UPDATE \`floor_plans\`
       SET name             = COALESCE(?, name),
           width            = COALESCE(?, width),
           height           = COALESCE(?, height),
           background_color = COALESCE(?, background_color),
           updated_at       = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name || null, width || null, height || null, background_color || null, FLOOR_PLAN_ID]
    );
    return db.get(
      'SELECT id, name, width, height, background_color, background_image_name FROM `floor_plans` WHERE id = ?',
      [FLOOR_PLAN_ID]
    );
  },

  async getStatus(db) {
    const tables = await db.all(
      'SELECT id, label, shape, x, y, width, height, capacity FROM `tables` WHERE floor_plan_id = ? AND active = 1',
      [FLOOR_PLAN_ID]
    );
    if (!tables.length) return [];

    return Promise.all(tables.map(async (table) => {
      const activeOrders = await db.all(
        `SELECT o.id, o.order_number, o.status, o.total, o.created_at,
                o.items, u.username AS waiter_name
         FROM \`orders\` o
         LEFT JOIN \`users\` u ON u.id = o.created_by
         WHERE o.table_number = ?
           AND o.status NOT IN ('paid', 'cancelled')
         ORDER BY o.created_at DESC`,
        [table.label]
      );

      const order = activeOrders[0] || null; // commande la plus récente = référence

      let computed_status = 'free';
      if (order) {
        if      (order.status === 'draft')      computed_status = 'draft';
        else if (order.status === 'validated')  computed_status = 'draft';
        else if (order.status === 'in_kitchen') computed_status = 'in_kitchen';
        else if (order.status === 'ready')      computed_status = 'ready';
        else if (order.status === 'served')     computed_status = 'served';
        else                                    computed_status = 'draft';
      }

      let elapsed_minutes = null;
      if (order?.created_at) {
        elapsed_minutes = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
      }

      let item_count = 0;
      if (order?.items) {
        try {
          const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
          item_count  = Array.isArray(items) ? items.reduce((s, i) => s + (i.quantity || 1), 0) : 0;
        } catch (_) {}
      }

      // Enrichir chaque commande pour l'affichage popover
      const orders = activeOrders.map(o => {
        let o_item_count = 0;
        if (o.items) {
          try {
            const it = typeof o.items === 'string' ? JSON.parse(o.items) : o.items;
            o_item_count = Array.isArray(it) ? it.reduce((s, i) => s + (i.quantity || 1), 0) : 0;
          } catch (_) {}
        }
        return {
          id:              o.id,
          order_number:    o.order_number,
          status:          o.status,
          total:           o.total,
          opened_at:       o.created_at,
          waiter_name:     o.waiter_name,
          item_count:      o_item_count,
          elapsed_minutes: o.created_at ? Math.floor((Date.now() - new Date(o.created_at).getTime()) / 60000) : null,
        };
      });

      return {
        ...table,
        computed_status,
        order_id:       order?.id           || null,
        order_number:   order?.order_number || null,
        order_ref:      order?.order_number || null,
        order_status:   order?.status       || null,
        order_total:    order?.total        || null,
        total_amount:   order?.total        || null,
        waiter_name:    order?.waiter_name  || null,
        opened_at:      order?.created_at   || null,
        item_count,
        elapsed_minutes,
        orders, // toutes les commandes actives de la table
      };
    }));
  },

  async getBackground(db) {
    const row = await db.get(
      'SELECT background_image, background_image_name FROM `floor_plans` WHERE id = ?',
      [FLOOR_PLAN_ID]
    );
    if (!row?.background_image) return { image: null };
    return { image: row.background_image, filename: row.background_image_name };
  },

  async setBackground(db, dataUrl, filename) {
    await db.run(
      'UPDATE `floor_plans` SET background_image = ?, background_image_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [dataUrl, filename, FLOOR_PLAN_ID]
    );
  },

  async removeBackground(db) {
    await db.run(
      'UPDATE `floor_plans` SET background_image = NULL, background_image_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [FLOOR_PLAN_ID]
    );
  },

  async getDrawing(db) {
    const row = await db.get('SELECT drawing_data FROM `floor_plans` WHERE id = ?', [FLOOR_PLAN_ID]);
    let elements = [];
    if (row?.drawing_data) {
      try { elements = JSON.parse(row.drawing_data); } catch (_) {}
    }
    return elements;
  },

  async saveDrawing(db, elements = []) {
    await db.run(
      'UPDATE `floor_plans` SET drawing_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(elements), FLOOR_PLAN_ID]
    );
    return elements.length;
  },

  // ── Tables ─────────────────────────────────────────────────────────────────

  async getAll(db) {
    return db.all(
      'SELECT id, label, capacity, shape FROM `tables` WHERE active = 1 ORDER BY label ASC'
    );
  },

  async create(db, data) {
    const { label, shape = 'rect', x = 50, y = 50, width = 80, height = 80, capacity = 4 } = data;
    const existing = await db.get('SELECT id FROM `tables` WHERE label = ? LIMIT 1', [label.trim()]);
    if (existing) {
      const err = new Error(`Une table "${label}" existe déjà.`);
      err.status = 409;
      throw err;
    }
    const id = uuidv4();
    await db.run(
      'INSERT INTO `tables` (id, floor_plan_id, label, shape, x, y, width, height, capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, FLOOR_PLAN_ID, label.trim(), shape, x, y, width, height, capacity]
    );
    return db.get('SELECT * FROM `tables` WHERE id = ?', [id]);
  },

  async update(db, id, data) {
    const table = await db.get('SELECT * FROM `tables` WHERE id = ? AND active = 1', [id]);
    if (!table) return null;

    const { label, shape, x, y, width, height, capacity } = data;
    if (label && label.trim() !== table.label) {
      const dup = await db.get('SELECT id FROM `tables` WHERE label = ? AND id != ? LIMIT 1', [label.trim(), id]);
      if (dup) {
        const err = new Error(`Le label "${label}" est déjà utilisé.`);
        err.status = 409;
        throw err;
      }
    }

    await db.run(
      `UPDATE \`tables\`
       SET label    = COALESCE(?, label),    shape    = COALESCE(?, shape),
           x        = COALESCE(?, x),        y        = COALESCE(?, y),
           width    = COALESCE(?, width),    height   = COALESCE(?, height),
           capacity = COALESCE(?, capacity), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        label?.trim() || null, shape || null,
        x != null ? Number(x) : null, y != null ? Number(y) : null,
        width  != null ? Number(width)    : null,
        height != null ? Number(height)   : null,
        capacity != null ? Number(capacity) : null,
        id,
      ]
    );
    return db.get('SELECT * FROM `tables` WHERE id = ?', [id]);
  },

  async softDelete(db, id) {
    const table = await db.get('SELECT id, label FROM `tables` WHERE id = ? AND active = 1', [id]);
    if (!table) return null;

    const activeOrder = await db.get(
      "SELECT id FROM `orders` WHERE table_number = ? AND status NOT IN ('paid','cancelled') LIMIT 1",
      [table.label]
    );
    if (activeOrder) {
      const err = new Error(`La table "${table.label}" a une commande active.`);
      err.status = 409;
      throw err;
    }

    await db.run('UPDATE `tables` SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    return table.label;
  },

};
