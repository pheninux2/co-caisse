import express from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Create transaction
router.post('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { items, subtotal, tax, discount, total, payment_method, payment_status, change, notes } = req.body;

    if (!items || !total || !payment_method) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = uuidv4();
    const receipt_number = `REC-${Date.now()}`;

    await db.run(
      `INSERT INTO transactions (id, user_id, items, subtotal, tax, discount, total, payment_method, payment_status, change, notes, receipt_number)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.userId, JSON.stringify(items), subtotal, tax || 0, discount || 0, total, payment_method, payment_status || 'completed', change || 0, notes, receipt_number]
    );

    const transaction = await db.get('SELECT * FROM transactions WHERE id = ?', [id]);
    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all transactions
router.get('/', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const { start_date, end_date, payment_method, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];

    if (start_date) {
      query += ' AND DATE(transaction_date) >= ?';
      params.push(start_date);
    }

    if (end_date) {
      query += ' AND DATE(transaction_date) <= ?';
      params.push(end_date);
    }

    if (payment_method) {
      query += ' AND payment_method = ?';
      params.push(payment_method);
    }

    query += ` ORDER BY transaction_date DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const transactions = await db.all(query, params);
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get transaction by ID
router.get('/:id', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const transaction = await db.get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    transaction.items = JSON.parse(transaction.items);
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get daily summary
router.get('/summary/daily', async (req, res) => {
  try {
    const db = req.app.locals.db;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const summary = await db.get(`
      SELECT
        DATE(transaction_date) as date,
        COUNT(*) as transaction_count,
        SUM(total) as total_amount,
        SUM(tax) as total_tax,
        SUM(discount) as total_discount,
        SUM(CASE WHEN payment_method = 'cash' THEN total ELSE 0 END) as cash_total,
        SUM(CASE WHEN payment_method = 'card' THEN total ELSE 0 END) as card_total,
        SUM(CASE WHEN payment_method = 'check' THEN total ELSE 0 END) as check_total
      FROM transactions
      WHERE DATE(transaction_date) = ?
    `, [date]);

    res.json(summary || { date, transaction_count: 0, total_amount: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

