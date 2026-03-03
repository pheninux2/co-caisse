/**
 * Co-Caisse — Routes Plan de salle
 * ===========================================
 * GET  /api/tables/layout      → plan + tables (tous rôles auth)
 * POST /api/tables/layout      → mettre à jour dimensions du plan (admin)
 * GET  /api/tables/status      → statut temps réel calculé depuis orders
 * POST /api/tables             → créer une table (admin)
 * PUT  /api/tables/:id         → modifier position/taille/label (admin)
 * DELETE /api/tables/:id       → désactiver une table (soft delete, admin)
 */

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { roleCheck } from '../middleware/auth.js';

const router = express.Router();
const FLOOR_PLAN_ID = 'default-floor-plan';

// ── GET /api/tables/layout ────────────────────────────────────────────────────
router.get('/layout', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const floorPlan = await db.get(
      'SELECT * FROM `floor_plans` WHERE id = ? LIMIT 1',
      [FLOOR_PLAN_ID]
    );

    const tables = await db.all(
      'SELECT * FROM `tables` WHERE floor_plan_id = ? AND active = 1 ORDER BY label ASC',
      [FLOOR_PLAN_ID]
    );

    res.json({
      floor_plan: floorPlan || { id: FLOOR_PLAN_ID, name: 'Salle principale', width: 1100, height: 650, background_color: '#f3f4f6' },
      tables:     tables || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tables/layout ───────────────────────────────────────────────────
router.post('/layout', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { name, width, height, background_color } = req.body;

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

    const updated = await db.get('SELECT * FROM `floor_plans` WHERE id = ?', [FLOOR_PLAN_ID]);
    res.json({ success: true, floor_plan: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tables/status ────────────────────────────────────────────────────
// Statut temps réel de chaque table, calculé depuis les commandes actives
router.get('/status', async (req, res) => {
  try {
    const db = req.app.locals.db;

    const tables = await db.all(
      'SELECT id, label, shape, x, y, width, height, capacity FROM `tables` WHERE floor_plan_id = ? AND active = 1',
      [FLOOR_PLAN_ID]
    );

    if (!tables.length) return res.json([]);

    const result = await Promise.all(tables.map(async (table) => {
      const order = await db.get(
        `SELECT id, order_number, status, total, created_at
         FROM \`orders\`
         WHERE table_number = ?
           AND status NOT IN ('paid', 'cancelled')
         ORDER BY created_at DESC
         LIMIT 1`,
        [table.label]
      );

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
        const start = new Date(order.created_at).getTime();
        elapsed_minutes = Math.floor((Date.now() - start) / 60000);
      }

      return {
        ...table,
        computed_status,
        order_id:       order?.id           || null,
        order_number:   order?.order_number || null,
        order_status:   order?.status       || null,
        order_total:    order?.total        || null,
        elapsed_minutes,
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tables ──────────────────────────────────────────────────────────
router.post('/', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const {
      label,
      shape    = 'rect',
      x        = 50,
      y        = 50,
      width    = 80,
      height   = 80,
      capacity = 4,
    } = req.body;

    if (!label?.trim()) {
      return res.status(400).json({ error: 'Le label de la table est requis (ex: "T1", "Table 2")' });
    }

    const existing = await db.get(
      'SELECT id FROM `tables` WHERE label = ? LIMIT 1',
      [label.trim()]
    );
    if (existing) {
      return res.status(409).json({ error: `Une table avec le label "${label}" existe déjà.` });
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO \`tables\` (id, floor_plan_id, label, shape, x, y, width, height, capacity)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, FLOOR_PLAN_ID, label.trim(), shape, x, y, width, height, capacity]
    );

    const table = await db.get('SELECT * FROM `tables` WHERE id = ?', [id]);
    res.status(201).json(table);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tables/:id ───────────────────────────────────────────────────────
router.put('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { id } = req.params;
    const { label, shape, x, y, width, height, capacity } = req.body;

    const table = await db.get('SELECT * FROM `tables` WHERE id = ? AND active = 1', [id]);
    if (!table) return res.status(404).json({ error: 'Table introuvable' });

    if (label && label.trim() !== table.label) {
      const duplicate = await db.get(
        'SELECT id FROM `tables` WHERE label = ? AND id != ? LIMIT 1',
        [label.trim(), id]
      );
      if (duplicate) return res.status(409).json({ error: `Le label "${label}" est déjà utilisé.` });
    }

    await db.run(
      `UPDATE \`tables\`
       SET label      = COALESCE(?, label),
           shape      = COALESCE(?, shape),
           x          = COALESCE(?, x),
           y          = COALESCE(?, y),
           width      = COALESCE(?, width),
           height     = COALESCE(?, height),
           capacity   = COALESCE(?, capacity),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        label?.trim()              || null,
        shape                      || null,
        x        != null ? Number(x)        : null,
        y        != null ? Number(y)        : null,
        width    != null ? Number(width)    : null,
        height   != null ? Number(height)   : null,
        capacity != null ? Number(capacity) : null,
        id,
      ]
    );

    const updated = await db.get('SELECT * FROM `tables` WHERE id = ?', [id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tables/:id ────────────────────────────────────────────────────
router.delete('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const db  = req.app.locals.db;
    const { id } = req.params;

    const table = await db.get('SELECT id, label FROM `tables` WHERE id = ? AND active = 1', [id]);
    if (!table) return res.status(404).json({ error: 'Table introuvable' });

    const activeOrder = await db.get(
      "SELECT id FROM `orders` WHERE table_number = ? AND status NOT IN ('paid','cancelled') LIMIT 1",
      [table.label]
    );
    if (activeOrder) {
      return res.status(409).json({
        error: `La table "${table.label}" a une commande active — clôturez-la avant de supprimer la table.`,
      });
    }

    await db.run(
      'UPDATE `tables` SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [id]
    );

    res.json({ success: true, message: `Table "${table.label}" désactivée.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

