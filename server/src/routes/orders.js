/**
 * Co-Caisse — Routes commandes
 */
import express from 'express';
import { roleCheck } from '../middleware/auth.js';
import { OrderService } from '../services/order.service.js';
import { requireFields } from '../validators/common.js';

const router = express.Router();

// ── GET /table/:table_number/active — Vérifier si une table a une commande active
router.get('/table/:table_number/active', roleCheck(['admin', 'cashier']), async (req, res) => {
  try {
    const order = await OrderService.getActiveByTable(req.app.locals.db, req.params.table_number);
    res.json({ active: !!order, order: order || null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── POST / — Créer une commande ───────────────────────────────────────────────
router.post('/', roleCheck(['admin', 'cashier']), async (req, res) => {
  try {
    const err = requireFields(req.body, 'items', 'total');
    if (err) return res.status(400).json({ error: err });

    const order = await OrderService.create(req.app.locals.db, req.body, req.userId);
    res.status(201).json(order);
  } catch (error) {
    console.error('[orders POST]', error.message);
    // 409 = table occupée → renvoyer les détails de la commande en conflit
    if (error.status === 409) {
      return res.status(409).json({ error: error.message, conflict: error.conflict });
    }
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── GET / — Lister les commandes ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const db          = req.app.locals.db;
    const currentUser = await db.get('SELECT role FROM `users` WHERE id = ?', [req.userId]);
    const userRole    = currentUser?.role || 'cashier';
    res.json(await OrderService.getAll(db, req.query, req.userId, userRole));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /kitchen/active ────────────────────────────────────────────────────────
router.get('/kitchen/active', roleCheck(['admin', 'cook']), async (req, res) => {
  try {
    res.json(await OrderService.getKitchenActive(req.app.locals.db));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /stats/summary ─────────────────────────────────────────────────────────
router.get('/stats/summary', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    res.json(await OrderService.getDailySummary(req.app.locals.db));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /alerts/pending ────────────────────────────────────────────────────────
router.get('/alerts/pending', async (req, res) => {
  try {
    const db          = req.app.locals.db;
    const currentUser = await db.get('SELECT id, role FROM `users` WHERE id = ?', [req.userId]);
    const userRole    = currentUser?.role || 'cashier';
    res.json(await OrderService.getAlertsPending(db, req.userId, userRole));
  } catch (error) {
    console.error('[ALERTS] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── GET /stats/detailed ───────────────────────────────────────────────────────
router.get('/stats/detailed', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    res.json(await OrderService.getDetailedStats(req.app.locals.db, req.query));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /:id ──────────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const order = await OrderService.getById(req.app.locals.db, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── PUT /:id — Modifier une commande (draft uniquement) ───────────────────────
router.put('/:id', roleCheck(['admin', 'cashier']), async (req, res) => {
  try {
    const order = await OrderService.update(req.app.locals.db, req.params.id, req.body);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', roleCheck(['admin', 'cashier']), async (req, res) => {
  try {
    const result = await OrderService.remove(req.app.locals.db, req.params.id);
    if (!result) return res.status(404).json({ error: 'Order not found' });
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── POST /:id/validate ────────────────────────────────────────────────────────
router.post('/:id/validate', roleCheck(['admin', 'cashier']), async (req, res) => {
  try {
    const order = await OrderService.validate(req.app.locals.db, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── POST /:id/send-to-kitchen — DÉSACTIVÉ ─────────────────────────────────────
router.post('/:id/send-to-kitchen', async (req, res) => {
  return res.status(400).json({ error: 'La validation envoie directement en cuisine. Cette route n\'est plus utilisée.' });
});

// ── POST /:id/mark-ready ──────────────────────────────────────────────────────
router.post('/:id/mark-ready', async (req, res) => {
  try {
    const order = await OrderService.markReady(req.app.locals.db, req.params.id, req.userId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── POST /:id/kitchen-handle ──────────────────────────────────────────────────
router.post('/:id/kitchen-handle', async (req, res) => {
  try {
    const result = await OrderService.kitchenHandle(req.app.locals.db, req.params.id, req.userId);
    if (!result) return res.status(404).json({ error: 'Order not found' });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── POST /:id/kitchen-comment ─────────────────────────────────────────────────
router.post('/:id/kitchen-comment', async (req, res) => {
  try {
    const result = await OrderService.kitchenComment(
      req.app.locals.db, req.params.id, req.body.comment, req.userId
    );
    if (!result) return res.status(404).json({ error: 'Order not found' });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── POST /:id/mark-served ─────────────────────────────────────────────────────
router.post('/:id/mark-served', roleCheck(['admin', 'cashier']), async (req, res) => {
  try {
    const order = await OrderService.markServed(req.app.locals.db, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── POST /:id/pay ─────────────────────────────────────────────────────────────
router.post('/:id/pay', roleCheck(['admin', 'cashier']), async (req, res) => {
  try {
    const err = requireFields(req.body, 'payment_method');
    if (err) return res.status(400).json({ error: err });

    const result = await OrderService.pay(req.app.locals.db, req.params.id, req.body, req.userId);
    if (!result) return res.status(404).json({ error: 'Order not found' });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
