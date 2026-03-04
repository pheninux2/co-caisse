/**
 * Co-Caisse — Routes Plan de salle
 * ===========================================
 * GET    /api/tables/layout          → plan + tables
 * POST   /api/tables/layout          → mettre à jour dimensions
 * GET    /api/tables/status          → statut enrichi (waiter, durée, items…)
 * GET    /api/tables/background      → retourner image de fond
 * POST   /api/tables/background      → uploader image de fond (multipart)
 * DELETE /api/tables/background      → supprimer image de fond
 * GET    /api/tables/drawing         → récupérer les éléments de dessin
 * PUT    /api/tables/drawing         → sauvegarder les éléments de dessin
 * GET    /api/tables                 → liste pour combobox
 * POST   /api/tables                 → créer une table
 * PUT    /api/tables/:id             → modifier position/taille/label
 * DELETE /api/tables/:id             → soft delete
 */

import express from 'express';
import multer  from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { roleCheck } from '../middleware/auth.js';

const router = express.Router();
const FLOOR_PLAN_ID = 'default-floor-plan';

// Multer en mémoire (stockage BLOB en base) — limite 5 Mo
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ── GET /api/tables/layout ────────────────────────────────────────────────────
router.get('/layout', async (req, res) => {
  try {
    const db = req.app.locals.db;
    // Ne pas renvoyer le BLOB background_image ici (trop lourd)
    const floorPlan = await db.get(
      'SELECT id, name, width, height, background_color, background_image_name, drawing_data, updated_at FROM `floor_plans` WHERE id = ? LIMIT 1',
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
    const updated = await db.get(
      'SELECT id, name, width, height, background_color, background_image_name FROM `floor_plans` WHERE id = ?',
      [FLOOR_PLAN_ID]
    );
    res.json({ success: true, floor_plan: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tables/status ────────────────────────────────────────────────────
// Statut enrichi : waiter_name, opened_at, item_count, total_amount, order_ref
router.get('/status', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const tables = await db.all(
      'SELECT id, label, shape, x, y, width, height, capacity FROM `tables` WHERE floor_plan_id = ? AND active = 1',
      [FLOOR_PLAN_ID]
    );
    if (!tables.length) return res.json([]);

    const result = await Promise.all(tables.map(async (table) => {
      // Commande active + nom du serveur (created_by → users.username)
      const order = await db.get(
        `SELECT o.id, o.order_number, o.status, o.total, o.created_at,
                o.items, u.username AS waiter_name
         FROM \`orders\` o
         LEFT JOIN \`users\` u ON u.id = o.created_by
         WHERE o.table_number = ?
           AND o.status NOT IN ('paid', 'cancelled')
         ORDER BY o.created_at DESC
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
        elapsed_minutes = Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60000);
      }

      // Compter les articles
      let item_count = 0;
      if (order?.items) {
        try {
          const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
          item_count = Array.isArray(items) ? items.reduce((s, i) => s + (i.quantity || 1), 0) : 0;
        } catch (_) {}
      }

      return {
        ...table,
        computed_status,
        order_id:       order?.id             || null,
        order_number:   order?.order_number   || null,
        order_ref:      order?.order_number   || null,
        order_status:   order?.status         || null,
        order_total:    order?.total          || null,
        total_amount:   order?.total          || null,
        waiter_name:    order?.waiter_name    || null,
        opened_at:      order?.created_at     || null,
        item_count,
        elapsed_minutes,
      };
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tables/background ────────────────────────────────────────────────
// Retourne l'image de fond (data URL)
router.get('/background', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const row = await db.get(
      'SELECT background_image, background_image_name FROM `floor_plans` WHERE id = ?',
      [FLOOR_PLAN_ID]
    );
    if (!row?.background_image) return res.json({ image: null });
    res.json({ image: row.background_image, filename: row.background_image_name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tables/background ───────────────────────────────────────────────
// Upload d'une image de fond (multipart/form-data, champ "image")
router.post('/background', roleCheck(['admin']), upload.single('image'), async (req, res) => {
  try {
    const db = req.app.locals.db;
    if (!req.file) return res.status(400).json({ error: 'Aucune image reçue (champ "image" requis)' });

    const base64  = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;

    await db.run(
      `UPDATE \`floor_plans\`
       SET background_image = ?, background_image_name = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [dataUrl, req.file.originalname, FLOOR_PLAN_ID]
    );

    res.json({ success: true, filename: req.file.originalname, size: req.file.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tables/background ─────────────────────────────────────────────
router.delete('/background', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    await db.run(
      'UPDATE `floor_plans` SET background_image = NULL, background_image_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [FLOOR_PLAN_ID]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tables/drawing ───────────────────────────────────────────────────
// Récupère les éléments de dessin (murs, portes, zones…)
router.get('/drawing', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const row = await db.get('SELECT drawing_data FROM `floor_plans` WHERE id = ?', [FLOOR_PLAN_ID]);
    let elements = [];
    if (row?.drawing_data) {
      try { elements = JSON.parse(row.drawing_data); } catch (_) {}
    }
    res.json({ elements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tables/drawing ───────────────────────────────────────────────────
// Sauvegarde les éléments de dessin
router.put('/drawing', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { elements = [] } = req.body;
    await db.run(
      'UPDATE `floor_plans` SET drawing_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [JSON.stringify(elements), FLOOR_PLAN_ID]
    );
    res.json({ success: true, count: elements.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tables (liste pour combobox) ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const tables = await db.all(
      'SELECT id, label, capacity, shape FROM `tables` WHERE active = 1 ORDER BY label ASC'
    );
    res.json(tables || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tables ──────────────────────────────────────────────────────────
router.post('/', roleCheck(['admin']), async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { label, shape = 'rect', x = 50, y = 50, width = 80, height = 80, capacity = 4 } = req.body;

    if (!label?.trim()) return res.status(400).json({ error: 'Le label de la table est requis' });

    const existing = await db.get('SELECT id FROM `tables` WHERE label = ? LIMIT 1', [label.trim()]);
    if (existing) return res.status(409).json({ error: `Une table "${label}" existe déjà.` });

    const id = uuidv4();
    await db.run(
      'INSERT INTO `tables` (id, floor_plan_id, label, shape, x, y, width, height, capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
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
      const dup = await db.get('SELECT id FROM `tables` WHERE label = ? AND id != ? LIMIT 1', [label.trim(), id]);
      if (dup) return res.status(409).json({ error: `Le label "${label}" est déjà utilisé.` });
    }

    await db.run(
      `UPDATE \`tables\`
       SET label = COALESCE(?, label), shape = COALESCE(?, shape),
           x = COALESCE(?, x), y = COALESCE(?, y),
           width = COALESCE(?, width), height = COALESCE(?, height),
           capacity = COALESCE(?, capacity), updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        label?.trim() || null, shape || null,
        x != null ? Number(x) : null, y != null ? Number(y) : null,
        width != null ? Number(width) : null, height != null ? Number(height) : null,
        capacity != null ? Number(capacity) : null, id,
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
    const db = req.app.locals.db;
    const { id } = req.params;

    const table = await db.get('SELECT id, label FROM `tables` WHERE id = ? AND active = 1', [id]);
    if (!table) return res.status(404).json({ error: 'Table introuvable' });

    const activeOrder = await db.get(
      "SELECT id FROM `orders` WHERE table_number = ? AND status NOT IN ('paid','cancelled') LIMIT 1",
      [table.label]
    );
    if (activeOrder) {
      return res.status(409).json({ error: `La table "${table.label}" a une commande active.` });
    }

    await db.run('UPDATE `tables` SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
    res.json({ success: true, message: `Table "${table.label}" désactivée.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

