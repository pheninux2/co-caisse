/**
 * Co-Caisse — Routes Plan de salle
 */
import express from 'express';
import multer  from 'multer';
import { roleCheck } from '../middleware/auth.js';
import { TableService } from '../services/table.service.js';
import { requireFields } from '../validators/common.js';
import { AuditService } from '../services/audit.service.js';

const router = express.Router();

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
    res.json(await TableService.getLayout(req.app.locals.db));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tables/layout ───────────────────────────────────────────────────
router.post('/layout', roleCheck(['admin']), async (req, res) => {
  try {
    const floor_plan = await TableService.updateLayout(req.app.locals.db, req.body);
    res.json({ success: true, floor_plan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tables/status ────────────────────────────────────────────────────
router.get('/status', async (req, res) => {
  try {
    res.json(await TableService.getStatus(req.app.locals.db));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tables/background ────────────────────────────────────────────────
router.get('/background', async (req, res) => {
  try {
    res.json(await TableService.getBackground(req.app.locals.db));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tables/background ───────────────────────────────────────────────
router.post('/background', roleCheck(['admin']), upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Aucune image reçue (champ "image" requis)' });

    const base64  = req.file.buffer.toString('base64');
    const dataUrl = `data:${req.file.mimetype};base64,${base64}`;
    await TableService.setBackground(req.app.locals.db, dataUrl, req.file.originalname);
    res.json({ success: true, filename: req.file.originalname, size: req.file.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/tables/background ─────────────────────────────────────────────
router.delete('/background', roleCheck(['admin']), async (req, res) => {
  try {
    await TableService.removeBackground(req.app.locals.db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tables/drawing ───────────────────────────────────────────────────
router.get('/drawing', async (req, res) => {
  try {
    res.json({ elements: await TableService.getDrawing(req.app.locals.db) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/tables/drawing ───────────────────────────────────────────────────
router.put('/drawing', roleCheck(['admin']), async (req, res) => {
  try {
    const count = await TableService.saveDrawing(req.app.locals.db, req.body.elements);
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tables/assign-bulk — Attribuer des tables à un serveur ─────────
// Body: { waiter_id: string, table_ids: string[] }
router.post('/assign-bulk', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const { waiter_id, table_ids = [] } = req.body;
    if (!waiter_id) return res.status(400).json({ error: 'waiter_id requis' });

    const db = req.app.locals.db;
    const waiter = await db.get('SELECT id, username FROM `users` WHERE id = ? AND active = 1', [waiter_id]);
    if (!waiter) return res.status(404).json({ error: 'Serveur introuvable' });

    const actor = await db.get('SELECT username FROM `users` WHERE id = ?', [req.userId]);

    await TableService.assignForWaiter(db, waiter_id, table_ids);

    await AuditService.log(db, {
      userId:     req.userId,
      userName:   actor?.username || null,
      action:     'table.assign',
      targetType: 'user',
      targetId:   waiter_id,
      details:    { waiter_name: waiter.username, assigned_table_ids: table_ids },
    });

    res.json({ success: true, waiter_id, table_ids });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── GET /api/tables/assigned/:waiterId — Tables assignées à un serveur ────────
router.get('/assigned/:waiterId', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const tableIds = await TableService.getAssignedFor(req.app.locals.db, req.params.waiterId);
    res.json({ waiter_id: req.params.waiterId, table_ids: tableIds });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/tables ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    res.json(await TableService.getAll(req.app.locals.db));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/tables ──────────────────────────────────────────────────────────
router.post('/', roleCheck(['admin']), async (req, res) => {
  try {
    const err = requireFields(req.body, 'label');
    if (err) return res.status(400).json({ error: err });

    const table = await TableService.create(req.app.locals.db, req.body);
    res.status(201).json(table);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── PUT /api/tables/:id ───────────────────────────────────────────────────────
router.put('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const table = await TableService.update(req.app.locals.db, req.params.id, req.body);
    if (!table) return res.status(404).json({ error: 'Table introuvable' });
    res.json(table);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── DELETE /api/tables/:id ────────────────────────────────────────────────────
router.delete('/:id', roleCheck(['admin']), async (req, res) => {
  try {
    const label = await TableService.softDelete(req.app.locals.db, req.params.id);
    if (!label) return res.status(404).json({ error: 'Table introuvable' });
    res.json({ success: true, message: `Table "${label}" désactivée.` });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
