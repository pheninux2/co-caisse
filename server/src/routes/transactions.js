/**
 * Co-Caisse — Routes transactions
 */
import express from 'express';
import { roleCheck } from '../middleware/auth.js';
import { TransactionService } from '../services/transaction.service.js';
import { requireFields } from '../validators/common.js';

const router = express.Router();

// ── POST / — Créer une transaction ───────────────────────────────────────────
router.post('/', roleCheck(['admin', 'cashier']), async (req, res) => {
  try {
    const err = requireFields(req.body, 'items', 'total', 'payment_method');
    if (err) return res.status(400).json({ error: err });

    const transaction = await TransactionService.create(req.app.locals.db, req.body, req.userId);
    res.status(201).json(transaction);
  } catch (error) {
    console.error('[transactions POST] error:', error.message);
    res.status(error.status || 500).json({ error: error.message });
  }
});

// ── GET / — Lister les transactions avec filtres ──────────────────────────────
router.get('/', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    res.json(await TransactionService.getAll(req.app.locals.db, req.query));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /summary/daily ────────────────────────────────────────────────────────
router.get('/summary/daily', roleCheck(['admin', 'manager', 'cashier']), async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    res.json(await TransactionService.getDailySummary(req.app.locals.db, date));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /summary/period ───────────────────────────────────────────────────────
router.get('/summary/period', roleCheck(['admin', 'manager']), async (req, res) => {
  try {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end dates required' });
    res.json(await TransactionService.getPeriodSummary(req.app.locals.db, start, end));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── GET /:id — Obtenir une transaction par ID ─────────────────────────────────
router.get('/:id', roleCheck(['admin', 'manager', 'cashier']), async (req, res) => {
  try {
    const transaction = await TransactionService.getById(req.app.locals.db, req.params.id);
    if (!transaction) return res.status(404).json({ error: 'Transaction not found' });
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
